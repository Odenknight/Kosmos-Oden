import type { DatabaseSync } from "node:sqlite";
import { stableJson, retrievalSha256 } from "gkos-engine/retrieval";
import { isValidGkxAuthoredUid } from "gkos-engine";

const APPLICATION = 0x4b4f444e;
const CONFIG_SQL = "CREATE TABLE authority (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)";
const RECEIPTS_SQL = "CREATE TABLE denials (seq INTEGER PRIMARY KEY, operation TEXT NOT NULL UNIQUE, body TEXT NOT NULL, digest TEXT NOT NULL)";
const GENESIS = retrievalSha256("kosmos-history-deletion-authority/1");
interface DeletionOptions { enabled: boolean; corpus: string; maxReceipts: number }
interface DeletionHost { current: () => boolean; now: () => string }
interface DenialBody { sequence: number; operation: string; source: string; deniedAt: string; priorDigest: string }
export interface HistoryDenialReceipt extends DenialBody { corpus: string; digest: string }
function sourceIdentity(value: string) {
  if (!isValidGkxAuthoredUid(value)) throw Error("HISTORY_DELETION_SOURCE_INVALID");
  return value.toLowerCase();
}
function instant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

/** Independent, native-only deny authority. The host must keep this database
 * outside source-history backup/restore and own its current private capability.
 * No payloads, source paths, content digests, purge or deletion-expiry operation.
 */
export class HistoryDeletionAuthority {
  private closed = false;
  private invalidated = false;
  private busy = false;
  private constructor(private db: DatabaseSync, private options: Readonly<DeletionOptions>, private host: DeletionHost) {}

  static open(options: DeletionOptions, openDatabase: () => DatabaseSync, host: DeletionHost, initialize = false) {
    if (options?.enabled === undefined || options.enabled === false) return null;
    options = JSON.parse(stableJson(options));
    if (options.enabled !== true || Object.keys(options).sort().join() !== "corpus,enabled,maxReceipts" ||
        typeof options.corpus !== "string" || !options.corpus || options.corpus.length > 4096 ||
        !Number.isSafeInteger(options.maxReceipts) || options.maxReceipts < 1 || options.maxReceipts > 10000) throw Error("HISTORY_DELETION_CONFIGURATION_INVALID");
    const captured = {current: host.current, now: host.now};
    if (typeof captured.current !== "function" || typeof captured.now !== "function" || captured.current() !== true) throw Error("HISTORY_DELETION_AUTHORITY_UNAVAILABLE");
    const db = openDatabase();
    try {
      if (initialize) {
        if ((db.prepare("SELECT count(*) AS n FROM sqlite_master").get() as any).n !== 0) throw Error("HISTORY_DELETION_DATABASE_EXISTS");
        db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;");
        try {
          db.exec(`${CONFIG_SQL}; ${RECEIPTS_SQL};`);
          db.prepare("INSERT INTO authority VALUES (1, ?)").run(stableJson(options));
          if (captured.current() !== true) throw Error("HISTORY_DELETION_AUTHORITY_UNAVAILABLE");
          db.exec(`PRAGMA application_id=${APPLICATION}; PRAGMA user_version=1; COMMIT;`);
        } catch (error) { db.exec("ROLLBACK;"); throw error; }
      }
      const authority = new HistoryDeletionAuthority(db, Object.freeze(options), captured);
      authority.schema();
      db.exec("PRAGMA busy_timeout=1000; PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA max_page_count=8192;");
      authority.transaction(() => authority.scan());
      return authority;
    } catch (error) { db.close(); throw error; }
  }
  private current() {
    if (this.closed || this.invalidated) throw Error("HISTORY_DELETION_AUTHORITY_UNAVAILABLE");
    try { if (this.host.current() === true) return; } catch { /* Do not revive an observed failed authority. */ }
    this.invalidated = true; throw Error("HISTORY_DELETION_AUTHORITY_UNAVAILABLE");
  }
  private schema() {
    if ((this.db.prepare("PRAGMA application_id").get() as any).application_id !== APPLICATION ||
        (this.db.prepare("PRAGMA user_version").get() as any).user_version !== 1) throw Error("HISTORY_DELETION_SCHEMA_UNSUPPORTED");
    const rows = this.db.prepare("SELECT name, type, sql FROM sqlite_master ORDER BY name").all() as any[];
    if (rows.length !== 3 || rows[0].name !== "authority" || rows[0].type !== "table" || rows[0].sql !== CONFIG_SQL ||
        rows[1].name !== "denials" || rows[1].type !== "table" || rows[1].sql !== RECEIPTS_SQL ||
        rows[2].name !== "sqlite_autoindex_denials_1" || rows[2].type !== "index" || rows[2].sql !== null ||
        (this.db.prepare("SELECT body FROM authority WHERE id=1").get() as any)?.body !== stableJson(this.options)) throw Error("HISTORY_DELETION_SCHEMA_UNSUPPORTED");
  }
  private transaction<T>(run: () => T): T {
    if (this.busy) throw Error("HISTORY_DELETION_BUSY");
    this.current(); this.busy = true;
    try {
      this.db.exec("BEGIN IMMEDIATE;");
      try { this.schema(); const result = run(); this.current(); this.db.exec("COMMIT;"); return result; }
      catch (error) { this.db.exec("ROLLBACK;"); throw error; }
    } finally { this.busy = false; }
  }
  private scan() {
    const size = this.db.prepare("SELECT count(*) AS n, coalesce(sum(length(CAST(body AS BLOB))+length(operation)+length(digest)+8),0) AS bytes FROM denials").get() as any;
    if (size.n > this.options.maxReceipts || size.bytes > 16 * 1024 * 1024) throw Error("HISTORY_DELETION_STORE_INVALID");
    const rows = this.db.prepare("SELECT * FROM denials ORDER BY seq").all() as any[];
    let prior = GENESIS, time = "";
    const receipts: HistoryDenialReceipt[] = [];
    for (const row of rows) {
      if (typeof row.body !== "string" || Buffer.byteLength(row.body) > 8192) throw Error("HISTORY_DELETION_STORE_INVALID");
      let body: DenialBody;
      try { body = JSON.parse(row.body); } catch { throw Error("HISTORY_DELETION_STORE_INVALID"); }
      if (!body || Object.keys(body).sort().join() !== "deniedAt,operation,priorDigest,sequence,source" ||
          body.sequence !== receipts.length + 1 || row.seq !== body.sequence || row.operation !== body.operation ||
          typeof body.operation !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(body.operation) ||
          !isValidGkxAuthoredUid(body.source) || body.source !== body.source.toLowerCase() ||
          !instant(body.deniedAt) || body.deniedAt < time || body.priorDigest !== prior ||
          stableJson(body) !== row.body || row.digest !== retrievalSha256(stableJson({corpus:this.options.corpus,...body}))) throw Error("HISTORY_DELETION_STORE_INVALID");
      prior = row.digest; time = body.deniedAt;
      receipts.push(Object.freeze({corpus:this.options.corpus,...body,digest:row.digest}));
    }
    return {receipts, digest:prior, bytes:size.bytes as number};
  }

  deny(operation: string, source: string, actionCurrent: () => boolean): Readonly<HistoryDenialReceipt> {
    source = sourceIdentity(source);
    if (typeof operation !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(operation) || typeof actionCurrent !== "function") throw Error("HISTORY_DELETION_ACTION_INVALID");
    return this.transaction(() => {
      if (actionCurrent() !== true) throw Error("HISTORY_DELETION_ACTION_STALE");
      const {receipts, digest:priorDigest, bytes} = this.scan();
      const existing = receipts.find(receipt => receipt.operation === operation);
      if (existing) {
        if (existing.source !== source) throw Error("HISTORY_DELETION_RETRY_CONFLICT");
        if (actionCurrent() !== true) throw Error("HISTORY_DELETION_ACTION_STALE");
        return existing;
      }
      const deniedAt = this.host.now();
      if (!instant(deniedAt) || receipts.length && deniedAt < receipts.at(-1).deniedAt) throw Error("HISTORY_DELETION_CLOCK_REGRESSED");
      const body = {sequence:receipts.length+1,operation,source,deniedAt,priorDigest};
      const text = stableJson(body), digest = retrievalSha256(stableJson({corpus:this.options.corpus,...body}));
      if (receipts.length >= this.options.maxReceipts || bytes+Buffer.byteLength(text)+operation.length+79 > 16*1024*1024) throw Error("HISTORY_DELETION_CAPACITY");
      if (actionCurrent() !== true) throw Error("HISTORY_DELETION_ACTION_STALE");
      this.current();
      this.db.prepare("INSERT INTO denials VALUES (?, ?, ?, ?)").run(body.sequence,operation,text,digest);
      return Object.freeze({corpus:this.options.corpus,...body,digest});
    });
  }

  /** The entire returned capability stays in the native host, never a renderer. */
  capture() {
    const captured = this.transaction(() => this.scan());
    const denied = new Set(captured.receipts.map(receipt => receipt.source));
    let valid = true;
    const current = () => {
      if (!valid) return false;
      try {
        this.transaction(() => {
          const fresh = this.scan();
          if (fresh.receipts.length !== captured.receipts.length || fresh.digest !== captured.digest) throw Error("HISTORY_DELETION_REVISION_CHANGED");
        });
        return true;
      } catch { valid = false; return false; }
    };
    return Object.freeze({corpus:this.options.corpus, watermark:Object.freeze({sequence:captured.receipts.length,digest:captured.digest}),current,
      isDenied:(source:string) => {
        if (!current()) throw Error("HISTORY_DELETION_AUTHORITY_UNAVAILABLE");
        return denied.has(sourceIdentity(source));
      }});
  }
  close() { if (this.busy) throw Error("HISTORY_DELETION_BUSY"); if (!this.closed) {this.closed=true;this.db.close();} }
}
