# Kosmos-Oden — Vault Kosmos v0.5.5

**A 3D "Local Cluster of Galaxies" view of your Markdown knowledge base.** Your notes become a living cosmos you can fly through — local-first, offline, and live-updating as you edit.

Kosmos-Oden is three products sharing **one semantic engine** (the Kosmos Core):

```
                    ┌─────────────────────┐
                    │  Kosmos Core Graph  │
                    │ parsing · resolution│
                    │ canonical lineage   │
                    │ temporal projection │
                    │ graph construction  │
                    │ Graphiti export     │
                    └──────────┬──────────┘
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
      Obsidian plugin   Standalone HTML    Agent API layer
      live vault events directory picker   REST + MCP
      incremental sync  rescan + diff      graph queries
      3D renderer       3D renderer        Graphiti episodes
```

The same vault produces materially the same nodes, links, lineage, HEAD status, temporal state and Graphiti episode structure whether you access it through Obsidian, `vault-kosmos.html`, `kosmos-build.mjs`, the REST Agent API, or MCP.

*A fork and rebuild of [H4R7W16/vault-kosmos](https://github.com/H4R7W16/vault-kosmos), continued by OdenKnight.*

---

## How your vault maps to the cosmos

| Cosmic body | What it is in your vault |
|---|---|
| **Cluster core** | The root-level manifest note, if you have one (`Home`, `index`, `README`, a MOC). It sits at the centre as the gravitational focal point. |
| **Galaxy / galactic centre** | Each top-level folder. Its folder note (`Projects/Projects.md`, or `index`/`README`/`MOC` inside the folder) becomes the large, bright galactic centre. |
| **Solar-system star** | A major, well-connected note inside a folder (or a sub-folder's note). |
| **Planets · moons · moonlets** | Notes linked outward from a star, chained Star → Planet → Moon → Moonlet by how far they sit from the star. |
| **Asteroids** | Loose, low-link, or unresolved notes — free-floating near the area they're gravitationally bound to. |
| **Oort cloud** | Attachment files (images, PDFs, …) linked from your notes, drifting in an outer shell around their system. |

The layout uses hierarchical packing and collision-resolution passes designed to keep bodies separated and minimize overlap. A diagnostic pass counts any residual intersections and reports them (they are rare, not impossible — see `benchmarks/RESULTS.md`).

## Standalone — no Obsidian required

`vault-kosmos.html` is one self-contained file: Three.js, the parser, the graph engine and the renderer are all inlined. No Obsidian, no Node.js, no Python, no local server, no internet connection.

1. Download **`vault-kosmos.html`** (or copy it anywhere — any folder works).
2. Open it in a modern browser (double-click).
3. Click **Open Knowledge Folder**.
4. Select the root of your Markdown or Obsidian vault.
5. Kosmos recursively scans and renders the folder — `.obsidian`, `.git`, `node_modules` are skipped, notes are read, attachments become Oort objects.
6. Where the browser grants persistent directory access, Kosmos **monitors the folder** while the page is open: new notes appear, deleted notes disappear, and a new top-level folder becomes a new galaxy after the next rescan (visibility/focus triggers, a low-frequency poll, or **Rescan Now**).

**Two access modes, clearly labelled in the status panel:**

- **Persistent folder access** (Chromium browsers — Chrome, Edge, Brave): uses `showDirectoryPicker()`. The page can re-scan the folder while it stays open, and can remember the folder (IndexedDB handle) for **Reopen Last Folder** — the browser re-asks permission before any access. **Forget Folder** removes the stored handle.
- **Imported folder snapshot** (all browsers, including Firefox/Safari and `file://` pages where the picker is restricted): a one-time import via the standard directory input. Everything renders identically, but there is **no live monitoring** — the page never implies otherwise.

The standalone scanner is **read-only**: it never renames, deletes, modifies, rewrites, normalizes, moves or patches your files. Exports (**Export Graph JSON**, **Export Graphiti Episodes**) are generated in memory and downloaded through the browser — no filesystem write access is requested.

## Obsidian plugin

Renders inside Obsidian (desktop **and** mobile) in an isolated view.

1. Copy `manifest.json`, `main.js`, and `styles.css` into `<your-vault>/.obsidian/plugins/vault-kosmos/`.
2. Settings → **Community plugins** → enable **Vault Kosmos**.
3. Open it from the ribbon (orbit icon) or the command palette → *Open Vault Kosmos*.

Live refresh is incremental: a single edited note is re-read and re-parsed alone (verified by tests); a full re-read happens only on large structural changes (bulk import/delete/rename, > max(500, 25 %) of the vault). Refresh is debounced and paused while the view is hidden; the render loop is suspended while the Kosmos view is hidden.

## OKF+ temporal knowledge graph

Notes written in **OKF+** (Open Knowledge Format Plus) light up temporal features:

- **Canonical knowledge chains** — `supersedes` / `superseded_by` frontmatter is normalized internally into one canonical lineage graph, so both fields are projected bidirectionally: declaring **either side** is enough. Superseded notes render as ghosts; the newest version of a chain is HEAD. Malformed lineage (cycles, self-references, unresolved targets, multiple successors, out-of-order timestamps) is detected and reported through diagnostics instead of silently breaking the graph.
- **Temporal validity intervals** — each note is *valid* from its OKF+ `timestamp` (fallback: file creation/modification time) and becomes *invalid* the moment its earliest successor's validity begins. This supports point-in-time reconstruction from retained timestamps and supersession history; it does **not** reconstruct edits that were overwritten in place — that history no longer exists in the files.
- **Chrono time-travel** — the **Chrono** button (`H`) scrubs the cosmos to any moment: notes not yet written vanish, notes already superseded dim to dark ghosts. Chrono, the Agent API's `graph_at_time`, and the temporal tests all use the **same** projector.
- **Semantic links** — the footer `**Related:** [[A]], [[B]]` links are tracked as their own `semantic` edge kind.

## Agent API (REST + MCP)

Settings → **Vault Kosmos** → **Enable local Agent API**. A read-only, token-protected server starts on `127.0.0.1` (opt-in LAN binding available) exposing the same core graph the viewer renders: `vault_overview`, `search_notes`, `get_note`, `get_lineage`, `get_related`, `graph_at_time`, `export_graphiti_episodes` over MCP (`/mcp`, Streamable HTTP) plus plain REST mirrors and a `/diagnostics` route. One-click copy buttons generate the Claude Code command / Claude Desktop config; a palette command writes **AGENT-API.md** into your vault with your address and token pre-filled. Full guide: [AGENT-API.md](AGENT-API.md).

Security: tokens come from a cryptographically secure RNG only (32 bytes, base64url — creation fails loudly if no secure RNG exists), MCP protocol versions are negotiated against an explicit supported list, request bodies are capped at 4 MiB (measured in **bytes**), and `Host`/`Origin` headers are validated to block DNS-rebinding and cross-site requests. Desktop only (Obsidian mobile has no local server support).

## Graphiti export

Export your vault as [getzep/graphiti](https://github.com/getzep/graphiti)-ingestable episodes — every note becomes an `EpisodeType.json` episode (`name`, `episode_body`, `source`, `source_description`, `reference_time`, `group_id`), sorted chronologically so lineage lands in order. Episode bodies carry the **canonical** (resolved) lineage plus the raw authored declarations under `source_okf`, keeping "what the author declared" and "what the system resolved" explicit. The format is Graphiti-ingestable; Graphiti's own LLM pipeline determines the graph it builds, so an identical internal reconstruction is not guaranteed.

- **Plugin:** command palette → *Export Graphiti episodes (OKF+)* → writes `graphiti-episodes.json` + `graphiti-ingest-sample.py` to the vault root.
- **Standalone:** the **Export Graphiti Episodes** button downloads the same payload.
- **CLI:** `node kosmos-build.mjs /path/to/vault graph.json --episodes graphiti-episodes.json`

## kosmos-build CLI

```bash
node kosmos-build.mjs /path/to/vault graph.json
node kosmos-build.mjs /path/to/vault graph.json --episodes graphiti-episodes.json
node kosmos-build.mjs /path/to/vault graph.json --watch     # rebuild on change (Node)
```

Uses the same bundled Kosmos Core as the plugin and the standalone page — not a separate implementation. A `graph.json` placed next to `vault-kosmos.html` is auto-loaded when the page is served over http(s).

## What writes what (read-only guarantees)

**Never modify existing notes:** the 3D visualization, directory scanning, the Agent API, MCP/REST queries, Chrono projection, and in-memory Graphiti episode generation.

**Create explicitly named new files, only when you trigger them:** *Write Agent API guide* → `AGENT-API.md`; *Export Graphiti episodes* → `graphiti-episodes.json` + `graphiti-ingest-sample.py`; `kosmos-build.mjs` → `graph.json` (+ episodes file). Visualization and Agent API queries never modify existing notes; optional export and setup commands create explicitly named output files.

## Controls

- **Drag** to orbit · **scroll / pinch** to zoom · **right-drag / two-finger** to pan.
- **Tap a body** to focus it — its direct links (including attachments) light up. **Right-click / long-press** → *Go to Note*.
- **Labels** `R` · **All links** `C` · **All objects** `O` · **Chrono** `H` · **Grow** `G` · **Timeline** `T` · **Trailer**.
- **Modes:** Overview `A` · Focus `S` · Depth `D` · Fly `F` (WASD + mouse; touch pads on mobile) · Clear `Q`.
- Zoom out as far as you like — once the whole cluster shrinks to ~10 % of the screen it re-centres itself.
- Mobile: adaptive pixel-ratio and geometry LOD keep the view smooth; the render loop is suspended while the view is hidden.

## Build from source

```bash
nvm use                  # Node 22 (see .nvmrc); engines pinned in package.json
npm ci                   # clean install from the committed package-lock.json
npm run typecheck        # tsc --noEmit
npm run build            # plugin main.js + embed page + vault-kosmos.html + node bundles
npm run build:standalone # just vault-kosmos.html
npm test                 # 90 unit/API/artifact tests (node --test)
npm run verify           # typecheck + build + test + version/artifact/invariant checks
npm run bench            # reproducible synthetic-vault benchmarks
```

A clean checkout builds and tests with exactly these commands — no manually generated files required. Toolchain and dependencies are pinned (no `"latest"`), so repeated clean builds produce the **same** executable artifacts; a CI job proves it by building twice and diffing the hashes. CI (GitHub Actions, minimal `contents: read` permissions) runs typecheck, both builds, the test suite, version-synchronization, artifact self-containment, and the `kosmos-invariants.yml` policy on every push and pull request. Releases are built **from the tag** with `SHA256SUMS` + `BUILD-INFO.json` provenance and are gated on the full pipeline.

Performance: see [benchmarks/RESULTS.md](benchmarks/RESULTS.md) for measured numbers (100 → 50,000 notes) — no claims beyond what the benchmark reproduces.

## Security, assurance & governance

- [SECURITY.md](SECURITY.md) — reporting, and the enforced security invariants.
- [kosmos-invariants.yml](kosmos-invariants.yml) — machine-readable policy, checked in CI.
- [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/RENDERER-PROTOCOL.md](docs/RENDERER-PROTOCOL.md) (incl. the iframe sandbox experiment) · [docs/RELEASE-PROCESS.md](docs/RELEASE-PROCESS.md).
- [CHANGELOG.md](CHANGELOG.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
- The two upstream engineering assessments this build was hardened against live in [docs/assessments/](docs/assessments/).

## Repository layout

```
src/core/        shared Kosmos Core (types, markdown, okf, resolver, lineage,
                 temporal, graph, graphiti, incremental index, demo)
src/renderer/    cosmology, layout (+collision diagnostics), shaders, renderer
src/plugin/      Obsidian plugin, iframe embed entry, Agent API server, settings
src/standalone/  directory source, rescan monitor, handle persistence, UI, entry
scripts/         build pipeline, version + artifact checks
test/            parser, resolver, lineage, temporal, incremental, graphiti,
                 agent-api, standalone-artifact tests
benchmarks/      synthetic-vault benchmark + measured results
vendor/          three.min.js r128 (MIT), inlined at build time
```

## Privacy

Everything runs locally. The plugin and the standalone viewer make no external network requests — no CDN, no telemetry. The optional Agent API binds to `127.0.0.1` unless you explicitly opt into LAN binding.

## License

MIT — see [LICENSE](LICENSE).
