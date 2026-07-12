# Architecture

Kosmos-Oden is **three products sharing one semantic engine**. That engine —
the Kosmos Core — is the single most important design decision: without it, the
plugin, standalone page, Agent API, Graphiti exporter and CLI would drift into
five different interpretations of the same vault.

```
                    ┌─────────────────────┐
                    │   Kosmos Core        │  src/core/
                    │  parsing             │
                    │  link resolution     │
                    │  canonical lineage   │
                    │  temporal projection │
                    │  graph construction  │
                    │  incremental index   │
                    │  Graphiti export     │
                    └──────────┬──────────┘
        ┌──────────────┬───────┴───────┬──────────────┐
        ▼              ▼               ▼              ▼
  Obsidian plugin  Standalone     Agent API       kosmos-build
  src/plugin/      src/standalone/ src/plugin/     kosmos-build.mjs
                                   agent-server.ts
        │              │               │              │
        └──────────────┴───────┬───────┴──────────────┘
                               ▼
                    Renderer  src/renderer/
                    (cosmology · layout · shaders · renderer)
```

## Modules

### `src/core/` — the shared engine (DOM-free, runs in Node and the browser)
| File | Responsibility |
|---|---|
| `types.ts` | Shared types: nodes, links, graph, diagnostics, lineage/temporal models. |
| `paths.ts` | POSIX path normalization, note/attachment classification, deterministic hashes. |
| `markdown.ts` | Tolerant frontmatter + wikilink/markdown/property link parsing. |
| `okf.ts` | OKF+ frontmatter + `**Related:**` footer parsing (declarations only). |
| `resolver.ts` | Link/title resolution with ambiguity tracking. |
| `lineage.ts` | **Canonical lineage normalization** — one `NEWER→OLDER` edge set from either declared side; validation (cycles, self-ref, unresolved, multi-successor, ordering, duplicates, ambiguity). |
| `temporal.ts` | `valid_at`/`invalid_at`, HEAD derivation, and the **one** point-in-time projector. |
| `graph.ts` | `parseSourceFile` (expensive, cacheable) + `assembleGraph` (cheap) + `buildGraph`. |
| `incremental.ts` | `KosmosIndex`: parse only changed content, rename without reparse, structural-rebuild threshold, graph delta. |
| `graphiti.ts` | `EpisodeType.json` episodes with canonical lineage + preserved raw declarations. |
| `demo.ts` | Built-in demo vault. |
| `version.ts` | Single version source of truth. |

### `src/renderer/` — the visualization (consumes a Core graph; never re-derives semantics)
`cosmology.ts` classifies nodes into cluster/galaxy/star/planet/moon/moonlet/
asteroid/Oort; `layout.ts` does hierarchical packing + a separation pass + a
collision **diagnostic** pass; `shaders.ts` holds the instanced body/glow
materials; `renderer.ts` is the Three.js scene, camera, interactions, Chrono,
minimap, playback, and the hidden-view render-loop suspension.

### `src/plugin/` — Obsidian host + Agent API
`main.ts` owns the view (an isolated, **sandboxed** iframe running the embed
page) and streams the vault in via the versioned `postMessage` protocol
(`protocol.ts`). `agent-server.ts` is a framework-free HTTP + MCP server
(unit-testable in Node) backed by `vault-provider.ts`, which owns a
`KosmosIndex` so the API answers from the *same* normalized graph the viewer
renders. `settings.ts` is the settings tab + setup guide.

### `src/standalone/` — the offline single-file viewer
`directory-source.ts` (persistent picker + snapshot fallback), `persistence.ts`
(IndexedDB handle), `directory-monitor.ts` (rescan-and-diff), `ui.ts` (startup
+ status + errors + exports), `standalone.ts` (entry, owns a `KosmosIndex`).

## Build

`scripts/build.mjs` is the deterministic generator (Doc1 §3.3): modular TS →
esbuild bundle → inlined into single-file HTML with `vendor/three.min.js`.
Outputs: `main.js` (plugin, embeds `dist/kosmos-embed.html` as base64),
`vault-kosmos.html` (standalone), and `dist/*.mjs` node bundles for the CLI and
tests. Executable artifacts are byte-reproducible across clean builds (verified
by a CI job); volatile metadata lives only in `release/BUILD-INFO.json`.

## Read/write boundary

Read-only: visualization, directory scanning, Agent API, MCP/REST queries,
Chrono, in-memory Graphiti generation. Writes happen only through explicit,
named, user-triggered commands (`AGENT-API.md`, `graphiti-episodes.json` +
sample script, `graph.json`).
