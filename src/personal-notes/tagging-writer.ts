/**
 * Personal Notes (0.9.0) — narrow, hash-checked tagging writer.
 *
 * Applies a TaggingPlan through an injected host. Writes are serialized per
 * file. Immediately before each write the file is re-read and re-hashed; a
 * file that changed since the preview is skipped, never overwritten. For
 * explicit bulk operations the exact before-text is saved first (the host
 * chooses the durable, excluded backup location); a manifest describes every
 * backup and `restoreTaggingBackup` refuses to overwrite later edits.
 */
import type { TaggingPlan } from "./tagging";

export const TAGGING_BACKUP_CONTRACT = "kosmos-tagging-backup/1";

export interface TaggingWriterHost {
  readRaw(path: string): Promise<string>;
  /**
   * Replace the file's text. `expectedRaw` is what the writer just verified;
   * the host should write atomically only if the file still equals it (e.g.
   * inside Vault.process) and return false when it did not.
   */
  writeRaw(path: string, text: string, expectedRaw: string): Promise<boolean | void>;
  /** Persist exact before-text; returns an opaque reference for the manifest. */
  saveBackup(path: string, beforeText: string): Promise<string>;
  /** SHA-256 hex of the text's UTF-8 bytes. Must reject (not return "") on failure. */
  sha256(text: string): Promise<string>;
  /** Called with the new content hash just before writing, so the plugin can ignore its own modify event. */
  recordOwnWrite?(path: string, hash: string): void;
}

export interface TaggingBackupEntry {
  path: string;
  backupRef: string;
  beforeHash: string;
  afterHash: string;
}

export interface TaggingBackupManifest {
  contract: typeof TAGGING_BACKUP_CONTRACT;
  proposalTimeMs: number;
  entries: TaggingBackupEntry[];
}

export interface TaggingApplyResult {
  written: { path: string; backupRef: string | null; beforeHash: string; afterHash: string }[];
  skipped: { path: string; reason: "changed" | "missing" | "no_changes"; detail: string }[];
  failed: { path: string; error: string }[];
  /** Paths and content hashes Kosmos wrote; the stamping guard must treat these as its own writes. */
  ownWrites: { path: string; hash: string }[];
  /** Present when backups were taken; the plugin stores it next to the backups. */
  manifest: TaggingBackupManifest | null;
}

const fileLocks = new Map<string, Promise<unknown>>();

/** Run `fn` after every earlier operation on the same path has settled. */
export function withTaggingFileLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(path) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const settled = run.then(() => undefined, () => undefined);
  fileLocks.set(path, settled);
  void settled.then(() => { if (fileLocks.get(path) === settled) fileLocks.delete(path); });
  return run;
}

async function hashOf(host: { sha256(text: string): Promise<string> }, text: string): Promise<string> {
  const hash = await host.sha256(text);
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) throw new Error("sha256 unavailable; nothing was written");
  return hash;
}

/** Apply the previewed plan. `backup` defaults to true (explicit bulk operation); automatic timestamps pass false. */
export async function applyTaggingPlan(plan: TaggingPlan, host: TaggingWriterHost, opts: { backup?: boolean } = {}): Promise<TaggingApplyResult> {
  const backup = opts.backup !== false;
  const result: TaggingApplyResult = { written: [], skipped: [], failed: [], ownWrites: [], manifest: null };
  const entries: TaggingBackupEntry[] = [];
  for (const note of plan.notes) {
    if (note.proposedRaw == null || !note.changes.length) {
      result.skipped.push({ path: note.path, reason: "no_changes", detail: "nothing to change" });
      continue;
    }
    const proposed = note.proposedRaw;
    try {
      await withTaggingFileLock(note.path, async () => {
        let current: string;
        try {
          current = await host.readRaw(note.path);
        } catch {
          result.skipped.push({ path: note.path, reason: "missing", detail: "the note could not be read; it may have been moved or deleted" });
          return;
        }
        const beforeHash = await hashOf(host, current);
        if (beforeHash !== note.originalHash) {
          result.skipped.push({ path: note.path, reason: "changed", detail: "the note changed after the preview; preview again" });
          return;
        }
        const afterHash = await hashOf(host, proposed);
        const backupRef = backup ? await host.saveBackup(note.path, current) : null;
        if (backup && (typeof backupRef !== "string" || !backupRef)) throw new Error("backup was not saved; nothing was written");
        host.recordOwnWrite?.(note.path, afterHash);
        const ok = await host.writeRaw(note.path, proposed, current);
        if (ok === false) {
          result.skipped.push({ path: note.path, reason: "changed", detail: "the note changed while writing; it was not overwritten" });
          return;
        }
        result.written.push({ path: note.path, backupRef, beforeHash, afterHash });
        result.ownWrites.push({ path: note.path, hash: afterHash });
        if (backupRef) entries.push({ path: note.path, backupRef, beforeHash, afterHash });
      });
    } catch (error: any) {
      result.failed.push({ path: note.path, error: String(error?.message || error) });
    }
  }
  if (entries.length) result.manifest = { contract: TAGGING_BACKUP_CONTRACT, proposalTimeMs: plan.proposalTimeMs, entries };
  return result;
}

export interface TaggingRestoreHost {
  readRaw(path: string): Promise<string>;
  readBackup(backupRef: string): Promise<string>;
  writeRaw(path: string, text: string, expectedRaw: string): Promise<boolean | void>;
  sha256(text: string): Promise<string>;
}

export type TaggingRestoreResult =
  | { restored: true }
  | { restored: false; reason: "changed_since_apply" | "missing" | "backup_mismatch" };

/** Restore one backed-up note, only if it still holds exactly what the tagging write produced. */
export async function restoreTaggingBackup(entry: TaggingBackupEntry, host: TaggingRestoreHost): Promise<TaggingRestoreResult> {
  return withTaggingFileLock(entry.path, async (): Promise<TaggingRestoreResult> => {
    let current: string;
    try { current = await host.readRaw(entry.path); } catch { return { restored: false, reason: "missing" }; }
    if (await hashOf(host, current) !== entry.afterHash) return { restored: false, reason: "changed_since_apply" };
    const before = await host.readBackup(entry.backupRef);
    if (await hashOf(host, before) !== entry.beforeHash) return { restored: false, reason: "backup_mismatch" };
    const ok = await host.writeRaw(entry.path, before, current);
    return ok === false ? { restored: false, reason: "changed_since_apply" } : { restored: true };
  });
}
