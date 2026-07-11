/**
 * Kosmos plugin — iframe embed entry.
 *
 * The Obsidian plugin drives this page over postMessage: a full snapshot
 * (`kosmos:files`), then debounced deltas (`kosmos:update`). The embed owns a
 * KosmosIndex so a single-note change costs one parse (§10) — the exact same
 * incremental core the standalone page uses. "Go to Note" posts `kosmos:open`
 * back to the plugin.
 */
import { KosmosIndex, type IndexChanges } from "../core/incremental";
import type { SourceFile } from "../core/types";
import { createKosmosApp } from "../renderer/renderer";

const app = createKosmosApp({
  autoStart: "wait",
  onOpenNote: (path, label) => {
    try { window.parent.postMessage({ type: "kosmos:open", path, label }, "*"); } catch (_) { /* sandboxed */ }
  },
});
const index = new KosmosIndex();

interface FilesMessage {
  type: "kosmos:files";
  files: Array<{ relativePath: string; content: string }>;
  folders?: string[];
  attachments?: string[];
  label?: string;
}
interface UpdateMessage {
  type: "kosmos:update";
  changed?: Array<{ relativePath: string; content: string }>;
  removed?: string[];
  renames?: Array<{ from: string; to: string }>;
  folders?: string[];
  attachments?: string[];
  label?: string;
}

function toSourceFiles(files: Array<{ relativePath: string; content: string }>): SourceFile[] {
  return (files || []).map((f) => ({ relativePath: f.relativePath, content: f.content, kind: "note" as const }));
}

window.addEventListener("message", (ev: MessageEvent) => {
  const m: any = ev && ev.data;
  if (!m || !m.type) return;
  try {
    if (m.type === "kosmos:files") {
      const msg = m as FilesMessage;
      const update = index.setFiles(toSourceFiles(msg.files), msg.folders || [], msg.attachments || []);
      app.setAttachments(msg.attachments || []);
      app.renderGraph(update.graph, msg.label || "Vault");
      for (const w of update.graph.diagnostics.lineageWarnings) console.warn("Vault Kosmos lineage:", w);
    } else if (m.type === "kosmos:update") {
      const msg = m as UpdateMessage;
      const changes: IndexChanges = {
        changed: toSourceFiles(msg.changed || []),
        removed: msg.removed || [],
        renames: msg.renames || [],
        folders: msg.folders,
        attachments: msg.attachments,
      };
      const update = index.applyChanges(changes);
      if (msg.attachments) app.setAttachments(msg.attachments);
      app.renderGraph(update.graph, msg.label || "Vault");
      for (const p of [...(msg.changed || []).map((c) => c.relativePath)]) {
        app.notifyLiveEvent({ path: p, type: update.delta.addedNodes.includes(`file:${p}`) ? "add" : "change" });
      }
    } else if (m.type === "kosmos:graph") {
      app.renderGraph(m.graph, m.label);
    }
  } catch (e) {
    console.error("Vault Kosmos:", e);
    app.showError("Could not render this vault.");
  }
});

/* Test/diagnostic hook (no effect on normal use). */
(window as any).__kosmosEmbed = {
  getIndexInfo: () => ({ notes: index.noteCount, parseCount: index.parseCount, diagnostics: index.getDiagnostics() }),
};
