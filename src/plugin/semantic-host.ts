/**
 * Semantic search (0.9.5) — the Obsidian side: files in the plugin's own
 * folder, the model download, SHA-256, and the worker started from a Blob URL.
 *
 * The only network use is here, in `downloadModelFile`: one file of a model
 * the user chose to download, from the pinned Hugging Face revision in the
 * catalog. Nothing is sent but the request itself; no note text, no path, no
 * token. Everything else in semantic search runs on files already on disk.
 */
import { requestUrl, type App, type DataAdapter } from "obsidian";
import WORKER_SOURCE from "../../dist/kosmos-semantic-worker.txt";
import { SemanticController } from "../semantic/controller";
import type { SemanticSettings } from "../semantic/settings";
import type { Downloader, SemanticFiles, Sha256 } from "../semantic/models";
import type { SemanticNoteSource, SemanticWorkerLike } from "../semantic/service";

/** Model files and the index live here, inside the plugin's folder (never in a note folder, never shared with an agent). */
export function semanticRoot(pluginDir: string): string {
  return `${pluginDir.replace(/\/+$/, "")}/semantic`;
}

export function semanticFiles(adapter: DataAdapter): SemanticFiles {
  return {
    exists: (path) => adapter.exists(path),
    mkdir: (path) => adapter.mkdir(path),
    readBinary: (path) => adapter.readBinary(path),
    writeBinary: (path, data) => adapter.writeBinary(path, data),
    remove: (path) => adapter.remove(path),
    rename: (from, to) => adapter.rename(from, to),
    size: async (path) => (await adapter.stat(path))?.size ?? null,
    list: async (dir) => ((await adapter.exists(dir)) ? (await adapter.list(dir)).files : []),
  };
}

export const sha256Hex: Sha256 = async (data) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  let hex = "";
  for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
  return hex;
};

/** Only the model host may be contacted; a catalog mistake must not turn into a request somewhere else. */
const MODEL_HOST = "https://huggingface.co/";

/**
 * Download one model file. Streams with progress where the platform allows
 * it; otherwise falls back to Obsidian's own request (no progress, same
 * bytes). The caller verifies size and SHA-256 before keeping anything.
 */
export const downloadModelFile: Downloader = async (url, onProgress, signal) => {
  if (!url.startsWith(MODEL_HOST)) throw new Error("refusing to download from an address outside the model catalog");
  if (signal?.aborted) throw new Error("download cancelled");
  let response: Response;
  try {
    response = await fetch(url, { signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
  } catch (error) {
    if (signal?.aborted) throw new Error("download cancelled");
    // Streaming was refused by the platform (not by the server): use Obsidian's request instead.
    const whole = await requestUrl({ url, method: "GET", throw: false });
    if (signal?.aborted) throw new Error("download cancelled");
    if (whole.status !== 200) throw new Error(`the model host answered ${whole.status}; check your internet connection and try again`);
    onProgress(whole.arrayBuffer.byteLength);
    return whole.arrayBuffer;
  }
  if (response.status !== 200 || !response.body) throw new Error(`the model host answered ${response.status}; check your internet connection and try again`);
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      received += value.byteLength;
      onProgress(received); // throws when more arrives than the catalog lists
    }
  } catch (error) {
    try { await reader.cancel(); } catch { /* already closed */ }
    if (signal?.aborted) throw new Error("download cancelled");
    throw error instanceof Error ? error : new Error(String(error));
  }
  const out = new Uint8Array(received);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.byteLength; }
  return out.buffer;
};

export interface SemanticWorkerFactory {
  create(): SemanticWorkerLike;
  release(): void;
}

/** The worker source (ONNX Runtime, the tokenizer and SQLite included) is text inside main.js; nothing is downloaded to run it. */
export function semanticWorkerFactory(): SemanticWorkerFactory {
  let url: string | null = null;
  return {
    create() {
      url ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
      return new Worker(url, { name: "kosmos-semantic" }) as unknown as SemanticWorkerLike;
    },
    release() {
      if (url) URL.revokeObjectURL(url);
      url = null;
    },
  };
}

export interface SemanticHandle {
  controller: SemanticController;
  /** Save the index, stop the worker and revoke its Blob URL. */
  dispose(): Promise<void>;
}

export function createSemantic(app: App, pluginDir: string, source: SemanticNoteSource, settings: () => SemanticSettings, onChange: () => void): SemanticHandle {
  const workers = semanticWorkerFactory();
  const controller = new SemanticController({
    files: semanticFiles(app.vault.adapter),
    root: semanticRoot(pluginDir),
    download: downloadModelFile,
    sha256: sha256Hex,
    createWorker: () => workers.create(),
    source,
    settings,
    onChange,
  });
  return {
    controller,
    dispose: async () => {
      try { await controller.dispose(); } finally { workers.release(); }
    },
  };
}
