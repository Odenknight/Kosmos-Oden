/**
 * Personal Notes (0.9.0) — folder scope helpers.
 *
 * Pure and dependency-free so the Agent API server (which must stay
 * Obsidian-free) and the plugin can both import it, and Node can test it.
 *
 * A folder is a vault-relative path without leading or trailing slashes.
 * The single value "/" means the whole vault.
 */
export const PERSONAL_WHOLE_VAULT = "/";
export const MAX_PERSONAL_FOLDERS = 200;

/** Normalize one folder entry. Returns "" when the value is unusable. */
export function normalizeFolder(input: unknown): string {
  if (typeof input !== "string") return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  // Only the exact value "/" means the whole vault. Nothing else may widen to it.
  if (trimmed === PERSONAL_WHOLE_VAULT) return PERSONAL_WHOLE_VAULT;
  const stripped = trimmed
    .normalize("NFC")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!stripped) return "";
  // Refuse traversal segments: a scope must never be widened by "..".
  if (stripped.split("/").some((segment) => segment === ".." || segment === ".")) return "";
  return stripped;
}

/** Sanitize a persisted folder list: strings only, normalized, unique, bounded. */
export function sanitizeFolderList(raw: unknown, max = MAX_PERSONAL_FOLDERS): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const folder = normalizeFolder(item);
    if (!folder) continue;
    const key = folder.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(folder);
    if (out.length >= max) break;
  }
  return out;
}

/** True when `path` is the folder itself or lies inside it. Case-insensitive. */
export function isUnderFolder(path: unknown, folder: string): boolean {
  if (typeof path !== "string" || !path) return false;
  const f = normalizeFolder(folder);
  if (!f) return false;
  if (f === PERSONAL_WHOLE_VAULT) return true;
  const p = path.normalize("NFC").replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
  const base = f.toLowerCase();
  return p === base || p.startsWith(base + "/");
}

/** True when `path` lies under any folder in the list. */
export function isUnderAnyFolder(path: unknown, folders: readonly string[] | undefined): boolean {
  if (!Array.isArray(folders)) return false;
  return folders.some((folder) => isUnderFolder(path, folder));
}

/**
 * The Personal Notes read rule for the assistant.
 * - An empty include list reads nothing (fail closed).
 * - An exclusion always wins over an inclusion.
 */
export function inPersonalScope(
  path: unknown,
  include: readonly string[] | undefined,
  exclude: readonly string[] | undefined,
): boolean {
  if (!isUnderAnyFolder(path, include)) return false;
  if (isUnderAnyFolder(path, exclude)) return false;
  return true;
}
