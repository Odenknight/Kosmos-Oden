# Kosmos-Oden (Vault Kosmos) — v0.5.5

**Version 0.5.5** — a 3D "Local Cluster of Galaxies" view of your Markdown knowledge base, built on a fork and rebuild of [H4R7W16/vault-kosmos](https://github.com/H4R7W16/vault-kosmos).

Vault Kosmos turns your notes into a night sky you can fly through. Your most important, most-connected notes shine as **stars**; the notes linked to them orbit as **planets** and **moons**; stray notes drift by as **asteroids**; each top-level folder becomes its own **galaxy**. Images, PDFs and other attachments float in a faint outer shell (the **Oort cloud**), just like the icy debris at the edge of a real solar system.

Nothing is changed or moved — Kosmos only *looks* at your notes. Close the view and your vault is exactly as you left it. Everything runs locally, and a single `.html` file can render your notes without Obsidian at all.

## Two ways to use it

| | |
|---|---|
| **Inside Obsidian** | Install the plugin — desktop and mobile, live-updating as you edit. See [Obsidian plugin](#obsidian-plugin). |
| **Standalone, no Obsidian** | Download one file, `vault-kosmos.html`, and open it in a browser. No install, no server, no internet. See [Standalone — no Obsidian required](#standalone--no-obsidian-required). |

Both surfaces — plus the Agent API and the `kosmos-build` CLI — render **the same vault the same way**, because they all share one engine (more on that below).

## Attribution & lineage

**What comes from [H4R7W16/vault-kosmos](https://github.com/H4R7W16/vault-kosmos) (original):** the basic Three.js rendering framework and the foundational spatial metaphor — notes as celestial bodies.

**What OdenKnight's Obsidian adaptation (v0.5.0–v0.5.1) added:** a complete visualization redesign with accurate folder/file hierarchy mapping; gravitational orbital mechanics (notes orbit gravitational focal points by connection strength); Saturn-style rings for well-connected notes; a folder-safe context menu (right-clicking a folder galaxy expands it in Obsidian's file explorer — it never opens or creates a note); a live agent-traversal trail; the Agent API with MCP support; Graphiti episode export; render-loop suspension and other performance work; and early security hardening (constant-time token comparison, DNS-rebinding protection).

**What Kosmos-Oden v0.5.5 adds:** a single shared **Kosmos Core** so the plugin, the standalone viewer, the Agent API and the CLI compute identical graphs instead of drifting into separate interpretations; canonical bidirectional lineage normalization with validation; a genuinely offline single-file standalone viewer with folder monitoring; and a full build-provenance / reproducibility / security-hardening pass (see [Security, assurance & governance](#security-assurance--governance)).

Both projects use the MIT License — see [LICENSE](LICENSE) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). The original code remains attributed to H4R7W16; new contributions are attributed to OdenKnight.

## Why would I want it?

A folder list shows you your notes one at a time. A cosmos shows you **the shape of everything you know, all at once**:

- **See what matters.** Big, bright bodies are your hub notes — the ideas everything else connects to. A lonely asteroid tells you something needs linking up (or that it's fine on its own).
- **Spot the clusters.** Related notes physically gather together, so themes and projects become visible neighborhoods instead of scattered filenames.
- **Travel through time.** Press one button and watch your vault grow note by note, or scrub the Chrono timeline to see exactly what you knew — and what you'd already revised — on any past date.
- **Find things by flying.** Tap any body to light up everything connected to it, then hop from neighbor to neighbor. It's search for people who think visually.
- **Watch your AI assistant think.** If you let an AI agent read your vault (entirely optional, off by default), the notes it visits glow with a fading emerald trail across your universe, live.

It works on desktop **and** on your phone or tablet, updates live as you edit, and needs no internet connection at all.

---

## Under the hood: one semantic engine

Kosmos-Oden is three products sharing **one semantic engine** — the Kosmos Core. This is the single most important design decision in the v0.5.5 rebuild: without it, the plugin, the standalone page, the Agent API and the CLI would gradually drift into five different interpretations of the same vault.

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

## How your vault becomes a cosmos

| You have… | You see… |
|---|---|
| A home/index note in your vault root | The **cluster core** — the bright heart of the whole universe, the gravitational focal point. |
| A top-level folder | A **galaxy**. If the folder has a manifest note (`index`/`README`/`MOC`/a note matching the folder's name), that note becomes the bright galactic center; otherwise the folder itself does. |
| A well-connected note | A **star** with its own solar system — its spectral class and size read the weight of that system (see below). |
| Notes linked from that note | **Planets**, **moons** and **moonlets**, chained by how closely they're related. Each planet gets a NASA exoplanet type from its own note (see below). |
| Loose or barely-linked notes | **Asteroids**, tumbling near the galaxy they're gravitationally bound to. |
| Images, PDFs, other attachments | The **Oort cloud** — a faint outer shell around the system that references them. |

Moons carry dark maria patches and bright ejecta flecks; asteroids are irregular tumbling rocks with varied mineral coloring — all of it runs inside the existing shader passes (mobile keeps its dedicated lightweight path), so nothing got slower. The layout uses hierarchical packing and collision-resolution passes designed to keep bodies separated and minimize overlap; a diagnostic pass counts any residual intersections and reports them honestly rather than promising a mathematically perfect zero (they're rare — see [benchmarks/RESULTS.md](benchmarks/RESULTS.md)).

### Stars follow the Hertzsprung–Russell main sequence

A star's brightness, color and size read the **weight of its solar system** — how many notes it gathers, how many distinct subfolders they span, and their total byte size. Heavier systems sit further up the [H-R main sequence](https://en.wikipedia.org/wiki/Hertzsprung%E2%80%93Russell_diagram): hotter, bluer and larger. A tiny system is a cool red **M** dwarf (like Proxima Centauri); a Sun-sized hub is a yellow **G**; a sprawling, deeply-foldered hub climbs through **F · A · B** to a hot blue **O** giant. The scale is relative to your own vault's heaviest system, with a floor so a two-note folder never mints a blue giant. Select a star and the inspector names its class (e.g. *Class G Star*).

| Class | Color | You have… |
|---|---|---|
| **M** | red | a small, shallow system |
| **K** | orange | a modest system |
| **G** | yellow (the Sun) | a mid-sized, Sun-like hub |
| **F · A** | white | a large, multi-folder system |
| **B · O** | blue | your biggest, deepest, heaviest hubs |

### Planets are typed like NASA's exoplanets

Each planet's appearance is a [NASA exoplanet type](https://science.nasa.gov/exoplanets/planet-types/) chosen from the note itself — its child notes (moons), the attachments it hosts, and its size:

| Type | You have… | Looks like |
|---|---|---|
| **Gas giant** | a note with 4+ descendant notes | banded Jupiter/Saturn tones, with rings |
| **Neptunian** (ice giant) | a note with 2–3 descendants | smooth, cold, blue/cyan haze (Neptune/Uranus) |
| **Super-Earth** | one descendant, or a hefty note (>24 KB) | amplified continental relief |
| **Terrestrial** | a leaf note | Mercury/Venus/Earth/Mars — rocky, land/sea + ice caps |

Hosting attachments biases a planet toward its watery variety (an Earth-like water world, a super-Earth ocean, or Neptune). Rings appear on gas giants only. Select a planet and the inspector names its type.

---

## Standalone — no Obsidian required

`vault-kosmos.html` is one self-contained file: Three.js, the parser, the graph engine and the renderer are all inlined. No Obsidian, no Node.js, no Python, no local server, no internet connection — copy it to any folder and open it in a browser.

1. Download **`vault-kosmos.html`** (or copy it anywhere — any folder works).
2. Open it in a modern browser (double-click).
3. Click **Open Knowledge Folder**.
4. Select the root of your Markdown or Obsidian vault.
5. Kosmos recursively scans and renders the folder — `.obsidian`, `.git`, `node_modules` are skipped, notes are read, attachments become Oort objects.
6. Where the browser grants persistent directory access, Kosmos **monitors the folder** while the page is open: new notes appear, deleted notes disappear, and a new top-level folder becomes a new galaxy after the next rescan (visibility/focus triggers, a low-frequency poll, or **Rescan Now**).

**Two access modes, clearly labelled in the status panel:**

- **Persistent folder access** (Chromium browsers — Chrome, Edge, Brave): uses `showDirectoryPicker()`. The page can re-scan the folder while it stays open, and can remember the folder (IndexedDB handle) for **Reopen Last Folder** — the browser re-asks permission before any access. **Forget Folder** removes the stored handle.
- **Imported folder snapshot** (all browsers, including Firefox/Safari and `file://` pages where the picker is restricted): a one-time import via the standard directory input. Everything renders identically, but there is **no live monitoring** — the page never implies otherwise.

The standalone scanner is **read-only**: it never renames, deletes, modifies, rewrites, normalizes, moves or patches your files. Exports (**Export Graph JSON**, **Export Graphiti Episodes**) are generated in memory and downloaded through the browser — no filesystem write access is requested. Makes no network calls, collects nothing, works fully offline.

---

## Obsidian plugin

Renders inside Obsidian (desktop **and** mobile) in an isolated, sandboxed view.

1. Copy `manifest.json`, `main.js`, and `styles.css` into `<your-vault>/.obsidian/plugins/vault-kosmos/`.
2. Settings → **Community plugins** → turn off Restricted mode if it's on, then enable **Vault Kosmos**.
3. Click the orbit icon in the left ribbon (or run **Open Vault Kosmos** from the command palette). That's it — your universe builds itself.

**Live refresh** is incremental and scales with vault size: a single edited note is re-read and re-parsed alone (verified by tests); a full re-read happens only on large structural changes (bulk import/delete/rename, more than `max(500, 25%)` of the vault). Refresh is debounced and paused while the view is hidden.

**Battery-friendly:** the 3D view fully stops rendering the moment its tab is hidden or Obsidian is minimized — the plugin tells the iframe about leaf visibility, so even a background Kosmos tab inside a visible Obsidian window costs ~zero CPU/GPU — and resumes instantly when you come back. Idle bookkeeping (highlight halos, GPU uploads, label scans) is skipped when nothing is selected or pulsing.

## Flying around

- **Drag** to orbit · **scroll / pinch** to zoom · **right-drag / two-finger** to pan.
- **Tap a body** to focus it — everything connected to it lights up.
- **Right-click** (long-press on iPhone/iPad) a body → **Go to Note** opens that note in a new tab. Right-clicking a **galaxy that is only a folder** (no manifest note) offers **Expand Folder** instead — it reveals and expands that folder in Obsidian's file explorer. It will never create or open a stray note for a folder.
- **Labels** `R` · **All links** `C` · **All objects** `O` · **Chrono** `H` · **Grow** `G` · **Timeline** `T` · **Trailer**.
- **Modes:** Overview `A` · Focus `S` · Depth `D` · Fly `F` (WASD + mouse; touch pads on mobile) · Clear `Q`.
- Zoom out as far as you like — once the whole cluster shrinks to ~10% of the screen it gently re-centers itself.
- Mobile: adaptive pixel-ratio and geometry LOD keep the view smooth.

---

## OKF+ temporal knowledge graph

Notes written in **OKF+** (Open Knowledge Format Plus) light up temporal features natively:

- **Canonical knowledge chains** — `supersedes` / `superseded_by` frontmatter is normalized internally into one canonical lineage graph, so both fields are projected bidirectionally: declaring **either side** is enough. Superseded notes render as ghosts; the newest version of a chain is flagged **HEAD**. Malformed lineage (cycles, self-references, unresolved targets, multiple successors, out-of-order timestamps) is detected and reported through diagnostics instead of silently breaking the graph.
- **Temporal validity intervals** — each note is *valid* from its OKF+ `timestamp` (fallback: file creation/modification time) and becomes *invalid* the moment its earliest successor's validity begins. This supports point-in-time reconstruction from retained timestamps and supersession history; it does **not** reconstruct edits that were overwritten in place — that history no longer exists in the files.
- **Chrono time-travel** — the **Chrono** button (`H`) scrubs the cosmos to any moment: notes not yet written vanish, notes already superseded dim to dark ghosts. Chrono, the Agent API's `graph_at_time`, and the temporal tests all use the **same** projector.
- **Semantic links** — the footer `**Related:** [[A]], [[B]]` links are tracked as their own `semantic` edge kind.
- The viewer is read-only: it never patches your notes.

---

## Agent API — let agents query this vault (HTTP + MCP)

Settings → **Vault Kosmos** → toggle **Enable local Agent API**.

**Connecting Claude (no typing required):**
1. Click **Copy Claude Code Config** or **Copy Claude Desktop Config** in the plugin settings.
2. Paste it into Claude.

That's it — the address and access token are filled in automatically, so there's nothing to type or get wrong. Want a reference for later? Run **"Write Agent API guide"** from the command palette and the plugin drops a ready-to-read `AGENT-API.md` into your vault with your connection details already filled in. Full guide: [AGENT-API.md](AGENT-API.md).

**Watch it work:** every query an agent makes is mirrored live in the Kosmos view — visited notes pulse with emerald halos and connect into a fading emerald breadcrumb trail (the last ~24 hops, fading over 30 seconds), so you can see exactly which notes your agent walked through and in what order.

**Technical:** a read-only server starts on `127.0.0.1` (opt into **Local network (LAN/VLAN)** in the same settings to let agents on other devices on your subnet reach it) exposing the same normalized graph the viewer renders: `vault_overview`, `search_notes`, `get_note`, `get_lineage`, `get_related`, `graph_at_time`, `export_graphiti_episodes` over MCP (`/mcp`, Streamable HTTP) plus plain REST mirrors and a `/diagnostics` route.

Security: tokens are generated from a cryptographically secure RNG only (32 bytes, base64url — token creation fails loudly rather than falling back to a weak source) and compared in constant time; `Host`/`Origin` headers are validated to block DNS-rebinding and cross-site requests; request bodies are capped at 4 MiB (measured in **bytes**); non-loopback clients are rate-limited with a concurrency cap; note bodies, search results and episode exports are size-capped; every response sets `Cache-Control: no-store`. `?token=` query authentication is **deprecated and off by default** — header auth (`Authorization: Bearer` / `x-api-key`) is the default, and query tokens are always rejected in LAN mode even if re-enabled. **LAN mode refuses to start without a token.** MCP protocol versions are negotiated against an explicit supported list. Desktop only (Obsidian mobile has no local server support).

---

## Graphiti export

Export your vault as [getzep/graphiti](https://github.com/getzep/graphiti)-ingestable episodes — every note becomes an `EpisodeType.json` episode (`name`, `episode_body`, `source`, `source_description`, `reference_time`, `group_id`), sorted chronologically so lineage lands in order. A per-vault `group_id` keeps multiple vaults' exports separable in one Graphiti graph. Episode bodies carry the **canonical** (resolved) lineage plus the raw authored declarations under `source_okf`, keeping "what the author declared" and "what the system resolved" explicit. The format is Graphiti-ingestable; Graphiti's own LLM pipeline determines the graph it builds, so an identical internal reconstruction is not guaranteed.

- **Plugin:** command palette → *Export Graphiti episodes (OKF+)* → writes `graphiti-episodes.json` + `graphiti-ingest-sample.py` to the vault root.
- **Standalone:** the **Export Graphiti Episodes** button downloads the same payload.
- **CLI:** `node kosmos-build.mjs /path/to/vault graph.json --episodes graphiti-episodes.json`

Then: `pip install graphiti-core` (Python 3.10+), set `OPENAI_API_KEY` + Neo4j env vars, `python graphiti-ingest-sample.py`.

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

## Private by design

Everything runs locally. The plugin and the standalone viewer make **no external network requests, collect nothing, and never write to your notes** — fully offline. The optional Agent API is off by default, reachable only from your own computer unless you explicitly say otherwise, and is read-only: there are no endpoints that can modify your vault.

---

## Build from source

```bash
nvm use                  # Node 22 (see .nvmrc); engines pinned in package.json
npm ci                   # clean install from the committed package-lock.json
npm run typecheck        # tsc --noEmit
npm run build            # plugin main.js + embed page + vault-kosmos.html + node bundles
npm run build:standalone # just vault-kosmos.html
npm test                 # 119 unit/API/artifact/classification tests (node --test)
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
- The upstream engineering assessments this build was hardened against live in [docs/assessments/](docs/assessments/).

## Repository layout

```
src/core/        shared Kosmos Core (types, markdown, okf, resolver, lineage,
                 temporal, graph, graphiti, incremental index, demo)
src/renderer/    cosmology, layout (+collision diagnostics), shaders, renderer
src/plugin/      Obsidian plugin, iframe embed entry, host<->renderer protocol,
                 Agent API server, settings
src/standalone/  directory source, rescan monitor, handle persistence, UI, entry
scripts/         build pipeline, version/artifact/invariant/renderer-provenance
                 checks, release packaging, static test server
test/            parser, resolver, lineage, temporal, incremental, graphiti,
                 agent-api, protocol, cosmology, standalone-artifact tests;
                 test/browser/ Playwright renderer + visual specs
benchmarks/      synthetic-vault benchmark + measured results
vendor/legacy/   frozen Three.js r128 global build (MIT), for an optional
                 WebGL1-era compatibility artifact only
```

> **Renderer:** the stable 3D engine is **Three.js r185** (`three@0.185.1`),
> an exact-pinned ESM dependency bundled into the offline single-file artifacts
> (no CDN). On the `renderer/three-r185-webgl` branch this replaced the vendored
> r128 global build; it is **WebGL2-only** and provenance-checked in CI. See
> [docs/RENDERER-MIGRATION-r185.md](docs/RENDERER-MIGRATION-r185.md) and
> [renderer-provenance.json](renderer-provenance.json). WebGPU/TSL is a separate
> future phase.

## License

MIT — see [LICENSE](LICENSE) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
