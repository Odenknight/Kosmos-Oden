/**
 * Personal Notes (0.9.0) — plain-language status for imported notes.
 *
 * Pure. Computed by Kosmos-Oden from the vault itself, so it does not depend
 * on parsing the Importer's localized log file.
 */
import { isUnderAnyFolder } from "./scope";

export interface StatusNote {
  /** Vault-relative path of a Markdown note. */
  path: string;
  /** Note text with frontmatter already removed. */
  body: string;
}

export interface PersonalNotesStatus {
  importFolders: string[];
  /** Notes found inside the import folders (import logs excluded). */
  imported: number;
  /** Non-note files found inside the import folders. */
  attachmentsSaved: number;
  /** Imported notes that contain words a search can find. */
  searchable: number;
  /** Imported notes with no words: pictures, drawings or attachments only. */
  needsAttentionTotal: number;
  /** First `maxListed` paths of the notes counted in needsAttentionTotal. */
  needsAttention: string[];
  /** Importer log notes found inside the import folders. */
  importLogs: string[];
}

const NOTE_FILE = /\.(md|markdown)$/i;
/** Obsidian Importer names its report "<date> <importer> import log" (English UI). */
const IMPORT_LOG = /\simport log\.md$/i;

/** True when the text holds at least one letter or digit outside link syntax. */
export function hasSearchableText(body: unknown): boolean {
  if (typeof body !== "string" || !body) return false;
  const withoutLinks = body
    .replace(/!?\[\[[^\]\n]*\]\]/g, " ")          // [[x]] and ![[x]]
    .replace(/!?\[[^\]\n]*\]\([^)\n]*\)/g, " ")   // [t](x) and ![t](x)
    .replace(/<[^>\n]+>/g, " ");                  // inline HTML tags
  return /[\p{L}\p{N}]/u.test(withoutLinks);
}

export function summarizePersonalNotes(input: {
  notes: readonly StatusNote[];
  /** Every file path in the vault, notes included. */
  files: readonly string[];
  importFolders: readonly string[];
  maxListed?: number;
}): PersonalNotesStatus {
  const folders = [...input.importFolders];
  const maxListed = Math.max(0, Math.floor(input.maxListed ?? 100));
  const status: PersonalNotesStatus = {
    importFolders: folders, imported: 0, attachmentsSaved: 0, searchable: 0,
    needsAttentionTotal: 0, needsAttention: [], importLogs: [],
  };
  for (const note of input.notes) {
    if (!note || !isUnderAnyFolder(note.path, folders)) continue;
    if (IMPORT_LOG.test(note.path)) { status.importLogs.push(note.path); continue; }
    status.imported++;
    if (hasSearchableText(note.body)) status.searchable++;
    else {
      status.needsAttentionTotal++;
      if (status.needsAttention.length < maxListed) status.needsAttention.push(note.path);
    }
  }
  for (const path of input.files) {
    if (typeof path !== "string" || NOTE_FILE.test(path)) continue;
    if (path.split("/").some((segment) => segment.startsWith("."))) continue;
    if (isUnderAnyFolder(path, folders)) status.attachmentsSaved++;
  }
  status.importLogs.sort();
  return status;
}
