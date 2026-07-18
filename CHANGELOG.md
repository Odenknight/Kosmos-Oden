# Changelog

All notable changes to Kosmos-Oden are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/); versioning is
[SemVer](https://semver.org/) (pre-1.0: minor versions may include breaking
changes, called out under **Compatibility**).

## [Unreleased]

## [0.6.5-beta.2] — 2026-07-18 (pre-release)

### Added
- Added a dedicated **Sync Obsidian configuration (.obsidian)** toggle. It is
  off by default and can be enabled independently of the editable per-path
  exclusion list, allowing themes, snippets, hotkeys, and selected plugin data
  to travel with the vault.

### Security
- `.obsidian/plugins/vault-kosmos/data.json` remains a non-overridable
  exclusion even when `.obsidian` sync is enabled, preventing local sync state
  and Agent API credentials from being copied or recursively synchronized.

## [0.6.5-beta.1] — 2026-07-18 (pre-release)

### Added
- Added an original, native Nextcloud WebDAV sync backend for desktop and
  mobile Obsidian. It accepts an instance URL or complete DAV files URL,
  supports app-password authentication through Obsidian Secret Storage,
  startup/manual/interval sync, binary attachments, nested folders, and
  case-insensitive glob exclusions.
- Added a deterministic three-way planner using the last common local hash and
  remote ETag. First-sync collisions are compared by content; simultaneous
  edits preserve the Nextcloud version as a timestamped local conflict copy.
- Added conditional `If-Match`/`If-None-Match` writes, bounded WebDAV traversal,
  traversal-safe paths, HTTPS enforcement (except literal private/loopback
  addresses), and 7 focused planner/security tests.

### Security
- Nextcloud credentials are never placed in plugin `data.json`; app passwords
  use Obsidian Secret Storage. `.obsidian/**`, `.git/**`, and `.trash/**` are
  excluded by default, preventing credential/state recursion.
- Deletion propagation defaults off. When explicitly enabled, only an
  unchanged file deleted on one side is deleted on the other; changed-versus-
  deleted cases remain conflicts.

### Compatibility
- Minimum Obsidian version is now 1.11.4 because native Secret Storage is a
  hard requirement for persistent Nextcloud credentials.

## [0.6.5-alpha.7] — 2026-07-16 (pre-release)

### Fixed
- Replaced the proposal row's viewport-sized input width with a bounded,
  responsive two-column layout. Field descriptions no longer collapse into a
  near-zero-width column and create extremely tall gaps between controls.

## [0.6.5-alpha.6] — 2026-07-16 (pre-release)

### Added
- Added a guided, inline OKF+ reconciliation workflow with explicit
  **Needs review**, **Accept**, and **Reject** decisions, live progress,
  expand/collapse controls, and a safe **Reject all remaining** action.
- Added per-note model-pass labels and inline recovery guidance when an
  optional model times out or returns unusable output.

### Changed
- The governed apply-plan button remains unavailable until every visible
  proposal has an explicit decision. An untouched control is no longer
  silently treated as rejection.
- Malformed model JSON is discarded with a plain-language explanation while
  independently generated deterministic proposals remain reviewable.

## [0.6.5-alpha.5] — 2026-07-16 (pre-release)

### Added
- Added OKF-processing-only exclusion patterns with `*`, `**`, and `?`, plus
  an opt-in developer preset for common agent instruction/control files. The
  migration preview lists every exclusion and matching pattern.
- Added a distinct **LAN LLM** provider for OpenAI-compatible models on a
  private network, with a separate public/internal/confidential sensitivity
  ceiling and fresh per-run disclosure.
- Blocked-note advisory review now supports either an on-device loopback model
  or an explicitly approved LAN model. Cloud remains prohibited.

### Security
- LAN endpoints require literal RFC1918, IPv4 link-local, IPv6 ULA, or IPv6
  link-local addresses. DNS hostnames, public IPs, bind-all addresses, and
  loopback addresses in LAN mode are rejected.
- PHI is always excluded from LAN and Cloud enrichment. Confidential LAN input
  requires an explicit ceiling change plus per-run confirmation. The consent
  screen displays the exact endpoint and warns that a private address does not
  prove the device, Wi-Fi/VLAN, firewall, or service is trusted.
- Exclusions default off to prevent silent omissions during upgrade and affect
  only OKF migration/enrichment—not visualization or the read-only Agent API.

## [0.6.5-alpha.4] — 2026-07-16 (pre-release)

### Added
- Renamed the enrichment action to **Scan / re-scan all OKF+ 2.2 notes** and
  clarified that every run reads current eligible notes again, including notes
  already upgraded by the deterministic migration.
- Added local-model advisory triage for migration-blocked notes. It returns
  explanations, manual inspection steps, and questions for a human; it has no
  note-write path and cannot emit a retained executable YAML patch.

### Security
- Blocked-note model review is loopback-local only because a blocked note may
  have missing or invalid sensitivity metadata. Cloud review is unavailable.
- Only bounded, provably closed frontmatter is sent; likely credential fields
  and their nested/multiline values are redacted. Unterminated frontmatter is
  omitted. Output must cite supplied deterministic finding codes and is saved
  without the transmitted frontmatter excerpt.
- Clarified that “no LLM needed” describes deterministic structural migration,
  not the separately configured enrichment re-scan.

## [0.6.5-alpha.3] — 2026-07-16 (pre-release)

### Added
- Added a governed enrichment review and apply workflow. No proposal is
  preselected; reviewers can accept, reject, or edit each value before a
  note-body-free SHA-256 plan is created.
- Accepted relationship targets must resolve and cannot point back to the
  source note. Conflicting scalar decisions are blocked for correction.

### Security
- Apply rechecks the proposal source hash, verifies the plan and in-memory
  content hashes, rechecks exact live note bytes, creates byte-exact backups,
  and writes only still-matching notes through Obsidian's note processor.
- Plans and results are retained under `.okf/enrichment/<run-id>/`; note bodies
  are omitted from the persisted plan and Markdown body bytes are preserved.

## [0.6.5-alpha.2] — 2026-07-15 (pre-release)

### Added
- Added deterministic, bounded note-evidence selection for OKF+ descriptions,
  types, tags, and explicitly named supersession candidates, with structural
  evidence-quality scores and reasons instead of a claim of semantic meaning.
- Added an optional OpenAI-compatible local/cloud second pass whose output is
  saved only as pending, evidence-cited review proposals.

### Security
- Local endpoints are loopback-only; cloud endpoints require HTTPS and fresh
  per-run consent. Confidential/PHI cloud input is hard-blocked, API keys are
  referenced only by environment-variable name, and note/paragraph/per-note/
  total-input/output/timeout caps constrain each run.
- Model tools, retries, automatic writes, governance-authority fields, and
  unevidenced relationship targets are disallowed. Output is schema-validated,
  and proposal confidence never grants approval.

## [0.6.5-alpha.1] — 2026-07-15 (pre-release)

### Added
- Added a governed **Upgrade all to OKF+ 2.2** mode for every mechanically
  recoverable Markdown note, including Google OKF, reserved index/log files,
  and flat legacy/2.1 frontmatter.
- Every migration entry now carries an explainable deterministic migration-
  safety confidence score and the complete coded reasons for manual review.
- Recoverable legacy governance values replaced by upgrade-all are retained in
  hash-bound salvage records and byte-exact backups.

### Security
- Upgrade-all remains unable to force duplicate keys, ambiguous/nested YAML,
  unsafe relationship values, or duplicate UIDs. Confidence orders review but
  never grants approval or changes epistemic authority.

## [0.6.0-beta.2] — 2026-07-15 (pre-release)

Updates the r185/WebGL2 beta with all 0.5.6 core, provider-neutral MCP,
Graphiti projection, OKF+ migration, and sensitivity hardening changes.

### Changed
- Stable renderer remains exact-pinned to ESM `three@0.185.1`, bundled into
  offline single-file artifacts with WebGL2 capability and context-loss handling.
- Provider quick links now cover native Streamable HTTP clients and a bundled
  first-party stdio adapter without making Graphiti part of the MCP setup.

### Added
- Deterministic capture controls, renderer provenance checks, Playwright browser
  scaffolding, split renderer CI, and mass-weighted elliptical orbits.

### Known issues
- Human smoke testing passed with orbits rendering correctly. A minor cosmetic
  clipping of the top header edge remains under investigation for beta QA.

## [0.5.6] — 2026-07-15

### Added
- Added **Mark notes in OKF+ format**, a vault-wide, LLM-free audit that accepts
  either OKF+ 2.2 or Google's OKF 0.1 draft and proposes conservative OKF+ 2.2
  metadata only for mechanically safe notes. The preview can be saved without
  note contents; apply is bound to the SHA-256 plan, requires explicit backup
  and sensitivity acknowledgements, creates byte-exact per-file backups, skips
  concurrently changed notes, preserves Markdown bodies, and reports blocked
  YAML/governance/UID conflicts instead of guessing.

### Fixed
- Updated the MCP server to the published `2025-11-25` revision and current
  Streamable HTTP lifecycle: strict JSON-RPC/tool validation, one message per
  POST, negotiated protocol headers, real session termination/expiry handling,
  structured tool results, and read-only/idempotent tool annotations.
- Corrected the Claude Code quick-connect command's option ordering and added
  native OpenAI Codex/ChatGPT desktop configuration plus a bundled first-party
  stdio adapter for clients that cannot attach to Streamable HTTP directly.
- Graphiti episodes now reuse valid OKF+ UUIDs, use disambiguated assertion
  namespaces, paginate connector exports, and never backfill later
  `superseded_by`/`head`/`invalid_at` state into earlier episodes.

### Security
- Added an OKF+ sensitivity ceiling (`internal` by default) across note reads,
  search, graph/lineage/temporal traversal, diagnostics, and Graphiti export.
  Invalid explicit sensitivity labels fail closed at the `phi` boundary.

### Changed
- The shared parser now recognizes the flat OKF+ 2.2 governance fields,
  canonical wikilink lists, `forked_to` compatibility, and registered typed
  relationships. Graphiti is labeled as a non-authoritative projection of
  explicit user assertions; source notes and accepted semantic events remain
  authoritative.

## [0.5.5] — 2026-07-11

Full rebuild on a shared **Kosmos Core**, then hardened per the two v0.5.1
engineering assessments (`docs/assessments/`).

### Added
- **Mass-weighted elliptical orbits + sibling perturbation** — orbits now *feel* gravity-anchored. Each body traces a Kepler-inspired ellipse whose eccentricity depends on the body's own mass (heavier notes ride more circular orbits; lighter, isolated ones swing more), and its speed scales with the parent's mass (`sqrt(mass/ref)` — heavier hubs pull their satellites faster). The heaviest sibling in a system exerts a small along-orbit tug (theta jitter, capped at ~8°). Apoapsis is pinned to the original |ov| — max radius stays within the layout's collision-safe packing, so no new intersections. Fully deterministic (hash-based jitter only); t=0 position exactly matches the layout position (no visual jump when the loop starts). Six new orbit invariants in `test/cosmology.test.mjs`.
- **MCP: current protocol revision + native-HTTP `.mcp.json`** — the Agent API now negotiates MCP `2025-06-18` (the revision current Claude Code / Claude Desktop request) in addition to `2025-03-26` and `2024-11-05`, so modern clients connect without being silently downgraded. Ships a committed `.mcp.json.example` (native Streamable-HTTP, **no `mcp-remote` bridge**) and a settings "Copy .mcp.json" button; the guide and settings now steer Claude Code to native HTTP and reserve `mcp-remote` for stdio-only Claude Desktop.
- **Per-agent live traversal trail** — each connected agent gets its own colour (stable hash of its name) and a colour-coded **mini rocket** riding the head of its trail; the agent's **name label shows when labels are toggled on** and hides when off. Agent identity comes from the MCP `clientInfo.name` (via an `Mcp-Session-Id` minted at `initialize`), else the `User-Agent`. Interleaved agents keep independent trails (no spurious cross-agent segments).
- **Trailer tours the whole vault** — the Trailer flight now flies nearby **each first-level-folder galaxy** (largest first, framed to its extent), bookended by wide cluster establishing shots, so it gives an overview of the entire vault instead of a single star + a few planets. Falls back to the old star/planets tour on the non-cosmos legacy layout.
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
- **Packaging for Obsidian Community Plugin submission** — the standalone viewer (`vault-kosmos.html`) and other generated outputs (`dist/`) are no longer committed; they're rebuilt by CI and attached to each GitHub Release, with the standalone as its own downloadable asset kept separate from the plugin components (`manifest.json`/`main.js`/`styles.css`/`versions.json`). `release.yml` now fires on unprefixed version tags (Obsidian requires the tag to equal the manifest version exactly, no `v`) and marks pre-releases automatically. See `docs/COMMUNITY-PLUGIN.md`. Internal docs consolidated under `docs/` with de-versioned filenames.
- Renderer extracted from the v0.5.0 base64 monolith into reviewable modules (`src/renderer/`); the single-file artifacts are now deterministically generated at build time.
- README/AGENT-API rewritten to match what the code proves (no universal no-overlap claim, temporal-validity-intervals instead of "bitemporal", explicit list of file-producing commands).
- Removed a quadratic orphan scan from graph assembly (50k-note build 75.7 s → 2.2 s).

### Fixed
- Frontmatter parsing broke on a UTF-8 BOM and on the CRLF-terminated last header line (both present in v0.5.0).
- Agent API token generation no longer has a `Math.random()` fallback (fails closed without a CSPRNG).
- Request-size limit now counts bytes, not JS string length.

### Security
- **Agent API concurrency fairness (Mitigation 4)** — a per-agent in-flight cap (`MAX_CONCURRENT_PER_AGENT = 12`, all clients incl. loopback), so one agent's bulk/background work can't monopolize throughput and starve another agent's interactive query. Complements the existing global cap + per-client rate limit + request timeout. Concurrency review of all four mitigations recorded in `docs/AGENT-API-CONCURRENCY-STATUS.md` (index-once: confirmed; `*Sync` audit: clean; worker-thread: scoped out with rationale).
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
