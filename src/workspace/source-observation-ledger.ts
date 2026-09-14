import type { DatabaseSync } from "node:sqlite";
import type { HistoryDeletionAuthority, HistoryDenialReceipt } from "./history-deletion-authority";
import { stableJson, retrievalSha256 } from "gkos-engine/retrieval";
import { isValidGkxAuthoredUid } from "gkos-engine";
import { validateVaultRelativePath } from "gkos-engine/navigation-effects";

const APPLICATION = 0x4b4f4253;
const RETENTION_SQL = "CREATE TABLE retention (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)";
const OBSERVATIONS_SQL = "CREATE TABLE observations (seq INTEGER PRIMARY KEY, operation TEXT NOT NULL UNIQUE, known_at TEXT NOT NULL, parent INTEGER, input TEXT NOT NULL, payload BLOB, receipt_digest TEXT NOT NULL)";
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export interface ObservationRetention {
  enabled: boolean;
  corpus: string;
  maxAgeMs: number;
  maxBytes: number;
  maxObservations: number;
}
export interface SourceObservation {
  operation: string;
  corpus: string;
  source: string;
  path: string;
  kind: "source_version" | "source_deleted";
  sourceDigest: string | null;
  validAt: string | null;
  authorityDigest: string;
  policyDigest: string;
  parserVersion: string;
  schemaVersion: string;
}
export interface SourceObservationReference {
  sequence: number;
  source: string;
  sourceDigest: string;
  receiptDigest: string;
}
export interface ProjectionObservation {
  version: 1;
  operation: string;
  corpus: string;
  kind: "projection_published";
  projectionId: string;
  configurationDigest: string;
  publicationDigest: string;
  authorityDigest: string;
  policyDigest: string;
  sources: SourceObservationReference[];
}
export interface SourceObservationHost {
  current: () => boolean;
  now: () => string;
  canRead: (source: string) => boolean;
  supports: (parser: string, schema: string) => boolean;
  projectionCurrent?: (input: ProjectionObservation) => boolean;
}
interface PurgedObservation {
  version: 1;
  operation: string;
  corpus: string;
  kind: "purged";
  source: string;
  denialSequence: number;
  denialDigest: string;
  purgedAt: string;
}
type Observation = SourceObservation | ProjectionObservation | PurgedObservation;
const PROJECTION_KEYS = ["version", "operation", "corpus", "kind", "projectionId", "configurationDigest", "publicationDigest", "authorityDigest", "policyDigest", "sources"].sort();
const recordLimit = (input: Observation) => input.kind === "projection_published" ? 1024 * 1024 : 16384;
const INPUT_KEYS = ["operation", "corpus", "source", "path", "kind", "sourceDigest", "validAt", "authorityDigest", "policyDigest", "parserVersion", "schemaVersion"].sort();
function instant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function positive(value: unknown, maximum: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximum;
}

function assertDatabase(db: DatabaseSync, retention: Readonly<ObservationRetention>) {
  if ((db.prepare("PRAGMA application_id").get() as any).application_id !== APPLICATION ||
      (db.prepare("PRAGMA user_version").get() as any).user_version !== 1) throw Error("OBSERVATION_SCHEMA_UNSUPPORTED");
  const schema = db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY name").all() as any[];
  if (schema.length !== 3 || schema[0].name !== "observations" || schema[0].type !== "table" || schema[0].sql !== OBSERVATIONS_SQL ||
      schema[1].name !== "retention" || schema[1].type !== "table" || schema[1].sql !== RETENTION_SQL ||
      schema[2].name !== "sqlite_autoindex_observations_1" || schema[2].type !== "index" || schema[2].sql !== null) throw Error("OBSERVATION_SCHEMA_UNSUPPORTED");
  if ((db.prepare("SELECT body FROM retention WHERE id=1").get() as any)?.body !== stableJson(retention)) throw Error("OBSERVATION_RETENTION_CHANGED");
}

/** Isolated native component. The host owns the private database capability and
 * authenticated retention action. No plugin hook opens or enables this ledger.
 * External derived-data cleanup, import and migration remain unavailable.
 */
export class SourceObservationLedger {
  private closed = false;
  private invalidated = false;
  private busy = false;
  private constructor(private db: DatabaseSync, private retention: Readonly<ObservationRetention>,
    private host: SourceObservationHost) {}

  static open(retention: ObservationRetention, openDatabase: () => DatabaseSync,
    host: SourceObservationHost, initialize = false) {
    if (retention?.enabled === undefined || retention?.enabled === false) return null;
    retention = JSON.parse(stableJson(retention));
    if (retention.enabled !== true || typeof retention.corpus !== "string" || !retention.corpus || retention.corpus.length > 4096 ||
      !positive(retention.maxAgeMs, 3650 * 86400000) || !positive(retention.maxBytes, 64 * 1024 * 1024) ||
      !positive(retention.maxObservations, 10000) || Object.keys(retention).sort().join() !== "corpus,enabled,maxAgeMs,maxBytes,maxObservations") throw Error("OBSERVATION_RETENTION_INVALID");
    const capturedHost = { current: host.current, now: host.now, canRead: host.canRead, supports: host.supports, projectionCurrent: host.projectionCurrent };
    if (typeof capturedHost.current !== "function" || typeof capturedHost.now !== "function" ||
        typeof capturedHost.canRead !== "function" || typeof capturedHost.supports !== "function" || capturedHost.current() !== true) throw Error("OBSERVATION_HOST_STALE");
    const db = openDatabase();
    try {
      if (initialize) {
        if ((db.prepare("SELECT count(*) AS n FROM sqlite_master").get() as any).n !== 0) throw Error("OBSERVATION_DATABASE_EXISTS");
        db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;");
        try {
          db.exec(`${RETENTION_SQL}; ${OBSERVATIONS_SQL};`);
          db.prepare("INSERT INTO retention VALUES (1, ?)").run(stableJson(retention));
          if (capturedHost.current() !== true) throw Error("OBSERVATION_HOST_STALE");
          db.exec(`PRAGMA application_id=${APPLICATION}; PRAGMA user_version=1; COMMIT;`);
        } catch (error) { db.exec("ROLLBACK;"); throw error; }
      }
      assertDatabase(db, retention);
      db.exec("PRAGMA busy_timeout=1000; PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA max_page_count=65536;");
      const ledger = new SourceObservationLedger(db, Object.freeze(retention), capturedHost);
      ledger.transaction(() => ledger.scan());
      return ledger;
    } catch (error) { db.close(); throw error; }
  }

  private current() {
    if (this.closed || this.invalidated) throw Error("OBSERVATION_HOST_STALE");
    try { if (this.host.current() === true) return; } catch { /* A failed authority check cannot preserve an old grant. */ }
    this.invalidated = true;
    throw Error("OBSERVATION_HOST_STALE");
  }
  private transaction<T>(run: () => T): T {
    if (this.busy) throw Error("OBSERVATION_BUSY");
    this.current(); this.busy = true;
    try {
      this.db.exec("BEGIN IMMEDIATE;");
      try { assertDatabase(this.db, this.retention); const result = run(); this.current(); this.db.exec("COMMIT;"); return result; }
      catch (error) { this.db.exec("ROLLBACK;"); throw error; }
    } finally { this.busy = false; }
  }
  private validate(input: Observation, payload: Uint8Array | null, checkPayload = true) {
    if (input.kind === "purged") {
      if (Object.keys(input).sort().join() !== "corpus,denialDigest,denialSequence,kind,operation,purgedAt,source,version" ||
          input.version !== 1 || input.corpus !== this.retention.corpus || typeof input.operation !== "string" ||
          !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.operation) || !isValidGkxAuthoredUid(input.source) ||
          input.source !== input.source.toLowerCase() || !positive(input.denialSequence, 10000) ||
          !DIGEST.test(input.denialDigest) || !instant(input.purgedAt) || payload !== null) throw Error("OBSERVATION_PURGE_RECORD_INVALID");
      return;
    }
    if (input.kind === "projection_published") {
      if (Object.keys(input).sort().join() !== PROJECTION_KEYS.join() || input.version !== 1 || input.corpus !== this.retention.corpus ||
          typeof input.operation !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.operation) ||
          typeof input.projectionId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(input.projectionId) ||
          ![input.configurationDigest, input.publicationDigest, input.authorityDigest, input.policyDigest].every(v => typeof v === "string" && DIGEST.test(v)) ||
          !Array.isArray(input.sources) || input.sources.length > 5000 || payload !== null) throw Error("OBSERVATION_PROJECTION_INVALID");
      const identities = new Set<string>(); let prior = 0;
      for (const ref of input.sources) {
        if (!ref || Object.keys(ref).sort().join() !== "receiptDigest,sequence,source,sourceDigest" ||
            !positive(ref.sequence, 10000) || ref.sequence <= prior || !isValidGkxAuthoredUid(ref.source) || identities.has(ref.source.toLowerCase()) ||
            !DIGEST.test(ref.sourceDigest) || !DIGEST.test(ref.receiptDigest)) throw Error("OBSERVATION_REFERENCE_INVALID");
        identities.add(ref.source.toLowerCase()); prior = ref.sequence;
      }
      return;
    }
    const path = validateVaultRelativePath(input.path);
    if (Object.keys(input).sort().join() !== INPUT_KEYS.join() || input.corpus !== this.retention.corpus ||
        typeof input.operation !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.operation) ||
        !isValidGkxAuthoredUid(input.source) || !path.valid || path.normalized !== input.path ||
        !["source_version", "source_deleted"].includes(input.kind) ||
        input.validAt !== null && !instant(input.validAt) ||
        !DIGEST.test(input.authorityDigest) || !DIGEST.test(input.policyDigest) ||
        ![input.parserVersion, input.schemaVersion].every(v => typeof v === "string" && v.length > 0 && v.length <= 128)) throw Error("OBSERVATION_INPUT_INVALID");
    if (!checkPayload) {
      if (input.kind === "source_deleted" ? input.sourceDigest !== null : !DIGEST.test(input.sourceDigest ?? "")) throw Error("OBSERVATION_PAYLOAD_INVALID");
      return;
    }
    if (this.host.supports(input.parserVersion, input.schemaVersion) !== true) throw Error("OBSERVATION_INTERPRETATION_UNSUPPORTED");
    if (input.kind === "source_deleted" ? input.sourceDigest !== null || payload !== null :
        payload === null || !DIGEST.test(input.sourceDigest ?? "") || retrievalSha256(payload) !== input.sourceDigest) throw Error("OBSERVATION_PAYLOAD_INVALID");
  }
  private scan() {
    const count = (this.db.prepare("SELECT count(*) AS n, coalesce(sum(coalesce(length(payload),0) + length(CAST(input AS BLOB)) + length(CAST(operation AS BLOB)) + length(CAST(known_at AS BLOB)) + length(CAST(receipt_digest AS BLOB)) + 16),0) AS bytes FROM observations").get() as any);
    if (count.n > this.retention.maxObservations || count.bytes > this.retention.maxBytes) throw Error("OBSERVATION_STORE_INVALID");
    const rows = this.db.prepare("SELECT seq, operation, known_at, parent, input, receipt_digest, length(payload) AS payload_length FROM observations ORDER BY seq").all() as any[];
    const parents = new Map<string, number>(); let lastTime = "";
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (typeof row.input !== "string" || Buffer.byteLength(row.input) > 1024 * 1024) throw Error("OBSERVATION_STORE_INVALID");
      let input: Observation;
      try { input = JSON.parse(row.input); } catch { throw Error("OBSERVATION_STORE_INVALID"); }
      if (Buffer.byteLength(row.input) > recordLimit(input)) throw Error("OBSERVATION_STORE_INVALID");
      this.validate(input, null, false);
      if (input.kind !== "source_version" ? row.payload_length !== null : row.payload_length === null) throw Error("OBSERVATION_PAYLOAD_INVALID");
      if (row.receipt_digest !== retrievalSha256(stableJson({ sequence: row.seq, operation: row.operation, knownAt: row.known_at, parent: row.parent, input }))) throw Error("OBSERVATION_STORE_INVALID");
      if (stableJson(input) !== row.input || row.seq !== i + 1 || row.operation !== input.operation ||
          !instant(row.known_at) || row.known_at < lastTime || row.parent !== (input.kind === "projection_published" || input.kind === "purged" ? null : parents.get(input.source) ?? null)) throw Error("OBSERVATION_STORE_INVALID");
      if (input.kind === "projection_published") this.references(input, rows.slice(0, i));
      else if (input.kind === "purged") { if (input.purgedAt < row.known_at) throw Error("OBSERVATION_PURGE_RECORD_INVALID"); }
      else parents.set(input.source, row.seq);
      lastTime = row.known_at;
      row.parsed = input;
    }
    const purged = new Set(rows.filter(row => row.parsed.kind === "purged").map(row => row.parsed.source));
    if (rows.some(row => ["source_version", "source_deleted"].includes(row.parsed.kind) && purged.has(row.parsed.source.toLowerCase()))) throw Error("OBSERVATION_SOURCE_PURGED");
    return { rows, bytes: count.bytes as number, watermark: retrievalSha256(stableJson(rows.map(row => [row.seq, row.receipt_digest]))) };
  }
  private references(input: ProjectionObservation, rows: any[]) {
    for (const ref of input.sources) {
      const row = rows[ref.sequence - 1];
      if (!row || row.parsed?.kind !== "source_version" || row.parsed.source !== ref.source ||
          row.parsed.sourceDigest !== ref.sourceDigest || row.receipt_digest !== ref.receiptDigest) throw Error("OBSERVATION_REFERENCE_INVALID");
    }
  }
  private authorize(input: Observation) {
    const sources = input.kind === "projection_published" ? input.sources.map(ref => ref.source) : [input.source];
    if (sources.some(source => this.host.canRead(source) !== true)) throw Error("OBSERVATION_HOST_STALE");
    if (input.kind === "projection_published" && this.host.projectionCurrent?.(JSON.parse(stableJson(input))) !== true) throw Error("OBSERVATION_PROJECTION_STALE");
    if (sources.some(source => this.host.canRead(source) !== true)) throw Error("OBSERVATION_HOST_STALE");
    this.current();
  }

  private retainedReference(row: any, rows: any[], now = this.host.now()) {
    if (!instant(now) || rows.length && now < rows.at(-1).known_at) throw Error("OBSERVATION_CLOCK_REGRESSED");
    if (Date.parse(now) - Date.parse(row.known_at) > this.retention.maxAgeMs) throw Error("OBSERVATION_REFERENCE_UNAVAILABLE");
  }

  sourceReference(source: string, sequence: number): Readonly<SourceObservationReference> {
    return this.transaction(() => {
      if (!isValidGkxAuthoredUid(source) || !positive(sequence, 10000) || this.host.canRead(source) !== true) throw Error("OBSERVATION_REFERENCE_UNAVAILABLE");
      const { rows } = this.scan();
      const row = rows[sequence - 1];
      if (!row || row.parsed.kind !== "source_version" || row.parsed.source.toLowerCase() !== source.toLowerCase()) throw Error("OBSERVATION_REFERENCE_UNAVAILABLE");
      if (this.host.canRead(source) !== true || this.host.canRead(row.parsed.source) !== true) throw Error("OBSERVATION_REFERENCE_UNAVAILABLE");
      this.retainedReference(row, rows);
      const payload = (this.db.prepare("SELECT payload FROM observations WHERE seq=?").get(sequence) as any)?.payload;
      this.validate(row.parsed, payload);
      this.retainedReference(row, rows);
      if (this.host.canRead(source) !== true || this.host.canRead(row.parsed.source) !== true) throw Error("OBSERVATION_REFERENCE_UNAVAILABLE");
      this.current();
      return Object.freeze({ sequence, source: row.parsed.source as string, sourceDigest: row.parsed.sourceDigest, receiptDigest: row.receipt_digest });
    });
  }

  append(value: SourceObservation | ProjectionObservation, bytes: Uint8Array | null) {
    const text = stableJson(value);
    if (Buffer.byteLength(text) > recordLimit(value) || bytes !== null && bytes.byteLength > this.retention.maxBytes) throw Error("OBSERVATION_CAPACITY");
    const input = JSON.parse(text), payload = bytes === null ? null : Buffer.from(bytes);
    if (input.kind === "purged") throw Error("OBSERVATION_PURGE_INPUT_FORBIDDEN");
    this.validate(input, payload);
    return this.transaction(() => {
      this.authorize(input);
      const { rows, bytes: retained } = this.scan();
      if (input.kind !== "projection_published" && rows.some(row => row.parsed.kind === "purged" && row.parsed.source === input.source.toLowerCase())) throw Error("OBSERVATION_SOURCE_PURGED");
      if (input.kind === "projection_published") {
        this.references(input, rows);
        for (const ref of input.sources) {
          if (this.host.canRead(ref.source) !== true) throw Error("OBSERVATION_HOST_STALE");
          this.retainedReference(rows[ref.sequence - 1], rows);
          const sourcePayload = (this.db.prepare("SELECT payload FROM observations WHERE seq=?").get(ref.sequence) as any)?.payload;
          this.validate(rows[ref.sequence - 1].parsed, sourcePayload);
        }
      }
      const existing = rows.find(row => row.operation === input.operation);
      if (existing) {
        if (existing.input !== text) throw Error("OBSERVATION_RETRY_CONFLICT");
        const retainedPayload = (this.db.prepare("SELECT payload FROM observations WHERE seq=?").get(existing.seq) as any)?.payload;
        this.validate(existing.parsed, retainedPayload);
        this.authorize(input);
        return Object.freeze({ sequence: existing.seq as number, knownAt: existing.known_at as string });
      }
      // Logical record bytes include input, payload, duplicated operation, two integers, timestamp and digest.
      const recordBytes = Buffer.byteLength(text) + (payload?.byteLength ?? 0) + input.operation.length + 111;
      if (rows.length >= this.retention.maxObservations || retained + recordBytes > this.retention.maxBytes) throw Error("OBSERVATION_CAPACITY");
      const now = this.host.now();
      if (!instant(now) || rows.length && now < rows.at(-1).known_at) throw Error("OBSERVATION_CLOCK_REGRESSED");
      if (input.kind === "projection_published") for (const ref of input.sources) this.retainedReference(rows[ref.sequence - 1], rows, now);
      const parent = input.kind === "projection_published" ? null : rows.slice().reverse().find(row => row.parsed.source === input.source)?.seq ?? null;
      this.current();
      this.authorize(input);
      this.current();
      const digest = retrievalSha256(stableJson({ sequence: rows.length + 1, operation: input.operation, knownAt: now, parent, input }));
      this.db.prepare("INSERT INTO observations VALUES (?, ?, ?, ?, ?, ?, ?)").run(rows.length + 1, input.operation, now, parent, text, payload, digest);
      return Object.freeze({ sequence: rows.length + 1, knownAt: now });
    });
  }

  /** A host-held synchronous publication capability, not a renderer payload. */
  knownBy(source: string, cutoff: string) {
    if (!isValidGkxAuthoredUid(source) || !instant(cutoff)) throw Error("OBSERVATION_QUERY_INVALID");
    const captured = this.transaction(() => {
      if (this.host.canRead(source) !== true) return { selected: null, watermark: null };
      const { rows, watermark } = this.scan();
      const selected = rows.slice().reverse().find(row => row.parsed.source?.toLowerCase() === source.toLowerCase() && row.known_at <= cutoff) ?? null;
      return { selected, watermark };
    });
    let available = true;
    return Object.freeze({ publish: (apply: (observation: null | { sequence: number; knownAt: string; input: SourceObservation; bytes: Uint8Array }) => void) => {
      if (!available) throw Error("OBSERVATION_SNAPSHOT_STALE");
      available = false;
      this.transaction(() => {
        const now = this.host.now();
        if (!instant(now)) throw Error("OBSERVATION_CLOCK_REGRESSED");
        if (this.host.canRead(source) !== true) { apply(null); return; }
        const { rows, watermark } = this.scan();
        if (watermark !== captured.watermark) throw Error("OBSERVATION_SNAPSHOT_STALE");
        if (rows.length && now < rows.at(-1).known_at) throw Error("OBSERVATION_CLOCK_REGRESSED");
        const row = captured.selected;
        // UUID spelling is provenance, not another identity or an alternative grant.
        const readable = () => this.host.canRead(source) === true && (!row || this.host.canRead(row.parsed.source) === true);
        if (row && rows[row.seq - 1]?.receipt_digest !== row.receipt_digest) throw Error("OBSERVATION_SNAPSHOT_STALE");
        this.current();
        if (!readable()) { apply(null); return; }
        if (!row || row.parsed.kind !== "source_version" || Date.parse(now) - Date.parse(row.known_at) > this.retention.maxAgeMs) { apply(null); return; }
        const payload = (this.db.prepare("SELECT payload FROM observations WHERE seq=?").get(row.seq) as any)?.payload;
        this.validate(row.parsed, payload);
        if (!readable()) { apply(null); return; }
        this.current();
        apply({ sequence: row.seq, knownAt: row.known_at, input: JSON.parse(row.input), bytes: new Uint8Array(payload) });
      });
    } });
  }
  /** Local retained-data purge only. A durable independent denial precedes this
   * transaction; the host action must bind that receipt and the retention-hold revision.
   */
  purge(authority: HistoryDeletionAuthority, operation: string,
    actionCurrent: (receipt: Readonly<HistoryDenialReceipt>) => boolean, held: (source: string) => boolean) {
    if (typeof actionCurrent !== "function" || typeof held !== "function") throw Error("OBSERVATION_PURGE_ACTION_INVALID");
    const denial = authority.receipt(operation), deletion = authority.capture();
    if (!denial || denial.corpus !== this.retention.corpus || deletion.corpus !== this.retention.corpus || !deletion.isDenied(denial.source)) throw Error("OBSERVATION_PURGE_DENIAL_REQUIRED");
    const check = () => {
      if (!deletion.current() || !deletion.isDenied(denial.source) || actionCurrent(denial) !== true) throw Error("OBSERVATION_PURGE_AUTHORITY_STALE");
      this.current();
    };
    const unheld = () => { if (held(denial.source) !== false) throw Error("OBSERVATION_PURGE_HELD"); };
    try {
      return this.transaction(() => {
        check();
        const {rows} = this.scan();
        const previous = rows.filter(row => row.parsed.kind === "purged" && row.parsed.denialDigest === denial.digest);
        if (previous.length) {
          const first = previous[0].parsed;
          if (previous.some(row => row.parsed.source !== denial.source || row.parsed.denialSequence !== denial.sequence || row.parsed.purgedAt !== first.purgedAt)) throw Error("OBSERVATION_PURGE_RECORD_INVALID");
          check();
          return Object.freeze({status:"purged" as const, source:denial.source, operation, denialDigest:denial.digest, purgedAt:first.purgedAt as string, erasedRecords:previous.length});
        }
        unheld(); check();
        const targets = rows.filter(row => row.parsed.kind === "projection_published"
          ? row.parsed.sources.some((ref: SourceObservationReference) => ref.source.toLowerCase() === denial.source)
          : row.parsed.kind !== "purged" && row.parsed.source.toLowerCase() === denial.source);
        if (!targets.length) return Object.freeze({status:"nothing_retained" as const, source:denial.source, operation});
        const purgedAt = this.host.now();
        if (!instant(purgedAt) || purgedAt < denial.deniedAt || rows.length && purgedAt < rows.at(-1).known_at) throw Error("OBSERVATION_CLOCK_REGRESSED");
        this.db.exec("PRAGMA secure_delete=ON;");
        unheld(); check();
        for (const row of targets) {
          const input: PurgedObservation = {version:1,operation:row.operation,corpus:this.retention.corpus,kind:"purged",source:denial.source,denialSequence:denial.sequence,denialDigest:denial.digest,purgedAt};
          const digest = retrievalSha256(stableJson({sequence:row.seq,operation:row.operation,knownAt:row.known_at,parent:null,input}));
          this.db.prepare("UPDATE observations SET parent=NULL,input=?,payload=NULL,receipt_digest=? WHERE seq=?").run(stableJson(input),digest,row.seq);
        }
        this.scan(); unheld(); check();
        return Object.freeze({status:"purged" as const, source:denial.source, operation, denialDigest:denial.digest, purgedAt, erasedRecords:targets.length});
      });
    } catch (error) {
      if (error instanceof Error && error.message === "OBSERVATION_PURGE_HELD") return Object.freeze({status:"blocked" as const, reason:"retention_hold" as const, source:denial.source, operation});
      throw error;
    }
  }

  close() { if (this.busy) throw Error("OBSERVATION_BUSY"); if (!this.closed) { this.closed = true; this.db.close(); } }
}
