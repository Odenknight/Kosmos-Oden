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
import type { App, TFile } from "obsidian";
import type { PersonalFileStat, PersonalNoteMeta, PersonalVaultSource } from "../personal-notes/types";
import { buildNoteMeta, isPhysicallyContained, type ContainmentFs, type ContainmentPath, type StrictYaml } from "gkos-engine/notes";
export { authoredSensitivity, buildNoteMeta, isPhysicallyContained, readNoteHeader, strictYaml, type StrictYaml } from "gkos-engine/notes";

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
      const name = f.basename ?? f.path.slice(f.path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
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
    // Only paths that exist are remembered: the vault bounds their number and
    // invalidate() drops them on create, delete and rename. (A size cap that
    // cleared the map made every request re-check a large vault on the main thread.)
    if (this.app.vault.getAbstractFileByPath(path)) this.containment.set(path, ok);
    return ok;
  }
}
