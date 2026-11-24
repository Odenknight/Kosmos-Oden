/** Pure, DOM-free Nextcloud sync settings, URL, exclusion, and three-way planning logic. */
import { isGkxLoopbackHost, isGkxPrivateLanIpLiteral } from "gkos-engine";
export const NEXTCLOUD_SYNC_SCHEMA = 2;
/** Saved sync records. 3: the scope is the exact folder address. Up to 2 it was stored lower-cased, so those
 *  records cannot say which of two folders differing only in capitals they were kept for, and are not used. */
export const NEXTCLOUD_STATE_SCHEMA = 3;
export const OBSIDIAN_CONFIG_PATTERN = ".obsidian/**";
/** Kosmos-Oden's own plugin data holds the Agent API credential and local
 *  sync state and must never be uploaded. The glob also covers
 *  version-suffixed install folders such as `kosmos-oden_v0.8.2`, which the
 *  previous literal path silently failed to match. */
export const PROTECTED_SYNC_EXCLUDES = [".obsidian/plugins/kosmos-oden*/data.json"];
export const DEFAULT_SYNC_EXCLUDES = [".git/**", ".trash/**"];

export interface NextcloudSettings {
  schemaVersion: number; enabled: boolean; serverUrl: string; username: string;
  remoteFolder: string; syncOnStartup: boolean; intervalMinutes: number;
  propagateDeletes: boolean; syncObsidianConfig: boolean; excludePatterns: string[];
}
export const DEFAULT_NEXTCLOUD_SETTINGS: NextcloudSettings = {
  schemaVersion: NEXTCLOUD_SYNC_SCHEMA, enabled: false, serverUrl: "", username: "",
  remoteFolder: "Kosmos-Oden", syncOnStartup: false, intervalMinutes: 0,
  propagateDeletes: false, syncObsidianConfig: false, excludePatterns: [...DEFAULT_SYNC_EXCLUDES],
};
export interface SyncRecord { localHash: string; remoteEtag: string; remoteMtime: number; remoteSize: number; syncedAt: number; }
export interface NextcloudSyncState { schemaVersion: number; scope: string; files: Record<string, SyncRecord>; }
export type SyncActionKind = "upload" | "download" | "delete-local" | "delete-remote" | "compare" | "conflict" | "forget";
export interface SyncAction { kind: SyncActionKind; path: string; reason: string; }
export interface LocalEntry { hash: string; size: number; }
export interface RemoteEntry { etag: string; mtime: number; size: number; }
export interface SyncSummary { uploaded: number; downloaded: number; deletedLocal: number; deletedRemote: number; unchanged: number; conflicts: string[]; errors: string[]; }

export function migrateNextcloudSettings(raw: any): NextcloudSettings {
  const s = Object.assign({}, DEFAULT_NEXTCLOUD_SETTINGS, raw || {}) as NextcloudSettings;
  s.enabled = s.enabled === true; s.syncOnStartup = s.syncOnStartup === true; s.propagateDeletes = s.propagateDeletes === true;
  s.syncObsidianConfig = s.syncObsidianConfig === true;
  s.intervalMinutes = Math.max(0, Math.min(1440, Math.floor(Number(s.intervalMinutes) || 0)));
  s.serverUrl = String(s.serverUrl || "").trim(); s.username = String(s.username || "").trim();
  s.remoteFolder = normalizeRemotePath(String(s.remoteFolder || "Kosmos-Oden")) || "Kosmos-Oden";
  s.excludePatterns = Array.isArray(s.excludePatterns)
    ? s.excludePatterns.map(String).map((v) => v.trim()).filter((v) => v && v.toLowerCase() !== OBSIDIAN_CONFIG_PATTERN).slice(0, 200)
    : [...DEFAULT_SYNC_EXCLUDES];
  s.schemaVersion = NEXTCLOUD_SYNC_SCHEMA; return s;
}
export function emptyNextcloudState(scope = ""): NextcloudSyncState { return { schemaVersion: NEXTCLOUD_STATE_SCHEMA, scope, files: {} }; }
export function migrateNextcloudState(raw: any, scope: string): NextcloudSyncState {
  // Records of an earlier schema, or for another scope, are not used: trusting them could delete or overwrite
  // local files. Without records every file present on both sides is compared once, and nothing is deleted.
  if (!raw || raw.schemaVersion !== NEXTCLOUD_STATE_SCHEMA || raw.scope !== scope || !raw.files || typeof raw.files !== "object" || Array.isArray(raw.files)) return emptyNextcloudState(scope);
  const files: Record<string, SyncRecord> = {};
  for (const [path, value] of Object.entries(raw.files as Record<string, any>).slice(0, 100_000)) {
    if (!safeRelativePath(path) || !value || typeof value !== "object" || Array.isArray(value)) continue; const v = value as any;
    files[path] = { localHash: String(v.localHash || ""), remoteEtag: String(v.remoteEtag || ""), remoteMtime: Number(v.remoteMtime) || 0, remoteSize: Number(v.remoteSize) || 0, syncedAt: Number(v.syncedAt) || 0 };
  }
  return { schemaVersion: NEXTCLOUD_STATE_SCHEMA, scope, files };
}
export function normalizeRemotePath(path: string): string { return path.replace(/\\/g, "/").split("/").filter((p) => p && p !== ".").join("/"); }
export function safeRelativePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\0") || path.includes("\\")) return false;
  return path.split("/").every((p) => p.length > 0 && p !== "." && p !== "..");
}
function globRegex(pattern: string): RegExp {
  let out = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") { out += ".*"; i++; }
    else if (c === "*") out += "[^/]*"; else if (c === "?") out += "[^/]";
    else out += c.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(out + "(?:$|/.*)", "i");
}
export function isExcluded(path: string, patterns: string[]): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  return patterns.some((pattern) => { const p = pattern.replace(/\\/g, "/").replace(/^\/+/, "").trim(); return Boolean(p) && (globRegex(p).test(normalized) || (!p.includes("/") && normalized.split("/").includes(p))); });
}
export function effectiveSyncExcludes(settings: NextcloudSettings, pluginDir?: string): string[] {
  const patterns = [...settings.excludePatterns];
  if (!settings.syncObsidianConfig) patterns.push(OBSIDIAN_CONFIG_PATTERN);
  // The host-reported install directory is authoritative. The globs above
  // remain as the fallback for a folder named outside that pattern.
  // isExcluded() normalises separators on both sides, so no path rewriting
  // is needed here beyond trimming.
  const guarded = [...PROTECTED_SYNC_EXCLUDES];
  const dir = (pluginDir || "").trim();
  if (dir) guarded.push(`${dir}/data.json`);
  for (const protectedPath of guarded) {
    if (!patterns.some((p) => p.toLowerCase() === protectedPath.toLowerCase())) patterns.push(protectedPath);
  }
  return patterns;
}
export function planSync(local: Record<string, LocalEntry>, remote: Record<string, RemoteEntry>, previous: Record<string, SyncRecord>, propagateDeletes: boolean): SyncAction[] {
  const paths = [...new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(previous)])].sort(); const actions: SyncAction[] = [];
  for (const path of paths) {
    const l = local[path]; const r = remote[path]; const p = previous[path];
    if (l && r) {
      if (!p) actions.push({ kind: "compare", path, reason: "exists on both sides without common state" });
      else { const lc = l.hash !== p.localHash; const rc = r.etag !== p.remoteEtag;
        if (lc && rc) actions.push({ kind: "conflict", path, reason: "local and Nextcloud both changed" });
        else if (lc) actions.push({ kind: "upload", path, reason: "local changed" });
        else if (rc) actions.push({ kind: "download", path, reason: "Nextcloud changed" }); }
    } else if (l) {
      if (!p) actions.push({ kind: "upload", path, reason: "new local file" });
      else if (l.hash !== p.localHash) actions.push({ kind: "conflict", path, reason: "local changed after Nextcloud deletion" });
      else actions.push({ kind: propagateDeletes ? "delete-local" : "upload", path, reason: propagateDeletes ? "Nextcloud deletion" : "restore missing Nextcloud file" });
    } else if (r) {
      if (!p) actions.push({ kind: "download", path, reason: "new Nextcloud file" });
      else if (r.etag !== p.remoteEtag) actions.push({ kind: "conflict", path, reason: "Nextcloud changed after local deletion" });
      else actions.push({ kind: propagateDeletes ? "delete-remote" : "download", path, reason: propagateDeletes ? "local deletion" : "restore missing local file" });
    } else if (p) actions.push({ kind: "forget", path, reason: "deleted on both sides" });
  }
  return actions;
}
/** Most conflict copies kept beside one note. A note that conflicts on every run (another program rewrites it
 *  between runs) stops here instead of filling the folder. */
export const MAX_CONFLICT_COPIES = 5;
const CONFLICT_MARK = ".nextcloud-conflict-";
const CONFLICT_STAMP = "\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z";
const CONFLICT_COPY = new RegExp(`\\.nextcloud-conflict-${CONFLICT_STAMP}(?:\\.[^./]+)?$`);
function splitExtension(path: string): [string, string] {
  const dot = path.lastIndexOf("."); return dot > path.lastIndexOf("/") ? [path.slice(0, dot), path.slice(dot)] : [path, ""];
}
/** Where the Nextcloud version of `path` is kept when the two sides disagree: `note.nextcloud-conflict-<UTC time>.md`. */
export function conflictCopyPath(path: string, at: Date): string {
  const [stem, ext] = splitExtension(path);
  return `${stem}${CONFLICT_MARK}${at.toISOString().replace(/[:.]/g, "-")}${ext}`;
}
/** A conflict copy is a local safety copy. It is never synced: uploaded, it would be compared and copied again. */
export function isConflictCopyPath(path: string): boolean { return CONFLICT_COPY.test(path); }
/** Whether `candidate` is a conflict copy of exactly `path` (same folder, same name, same extension). */
export function isConflictCopyOf(candidate: string, path: string): boolean {
  const [stem, ext] = splitExtension(path);
  if (!candidate.startsWith(stem + CONFLICT_MARK) || !candidate.endsWith(ext)) return false;
  return new RegExp(`^${CONFLICT_STAMP}$`).test(candidate.slice(stem.length + CONFLICT_MARK.length, candidate.length - ext.length));
}
export function encodePath(path: string): string { return path.split("/").filter(Boolean).map(encodeURIComponent).join("/"); }
export function buildNextcloudDavRoot(serverUrl: string, username: string, remoteFolder: string): string {
  const parsed = new URL(serverUrl.trim()); validateTransport(parsed); parsed.hash = ""; parsed.search = "";
  let base = parsed.toString().replace(/\/$/, "");
  if (!/\/remote\.php\/(?:dav\/files\/[^/]+|webdav)(?:\/|$)/i.test(parsed.pathname)) base += `/remote.php/dav/files/${encodeURIComponent(username)}`;
  const folder = encodePath(normalizeRemotePath(remoteFolder)); return folder ? `${base}/${folder}/` : `${base}/`;
}
function validateTransport(url: URL): void {
  if (url.protocol === "https:") return; if (url.protocol !== "http:") throw new Error("Nextcloud URL must use HTTPS");
  // Literal addresses only: a prefix test would accept a public DNS name such as 10.example.com.
  const privateHost = isGkxLoopbackHost(url.hostname) || isGkxPrivateLanIpLiteral(url.hostname);
  if (!privateHost) throw new Error("HTTP is allowed only for a literal private or loopback Nextcloud address; use HTTPS for hostnames");
}
/**
 * The saved state a run may plan with. State recorded for another server,
 * account or folder describes different files: planned against this one it
 * reads every local file as "deleted on Nextcloud". Such state is dropped.
 */
export function stateForScope(state: NextcloudSyncState, settings: NextcloudSettings): NextcloudSyncState {
  const scope = syncScope(settings);
  return state.scope === scope ? state : emptyNextcloudState(scope);
}
export function syncScope(settings: NextcloudSettings): string {
  if (!settings.serverUrl || !settings.username) return "";
  // Exact: "Vault" and "vault" are two folders on a Nextcloud server (the URL parser already lower-cases the host).
  try { return buildNextcloudDavRoot(settings.serverUrl, settings.username, settings.remoteFolder); } catch { return ""; }
}
