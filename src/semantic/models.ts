/**
 * Semantic search (0.9.5) — model files and the index file on disk.
 *
 * Everything lives in one folder inside the plugin's own folder:
 *
 *   semantic/models/<model id>/model.onnx, tokenizer.json, tokenizer_config.json
 *   semantic/models/custom/…          the user's own model files
 *   semantic/index-<model>.sqlite     the SQLite index for one model
 *
 * A catalog model is downloaded only when the user asks, from the pinned
 * revision in catalog.ts, and every file is checked (size and SHA-256) before
 * it is kept and again each time it is loaded. Nothing else is ever fetched.
 *
 * Pure apart from the injected file access, downloader and hash.
 */
import { CUSTOM_MODEL_ID, modelFileUrl, type CatalogModel, type ModelFile } from "./catalog";

/** The file operations used, vault-adapter style (paths relative to the vault root). */
export interface SemanticFiles {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readBinary(path: string): Promise<ArrayBuffer>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** Size in bytes, or null when the file does not exist. */
  size(path: string): Promise<number | null>;
  /** Files directly inside `dir` (full paths). [] when the folder does not exist. */
  list(dir: string): Promise<string[]>;
}

export type Progress = (receivedBytes: number, totalBytes: number) => void;
/** Download one URL completely. Must reject on any HTTP status other than 200. */
export type Downloader = (url: string, onProgress: (received: number) => void, signal?: AbortSignal) => Promise<ArrayBuffer>;
export type Sha256 = (data: ArrayBuffer) => Promise<string>;

export interface LoadedModelFiles { model: ArrayBuffer; tokenizer: string; tokenizerConfig: string }

export const CUSTOM_FILE_LIMITS = {
  /** A model larger than this is refused: it would not fit in the WebAssembly memory with room to run. */
  maxModelBytes: 1024 * 1024 * 1024,
  maxTokenizerBytes: 64 * 1024 * 1024,
} as const;

export type CustomFileRole = "model.onnx" | "tokenizer.json" | "tokenizer_config.json";

/** Which role a file the user picked plays, by its name. Null = not a file this plugin uses. */
export function customFileRole(fileName: string): CustomFileRole | null {
  const name = fileName.replace(/^.*[\\/]/, "").toLowerCase();
  if (name === "tokenizer.json") return "tokenizer.json";
  if (name === "tokenizer_config.json") return "tokenizer_config.json";
  if (name.endsWith(".onnx")) return "model.onnx";
  return null;
}

const text = (buffer: ArrayBuffer) => new TextDecoder("utf-8").decode(buffer);

/** 64-bit FNV-1a as hex: names an index file after its model key. Not a security hash. */
export function keyName(key: string): string {
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 16777619) ^ (a >>> 7);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

export class ModelStore {
  constructor(
    private readonly files: SemanticFiles,
    /** The semantic folder, e.g. ".obsidian/plugins/kosmos-oden/semantic". */
    readonly root: string,
    private readonly download: Downloader,
    private readonly sha256: Sha256,
  ) {}

  modelDir(id: string): string { return `${this.root}/models/${id}`; }
  get customDir(): string { return this.modelDir(CUSTOM_MODEL_ID); }
  indexPath(modelId: string, key: string): string { return `${this.root}/index-${modelId}-${keyName(key)}.sqlite`; }

  private async ensureDir(dir: string): Promise<void> {
    const parts = dir.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join("/");
      if (p && !(await this.files.exists(p))) await this.files.mkdir(p);
    }
  }

  /** True when every file of the model is present with the right size. Cheap: no hashing. */
  async isInstalled(model: CatalogModel): Promise<boolean> {
    for (const file of model.files) {
      if ((await this.files.size(`${this.modelDir(model.id)}/${file.name}`)) !== file.bytes) return false;
    }
    return true;
  }

  private async verify(model: CatalogModel, file: ModelFile, data: ArrayBuffer, where: string): Promise<void> {
    if (data.byteLength !== file.bytes) throw new Error(`${where}: ${file.name} of ${model.label} is ${data.byteLength} bytes, expected ${file.bytes}. The file is incomplete or was changed.`);
    const hash = await this.sha256(data);
    if (hash !== file.sha256) throw new Error(`${where}: ${file.name} of ${model.label} does not match its published SHA-256. It was not kept.`);
  }

  /**
   * Download a catalog model. Each file is verified before it replaces
   * anything; a failed or cancelled download leaves no partial model behind.
   * Files already present and correct are not downloaded again.
   */
  async install(model: CatalogModel, onProgress?: Progress, signal?: AbortSignal): Promise<void> {
    const dir = this.modelDir(model.id);
    await this.ensureDir(dir);
    const total = model.files.reduce((sum, f) => sum + f.bytes, 0);
    let done = 0;
    for (const file of model.files) {
      if (signal?.aborted) throw new Error("download cancelled");
      const target = `${dir}/${file.name}`;
      if ((await this.files.size(target)) === file.bytes) {
        const existing = await this.files.readBinary(target);
        if ((await this.sha256(existing)) === file.sha256) { done += file.bytes; onProgress?.(done, total); continue; }
      }
      const data = await this.download(modelFileUrl(model, file), (received) => {
        // Stop as soon as more arrives than was published, instead of buffering it.
        if (received > file.bytes) throw new Error(`Download: ${file.name} of ${model.label} is larger than the published ${file.bytes} bytes. It was not kept.`);
        onProgress?.(done + received, total);
      }, signal);
      await this.verify(model, file, data, "Download");
      const part = `${target}.part`;
      if (await this.files.exists(part)) await this.files.remove(part);
      await this.files.writeBinary(part, data);
      if (await this.files.exists(target)) await this.files.remove(target);
      await this.files.rename(part, target);
      done += file.bytes;
      onProgress?.(done, total);
    }
  }

  /** Read a catalog model, verifying every file again. */
  async load(model: CatalogModel): Promise<LoadedModelFiles> {
    const dir = this.modelDir(model.id);
    const out: Partial<Record<ModelFile["name"], ArrayBuffer>> = {};
    for (const file of model.files) {
      const path = `${dir}/${file.name}`;
      if (!(await this.files.exists(path))) throw new Error(`${model.label} is not downloaded on this device.`);
      const data = await this.files.readBinary(path);
      await this.verify(model, file, data, "Load");
      out[file.name] = data;
    }
    if (!out["model.onnx"] || !out["tokenizer.json"]) throw new Error(`${model.label}: the catalog entry lists no model or tokenizer file.`);
    return { model: out["model.onnx"], tokenizer: text(out["tokenizer.json"]), tokenizerConfig: out["tokenizer_config.json"] ? text(out["tokenizer_config.json"]) : "" };
  }

  /** Which of the user's own model files are in place. */
  async customStatus(): Promise<{ model: number | null; tokenizer: number | null; tokenizerConfig: number | null; ready: boolean }> {
    const model = await this.files.size(`${this.customDir}/model.onnx`);
    const tokenizer = await this.files.size(`${this.customDir}/tokenizer.json`);
    const tokenizerConfig = await this.files.size(`${this.customDir}/tokenizer_config.json`);
    return { model, tokenizer, tokenizerConfig, ready: model !== null && model > 0 && tokenizer !== null && tokenizer > 0 };
  }

  /**
   * Copy files the user picked into the custom model folder. Files are
   * recognised by name (any .onnx, tokenizer.json, tokenizer_config.json);
   * others are reported back and ignored. Nothing is downloaded.
   */
  async importCustom(picked: ReadonlyArray<{ name: string; data: ArrayBuffer }>): Promise<{ saved: CustomFileRole[]; ignored: string[] }> {
    const saved: CustomFileRole[] = [];
    const ignored: string[] = [];
    const byRole = new Map<CustomFileRole, { name: string; data: ArrayBuffer }>();
    for (const file of picked) {
      const role = customFileRole(file.name);
      if (!role || byRole.has(role)) { ignored.push(file.name); continue; }
      byRole.set(role, file);
    }
    for (const [role, file] of byRole) {
      if (!file.data.byteLength) throw new Error(`${file.name} is empty.`);
      if (role === "model.onnx" && file.data.byteLength > CUSTOM_FILE_LIMITS.maxModelBytes) throw new Error(`${file.name} is larger than 1 GB, which is more than the built-in runtime can load.`);
      if (role !== "model.onnx") {
        if (file.data.byteLength > CUSTOM_FILE_LIMITS.maxTokenizerBytes) throw new Error(`${file.name} is too large to be a tokenizer file.`);
        try { JSON.parse(text(file.data)); } catch { throw new Error(`${file.name} is not valid JSON.`); }
      }
    }
    if (byRole.size) await this.ensureDir(this.customDir);
    for (const [role, file] of byRole) {
      const target = `${this.customDir}/${role}`;
      if (await this.files.exists(target)) await this.files.remove(target);
      await this.files.writeBinary(target, file.data);
      saved.push(role);
    }
    return { saved, ignored };
  }

  /** Read the user's own model. `fingerprint` identifies these exact files, so replacing them starts a new index. */
  async loadCustom(): Promise<LoadedModelFiles & { fingerprint: string }> {
    const status = await this.customStatus();
    if (!status.ready) throw new Error("Your own model is not set up yet: a model (.onnx) file and tokenizer.json are needed.");
    if (status.model! > CUSTOM_FILE_LIMITS.maxModelBytes) throw new Error("The model file is larger than 1 GB, which is more than the built-in runtime can load.");
    const model = await this.files.readBinary(`${this.customDir}/model.onnx`);
    const tokenizer = text(await this.files.readBinary(`${this.customDir}/tokenizer.json`));
    const tokenizerConfig = status.tokenizerConfig ? text(await this.files.readBinary(`${this.customDir}/tokenizer_config.json`)) : "";
    const fingerprint = (await this.sha256(model)).slice(0, 16);
    return { model, tokenizer, tokenizerConfig, fingerprint };
  }

  /** Delete a model's files and every index built with it. */
  async removeModel(id: string): Promise<void> {
    for (const path of await this.files.list(this.modelDir(id))) await this.files.remove(path);
    await this.removeIndexes(id);
  }

  async removeIndexes(modelId: string): Promise<number> {
    let removed = 0;
    for (const path of await this.files.list(this.root)) {
      const name = path.slice(path.lastIndexOf("/") + 1);
      if (name.startsWith(`index-${modelId}-`) && /\.sqlite(\.tmp)?$/.test(name)) { await this.files.remove(path); removed++; }
    }
    return removed;
  }

  /** The stored index for one model, or null. A leftover temporary file from an interrupted save is used when the main file is missing. */
  async readIndex(modelId: string, key: string): Promise<ArrayBuffer | null> {
    const path = this.indexPath(modelId, key);
    if (await this.files.exists(path)) return this.files.readBinary(path);
    if (await this.files.exists(`${path}.tmp`)) return this.files.readBinary(`${path}.tmp`);
    return null;
  }

  /** Write the index: to a temporary file first, so an interrupted save never leaves a half-written database in place. */
  async writeIndex(modelId: string, key: string, bytes: ArrayBuffer): Promise<void> {
    await this.ensureDir(this.root);
    const path = this.indexPath(modelId, key);
    const tmp = `${path}.tmp`;
    if (await this.files.exists(tmp)) await this.files.remove(tmp);
    await this.files.writeBinary(tmp, bytes);
    if (await this.files.exists(path)) await this.files.remove(path);
    await this.files.rename(tmp, path);
  }

  async indexSize(modelId: string, key: string): Promise<number | null> {
    return this.files.size(this.indexPath(modelId, key));
  }
}
