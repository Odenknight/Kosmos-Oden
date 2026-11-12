# Architecture

Kosmos-Oden is **three products sharing one semantic engine**. Since 0.8.0 that
engine is an exact-pinned external `gkos-engine` package (0.9.0: the 2.2.0
development line at commit `7511233717cd5ab9ce8f6cec76e9623a21e3c728`). The plugin,
standalone page, Agent API, Graphiti exporter, CLI, and opt-in Navigation
integration all consume that same dependency.

```
                    ┌─────────────────────┐
                    │ GKOS-Engine 2.1      │  node_modules/gkos-engine
                    │  parsing             │
                    │  link resolution     │
                    │  canonical lineage   │
                    │  temporal projection │
                    │  graph construction  │
                    │  incremental index   │
                    │  Graphiti export     │
                    │  Navigation 1.0      │
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

### `gkos-engine` — the shared engine (DOM-free, runs in Node and the browser)
| File | Responsibility |
|---|---|
| `types.ts` | Shared types: nodes, links, graph, diagnostics, lineage/temporal models. |
| `paths.ts` | POSIX path normalization, note/attachment classification, deterministic hashes. |
| `markdown.ts` | Tolerant frontmatter + wikilink/markdown/property link parsing. |
| `gkx.ts` | Flat GKX 2.2 metadata, typed relations, compatibility aliases, and legacy `**Related:**` parsing (declarations only). |
| `gkx23.ts` | Source-preserving nested GKX 2.3 parser, origin-separated validating projection, deterministic policy/assessment, labels, and structured diagnostics. |
| `gkx-migration.ts` | Strict GKX conformance audit plus deterministic, hash-bound onboarding proposals; no Obsidian or LLM dependency. |
| `resolver.ts` | Link/title resolution with ambiguity tracking. |
| `lineage.ts` | **Canonical lineage normalization** — one `NEWER→OLDER` edge set from either declared side; validation (cycles, self-ref, unresolved, multi-successor, ordering, duplicates, ambiguity). |
| `temporal.ts` | `valid_at`/`invalid_at`, HEAD derivation, and the **one** point-in-time projector. |
| `graph.ts` | `parseSourceFile` (expensive, cacheable) + `assembleGraph` (cheap) + `buildGraph`. |
| `incremental.ts` | `GkxIndex`: parse only changed content, rename without reparse, structural-rebuild threshold, graph delta. |
| `graphiti.ts` | Stable-UUID, chronological, non-authoritative Graphiti episodes without future-state leakage. |
| `demo.ts` | Built-in demo vault. |
| `navigation/` | Source-content-read-only discovery, classification, diff/audit/context/re-entry planning, and truthful capabilities. |

`src/navigation-integration.ts` is the product adapter. It keeps Navigation off
by default, passes enabled discovery through the Engine contract, exposes
findings to the local renderer, and advertises that Kosmos-Oden has no
Governance Store or Navigation write effects.

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
`GkxIndex` so the API answers from the *same* normalized graph the viewer
renders, filtered by the configured GKX sensitivity ceiling. `settings.ts`
renders Anthropic, OpenAI, stdio, and vendor-neutral quick-connect configs
from `connect-snippets.ts`; the release's `kosmos-mcp-stdio.mjs` mirrors
modern per-request metadata into headers and carries initialize-era clients
(including `2024-11-05`) for stdio-only harnesses, with no session. `gkx-migration.ts` hosts the explicit structural
audit/backup/apply modal. `gkx-enrichment.ts` builds deterministic and optional
bounded-LLM proposals; `gkx-enrichment-apply.ts` keeps the later human review,
hash-bound decision plan, backup, source recheck, and write authority in a
separate step. `gkx-blocked-review.ts` is an on-device/private-LAN-only,
advisory boundary for
migration blockers; it shares the bounded JSON request transport in
`gkx-llm.ts` but has no route into either writer.

`nextcloud-sync-core.ts` contains DOM-free settings migration, URL/path
validation, exclusions, and the deterministic three-way planner.
`nextcloud-sync.ts` is the Obsidian/WebDAV adapter: it scans local binary files,
enumerates Nextcloud with bounded depth-1 `PROPFIND` requests, applies
conditional transfers, stores common-state metadata, and preserves remote
conflict copies. Credentials remain in Obsidian Secret Storage rather than
plugin data.

### `src/personal-notes/` and the Personal profile (0.9.0)

The Agent API serves one of two profiles, chosen by `activeProfile` (settings
schema 11). The existing profile is unchanged. The Personal Notes profile does
not use the Engine projection for access decisions:

| Module | Responsibility |
|---|---|
| `types.ts` | Shared contracts, limits and error codes (`kosmos-personal-notes/1`). |
| `settings.ts` | Schema 11 migration (fresh, baseline 9, starter-patch 10, malformed). |
| `scope.ts`, `policy.ts` | Strict vault paths and folder scope; the one `PersonalReadPolicy` with a monotonic **policy generation**; the read decision (scope, physical containment, authored sensitivity only). |
| `corpus.ts` | In-memory corpus of exact raw Markdown, rebuilt at startup and kept current from vault events; whole-file size and aggregate budget limits. |
| `fulltext.ts`, `search-worker.ts`, `worker-client.ts` | Lexical search in a Web Worker built to `dist/kosmos-personal-search-worker.txt`, embedded in `main.js` and started from a Blob URL. Requests carry corpus revision and policy generation; no main-thread fallback. |
| `query-service.ts`, `pagination.ts`, `attachments.ts`, `lineage.ts` | The five read-only tools behind REST and every MCP era; exact UTF-16 pages with SHA-256 continuation; attachment references; supersession lineage among readable notes. |
| `tagging.ts`, `frontmatter-patch.ts`, `tagging-writer.ts` | Optional deterministic tags: a frozen preview plan, a byte-preserving frontmatter patch, and a hash-checked, per-file serialized writer with exact backups. |

`src/plugin/personal-runtime.ts` owns the runtime handed to the server and the
device-local token store; `agent-server.ts` dispatches by profile
(`PERSONAL_REST_ROUTES`, five tools) and bumps the policy generation on every
access change; `mcp-compat.ts` holds the era classifier and stateless legacy
adapter shared by both profiles; `connect-snippets.ts` is the single source
of client configuration text. The UI windows live in `src/ui/`.

### `src/standalone/` — the offline single-file viewer
`directory-source.ts` (persistent picker + snapshot fallback), `persistence.ts`
(IndexedDB handle), `directory-monitor.ts` (rescan-and-diff), `ui.ts` (startup
+ status + errors + exports), `standalone.ts` (entry, owns a `GkxIndex`).

## Build

`scripts/build.mjs` is the deterministic generator (Doc1 §3.3): modular TS →
esbuild bundle → inlined into single-file HTML with `vendor/three.min.js`.
Outputs: `main.js` (plugin, embeds `dist/kosmos-embed.html` as base64 and the
Personal search worker as text),
`kosmos-oden-stand-alone.html` (standalone), and `dist/*.mjs` node bundles for the CLI and
tests. Executable artifacts are byte-reproducible across clean builds (verified
by a CI job); volatile metadata lives only in `release/BUILD-INFO.json`.

## Read/write boundary

Read-only: visualization, ordinary directory scanning, Agent API, MCP/REST
queries, Chrono, in-memory Graphiti generation, and the initial GKX audit.
Writes happen only through explicit, named, user-triggered commands. The GKX
migrator has a separate approval boundary: save-audit writes only a content-free
plan; apply requires backup/sensitivity confirmations, writes binary backups,
and edits only sources still identical to the approved hash-bound plan.
The v2.3 validating projection and all REST/MCP assess/validate tools are
in-memory and read-only. They never insert assessment results into notes and
never treat proposed values as effective. The enrichment path adds another boundary: proposals have no write authority,
nothing is preselected, accepted relationship targets must resolve, and only a
reviewer-approved plan can reach the backup/apply modal. Persisted enrichment
plans omit note bodies and each live note is compared byte-for-byte with the
reviewed source before its guarded write.
The separately configured Nextcloud workflow can write local vault files and
the selected remote folder. It is disabled by default, excludes `.obsidian`,
uses conditional WebDAV requests, and defaults deletion propagation off.
Users can opt into `.obsidian` synchronization independently of custom path
globs; the plugin's own `data.json` remains a mandatory exclusion.
Personal Notes adds two user-triggered writers and no implicit one: optional
tags (**Apply selected tags**, **Add supersedes**: hash re-check, exact backup
under `.gkx/backup/tagging-*`) and opted-in automatic time stamps (content
changes inside the tagging folders only, no backup). Reading, indexing,
searching and connecting never write; the legacy automatic timestamp writer
stands down while the Personal profile is active.
