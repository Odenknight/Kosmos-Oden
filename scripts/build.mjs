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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    entryPoints: [resolve(root, entry)],
    bundle: true,
    write: false,
    format: opts.format ?? "iife",
    platform: opts.platform ?? "browser",
    target: "es2020",
    minify: production,
    sourcemap: false,
    logLevel: "silent",
    ...opts.extra,
  });
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
  const operationalPaths = await bundle("src/operational-paths.ts", { format: "esm", platform: "neutral", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-operational-paths.mjs"), operationalPaths);
  const navigationEffects = await bundle("src/navigation-effects/engine-adapter.ts", { format: "esm", platform: "browser", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-navigation-effects.mjs"), navigationEffects);
  // dist/kosmos-core.mjs — self-contained re-bundle of the gkos-engine core,
  // consumed by kosmos-build.mjs, the benchmarks and the Node test suite.
  const core = await bundleEngineCore();
  writeFileSync(resolve(root, "dist/kosmos-core.mjs"), core);
  const agent = await bundle("src/plugin/agent-server.ts", { format: "esm", platform: "node", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-agent-server.mjs"), agent);
  const agentLineage = await bundle("src/plugin/agent-lineage-test-entry.ts", { format: "esm", platform: "node", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-agent-lineage-test.mjs"), agentLineage);
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
  // Personal Notes (0.9.0) pure helpers are dependency-free and unit-testable
  const personalNotes = await bundle("src/personal-notes/index.ts", { format: "esm", platform: "neutral", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-personal-notes.mjs"), personalNotes);
  // Semantic search (0.9.5): everything except the ONNX runtime is plain TypeScript and unit-testable
  const semantic = await bundle("src/semantic/index.ts", { format: "esm", platform: "neutral", extra: { minify: false } });
  writeFileSync(resolve(root, "dist/kosmos-semantic.mjs"), semantic);
  console.log("built dist/kosmos-operational-paths.mjs, dist/kosmos-navigation-effects.mjs, dist/kosmos-core.mjs, dist/kosmos-agent-server.mjs, dist/kosmos-agent-lineage-test.mjs, dist/kosmos-layout.mjs, dist/kosmos-protocol.mjs, dist/kosmos-renderer-quality.mjs, dist/kosmos-version-metadata.mjs, dist/kosmos-nextcloud-sync.mjs, dist/kosmos-api-feed.mjs");
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
  const app = await bundle("src/standalone/standalone.ts");
  const html = composePage(`Kosmos-Oden ${VERSION} — Standalone`, app);
  writeFileSync(resolve(root, "kosmos-oden-stand-alone.html"), html);
  console.log(`built kosmos-oden-stand-alone.html (${(html.length / 1024).toFixed(0)} KB, single file)`);
}

async function buildEmbed() {
  const app = await bundle("src/plugin/embed.ts");
  const html = composePage(`Kosmos-Oden ${VERSION} (plugin)`, app);
  writeFileSync(resolve(root, "dist/kosmos-embed.html"), html);
  console.log(`built dist/kosmos-embed.html (${(html.length / 1024).toFixed(0)} KB)`);
}

/**
 * Personal Notes search worker (0.9.0): a self-contained browser IIFE written
 * as text. main.js embeds it via the `.txt` loader and starts it from a Blob
 * URL (src/plugin/personal-search-worker-url.ts); tests run the same text in
 * a worker_threads shim. Must be built before main.js.
 */
async function buildSearchWorker() {
  const res = await esbuild.build({
    stdin: {
      contents: 'import { installSearchWorker } from "./src/personal-notes/search-worker";\ninstallSearchWorker(self);\n',
      resolveDir: root,
      sourcefile: "kosmos-personal-search-worker-entry.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: production,
    sourcemap: false,
    logLevel: "silent",
  });
  const text = res.outputFiles[0].text;
  writeFileSync(resolve(root, "dist/kosmos-personal-search-worker.txt"), text);
  console.log(`built dist/kosmos-personal-search-worker.txt (${(text.length / 1024).toFixed(0)} KB)`);
}

/**
 * Semantic search worker (0.9.5): ONNX Runtime Web, the tokenizer, sql.js and
 * this plugin's index code as one self-contained browser IIFE, written as
 * text. Both WebAssembly binaries are embedded in it (gzip + base64), so the
 * plugin stays a single main.js and loads nothing at run time. gzip output is
 * deterministic here (no file name, no time stamp), which keeps the build
 * reproducible. Must be built before main.js.
 */
const SEMANTIC_WASM = [
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "dist/kosmos-ort-wasm.gz.b64.txt"],
  ["node_modules/sql.js/dist/sql-wasm-browser.wasm", "dist/kosmos-sql-wasm.gz.b64.txt"],
];

async function buildSemanticWorker() {
  for (const [from, to] of SEMANTIC_WASM) {
    writeFileSync(resolve(root, to), gzipSync(readFileSync(resolve(root, from)), { level: 9 }).toString("base64"));
  }
  const res = await esbuild.build({
    entryPoints: [resolve(root, "src/semantic/worker-entry.ts")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    loader: { ".txt": "text" },
    minify: production,
    sourcemap: false,
    logLevel: "silent",
  });
  const text = res.outputFiles[0].text;
  writeFileSync(resolve(root, "dist/kosmos-semantic-worker.txt"), text);
  console.log(`built dist/kosmos-semantic-worker.txt (${(text.length / 1024).toFixed(0)} KB, ONNX Runtime + SQLite WebAssembly embedded)`);
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
    loader: { ".html": "base64", ".txt": "text" },
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
    await buildSearchWorker(); // worker tests run the real built worker text
    await buildStandalone(); // artifact checks are part of the test suite (§25)
  } else if (standaloneOnly) {
    await buildStandalone();
  } else {
    await buildNodeBundles();
    await buildEmbed();     // must precede the plugin bundle (main.ts imports it)
    await buildSearchWorker(); // likewise embedded into main.js as text
    await buildSemanticWorker(); // likewise
    await buildStandalone();
    await buildPlugin();
  }
} catch (e) {
  console.error(e);
  process.exit(1);
}
