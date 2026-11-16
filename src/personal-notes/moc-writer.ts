/**
 * Personal Notes (0.9.5) — narrow, hash-checked writer for a MoC plan.
 *
 * Applies one MocPlan through an injected host and writes at most the single
 * generated index note. Operations on the same path are serialized with the
 * tagging writer's file lock. Immediately before writing the target is
 * re-read: an "update" requires the file to still hold exactly the text the
 * plan was computed from (otherwise skipped "changed", never overwritten); a
 * "create" requires the file to still not exist (otherwise skipped "exists").
 * "unchanged" and "refuse" write nothing. Updates save the exact before-text
 * first; when the backup cannot be saved nothing is written.
 */
import { MOC_CONTRACT, type MocPlan } from "./moc";
import { vaultPathProblem } from "./scope";
import { withTaggingFileLock } from "./tagging-writer";

export interface MocWriterHost {
  /** Current text of the file; null (or a rejection) when it does not exist. */
  readRaw(path: string): Promise<string | null>;
  /** Replace the text atomically only if the file still equals `expectedRaw`; return false when it did not. */
  writeRaw(path: string, text: string, expectedRaw: string): Promise<boolean | void>;
  /** Create a new file. Must not overwrite: return false (or reject) when the file exists. */
  createFile(path: string, text: string): Promise<boolean | void>;
  /** Persist exact before-text; returns an opaque, non-empty reference. */
  saveBackup(path: string, beforeText: string): Promise<string>;
  /** SHA-256 hex of the text's UTF-8 bytes. Must reject (not return "") on failure. */
  sha256(text: string): Promise<string>;
  /** Called with the new content hash just before writing, so the plugin can ignore its own event. */
  recordOwnWrite?(path: string, hash: string): void;
}

export type MocSkipReason = "changed" | "exists" | "missing" | "unchanged" | "refused";

export interface MocApplyResult {
  written: { path: string; action: "create" | "update"; backupRef: string | null; beforeHash: string | null; afterHash: string }[];
  skipped: { path: string; reason: MocSkipReason; detail: string }[];
  failed: { path: string; error: string }[];
  /** Paths and content hashes Kosmos wrote; the stamping guard must treat these as its own writes. */
  ownWrites: { path: string; hash: string }[];
}

async function hashOf(host: MocWriterHost, text: string): Promise<string> {
  const hash = await host.sha256(text);
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) throw new Error("sha256 unavailable; nothing was written");
  return hash;
}

/** Apply a plan from planMoc. Never throws for per-file problems; they are reported in the result. */
export async function applyMocPlan(plan: MocPlan, host: MocWriterHost): Promise<MocApplyResult> {
  const result: MocApplyResult = { written: [], skipped: [], failed: [], ownWrites: [] };
  const path = typeof plan?.target === "string" ? plan.target : "";
  if (!plan || plan.contract !== MOC_CONTRACT || vaultPathProblem(plan.target) || !/\.md$/i.test(path)) {
    result.failed.push({ path, error: "not a kosmos-moc/1 plan; nothing was written" });
    return result;
  }
  if (plan.action === "refuse") {
    result.skipped.push({ path, reason: "refused", detail: plan.detail || plan.reason || "the plan was refused" });
    return result;
  }
  if (plan.action === "unchanged") {
    result.skipped.push({ path, reason: "unchanged", detail: "the index is already up to date" });
    return result;
  }
  const proposed = plan.proposedRaw;
  const expected = plan.existingRaw;
  if ((plan.action !== "create" && plan.action !== "update") || typeof proposed !== "string"
    || (plan.action === "update" ? typeof expected !== "string" : expected !== null)) {
    result.failed.push({ path, error: "the plan is inconsistent; nothing was written" });
    return result;
  }
  try {
    await withTaggingFileLock(path, async () => {
      let current: string | null;
      try { current = await host.readRaw(path); } catch { current = null; }
      if (current !== null && typeof current !== "string") throw new Error("the file could not be read; nothing was written");
      if (plan.action === "create") {
        if (current !== null) {
          result.skipped.push({ path, reason: "exists", detail: "a file appeared at the index path after the preview; it was not overwritten" });
          return;
        }
        const afterHash = await hashOf(host, proposed);
        host.recordOwnWrite?.(path, afterHash);
        if (await host.createFile(path, proposed) === false) {
          result.skipped.push({ path, reason: "exists", detail: "a file appeared at the index path while writing; it was not overwritten" });
          return;
        }
        result.written.push({ path, action: "create", backupRef: null, beforeHash: null, afterHash });
        result.ownWrites.push({ path, hash: afterHash });
        return;
      }
      if (current === null) {
        result.skipped.push({ path, reason: "missing", detail: "the index could not be read; it may have been moved or deleted" });
        return;
      }
      if (current !== expected) {
        result.skipped.push({ path, reason: "changed", detail: "the index changed after the preview; preview again" });
        return;
      }
      const beforeHash = await hashOf(host, current);
      const afterHash = await hashOf(host, proposed);
      const backupRef = await host.saveBackup(path, current);
      if (typeof backupRef !== "string" || !backupRef) throw new Error("backup was not saved; nothing was written");
      host.recordOwnWrite?.(path, afterHash);
      if (await host.writeRaw(path, proposed, current) === false) {
        result.skipped.push({ path, reason: "changed", detail: "the index changed while writing; it was not overwritten" });
        return;
      }
      result.written.push({ path, action: "update", backupRef, beforeHash, afterHash });
      result.ownWrites.push({ path, hash: afterHash });
    });
  } catch (error: any) {
    result.failed.push({ path, error: String(error?.message || error) });
  }
  return result;
}
