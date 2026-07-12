# Changelog

All notable changes to Kosmos-Oden are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/); versioning is
[SemVer](https://semver.org/) (pre-1.0: minor versions may include breaking
changes, called out under **Compatibility**).

## [0.5.5] — 2026-07-11

Full rebuild on a shared **Kosmos Core**, then hardened per the two v0.5.1
engineering assessments (`docs/assessments/`).

### Added
- **Hertzsprung–Russell stellar classification** — a star's spectral class, color and size now read the weight of its solar system (member notes + distinct subfolders + total bytes): heavier systems climb the main sequence M→K→G→F→A→B→O (red dwarf → blue giant), relative to the vault's heaviest with a floor. Applied before layout so packing stays overlap-free; the inspector names the class. Pure `classifyStar`/`starScore` helpers, unit-tested.
- **NASA exoplanet planet types** — each planet is typed (gas giant / Neptunian ice giant / super-Earth / terrestrial, per science.nasa.gov/exoplanets/planet-types) from its child notes, hosted attachments and note size, with per-type color, size factor, in-shader treatment (Jupiter/Saturn banding, cool Neptunian haze, amplified super-Earth relief, terrestrial land/sea + ice caps) and rings on gas giants only. Attachment-hosting biases watery varieties. Pure `classifyPlanet` helper, unit-tested; the inspector names the type.
- **Shared Kosmos Core** (`src/core/`) — one parsing / resolution / canonical-lineage / temporal / graph / Graphiti implementation consumed by the plugin, the standalone viewer, the Agent API, the Graphiti exporter and the `kosmos-build` CLI.
- **Canonical lineage** — `supersedes` / `superseded_by` normalized bidirectionally; one-sided declarations invalidate predecessors; cycles, self-references, unresolved targets, multiple successors, out-of-order timestamps, duplicates and ambiguous resolution detected and surfaced through diagnostics.
- **Single temporal projector** shared by Chrono, the Agent API `graph_at_time` and the tests.
- **True incremental index** — one edited note costs one parse (test-verified); rename moves the cache without reparsing; documented structural-rebuild threshold.
- **Genuine standalone single-file viewer** (`vault-kosmos.html`) — `showDirectoryPicker` + `webkitdirectory` snapshot fallback, IndexedDB handle persistence, rescan-and-diff monitoring, status panel, in-page errors, browser-download exports.
- **`kosmos-build.mjs` CLI** on the shared core (`--episodes`, `--watch`).
- **84-test suite** (parser, resolver, lineage, temporal, incremental, Graphiti, Agent API, standalone artifact), reproducible benchmarks (100–50,000 notes).
- **CI + release workflows**, version-sync + artifact self-containment checks.
- Reproducibility double-build CI job; `SHA256SUMS` + `BUILD-INFO.json` release provenance; `kosmos-invariants.yml` policy with `check:invariants`; Dependabot; pinned toolchain + committed `package-lock.json`.
- Versioned host↔renderer message protocol with structural validation; the plugin iframe is now sandboxed (`allow-scripts allow-pointer-lock allow-downloads`, no `allow-same-origin`).
- Governance docs: `SECURITY.md`, `CONTRIBUTING.md`, `THREAT-MODEL.md`, `ARCHITECTURE.md`, `RELEASE-PROCESS.md`, `RENDERER-PROTOCOL.md`, `THIRD-PARTY-NOTICES.md`.
- **Folder-safe context menu restored** — right-clicking a folder-only galaxy (no manifest note) now offers **Expand Folder** (reveals it in Obsidian's file explorer and flies the camera to the galaxy) instead of attempting to open or create a note; carried over via a versioned `open-folder` renderer→host message.
- **Live agent-traversal breadcrumb restored (full v0.5.1 behavior)** — visited notes pulse with emerald halos (8 s window) and consecutive hops connect into a fading emerald line trail (last 24 hops, 30 s fade), with a throttled "Agent traversal: *tool*" hint. Emission is post-hoc from result objects and capped per tool (lineage 12, related 11, search 8, `graph_at_time` 6); whole-vault queries report no trail.
- **v0.5.1 visual pack restored** — irregular tumbling rock asteroids (carve-only vertex displacement + per-rock albedo/mineral tint, mobile-safe), rocky-planet land/sea tones + fbm-jittered polar ice caps, lunar maria + ejecta flecks on moons, and fine planetary ring grooves — all in-shader, both quality tiers.
- **Host-driven render gate restored** — the plugin posts a versioned `visibility` message on leaf/layout changes, so the render loop fully stops when the Kosmos tab is hidden *inside* a visible Obsidian window (not just when the window itself hides), and resumes instantly.
- **v0.5.1 idle/perf trims restored** — `updateHalos` idle fast-path (skips all writes/uploads when nothing is selected or live), per-layer instanced-matrix dirty flags, direct label-slot references (no per-frame array scans), and a 60 s LAN-IP cache for per-request Host validation.
- 119-test suite (adds `cosmology.test.mjs`: spectral monotonicity/floor, planet-type rules incl. size + attachment correlations, and classified radii surviving layout; protocol `visibility` validation, traversal caps, REST-vs-MCP emission parity).
- README rewritten to fold in the prior release's narrative sections (attribution lineage, "why would I want it", friendly Agent API onboarding) alongside the v0.5.5 architecture and hardening documentation.
- Ingest sample pins `graphiti-core>=0.28.2` (upstream security fixes).

### Changed
- Renderer extracted from the v0.5.0 base64 monolith into reviewable modules (`src/renderer/`); the single-file artifacts are now deterministically generated at build time.
- README/AGENT-API rewritten to match what the code proves (no universal no-overlap claim, temporal-validity-intervals instead of "bitemporal", explicit list of file-producing commands).
- Removed a quadratic orphan scan from graph assembly (50k-note build 75.7 s → 2.2 s).

### Fixed
- Frontmatter parsing broke on a UTF-8 BOM and on the CRLF-terminated last header line (both present in v0.5.0).
- Agent API token generation no longer has a `Math.random()` fallback (fails closed without a CSPRNG).
- Request-size limit now counts bytes, not JS string length.

### Security
- MCP protocol-version negotiation against an explicit supported list (no echo of unknown versions).
- `Host` and `Origin` validation (DNS-rebinding / cross-site defence).
- LAN mode refuses to start without a token; query-string token auth deprecated, off by default, always rejected in LAN mode.
- Constant-time token comparison; `Cache-Control: no-store` on all responses.
- Per-client rate limit + concurrency cap + request timeout; output caps on note bodies, search results and episode exports.

### Compatibility
- Settings schema migrated to v2 on load; existing tokens preserved. Query-token auth defaults OFF — clients using `?token=` must switch to `Authorization: Bearer` / `x-api-key`, or re-enable the deprecated option in settings (removal targeted for the next breaking release).
- Legacy flat `kosmos:files` / `kosmos:update` / `kosmos:open` postMessage shapes are still accepted alongside the new versioned envelope.
- Upstream MIT attribution and bundled Three.js (MIT) notices retained (`THIRD-PARTY-NOTICES.md`).

## [0.5.0]

Prior baseline (fork of `H4R7W16/vault-kosmos`): 3D cosmology renderer, OKF+
temporal features, Agent API (REST + MCP), Graphiti export — shipped as a
base64-embedded single HTML string.
