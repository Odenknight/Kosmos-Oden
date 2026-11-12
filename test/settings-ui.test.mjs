import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settingsPath = new URL("../src/plugin/settings.ts", import.meta.url);
const stylesPath = new URL("../styles.css", import.meta.url);
const brandedPluginPaths = [
  "agent-server.ts", "main.ts", "gkx-blocked-review.ts", "gkx-enrichment-apply.ts",
  "gkx-enrichment.ts", "gkx-migration.ts", "settings.ts",
].map((name) => new URL(`../src/plugin/${name}`, import.meta.url));

test("plugin-facing copy consistently uses GKOS-Engine and GKX branding", async () => {
  const sources = await Promise.all(brandedPluginPaths.map((path) => readFile(path, "utf8")));
  const copy = sources.join("\n");
  // The engine version must be interpolated from the library, never frozen as a
  // literal: this copy is agent-facing, and a stale literal misreports the
  // engine to every connected client.
  assert.match(copy, /GKOS-Engine v\$\{ENGINE_VERSION\}/);
  assert.doesNotMatch(copy, /GKOS-Engine v\d+\.\d+\.\d+/);
  assert.match(copy, /GKX v2\.3 Validating Projection Profile/);
  assert.doesNotMatch(copy, /GKX\+/);
});

test("Options exposes the four required first-class tabs and routes Sync controls to Sync", async () => {
  const source = await readFile(settingsPath, "utf8");
  for (const label of [
    "Agent API (HTTP + MCP)",
    "GKOS Note Formatting",
    "Quick Connect MCP",
    "Connectivity to Sync Vault",
  ]) assert.match(source, new RegExp(label.replace(/[+()]/g, "\\$&")));
  assert.match(source, /role\", \"tablist/);
  assert.match(source, /role\", \"tabpanel/);
  assert.match(source, /new Setting\(syncEl\)\.setName\(\"Nextcloud server URL\"\)/);
  assert.match(source, /new Setting\(syncEl\)\.setName\(\"Sync hidden Obsidian configuration \(\.obsidian\)\"\)/);
  for (const label of ["Scan and repair", "Convert all to editable 2.2", "Convert all to editable 2.3", "Scan labels and links"]) assert.ok(source.includes(label));
  assert.match(source, /Flat GKX 2\.2 Properties are the human authoring surface/);
  assert.match(source, /GKOS-Engine v\$\{ENGINE_VERSION\}/);
  for (const provider of ["S3-compatible object storage", "Dropbox", "Microsoft OneDrive", "Google Drive"]) assert.match(source, new RegExp(provider));
  assert.doesNotMatch(source, /enhanceSectionNavigation|openSections/);
});

test("Quick Connect text comes from the one shared generator; older-client text is transport-accurate", async () => {
  const source = await readFile(settingsPath, "utf8");
  assert.match(source, /renderQuickConnect\(/, "settings tab uses the shared Quick Connect block");
  assert.match(source, /connectionConfig\(/, "the Agent API guide uses the shared generator");
  for (const literal of ["claude mcp add", "[mcp_servers.", "streamable-http\", url", "KOSMOS_MCP_TOKEN: s.agentToken"]) {
    assert.ok(!source.includes(literal), `settings.ts must not hard-code connection text: ${literal}`);
  }
  assert.match(source, /STDIO_ONLY_MCP_PROTOCOL_VERSIONS\.join\(", "\)\} only through the bundled stdio bridge/);
  for (const label of ["Active profile", "Personal Notes windows", "Optional tags", "Connect my AI"]) assert.ok(source.includes(label), label);
  const modal = await readFile(new URL("../src/ui/connect-ai-modal.ts", import.meta.url), "utf8");
  assert.match(modal, /renderQuickConnect\(/, "the Connect window uses the same block");
});

test("Options CSS stacks controls on mobile and keeps tabs horizontally reachable", async () => {
  const css = await readFile(stylesPath, "utf8");
  assert.match(css, /\.kosmos-settings-tabs[\s\S]*grid-template-columns:\s*repeat\(4/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.kosmos-settings-tabs[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /\.kosmos-settings-panel \.setting-item[\s\S]*flex-direction:\s*column/);
  assert.match(css, /\.kosmos-settings-panel\[hidden\][^{]*\{\s*display:\s*none/);
});
