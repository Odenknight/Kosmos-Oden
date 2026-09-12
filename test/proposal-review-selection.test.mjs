import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const bundled = await build({
  stdin: { contents: readFileSync("src/plugin/gkx-enrichment.ts", "utf8") + "\nexport { GkxEnrichmentPreviewModal };", resolveDir: resolve("src/plugin"), loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{ name: "review-modal-host", setup(b) {
    b.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ loader: "js", contents: "export const requestUrl=()=>{throw new Error()}; export class App{}; export class Notice{}; export class Setting{}; export class TFile{}; export const normalizePath=x=>x; export class Modal {constructor(app){this.app=app;} open(){globalThis.__reviewPreview=this;} close(){}}" }));
  } }],
});
const { GkxEnrichmentPreviewModal } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);

test("batch acceptance cannot accept selected proposals hidden by current filters", () => {
  const suggestions = [{ field: "description", value: "summary" }, { field: "tags", value: ["tag"] }];
  const record = { proposalId: "operation", suggestions };
  const proposals = suggestions.map((s, i) => ({ proposalId: `p${i}`, operationId: "operation", target: { uid: "same" }, change: { field: s.field, canonicalValue: s.value }, confidence: .9, provenance: { producer: "engine" }, actor: { id: "human" } }));
  const modal = new GkxEnrichmentPreviewModal({}, { records: [record] }, proposals);
  modal.onOpen = () => {};
  modal.selected = new Set(["p0", "p1"]);
  modal.filters = { field: "description", direction: "descending" };
  modal.acceptSelected();
  assert.deepEqual(globalThis.__reviewPreview.proposals.map(p => p.proposalId), ["p0"]);
  assert.equal(modal.controls.get("operation:0").decision, "pending", "preview alone approves nothing");
  globalThis.__reviewPreview.onConfirm();
  assert.equal(modal.controls.get("operation:0").decision, "accepted");
  assert.equal(modal.controls.get("operation:1").decision, "pending");
  delete globalThis.__reviewPreview;
});


