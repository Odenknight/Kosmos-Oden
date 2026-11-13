/**
 * Semantic search (0.9.5) — the controller: what the settings page and the
 * Personal Notes runtime talk to.
 *
 * It turns three saved choices (on/off, which model, the user's own model
 * recipe) into a running index, and reports one plain status for the screen.
 * It is also the `PersonalSemantic` the query service asks for candidates.
 *
 * Rules it keeps:
 *   - nothing is downloaded unless the user presses Download for a model;
 *   - a model that is not on this device is never fetched on its own (the
 *     settings sync between devices, the model files do not);
 *   - turning semantic search off stops the worker and frees the model; the
 *     index file stays, so turning it on again does not re-embed the vault;
 *   - it decides nothing about access: every question names its notes.
 *
 * Pure apart from what is injected, so it is tested in Node.
 */
import { CUSTOM_MODEL_ID, MODEL_CATALOG, activeModel, catalogModel, modelDownloadBytes, type ActiveModel } from "./catalog";
import { ModelStore, type CustomFileRole, type Downloader, type SemanticFiles, type Sha256 } from "./models";
import { normalizeSemanticSettings, type SemanticSettings } from "./settings";
import { SemanticService, type SemanticNoteSource, type SemanticStatus, type SemanticWorkerLike } from "./service";

/* ------------------------------------------------------------------ status */

export type SemanticPhase =
  /** Turned off. */
  | "off"
  /** Turned on, but the chosen model is not on this device. */
  | "needs_model"
  | "downloading"
  | "loading"
  | "indexing"
  | "paused"
  | "ready"
  | "error";

export interface SemanticOverview {
  phase: SemanticPhase;
  enabled: boolean;
  modelId: string;
  /** Display name of the chosen model. */
  model: string;
  /** One plain sentence for the settings page. */
  message: string;
  indexedNotes: number;
  totalNotes: number;
  pendingNotes: number;
  failedNotes: number;
  passages: number;
  /** While downloading. */
  download: { modelId: string; receivedBytes: number; totalBytes: number } | null;
  /** True when the stored index could not be reused and was started again. */
  rebuilt: boolean;
}

export interface SemanticControllerOptions {
  files: SemanticFiles;
  /** The semantic folder inside the plugin's own folder. */
  root: string;
  download: Downloader;
  sha256: Sha256;
  createWorker(): SemanticWorkerLike;
  source: SemanticNoteSource;
  settings(): SemanticSettings;
  onChange?(): void;
  now?: () => number;
  saveEveryMs?: number;
}

/** Decimal megabytes, as the catalog labels state them. */
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 10e6 ? 1 : 0)} MB`;

export class SemanticController {
  readonly models: ModelStore;
  readonly service: SemanticService;
  /** What the running worker was started with. */
  private running: ActiveModel | null = null;
  private needsModel = false;
  private startError = "";
  private downloading: { modelId: string; received: number; total: number; abort: AbortController } | null = null;
  /** One apply at a time; a later one sees the newest settings. */
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(private readonly options: SemanticControllerOptions) {
    this.models = new ModelStore(options.files, options.root, options.download, options.sha256);
    this.service = new SemanticService({
      createWorker: options.createWorker,
      source: options.source,
      readDatabase: (key) => this.models.readIndex(this.modelOfKey(key), key),
      writeDatabase: (key, bytes) => this.models.writeIndex(this.modelOfKey(key), key, bytes),
      onChange: () => this.changed(),
      now: options.now,
      saveEveryMs: options.saveEveryMs,
    });
  }

  /** The model id an index key belongs to (the service knows only keys). Kept after a stop, for the final save. */
  private readonly keyModels = new Map<string, string>();
  private modelOfKey(key: string): string {
    const id = this.keyModels.get(key);
    if (!id) throw new Error("no model is associated with this index");
    return id;
  }

  private changed(): void {
    if (!this.disposed) this.options.onChange?.();
  }

  private serial(run: () => Promise<void>): Promise<void> {
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /**
   * Make what is running match the saved settings. Call after any settings
   * change and once at start. Never downloads. Never rejects: a problem is
   * shown in the status instead.
   */
  apply(): Promise<void> {
    return this.serial(async () => {
      if (this.disposed) return;
      const s = normalizeSemanticSettings(this.options.settings());
      this.startError = "";
      if (!s.enabled) {
        this.needsModel = false;
        if (this.running) { this.running = null; await this.service.stop(); }
        this.changed();
        return;
      }
      try {
        let model: ActiveModel | null;
        let files;
        if (s.modelId === CUSTOM_MODEL_ID) {
          if (!(await this.models.customStatus()).ready) { await this.halt(true); return; }
          const loaded = await this.models.loadCustom();
          model = activeModel(CUSTOM_MODEL_ID, s.custom, loaded.fingerprint);
          files = loaded;
        } else {
          const entry = catalogModel(s.modelId);
          if (!entry || !(await this.models.isInstalled(entry))) { await this.halt(true); return; }
          model = activeModel(s.modelId, s.custom);
          // Same model already running: nothing to do (and no need to hash 100 MB again).
          if (model && this.running?.key === model.key && this.service.searchable) { this.needsModel = false; this.changed(); return; }
          files = await this.models.load(entry);
        }
        if (!model) { await this.halt(true); return; }
        // Same file and recipe already running: keep it. Only what is shown (the user's name for it) may have changed.
        if (this.running?.key === model.key && this.service.searchable) { this.running = model; this.needsModel = false; this.changed(); return; }
        this.needsModel = false;
        this.running = model;
        this.keyModels.set(model.key, model.id);
        await this.service.start(model, { model: files.model, tokenizer: files.tokenizer, tokenizerConfig: files.tokenizerConfig });
      } catch (error) {
        this.startError = error instanceof Error ? error.message : String(error);
        this.changed();
      }
    });
  }

  private async halt(needsModel: boolean): Promise<void> {
    this.needsModel = needsModel;
    if (this.running) { this.running = null; await this.service.stop(); }
    this.changed();
  }

  /** Which catalog models are on this device, and whether the user's own files are in place. */
  async installed(): Promise<Record<string, boolean>> {
    const out: Record<string, boolean> = {};
    for (const m of MODEL_CATALOG) out[m.id] = await this.models.isInstalled(m);
    out[CUSTOM_MODEL_ID] = (await this.models.customStatus()).ready;
    return out;
  }

  /**
   * Download one catalog model (the only network use of semantic search),
   * then apply the settings. Rejects with a plain message when it fails; a
   * failed or cancelled download leaves no partial model behind.
   */
  async download(modelId: string): Promise<void> {
    const entry = catalogModel(modelId);
    if (!entry) throw new Error("That model is not in the catalog.");
    if (this.downloading) throw new Error("Another model is being downloaded.");
    const abort = new AbortController();
    this.downloading = { modelId, received: 0, total: modelDownloadBytes(entry), abort };
    this.changed();
    try {
      let shown = 0;
      await this.models.install(entry, (received, total) => {
        if (!this.downloading) return;
        this.downloading.received = received;
        this.downloading.total = total;
        // At most ~100 repaints per download.
        if (received === total || received - shown >= total / 100) { shown = received; this.changed(); }
      }, abort.signal);
    } catch (error) {
      if (abort.signal.aborted) throw new Error("The download was cancelled. Nothing was kept.");
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      this.downloading = null;
      this.changed();
    }
    await this.apply();
  }

  cancelDownload(): void {
    this.downloading?.abort.abort();
  }

  /** Copy the user's own model files into place, then apply the settings. */
  async importCustom(picked: ReadonlyArray<{ name: string; data: ArrayBuffer }>): Promise<{ saved: CustomFileRole[]; ignored: string[] }> {
    // The files are replaced on disk: stop a worker that is using the old ones first.
    if (this.running?.custom) await this.serial(() => this.halt(false));
    const result = await this.models.importCustom(picked);
    await this.apply();
    return result;
  }

  /** Delete a model's files and the indexes built with it. */
  async removeModel(modelId: string): Promise<void> {
    await this.serial(async () => {
      if (this.running?.id === modelId) await this.halt(true);
      await this.models.removeModel(modelId);
    });
    await this.apply();
  }

  /** Throw the vectors away and embed every note again. */
  async rebuild(): Promise<void> {
    await this.service.rebuild();
  }

  setPaused(paused: boolean): void { this.service.setPaused(paused); }

  /** Notes changed (`null` = look at all of them again). */
  noteChanges(paths: readonly string[] | null): void { this.service.noteChanges(paths); }

  overview(): SemanticOverview {
    const s = normalizeSemanticSettings(this.options.settings());
    const st: SemanticStatus = this.service.status();
    const entry = catalogModel(s.modelId);
    const model = s.modelId === CUSTOM_MODEL_ID ? (s.custom.name || "Your own model") : (entry?.label ?? s.modelId);
    const base = {
      enabled: s.enabled, modelId: s.modelId, model,
      indexedNotes: st.indexedNotes, totalNotes: st.totalNotes, pendingNotes: st.pendingNotes, failedNotes: st.failedNotes, passages: st.chunks,
      download: this.downloading ? { modelId: this.downloading.modelId, receivedBytes: this.downloading.received, totalBytes: this.downloading.total } : null,
      rebuilt: st.rebuilt,
    };
    if (this.downloading) {
      const d = this.downloading;
      const pct = d.total ? Math.floor((d.received / d.total) * 100) : 0;
      return { ...base, phase: "downloading", message: `Downloading the model: ${mb(d.received)} of ${mb(d.total)} (${pct}%).` };
    }
    if (!s.enabled) return { ...base, phase: "off", message: "Semantic search is off. Search uses words only." };
    if (this.startError) return { ...base, phase: "error", message: `Semantic search could not start: ${this.startError}` };
    if (this.needsModel) {
      return {
        ...base, phase: "needs_model",
        message: s.modelId === CUSTOM_MODEL_ID
          ? "Choose your model files below (a .onnx model and its tokenizer.json). Until then, search uses words only."
          : "This model is not on this device yet. Press Download. Until then, search uses words only.",
      };
    }
    const failed = st.failedNotes ? ` ${st.failedNotes} note${st.failedNotes === 1 ? "" : "s"} could not be embedded and will be tried again when changed.` : "";
    switch (st.state) {
      case "loading": return { ...base, phase: "loading", message: "Loading the model…" };
      case "indexing": {
        if (this.service.isPaused) return { ...base, phase: "paused", message: `Paused. ${st.indexedNotes} of ${st.totalNotes || "?"} notes are embedded; questions use those.` };
        const reason = st.rebuilt ? " (a new index for this model)" : "";
        return { ...base, phase: "indexing", message: `Reading your notes${reason}: ${st.indexedNotes} of ${st.totalNotes || "?"} embedded. Search already works and improves as this finishes.` };
      }
      case "ready":
        // Paused with nothing left to do still shows as paused: note changes wait, and the way back is Resume.
        if (this.service.isPaused) return { ...base, phase: "paused", message: `Paused. ${st.indexedNotes} note${st.indexedNotes === 1 ? " is" : "s are"} embedded; questions use those. Changed notes wait until you resume.` };
        return { ...base, phase: "ready", message: `Ready. ${st.indexedNotes} note${st.indexedNotes === 1 ? "" : "s"} in ${st.chunks} passage${st.chunks === 1 ? "" : "s"} are searchable by meaning.${failed}` };
      case "error": return { ...base, phase: "error", message: `Semantic search stopped: ${st.error || "unknown error"}. Search uses words only. Turn it off and on again to retry.` };
      default: return { ...base, phase: "loading", message: "Starting…" };
    }
  }

  /* ------------------------------------------------- PersonalSemantic */

  info(): { state: "ready" | "partial" | "off" | "loading" | "error"; model?: string; detail?: string } {
    const o = this.overview();
    const model = this.running?.label;
    switch (o.phase) {
      case "ready": return { state: "ready", ...(model ? { model } : {}) };
      case "indexing":
      case "paused":
        return { state: "partial", ...(model ? { model } : {}), detail: `${o.indexedNotes} of ${o.totalNotes || "?"} notes are embedded so far` };
      case "loading": return { state: "loading", detail: "the embedding model is still loading" };
      case "error": return { state: "error", detail: o.message };
      case "downloading": return { state: this.service.searchable ? "partial" : "off", ...(model && this.service.searchable ? { model } : {}), detail: "an embedding model is being downloaded" };
      case "needs_model": return { state: "off", detail: "semantic search is turned on, but its model is not on this device; the user can download it in Settings → Kosmos-Oden → Semantic search" };
      default: return { state: "off", detail: "semantic search is turned off; the user can turn it on in Settings → Kosmos-Oden → Semantic search" };
    }
  }

  async candidates(question: string, allowed: ReadonlySet<string>): Promise<Array<{ path: string; score: number; offsetChars: number }>> {
    const hits = await this.service.candidates(question, allowed);
    return hits.map((h) => ({ path: h.path, score: h.score, offsetChars: h.offsetChars }));
  }

  async related(sources: readonly string[], allowed: ReadonlySet<string>, limit: number): Promise<Array<{ path: string; relatedTo: string; score: number }>> {
    const hits = await this.service.related(sources, allowed, limit);
    return hits.map((h) => ({ path: h.path, relatedTo: h.relatedTo, score: h.score }));
  }

  /** Save the index and stop. Idempotent. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.downloading?.abort.abort();
    await this.queue.catch(() => undefined);
    this.running = null;
    await this.service.stop().catch(() => undefined);
  }
}
