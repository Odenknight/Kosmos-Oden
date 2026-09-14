/**
 * Kosmos-Oden build (§21).
 *
 * Modular TypeScript source -> bundled, fully inlined artifacts:
 *
 *   dist/kosmos-core.mjs          ESM bundle of the shared Kosmos Core
 *                                 (consumed by kosmos-build.mjs and tests)
 *   dist/kosmos-agent-server.mjs  ESM bundle of the Agent API server core
 *                                 (consumed by tests)
 *   dist/kosmos-embed.html        single-file page for the plugin iframe
 *   kosmos-oden-stand-alone.html             single-file STANDALONE viewer (repo root)
 *   main.js                       Obsidian plugin bundle (embeds the iframe page)
 *
 * Every artifact bundles Three.js (exact-pinned ESM `three`, esbuild-bundled
 * into the app), all JS and all CSS. No CDN, no external runtime URL, works
 * from file:// (§2.1). Renderer provenance is recorded in renderer-provenance.json.
 *
 * Usage:
 *   node scripts/build.mjs                  full build
 *   node scripts/build.mjs --standalone-only
 *   node scripts/build.mjs --for-tests      core + agent-server bundles only
 *   node scripts/build.mjs --dev            full build, unminified with sourcemaps disabled
 */
import esbuild from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { observeStandaloneInputs } from "./standalone-component-inputs.mjs";
import { standaloneSbom } from "./standalone-sbom.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const production = !args.has("--dev");
const forTests = args.has("--for-tests");
const standaloneOnly = args.has("--standalone-only");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const VERSION = pkg.version;

mkdirSync(resolve(root, "dist"), { recursive: true });

/** Inline-script hardening: '</script' inside JS strings would close the tag. */
const escapeInline = (js) => js.replace(/<\/script/gi, "<\\/script");

// The Kosmos Core now lives in the external `gkos-engine` package (an ordinary
// node_modules dependency, resolved by esbuild/tsc the normal way — no special
// path mapping needed).

async function bundle(entry, opts = {}) {
  const res = await esbuild.build({
    absWorkingDir: root,
    entryPoints: [resolve(root, entry)],
    bundle: true,
    write: false,
    format: opts.format ?? "iife",
    platform: opts.platform ?? "browser",
    target: "es2020",
    minify: production,
    sourcemap: false,
    logLevel: "silent",
    metafile: Boolean(opts.captureMetafile),
    ...opts.extra,
  });
  if (opts.captureMetafile) opts.captureMetafile(res.metafile);
  return res.outputFiles[0].text;
}

/** Bundle the external gkos-engine core into a self-contained ESM artifact. */
async function bundleEngineCore() {
  const res = await esbuild.build({
    stdin: {
      contents: 'export * from "gkos-engine";',
      resolveDir: root,
      sourcefile: "kosmos-core-entry.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2020",
    minify: false,
    sourcemap: false,
    logLevel: "silent",
  });
  return res.outputFiles[0].text;
}

async function buildNodeBundles() {
  const effectsInspectionHost = await bundle("src/navigation-effects/plugin-inspection-host.ts", { format: "cjs", platform: "node" });
  writeFileSync(resolve(root, "effects-inspection-host.cjs"), effectsInspectionHost);
  const workspaceView = await bundle("src/workspace/view.ts", { extra: { globalName: "KosmosNotesWorkspace", minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-notes-workspace.js"), workspaceView);
  const workspaceMarkdown = await bundle("src/workspace/markdown.ts", { format: "esm", platform: "browser", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-workspace-markdown.mjs"), workspaceMarkdown);
  const workspaceHost = await bundle("src/workspace/host.ts", { format: "esm", platform: "neutral", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-workspace-host.mjs"), workspaceHost);
  const workspaceSelection = await bundle("src/workspace/selection.ts", { format: "esm", platform: "neutral", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-workspace-selection.mjs"), workspaceSelection);
  const operationalPaths = await bundle("src/operational-paths.ts", { format: "esm", platform: "neutral", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-operational-paths.mjs"), operationalPaths);
  const navigationEffects = await bundle("src/navigation-effects/test-entry.ts", { format: "esm", platform: "browser", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-navigation-effects.mjs"), navigationEffects);
  // dist/kosmos-core.mjs — self-contained re-bundle of the gkos-engine core,
  // consumed by kosmos-build.mjs, the benchmarks and the Node test suite.
  const core = await bundleEngineCore();
  writeFileSync(resolve(root, "dist/kosmos-core.mjs"), core);
  const agent = await bundle("src/plugin/agent-server.ts", { format: "esm", platform: "node", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-agent-server.mjs"), agent);
  // cosmology + layout are DOM-free, so the classification/packing pipeline is testable in Node
  const layout = await bundle("src/renderer/layout.ts", { format: "esm", platform: "neutral", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-layout.mjs"), layout);
  // host<->renderer protocol validation is DOM-free and unit-testable
  const protocol = await bundle("src/plugin/protocol.ts", { format: "esm", platform: "neutral", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-protocol.mjs"), protocol);
  // adaptive render-quality policy is DOM-free and unit-testable
  const rendererQuality = await bundle("src/renderer/quality.ts", { format: "esm", platform: "neutral", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-renderer-quality.mjs"), rendererQuality);
  // separately sourced Engine version metadata (R3) is dependency-free and unit-testable
  const versionMetadata = await bundle("src/retrieval/version-metadata.ts", { format: "esm", platform: "neutral", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-version-metadata.mjs"), versionMetadata);
  const nextcloudSync = await bundle("src/plugin/nextcloud-sync-test-entry.ts", { format: "esm", platform: "neutral", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-nextcloud-sync.mjs"), nextcloudSync);
  // standalone live Agent-API feed glue is DOM-free and unit-testable
  const apiFeed = await bundle("src/standalone/api-feed.ts", { format: "esm", platform: "neutral", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-api-feed.mjs"), apiFeed);
  console.log("built effects-inspection-host.cjs, dist/kosmos-operational-paths.mjs, dist/kosmos-navigation-effects.mjs, dist/kosmos-core.mjs, dist/kosmos-agent-server.mjs, dist/kosmos-layout.mjs, dist/kosmos-protocol.mjs, dist/kosmos-renderer-quality.mjs, dist/kosmos-version-metadata.mjs, dist/kosmos-nextcloud-sync.mjs, dist/kosmos-api-feed.mjs");
}

const RENDERER_PROVENANCE = JSON.parse(readFileSync(resolve(root, "renderer-provenance.json"), "utf8"));

function composePage(title, appJs) {
  const css = readFileSync(resolve(root, "src/renderer/kosmos.css"), "utf8");
  const body = readFileSync(resolve(root, "src/renderer/kosmos-body.html"), "utf8");
  // Three.js is now an ESM dependency bundled into appJs by esbuild — no separate
  // vendored <script> and no CDN. A diagnostic build marker records the renderer.
  const marker = `three r${RENDERER_PROVENANCE.threeRevision} ${RENDERER_PROVENANCE.stableBackend} webgl${RENDERER_PROVENANCE.webglVersion}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<meta name="kosmos-renderer" content="${marker}" />
<title>${title}</title>
<style>
${css}
</style>
</head>
<body>
<!-- Kosmos renderer: ${marker} (Three.js bundled from the exact-pinned npm module; no CDN, no runtime fetch) -->
${body}
<script>
${escapeInline(appJs)}
</script>
</body>
</html>
`;
}

async function buildStandalone() {
  let metafile;
  const app = await bundle("src/standalone/standalone.ts", { captureMetafile: value => { metafile = value; } });
  const html = composePage(`Kosmos-Oden ${VERSION} — Standalone`, app);
  writeFileSync(resolve(root, "kosmos-oden-stand-alone.html"), html);
  const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
  const pageInputs = ["src/renderer/kosmos.css", "src/renderer/kosmos-body.html", "renderer-provenance.json", "package.json"];
  const inventory = {
    schemaVersion: 1,
    artifact: "kosmos-oden-stand-alone.html",
    artifactSha256: sha256(Buffer.from(html)),
    artifactBytes: Buffer.byteLength(html),
    esbuildVersion: esbuild.version,
    minified: production,
    lockfileSha256: sha256(readFileSync(resolve(root, "package-lock.json"))),
    buildScriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    // Metafile paths and byte contributions come from the actual bundler run.
    // Page-input hashes are post-build observations, not a signed source receipt.
    pageInputs: pageInputs.map(path => ({ path, sha256: sha256(readFileSync(resolve(root, path))) })),
    pageInputObservation: "post-build",
    completeSbom: false,
    componentInputs: observeStandaloneInputs(root, metafile),
    componentObserverSha256: sha256(readFileSync(resolve(root, "scripts/standalone-component-inputs.mjs"))),
    sbomGeneratorSha256: sha256(readFileSync(resolve(root, "scripts/standalone-sbom.mjs"))),
    metafile,
  };
  const inventoryBytes = Buffer.from(JSON.stringify(inventory, null, 2) + "\n");
  writeFileSync(resolve(root, "dist/standalone-build-inputs.json"), inventoryBytes);
  writeFileSync(resolve(root, "dist/standalone.cdx.json"), standaloneSbom(inventoryBytes));
  console.log(`built kosmos-oden-stand-alone.html (${(html.length / 1024).toFixed(0)} KB, single file)`);
}

async function buildEmbed() {
  const app = await bundle("src/plugin/embed.ts");
  const html = composePage(`Kosmos-Oden ${VERSION} (plugin)`, app);
  writeFileSync(resolve(root, "dist/kosmos-embed.html"), html);
  console.log(`built dist/kosmos-embed.html (${(html.length / 1024).toFixed(0)} KB)`);
}

async function buildPlugin() {
  await esbuild.build({
    entryPoints: [resolve(root, "src/plugin/main.ts")],
    bundle: true,
    format: "cjs",
    target: "es2020",
    platform: "browser",
    // Provided by Obsidian at runtime — never bundle these:
    external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", "node:*"],
    loader: { ".html": "base64" },
    sourcemap: production ? false : "inline",
    minify: production,
    treeShaking: true,
    outfile: resolve(root, "main.js"),
    logLevel: "info",
  });
  console.log("built main.js");
}

try {
  if (forTests) {
    await buildNodeBundles();
    await buildStandalone(); // artifact checks are part of the test suite (§25)
  } else if (standaloneOnly) {
    await buildStandalone();
  } else {
    await buildNodeBundles();
    await buildEmbed();     // must precede the plugin bundle (main.ts imports it)
    await buildStandalone();
    await buildPlugin();
  }
} catch (e) {
  console.error(e);
  process.exit(1);
}
