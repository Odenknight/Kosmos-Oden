/**
 * Kosmos plugin — Obsidian-backed data provider for the Agent API.
 *
 * Owns a GkxIndex fed from the live vault, so the Agent API answers from
 * the SAME normalized graph snapshot the viewer renders (§33). Change events
 * are folded incrementally (§10): a single edited note is re-read (from
 * Obsidian's in-memory cache) and re-parsed alone; only bulk changes trigger
 * a full rebuild.
 */
import type { App, TFile } from "obsidian";
import type { GkxIndex } from "gkos-engine";
import { createGkosEngineAdapter, type GkosEngineAdapter } from "gkos-engine/adapter";
import { stripFrontmatter } from "gkos-engine";
import type { AgentDataProvider, AgentSettings } from "./agent-server";
import type { GkxGraph, GkxSensitivity, SourceFile } from "gkos-engine";
import { isKosmosOperationalPath } from "../operational-paths";
import { readBatches } from "./read-batches";
import { deadline, ProviderError, readVaultText, VAULT_BUILD_TIMEOUT_MS, VAULT_READ_TIMEOUT_MS } from "./vault-operations";

declare const require: any;

export function nodeRequire(mod: string): any {
  try {
    const rq: any = typeof require !== "undefined" ? require : (window as any)?.require;
    return rq ? rq(mod) : null;
  } catch (_) {
    return null;
  }
}

/** The machine's own LAN IPv4 addresses (Node "os" module). */
export function lanAddresses(): string[] {
  try {
    const os = nodeRequire("os");
    if (!os) return [];
    const ifaces = os.networkInterfaces();
    const out: string[] = [];
    for (const name of Object.keys(ifaces || {})) {
      for (const info of ifaces[name] || []) {
        if (info.family === "IPv4" && !info.internal) out.push(info.address);
      }
    }
    return out;
  } catch (_) {
    return [];
  }
}

const ATTACH_EXT = new Set(["png", "jpg", "jpeg", "gif", "bmp", "webp", "avif", "svg", "tif", "tiff", "pdf", "mp4", "mov", "webm", "mkv", "avi", "m4v", "mp3", "wav", "ogg", "m4a", "flac", "aac", "zip", "rar", "7z", "gz", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "tsv", "json", "canvas", "excalidraw", "psd", "ai", "fig", "heic"]);

export function folderListFrom(md: Array<{ path: string }>): string[] {
  const folders = new Set<string>();
  for (const f of md) {
    if (isKosmosOperationalPath(f.path)) continue;
    const parts = String(f.path).split("/");
    parts.pop();
    let acc = "";
    for (const p of parts) { acc = acc ? `${acc}/${p}` : p; folders.add(acc); }
  }
  return Array.from(folders);
}

export function attachmentListFrom(all: Array<{ path: string; extension?: string }>): string[] {
  const out: string[] = [];
  for (const f of all) {
    if (isKosmosOperationalPath(f.path)) continue;
    const ext = String(f.extension || "").toLowerCase();
    if (ext && ext !== "md" && ATTACH_EXT.has(ext)) out.push(f.path);
  }
  return out;
}

export class VaultDataProvider implements AgentDataProvider {
  private app: App;
  private settings: AgentSettings;
  private index: GkxIndex;
  private adapter: Readonly<GkosEngineAdapter>;
  /** The defaultSensitivity the live index was projected with. When the setting
   *  diverges from this the index is recreated (projectionOptions are readonly
   *  on the engine's GkxIndex) and a full rebuild is forced. */
  private projectedSensitivity: GkxSensitivity;
  private fullDirty = true;
  private revision = 0;
  private changedPaths = new Set<string>();
  private removedPaths = new Set<string>();
  private renamedPaths: Array<{ from: string; to: string }> = [];
  private building: Promise<GkxGraph> | null = null;
  private sourceFiles = new Map<string, SourceFile>();

  constructor(app: App, settings: AgentSettings, private limits = { readMs: VAULT_READ_TIMEOUT_MS, buildMs: VAULT_BUILD_TIMEOUT_MS }) {
    this.app = app;
    this.settings = settings;
    this.projectedSensitivity = settings.defaultSensitivity;
    this.adapter = createGkosEngineAdapter({ projection: { defaultSensitivity: settings.defaultSensitivity } });
    this.index = this.adapter.createIndex();
  }

  /* ---- change notifications (wired to vault events by the plugin) ---- */
  markChanged(path: string): void { if (isKosmosOperationalPath(path)) return; this.revision++; if (!this.fullDirty) this.changedPaths.add(path); }
  markRemoved(path: string): void { if (isKosmosOperationalPath(path)) return; this.revision++; if (!this.fullDirty) { this.removedPaths.add(path); this.changedPaths.delete(path); } }
  markRenamed(from: string, to: string): void {
    const oldOperational = isKosmosOperationalPath(from);
    const newOperational = isKosmosOperationalPath(to);
    if (oldOperational && newOperational) return;
    this.revision++;
    if (this.fullDirty) return;
    if (oldOperational) { this.changedPaths.add(to); return; }
    if (newOperational) { this.removedPaths.add(from); this.changedPaths.delete(from); return; }
    this.renamedPaths.push({ from, to });
    this.changedPaths.add(to);
  }
  markFullDirty(): void { this.revision++; this.fullDirty = true; this.changedPaths.clear(); this.removedPaths.clear(); this.renamedPaths = []; }

  /** Re-project the whole vault when the Default sensitivity setting changes so
   *  the engine's projection defaults (which govern unlabeled notes) track the
   *  configured value. Recreates the index — projectionOptions are fixed at
   *  construction — and forces a full rebuild on the next getGraph(). Mirrors
   *  the Lite sibling's markFullDirty()-on-change refresh. No-op when unchanged. */
  reprojectForSensitivity(): void {
    if (this.settings.defaultSensitivity === this.projectedSensitivity) return;
    this.projectedSensitivity = this.settings.defaultSensitivity;
    this.adapter = createGkosEngineAdapter({ projection: { defaultSensitivity: this.settings.defaultSensitivity } });
    this.index = this.adapter.createIndex();
    this.markFullDirty();
  }

  private async toSourceFile(f: TFile): Promise<SourceFile> {
    const source = {
      relativePath: f.path,
      name: f.name,
      extension: f.extension,
      size: f.stat.size,
      modifiedTime: f.stat.mtime,
      createdTime: f.stat.ctime,
      kind: "note" as const,
    };
    const content = await readVaultText(this.app.vault, f, this.limits.readMs);
    return { ...source, content };
  }

  async getGraph(): Promise<GkxGraph> {
    // Safety net: honor a Default sensitivity change even if the settings UI did
    // not call reprojectForSensitivity() explicitly (a no-op when unchanged).
    this.reprojectForSensitivity();
    if (this.building) return this.building;
    const pending = this.fullDirty || this.changedPaths.size || this.removedPaths.size || this.renamedPaths.length;
    if (this.index.graph && !pending) return this.index.graph;
    const attempt = { active: true, until: performance.now() + this.limits.buildMs };
    const work = deadline(this.rebuild(attempt), this.limits.buildMs, () => { attempt.active = false; });
    this.building = work;
    try {
      return await work;
    } finally {
      attempt.active = false;
      if (this.building === work) this.building = null;
    }
  }

  private async rebuild(attempt: { active: boolean; until: number }): Promise<GkxGraph> {
    const check = () => { if (!attempt.active || performance.now() >= attempt.until) throw new ProviderError("timeout"); };
    while (true) {
    check();
    this.reprojectForSensitivity();
    const revision = this.revision;
    const sensitivity = this.settings.defaultSensitivity;
    const md = this.app.vault.getMarkdownFiles().filter((file) => !isKosmosOperationalPath(file.path));
    const folders = folderListFrom(md);
    const attachments = attachmentListFrom(this.app.vault.getFiles());
    const files = new Map(this.sourceFiles);
    const read = async (f: TFile) => { check(); const value = await this.toSourceFile(f); check(); return value; };
    if (this.fullDirty || !this.index.graph) {
      files.clear();
      for (const file of await readBatches(md, read)) files.set(file.relativePath, file);
    } else {
    const byPath = new Map(md.map((f) => [f.path, f]));
    for (const p of this.removedPaths) files.delete(p);
    for (const rename of this.renamedPaths) files.delete(rename.from);
    for (const p of this.changedPaths) {
      const f = byPath.get(p);
      if (f) files.set(p, await read(f)); else files.delete(p);
    }
    }
    check();
    if (revision !== this.revision || sensitivity !== this.settings.defaultSensitivity) { this.fullDirty = true; continue; }
    // Index into an unpublished candidate. Even a synchronous overrun or a
    // reentrant policy change cannot contaminate the last committed snapshot.
    const candidate = this.adapter.createIndex();
    const update = candidate.setFiles([...files.values()], folders, attachments);
    check();
    if (revision !== this.revision || sensitivity !== this.settings.defaultSensitivity) { this.fullDirty = true; continue; }
    this.index = candidate;
    this.sourceFiles = files;
    this.fullDirty = false;
    this.changedPaths.clear(); this.removedPaths.clear(); this.renamedPaths = [];
    return update.graph;
    }
  }

  async getNoteContent(path: string): Promise<string | null> {
    if (isKosmosOperationalPath(path)) return null;
    const f = this.app.vault.getAbstractFileByPath(path);
    if (!f || !("stat" in (f as any))) return null;
    const raw = await readVaultText(this.app.vault, f as TFile, this.limits.readMs);
    return stripFrontmatter(raw);
  }

  vaultName(): string {
    return this.app.vault.getName();
  }

  vaultIdentity(): string {
    // The path is never exported; it is hashed by the Graphiti projector to
    // prevent same-name vaults from sharing a namespace accidentally.
    try {
      return String((this.app.vault.adapter as any).getBasePath?.() || this.vaultName());
    } catch {
      return this.vaultName();
    }
  }

  lanAddresses(): string[] {
    return lanAddresses();
  }
}
