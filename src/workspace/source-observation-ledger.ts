import type { DatabaseSync } from "node:sqlite";
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
 * Purge, projection events, import and migration are deliberately unavailable.
 */
export class SourceObservationLedger {
  private closed = false;
  private busy = false;
  private constructor(private db: DatabaseSync, private retention: Readonly<ObservationRetention>,
    private host: { current: () => boolean; now: () => string; canRead: (source: string) => boolean; supports: (parser: string, schema: string) => boolean }) {}

  static open(retention: ObservationRetention, openDatabase: () => DatabaseSync,
    host: { current: () => boolean; now: () => string; canRead: (source: string) => boolean; supports: (parser: string, schema: string) => boolean }, initialize = false) {
    if (retention?.enabled === undefined || retention?.enabled === false) return null;
    retention = JSON.parse(stableJson(retention));
    if (retention.enabled !== true || typeof retention.corpus !== "string" || !retention.corpus || retention.corpus.length > 4096 ||
      !positive(retention.maxAgeMs, 3650 * 86400000) || !positive(retention.maxBytes, 64 * 1024 * 1024) ||
      !positive(retention.maxObservations, 10000) || Object.keys(retention).sort().join() !== "corpus,enabled,maxAgeMs,maxBytes,maxObservations") throw Error("OBSERVATION_RETENTION_INVALID");
    const capturedHost = { current: host.current, now: host.now, canRead: host.canRead, supports: host.supports };
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
    if (this.closed || this.host.current() !== true) throw Error("OBSERVATION_HOST_STALE");
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
  private validate(input: SourceObservation, payload: Uint8Array | null, checkPayload = true) {
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
      if (typeof row.input !== "string" || Buffer.byteLength(row.input) > 16384) throw Error("OBSERVATION_STORE_INVALID");
      let input: SourceObservation;
      try { input = JSON.parse(row.input); } catch { throw Error("OBSERVATION_STORE_INVALID"); }
      this.validate(input, null, false);
      if (input.kind === "source_deleted" ? row.payload_length !== null : row.payload_length === null) throw Error("OBSERVATION_PAYLOAD_INVALID");
      if (row.receipt_digest !== retrievalSha256(stableJson({ sequence: row.seq, operation: row.operation, knownAt: row.known_at, parent: row.parent, input }))) throw Error("OBSERVATION_STORE_INVALID");
      if (stableJson(input) !== row.input || row.seq !== i + 1 || row.operation !== input.operation ||
          !instant(row.known_at) || row.known_at < lastTime || row.parent !== (parents.get(input.source) ?? null)) throw Error("OBSERVATION_STORE_INVALID");
      parents.set(input.source, row.seq); lastTime = row.known_at;
      row.parsed = input;
    }
    return { rows, bytes: count.bytes as number };
  }
  append(value: SourceObservation, bytes: Uint8Array | null) {
    const text = stableJson(value);
    if (Buffer.byteLength(text) > 16384 || bytes !== null && bytes.byteLength > this.retention.maxBytes) throw Error("OBSERVATION_CAPACITY");
    const input = JSON.parse(text), payload = bytes === null ? null : Buffer.from(bytes);
    this.validate(input, payload);
    return this.transaction(() => {
      if (this.host.canRead(input.source) !== true) throw Error("OBSERVATION_HOST_STALE");
      const { rows, bytes: retained } = this.scan();
      const existing = rows.find(row => row.operation === input.operation);
      if (existing) {
        if (existing.input !== text) throw Error("OBSERVATION_RETRY_CONFLICT");
        const retainedPayload = (this.db.prepare("SELECT payload FROM observations WHERE seq=?").get(existing.seq) as any)?.payload;
        this.validate(existing.parsed, retainedPayload);
        return Object.freeze({ sequence: existing.seq as number, knownAt: existing.known_at as string });
      }
      // Logical record bytes include input, payload, duplicated operation, two integers, timestamp and digest.
      const recordBytes = Buffer.byteLength(text) + (payload?.byteLength ?? 0) + input.operation.length + 111;
      if (rows.length >= this.retention.maxObservations || retained + recordBytes > this.retention.maxBytes) throw Error("OBSERVATION_CAPACITY");
      const now = this.host.now();
      if (!instant(now) || rows.length && now < rows.at(-1).known_at) throw Error("OBSERVATION_CLOCK_REGRESSED");
      const parent = rows.slice().reverse().find(row => row.parsed.source === input.source)?.seq ?? null;
      this.current();
      if (this.host.canRead(input.source) !== true) throw Error("OBSERVATION_HOST_STALE");
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
      if (this.host.canRead(source) !== true) return { rows: [], selected: null, watermark: -1 };
      const { rows } = this.scan();
      const selected = rows.slice().reverse().find(row => row.parsed.source === source && row.known_at <= cutoff) ?? null;
      return { rows: [], selected, watermark: rows.length };
    });
    let available = true;
    return Object.freeze({ publish: (apply: (observation: null | { sequence: number; knownAt: string; input: SourceObservation; bytes: Uint8Array }) => void) => {
      if (!available) throw Error("OBSERVATION_SNAPSHOT_STALE");
      available = false;
      this.transaction(() => {
        const now = this.host.now();
        if (!instant(now)) throw Error("OBSERVATION_CLOCK_REGRESSED");
        if (this.host.canRead(source) !== true) { apply(null); return; }
        const { rows } = this.scan();
        if (rows.length !== captured.watermark) throw Error("OBSERVATION_SNAPSHOT_STALE");
        if (rows.length && now < rows.at(-1).known_at) throw Error("OBSERVATION_CLOCK_REGRESSED");
        const row = captured.selected;
        if (row && rows[row.seq - 1]?.receipt_digest !== row.receipt_digest) throw Error("OBSERVATION_SNAPSHOT_STALE");
        this.current();
        if (this.host.canRead(source) !== true) { apply(null); return; }
        if (!row || row.parsed.kind === "source_deleted" || Date.parse(now) - Date.parse(row.known_at) > this.retention.maxAgeMs) { apply(null); return; }
        const payload = (this.db.prepare("SELECT payload FROM observations WHERE seq=?").get(row.seq) as any)?.payload;
        this.validate(row.parsed, payload);
        if (this.host.canRead(source) !== true) { apply(null); return; }
        this.current();
        apply({ sequence: row.seq, knownAt: row.known_at, input: JSON.parse(row.input), bytes: new Uint8Array(payload) });
      });
    } });
  }
  close() { if (this.busy) throw Error("OBSERVATION_BUSY"); if (!this.closed) { this.closed = true; this.db.close(); } }
}
