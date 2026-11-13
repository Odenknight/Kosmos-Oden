/**
 * Personal Notes (0.9.5) — one folder's Map of Content, planned and applied.
 *
 * The generator (moc.ts) and the writer (moc-writer.ts) are pure; this module
 * joins them to a host in one place so the Obsidian command, the tests and any
 * future surface run exactly the same sequence: list the vault's notes, read
 * the target as it is now, plan, then write only when the plan says create or
 * update. Nothing is written when the plan refuses or the file is unchanged.
 */
import { MOC_DEFAULT_FILE_NAME, planMoc, type MocNoteInput, type MocOptions, type MocPlan } from "./moc";
import { applyMocPlan, type MocApplyResult, type MocWriterHost } from "./moc-writer";

/** What one folder run needs from the host. `readRaw` returning null means "no such file". */
export interface MocFolderIo extends MocWriterHost {
  /** Every Markdown path in the vault, forward slashes, any order. */
  listMarkdown(): readonly string[];
  /** Authored metadata for one note. Missing fields are simply absent. */
  meta(path: string): {
    title?: string | null;
    aliases?: readonly string[] | null;
    tags?: readonly string[] | null;
    updatedAt?: string | null;
    supersededBy?: readonly string[] | null;
    summary?: string | null;
  };
}

export interface MocFolderRun {
  plan: MocPlan;
  /** null for "unchanged" and "refuse". */
  applied: MocApplyResult | null;
}

/** Strip leading/trailing slashes; the vault root stays "" and is rejected by planMoc. */
export const normaliseMocFolder = (folder: string): string => String(folder ?? "").replace(/^\/+|\/+$/g, "");

/**
 * Plan and, when needed, write the MoC of `folder`.
 * Throws only for invalid input (MocError) or a host failure; per-file write
 * problems come back in `applied.skipped` / `applied.failed`.
 */
export async function runFolderMoc(folder: string, io: MocFolderIo, options: MocOptions = {}): Promise<MocFolderRun> {
  const clean = normaliseMocFolder(folder);
  const target = `${clean ? `${clean}/` : ""}${options.fileName ?? MOC_DEFAULT_FILE_NAME}`;
  const notes: MocNoteInput[] = [];
  for (const path of io.listMarkdown()) {
    if (path === target) continue;
    const meta = io.meta(path);
    notes.push({
      path,
      ...(meta.title !== undefined ? { title: meta.title } : {}),
      ...(meta.aliases !== undefined ? { aliases: meta.aliases } : {}),
      ...(meta.tags !== undefined ? { tags: meta.tags } : {}),
      ...(meta.updatedAt !== undefined ? { updatedAt: meta.updatedAt } : {}),
      ...(meta.supersededBy !== undefined ? { supersededBy: meta.supersededBy } : {}),
      ...(meta.summary !== undefined ? { summary: meta.summary } : {}),
    });
  }
  const existingRaw = await io.readRaw(target);
  const plan = planMoc({ folder: clean, notes, existingRaw, options });
  const applied = plan.action === "create" || plan.action === "update" ? await applyMocPlan(plan, io) : null;
  return { plan, applied };
}