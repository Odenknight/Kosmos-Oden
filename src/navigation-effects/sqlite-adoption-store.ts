import { DatabaseSync } from "node:sqlite";
import { closeSync, lstatSync, openSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonicalJson, validateAdoptionRegistry, type AdoptionRegistryGeneration, type MocAdoptionReceipt } from "./adoption-registry";
import { InMemoryAdoptionStore } from "./in-memory-adoption-store";

const APPLICATION_ID = 0x4b414450;
const MAX_COMMITS = 1000, MAX_RECORD_BYTES = 1024 * 1024;

/** Native-only adoption metadata. The caller must own a private local directory.
 * No source-note API, automatic initialization, pruning, or write authority.
 */
export class SqliteAdoptionStore {
  private constructor(private db: DatabaseSync) {}

  static async open(directory: string, initial?: AdoptionRegistryGeneration) {
    const root = resolve(directory);
    if (root.startsWith("\\\\") || realpathSync(root) !== root || !lstatSync(root).isDirectory()) throw Error("ADOPTION_DIRECTORY_UNSAFE");
    const path = join(root, "adoption.sqlite");
    if (initial) {
      initial = JSON.parse(canonicalJson(initial));
      if (!(await validateAdoptionRegistry(initial)).valid || initial.generation !== 0 || initial.bindings.length) throw Error("ADOPTION_INITIAL_REGISTRY_INVALID");
      // Exclusive creation refuses existing state, including an empty/corrupt DB.
      closeSync(openSync(path, "wx", 0o600));
    }
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 64 * 1024 * 1024 || (!initial && stat.size === 0)) throw Error("ADOPTION_DATABASE_UNSAFE");
    const db = new DatabaseSync(path);
    try {
      if (!initial) {
        const identity = db.prepare("PRAGMA application_id").get() as any;
        const version = db.prepare("PRAGMA user_version").get() as any;
        if (identity.application_id !== APPLICATION_ID || version.user_version !== 1) throw Error("ADOPTION_DATABASE_IDENTITY_INVALID");
      }
      db.exec("PRAGMA busy_timeout=1000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA max_page_count=16384;");
      if (initial) {
        db.exec("BEGIN IMMEDIATE; CREATE TABLE initial_registry (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL); CREATE TABLE commits (seq INTEGER PRIMARY KEY, operation TEXT NOT NULL UNIQUE, receipt_id TEXT NOT NULL UNIQUE, expected TEXT NOT NULL, registry TEXT NOT NULL, receipt TEXT NOT NULL);");
        db.prepare("INSERT INTO initial_registry VALUES (1, ?)").run(canonicalJson(initial));
        db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=1; COMMIT;`);
      }
      const identity = db.prepare("PRAGMA application_id").get() as any;
      const version = db.prepare("PRAGMA user_version").get() as any;
      if (identity.application_id !== APPLICATION_ID || version.user_version !== 1) throw Error("ADOPTION_DATABASE_IDENTITY_INVALID");
      const store = new SqliteAdoptionStore(db);
      await store.replay();
      return store;
    } catch (error) { db.close(); throw error; }
  }

  private parse(text: unknown) {
    if (typeof text !== "string" || Buffer.byteLength(text) > MAX_RECORD_BYTES) throw Error("ADOPTION_RECORD_BUDGET");
    return JSON.parse(text);
  }

  private async replay() {
    // Capture both tables synchronously in one read transaction before hashing.
    this.db.exec("BEGIN;");
    let initial: any, rows: any[];
    try {
      initial = this.db.prepare("SELECT body FROM initial_registry WHERE id=1").get();
      const count = this.db.prepare("SELECT count(*) AS n FROM commits").get() as any;
      if (count.n > MAX_COMMITS) throw Error("ADOPTION_STORE_FULL");
      rows = this.db.prepare("SELECT * FROM commits ORDER BY seq").all();
      this.db.exec("COMMIT;");
    } catch (error) { this.db.exec("ROLLBACK;"); throw error; }
    const registry = this.parse(initial?.body);
    if (!(await validateAdoptionRegistry(registry)).valid || registry.generation !== 0 || registry.bindings.length) throw Error("ADOPTION_INITIAL_REGISTRY_INVALID");
    const state = new InMemoryAdoptionStore(registry);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], next = this.parse(row.registry), receipt = this.parse(row.receipt);
      if (row.seq !== i + 1 || row.operation !== receipt.operationId || row.receipt_id !== receipt.receiptId) throw Error("ADOPTION_LOG_INVALID");
      await state.commit(row.expected, next, receipt);
    }
    return { state, count: rows.length };
  }

  async load() { return (await this.replay()).state.load(); }
  async receipt(id: string) { return (await this.replay()).state.receipt(id); }

  async commit(expectedDigest: string, next: AdoptionRegistryGeneration, receipt: MocAdoptionReceipt, stillCurrent: () => boolean) {
    // Clone before awaits so caller mutation cannot change the committed bytes.
    const nextText = canonicalJson(next), receiptText = canonicalJson(receipt);
    next = this.parse(nextText); receipt = this.parse(receiptText);
    const { state, count } = await this.replay();
    const existing = state.receipt(receipt.receiptId);
    await state.commit(expectedDigest, next, receipt);
    if (existing) {
      if (typeof stillCurrent !== "function" || stillCurrent() !== true) throw Error("ADOPTION_HOST_STATE_STALE");
      return;
    }
    if (count >= MAX_COMMITS) throw Error("ADOPTION_STORE_FULL");
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.db.prepare("SELECT count(*) AS n FROM commits").get() as any;
      if (current.n !== count) throw Error("REGISTRY_GENERATION_STALE");
      // The trusted host must check source bytes and authority synchronously.
      // No await may separate this check from the transactional append.
      if (typeof stillCurrent !== "function" || stillCurrent() !== true) throw Error("ADOPTION_HOST_STATE_STALE");
      this.db.prepare("INSERT INTO commits VALUES (?, ?, ?, ?, ?, ?)").run(count + 1, receipt.operationId, receipt.receiptId, expectedDigest, nextText, receiptText);
      this.db.exec("COMMIT;");
    } catch (error) { this.db.exec("ROLLBACK;"); throw error; }
  }

  close() { this.db.close(); }
}
