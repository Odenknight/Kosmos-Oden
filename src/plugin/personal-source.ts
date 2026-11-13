/**
 * Personal Notes (0.9.0) — PersonalVaultSource over the Obsidian vault.
 *
 * Reads never write. Frontmatter fields (title, aliases, tags, uid,
 * timestamps, lineage, sensitivity) come from the raw text itself through a
 * strict YAML parse, so they always agree with the bytes that were read;
 * body links, embeds and inline tags come from Obsidian's metadata cache and
 * link resolver. The pure parts (`buildNoteMeta`, `isPhysicallyContained`)
 * take their dependencies as arguments so Node tests can call them with fakes.
 */
import type { App, CachedMetadata, TFile } from "obsidian";
import { FrontmatterPatchError, readFrontmatter } from "../personal-notes/frontmatter-patch";
import type { PersonalAttachmentRef, PersonalFileStat, PersonalNoteMeta, PersonalVaultSource } from "../personal-notes/types";

/** Strict YAML parse: throws on malformed YAML and on a non-mapping document. */
export type StrictYaml = (text: string) => Record<string, unknown>;

/** Wrap a YAML parser (Obsidian's `parseYaml`) so that anything but a mapping or an empty document throws. */
export function strictYaml(parse: (text: string) => unknown): StrictYaml {
  return (text: string) => {
    const value = parse(text);
    if (value == null) return {};
    if (typeof value !== "object" || Array.isArray(value)) throw new Error("frontmatter is not a mapping");
    return value as Record<string, unknown>;
  };
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Header text between the delimiters, or null when the note has no (closed) frontmatter block. */
function headerOf(raw: string): string | null {
  const s = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const open = /^---\r?\n/.exec(s);
  if (!open) return null;
  const lines: string[] = [];
  let pos = open[0].length;
  while (pos < s.length) {
    const nl = s.indexOf("\n", pos);
    const line = (nl === -1 ? s.slice(pos) : s.slice(pos, nl)).replace(/\r$/, "");
    if (line === "---") return lines.join("\n");
    lines.push(line);
    pos = nl === -1 ? s.length : nl + 1;
  }
  return null;
}

interface Header { data: Rec; scalar(key: string): string | undefined; error: boolean }

/**
 * Read the frontmatter of `raw`. Scalars are taken as authored text (no YAML
 * type coercion, so an unquoted date stays the string that was written).
 * Malformed YAML or duplicate keys set `error`. An unclosed `---` is not a
 * frontmatter block, as in Obsidian.
 */
function readHeader(raw: string, parse: StrictYaml): Header {
  const none: Header = { data: {}, scalar: () => undefined, error: false };
  try {
    const fm = readFrontmatter(raw, parse);
    return { data: fm.data, scalar: (k) => fm.scalars.get(k) ?? (typeof fm.data[k] === "string" ? fm.data[k] as string : undefined), error: false };
  } catch (error) {
    if (!(error instanceof FrontmatterPatchError)) throw error;
    if (error.code === "unterminated_frontmatter") return none;
    if (error.code === "malformed_yaml" || error.code === "duplicate_key") return { ...none, error: true };
    // A layout the narrow patcher will not edit can still be valid YAML.
    const header = headerOf(raw);
    if (header === null) return none;
    try {
      const data = parse(header);
      return { data, scalar: (k) => (typeof data[k] === "string" ? data[k] as string : undefined), error: false };
    } catch { return { ...none, error: true }; }
  }
}

const stripHash = (t: string) => t.replace(/^#/, "");

function stringList(v: unknown, splitString: boolean): string[] {
  if (typeof v === "string") return splitString ? v.split(/[,\s]+/).filter(Boolean) : (v.trim() ? [v] : []);
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return [];
}

/** Lineage declarations as written. An unquoted `- [[Old]]` parses as a nested list; it is restored to "[[Old]]". */
function linkTexts(v: unknown): string[] {
  const one = (x: unknown): string | null => {
    if (typeof x === "string") return x.trim() ? x : null;
    if (Array.isArray(x) && x.length === 1 && Array.isArray(x[0]) && x[0].length === 1 && typeof x[0][0] === "string") return `[[${x[0][0]}]]`;
    return null;
  };
  const list = Array.isArray(v) && !(v.length === 1 && Array.isArray(v[0])) ? v : [v];
  return list.map(one).filter((x): x is string => x !== null);
}

/** Authored sensitivity: flat string, `{ level }` mapping, or a `gkx:` block's. Anything else present is reported as written (and fails closed). */
function authoredSensitivity(data: Rec): string | undefined {
  const pick = (holder: Rec): string | undefined => {
    if (!hasOwn(holder, "sensitivity")) return undefined;
    const v = holder.sensitivity;
    if (typeof v === "string") return v;
    if (isRecord(v) && typeof v.level === "string") return v.level;
    return JSON.stringify(v) ?? String(v);
  };
  return pick(data) ?? (isRecord(data.gkx) ? pick(data.gkx) : undefined);
}

export interface LinkDest { path: string; extension: string }

export interface NoteMetaInput {
  path: string;
  raw: string;
  /** Obsidian metadata cache entry, or null when the cache has not indexed the file yet. */
  cache: Pick<CachedMetadata, "links" | "embeds" | "tags"> | null;
  parse: StrictYaml;
  /** metadataCache.getFirstLinkpathDest. */
  resolveLinkpath: (linkpath: string, fromPath: string) => LinkDest | null;
  /** Frontmatter keys of the timestamp settings. */
  createdKey?: string;
  updatedKey?: string;
}

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
const linkpathOf = (link: string) => link.split("#")[0].trim();
const extOf = (p: string) => { const name = p.slice(p.lastIndexOf("/") + 1); const dot = name.lastIndexOf("."); return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""; };

/** Cache entry + raw text → PersonalNoteMeta. Pure. */
export function buildNoteMeta(input: NoteMetaInput): PersonalNoteMeta {
  const header = readHeader(input.raw, input.parse);
  const data = header.data;
  const title = typeof data.title === "string" && data.title.trim() ? data.title : baseName(input.path);
  const tags: string[] = [];
  const addTag = (t: string) => { const v = stripHash(t.trim()); if (v && !tags.includes(v)) tags.push(v); };
  for (const t of stringList(data.tags ?? data.tag, true)) addTag(t);
  for (const t of input.cache?.tags ?? []) addTag(t.tag);
  const links: string[] = [];
  const attachments: PersonalAttachmentRef[] = [];
  const seen = new Set<string>();
  const refs = [
    ...(input.cache?.embeds ?? []).map((l) => ({ link: l.link, kind: "embed" as const })),
    ...(input.cache?.links ?? []).map((l) => ({ link: l.link, kind: "link" as const })),
  ];
  for (const ref of refs) {
    const linkpath = linkpathOf(ref.link);
    if (!linkpath) continue;
    const dest = input.resolveLinkpath(linkpath, input.path);
    if (dest && dest.extension === "md") { if (!links.includes(dest.path)) links.push(dest.path); continue; }
    if (!dest && ref.kind === "link" && (extOf(linkpath) === "" || extOf(linkpath) === "md")) continue; // an unresolved note link, not an attachment
    const key = `${ref.kind}\0${ref.link}`;
    if (seen.has(key)) continue;
    seen.add(key);
    attachments.push({ target: ref.link, kind: ref.kind, path: dest ? dest.path : null });
  }
  const meta: PersonalNoteMeta = {
    title,
    aliases: stringList(data.aliases ?? data.alias, false),
    tags,
    supersedes: linkTexts(data.supersedes),
    supersededBy: linkTexts(data.superseded_by),
    links,
    attachments,
  };
  const uid = header.scalar("uid");
  if (uid !== undefined && uid !== "") meta.uid = uid;
  const created = header.scalar(input.createdKey || "created_at") ?? header.scalar("timestamp");
  if (created) meta.createdAt = created;
  const updated = header.scalar(input.updatedKey || "updated_at");
  if (updated) meta.updatedAt = updated;
  const sensitivity = authoredSensitivity(data);
  if (sensitivity !== undefined) meta.authoredSensitivity = sensitivity;
  if (header.error) meta.frontmatterError = true;
  return meta;
}

/* ------------------------------------------------------- physical containment */

export interface ContainmentFs {
  lstatSync(p: string): { isSymbolicLink(): boolean };
  realpathSync(p: string): string;
}
export interface ContainmentPath {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
  isAbsolute(p: string): boolean;
}

/**
 * True when `relPath` (a vault path) is reached from the canonical vault root
 * without passing through a symlink or junction and its real path stays under
 * that root (path-relative containment, not a string prefix). A path that does
 * not exist (yet) is contained as far as it exists.
 */
export function isPhysicallyContained(rootReal: string, relPath: string, fs: ContainmentFs, path: ContainmentPath): boolean {
  if (!relPath || relPath.includes("\0")) return false;
  let current = rootReal;
  for (const segment of relPath.split("/")) {
    if (!segment || segment === "." || segment === "..") return false;
    current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) return false; // Node reports Windows junctions as symbolic links
    } catch (error: any) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return true;
      return false;
    }
  }
  try {
    const rel = path.relative(rootReal, fs.realpathSync(current));
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  } catch { return false; }
}

/* ------------------------------------------------------------ vault source */

/** A file (not a folder). Duck-typed like vault-provider, so test fakes need not be TFile instances. */
const isFile = (f: unknown): f is TFile => !!f && typeof f === "object" && "stat" in f && "extension" in f;

export interface ObsidianSourceOptions {
  parse: StrictYaml;
  /** Node `fs` and `path` on desktop; null on mobile (no connector there, so containment is moot). */
  fs: ContainmentFs | null;
  path: ContainmentPath | null;
  timestampKeys?: () => { createdKey?: string; updatedKey?: string };
}

export class ObsidianPersonalSource implements PersonalVaultSource {
  private containment = new Map<string, boolean>();
  private rootReal: string | null | undefined;
  private names: Map<string, string[]> | null = null;

  constructor(private readonly app: App, private readonly options: ObsidianSourceOptions) {}

  /** Forget cached containment and name lookups (call on create/delete/rename). */
  invalidate(): void { this.containment.clear(); this.names = null; }

  private file(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(path);
    return isFile(f) ? f : null;
  }

  private note(path: string): TFile | null {
    const f = this.file(path);
    return f && f.extension === "md" ? f : null;
  }

  listMarkdown(): PersonalFileStat[] {
    return this.app.vault.getMarkdownFiles().map((f) => ({ path: f.path, mtimeMs: f.stat.mtime, sizeBytes: f.stat.size }));
  }

  stat(path: string): PersonalFileStat | null {
    const f = this.note(path);
    return f ? { path: f.path, mtimeMs: f.stat.mtime, sizeBytes: f.stat.size } : null;
  }

  /** Exact text through Obsidian's read cache. No frontmatter stripping or normalization. */
  async readRaw(path: string): Promise<string> {
    const f = this.note(path);
    if (!f) throw new Error("not found");
    return this.app.vault.cachedRead(f);
  }

  meta(path: string, raw: string): PersonalNoteMeta {
    const cache = this.app.metadataCache.getCache(path);
    return buildNoteMeta({
      path, raw, cache, parse: this.options.parse,
      resolveLinkpath: (linkpath, from) => {
        const dest = this.app.metadataCache.getFirstLinkpathDest(linkpath, from);
        return dest ? { path: dest.path, extension: dest.extension } : null;
      },
      ...(this.options.timestampKeys?.() ?? {}),
    });
  }

  exists(path: string): boolean { return this.file(path) !== null; }

  resolveLink(linkText: string, fromPath: string): string | null | "ambiguous" {
    const text = linkText.trim();
    if (!text) return null;
    if (!text.includes("/")) {
      const key = text.replace(/\.md$/i, "");
      const matches = this.byName().get(key) ?? [];
      if (matches.length > 1) return "ambiguous";
      if (matches.length === 1) return matches[0];
    }
    const dest = this.app.metadataCache.getFirstLinkpathDest(text, fromPath);
    return dest && dest.extension === "md" ? dest.path : null;
  }

  private byName(): Map<string, string[]> {
    if (this.names) return this.names;
    const names = new Map<string, string[]>();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const name = f.basename ?? baseName(f.path);
      (names.get(name) ?? names.set(name, []).get(name)!).push(f.path);
    }
    return (this.names = names);
  }

  physicallyContained(path: string): boolean {
    const { fs, path: pathMod } = this.options;
    if (!fs || !pathMod) return true;
    const known = this.containment.get(path);
    if (known !== undefined) return known;
    if (this.rootReal === undefined) {
      try {
        const base = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.();
        this.rootReal = base ? fs.realpathSync(base) : null;
      } catch { this.rootReal = null; }
    }
    const ok = this.rootReal ? isPhysicallyContained(this.rootReal, path, fs, pathMod) : false;
    if (this.containment.size > 10_000) this.containment.clear();
    this.containment.set(path, ok);
    return ok;
  }
}
