/**
 * Personal Notes (0.9.0) — plain-language inventory of the import folders.
 *
 * Pure. Counts are what is present in the vault now ("Files present"), not
 * proof of what the last import created. Importer reports are the files the
 * user selected (`importReportPaths`); nothing here guesses them from a
 * localized file name.
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
  /** Markdown notes present in the import folders (selected reports not counted). */
  notesPresent: number;
  /** Other files present in the import folders (hidden "."-segments skipped). */
  otherFilesPresent: number;
  /** Notes present that contain words a search can find. */
  searchable: number;
  /** Notes present with no words: pictures, drawings or attachments only. */
  needsAttentionTotal: number;
  /** First `maxListed` paths of the notes counted in needsAttentionTotal. */
  needsAttention: string[];
  /** The Importer reports the user selected, and whether each still exists. */
  reports: { path: string; present: boolean }[];
}

const NOTE_FILE = /\.(md|markdown)$/i;

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
  /** Importer reports selected by the user. */
  importReportPaths?: readonly string[];
  maxListed?: number;
}): PersonalNotesStatus {
  const folders = [...input.importFolders];
  const reportPaths = [...(input.importReportPaths ?? [])];
  const reportSet = new Set(reportPaths);
  const fileSet = new Set(input.files);
  const maxListed = Math.max(0, Math.floor(input.maxListed ?? 100));
  const status: PersonalNotesStatus = {
    importFolders: folders, notesPresent: 0, otherFilesPresent: 0, searchable: 0,
    needsAttentionTotal: 0, needsAttention: [],
    reports: reportPaths.map((path) => ({ path, present: fileSet.has(path) })),
  };
  for (const note of input.notes) {
    if (!note || reportSet.has(note.path) || !isUnderAnyFolder(note.path, folders)) continue;
    status.notesPresent++;
    if (hasSearchableText(note.body)) status.searchable++;
    else {
      status.needsAttentionTotal++;
      if (status.needsAttention.length < maxListed) status.needsAttention.push(note.path);
    }
  }
  for (const path of input.files) {
    if (typeof path !== "string" || NOTE_FILE.test(path) || reportSet.has(path)) continue;
    if (path.split("/").some((segment) => segment.startsWith("."))) continue;
    if (isUnderAnyFolder(path, folders)) status.otherFilesPresent++;
  }
  return status;
}
