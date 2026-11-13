/**
 * Personal Notes (0.9.0) — strict vault-path validation and folder scope.
 *
 * Pure and dependency-free (bundles for platform "neutral").
 *
 * A vault path is vault-relative, uses "/" separators and is compared exactly
 * as the vault stores it: no lowercasing, no Unicode normalization, no slash
 * repair. Invalid input is rejected, never rewritten into a different (and
 * possibly allowed) path. The single value "/" is the whole-vault folder
 * sentinel; it is not a valid file path.
 */
import { PersonalError } from "./types";

export const PERSONAL_WHOLE_VAULT = "/";
export const MAX_PERSONAL_FOLDERS = 200;

export type VaultPathProblem =
  | "not_string"
  | "empty"
  | "malformed_encoding"
  | "nul"
  | "control_character"
  | "unc"
  | "absolute"
  | "drive"
  | "backslash"
  | "empty_segment"
  | "dot_segment";

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0001-\u001f\u007f]/;

/** Why `path` is not an acceptable vault-relative file or folder path, or null when it is. */
export function vaultPathProblem(path: unknown): VaultPathProblem | null {
  if (typeof path !== "string") return "not_string";
  if (!path) return "empty";
  if (LONE_SURROGATE.test(path)) return "malformed_encoding";
  if (path.includes("\u0000")) return "nul";
  if (CONTROL.test(path)) return "control_character";
  if (path.startsWith("//") || path.startsWith("\\\\")) return "unc";
  // "file:<path>" is desktop Obsidian's external-file form: vault.getAbstractFileByPath
  // resolves it to any file on disk, outside the vault and its folder selection.
  if (path.startsWith("/") || path.startsWith("file:")) return "absolute";
  if (/^[A-Za-z]:/.test(path)) return "drive";
  if (path.includes("\\")) return "backslash";
  for (const segment of path.split("/")) {
    if (segment === "") return "empty_segment";
    if (segment === "." || segment === "..") return "dot_segment";
  }
  return null;
}

export function isValidVaultPath(path: unknown): path is string {
  return vaultPathProblem(path) === null;
}

/** Return `path` unchanged when valid; otherwise throw `invalid_argument`. */
export function requireVaultPath(path: unknown, name = "path"): string {
  const problem = vaultPathProblem(path);
  if (problem) throw new PersonalError("invalid_argument", `${name} is not a valid vault-relative path (${problem})`);
  return path as string;
}

/** Why `entry` is not an acceptable folder-list entry ("/" or a vault path), or null. */
export function folderProblem(entry: unknown): VaultPathProblem | null {
  return entry === PERSONAL_WHOLE_VAULT ? null : vaultPathProblem(entry);
}

/**
 * Convenience for a folder typed into a text field: surrounding whitespace is
 * trimmed, then the value must be a valid folder entry exactly as typed.
 * Returns "" when it is not. Persisted lists use parseFolderList, which does
 * not trim.
 */
export function normalizeFolder(input: unknown): string {
  if (typeof input !== "string") return "";
  const trimmed = input.trim();
  return folderProblem(trimmed) === null ? trimmed : "";
}

export interface RejectedFolder {
  index: number;
  value: unknown;
  reason: VaultPathProblem | "not_a_list" | "too_many";
}

export interface FolderListResult {
  folders: string[];
  rejected: RejectedFolder[];
}

/**
 * Validate a persisted or user-supplied folder list. Invalid entries are
 * rejected and reported, never repaired. Exact duplicates collapse; folders
 * differing only in case or Unicode form stay distinct. undefined/null is an
 * empty list; any other non-array value is rejected as a whole.
 */
export function parseFolderList(raw: unknown, max = MAX_PERSONAL_FOLDERS): FolderListResult {
  if (raw == null) return { folders: [], rejected: [] };
  if (!Array.isArray(raw)) return { folders: [], rejected: [{ index: -1, value: raw, reason: "not_a_list" }] };
  const folders: string[] = [];
  const rejected: RejectedFolder[] = [];
  raw.forEach((value, index) => {
    const problem = folderProblem(value);
    if (problem) { rejected.push({ index, value, reason: problem }); return; }
    if (folders.includes(value)) return;
    if (folders.length >= max) { rejected.push({ index, value, reason: "too_many" }); return; }
    folders.push(value);
  });
  return { folders, rejected };
}

/** parseFolderList without the report. Prefer parseFolderList where the rejection can be shown. */
export function sanitizeFolderList(raw: unknown, max = MAX_PERSONAL_FOLDERS): string[] {
  return parseFolderList(raw, max).folders;
}

/**
 * True when `path` is `folder` itself or lies inside it, at a segment
 * boundary and case-sensitively. "/" contains every valid path. Invalid
 * paths or folders never match.
 */
export function isUnderFolder(path: unknown, folder: unknown): boolean {
  if (!isValidVaultPath(path) || folderProblem(folder) !== null) return false;
  if (folder === PERSONAL_WHOLE_VAULT) return true;
  return path === folder || path.startsWith(`${folder as string}/`);
}

/** True when `path` lies under any folder in the list. */
export function isUnderAnyFolder(path: unknown, folders: readonly unknown[] | undefined): boolean {
  if (!Array.isArray(folders)) return false;
  return folders.some((folder) => isUnderFolder(path, folder));
}

/**
 * The Personal folder-selection rule:
 * - the path must be a valid vault path;
 * - an empty include list selects nothing;
 * - exclusions always win, and "/" in the exclusion list excludes everything;
 * - an invalid exclusion entry fails closed (selects nothing), because
 *   ignoring it would widen the selection.
 */
export function inPersonalScope(
  path: unknown,
  include: readonly unknown[] | undefined,
  exclude: readonly unknown[] | undefined,
): boolean {
  if (!isValidVaultPath(path)) return false;
  if (Array.isArray(exclude) && exclude.some((entry) => folderProblem(entry) !== null)) return false;
  if (!isUnderAnyFolder(path, include)) return false;
  return !isUnderAnyFolder(path, exclude);
}

/* ------------------------------------------------------------- REST input */

/** Percent-decode one REST component exactly once. Malformed escapes or UTF-8 throw `invalid_argument`. */
export function decodeRestComponent(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    throw new PersonalError("invalid_argument", "request contains malformed percent-encoding");
  }
}

/**
 * The single REST query decoder: splits a raw (still encoded) query string,
 * decodes each key and value exactly once, and rejects duplicate keys. "+" is
 * a literal plus, not a space (paths may contain "+"). Values stay strings;
 * validatePersonalArgs(…, "rest") applies the numeric syntax rules.
 */
export function parseRestQuery(search: string): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  const raw = search.startsWith("?") ? search.slice(1) : search;
  for (const part of raw.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = decodeRestComponent(eq < 0 ? part : part.slice(0, eq));
    const value = decodeRestComponent(eq < 0 ? "" : part.slice(eq + 1));
    if (Object.prototype.hasOwnProperty.call(out, key)) throw new PersonalError("invalid_argument", `duplicate query parameter: ${key}`);
    out[key] = value;
  }
  return out;
}
