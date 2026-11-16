/**
 * Hybrid search fixture: the Personal Notes query service (as MCP and REST
 * call it) with the real semantic controller behind it — real SQLite, the
 * concept embedder and the in-process worker from semantic-fixture.mjs.
 */
import { MODEL_CATALOG, SemanticController, modelFileUrl, normalizeSemanticSettings } from "../../dist/kosmos-semantic.mjs";
import { makeService, makeVault } from "./personal-fixture.mjs";
import { NOTES, fakeWorkerFactory, memoryFiles, sha256 } from "./semantic-fixture.mjs";

export const SECRET_PATH = "Ops/Root password.md";

/** NOTES, with the runbook linking to Backups, and one note the requester may not read that is about the very same subject. */
export function hybridFiles() {
  const files = Object.fromEntries(Object.entries(NOTES).map(([path, raw]) => [path, { raw }]));
  files["Ops/Recovery runbook.md"].meta = { links: ["Ops/Backups.md"] };
  files[SECRET_PATH] = { raw: "# Root password\n\nTo recover a crashed machine boot the rescue image; the recovery password is hunter2.\n", meta: { authoredSensitivity: "secret" } };
  return files;
}

/**
 * A running semantic controller over `files` (every note, the unreadable one
 * included, so the tests prove the query service — not the index — decides
 * what a requester sees). `calls` records the allowed set of every question.
 */
export async function hybrid({ files = hybridFiles(), embedder, start = true } = {}) {
  const vault = makeVault(files);
  const model = MODEL_CATALOG.find((m) => m.id === "all-minilm-l6-v2");
  const disk = memoryFiles();
  const root = ".obsidian/plugins/kosmos-oden/semantic";
  const tag = (f) => `{"FAKE:${f.name}":"`;
  for (const f of model.files) {
    const data = new Uint8Array(f.bytes);
    data.set(new TextEncoder().encode(tag(f)));
    disk.files.set(`${root}/models/${model.id}/${f.name}`, data.buffer);
  }
  const hash = async (data) => {
    const head = new TextDecoder().decode(new Uint8Array(data, 0, Math.min(48, data.byteLength)));
    const f = model.files.find((x) => head.startsWith(tag(x)) && x.bytes === data.byteLength);
    return f ? f.sha256 : sha256(data);
  };
  const title = (path) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  const source = {
    notes: () => Object.keys(files).sort().map((path) => ({ path, title: title(path), raw: files[path].raw })),
    get: (path) => (files[path] ? { path, title: title(path), raw: files[path].raw } : null),
    ready: () => true,
  };
  const createWorker = fakeWorkerFactory(embedder);
  const requests = [];
  const controller = new SemanticController({
    files: disk, root, sha256: hash, createWorker, source,
    download: async (url) => { requests.push(url); throw new Error("no download in this test"); },
    settings: () => normalizeSemanticSettings({ enabled: true, modelId: model.id }),
  });
  // The plugin reads tokenizer.json as text and checks it is JSON; make the fake files valid JSON.
  for (const f of model.files) if (f.name !== "model.onnx") {
    const data = new Uint8Array(disk.files.get(`${root}/models/${model.id}/${f.name}`));
    data.fill(0x20, tag(f).length); data.set(new TextEncoder().encode('"}'), f.bytes - 2);
  }
  if (start) { await controller.apply(); await controller.service.idle(); }
  const calls = [];
  const semantic = {
    info: () => controller.info(),
    candidates: (question, allowed) => { calls.push({ op: "candidates", allowed: new Set(allowed) }); return controller.candidates(question, allowed); },
    related: (sources, allowed, limit) => { calls.push({ op: "related", sources: [...sources], allowed: new Set(allowed) }); return controller.related(sources, allowed, limit); },
  };
  const made = makeService(vault, {}, { semantic });
  return { ...made, vault, semantic, controller, createWorker, calls, requests, model, modelFileUrl };
}
