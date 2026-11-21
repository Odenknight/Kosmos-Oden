# Kosmos-Oden Technical README

## Capability index

1. [Vault sky, layouts and navigation controls](#local-cluster-renderer)
    1. [Note relationships, lineage, time and Navigation centers](#semantic-and-graph-behavior)
    2. [Traffic heatmap](#heat) and [session recording and replay](#recording-and-replay)
2. [Obsidian commands and vault events](#obsidian-plugin-host)
    1. [Import, word search, timestamps, permanent IDs and supersession](#import-word-search-and-deterministic-tags)
    2. [Librarian questions, embeddings and deterministic folder maps](#librarian-semantic-search-and-folder-maps)
3. [Connect assistants through REST, MCP and the stdio bridge](#obsidian-agent-api-and-mcp)
    1. [Personal Notes tools and folder filtering](#personal-notes-profile)
    2. [Profiles, bearer access and sensitivity](#profiles-and-sensitivity)
    3. [Protocol versions and client qualification](#mcp-qualification-scope)
4. [Governed GKX maintenance](#explicit-gkx-maintenance-workflows)
    1. [Audit, repair and conversion](#audit-migration-and-conversion)
    2. [Deterministic and model-assisted enrichment proposals](#content-assisted-enrichment)
5. [Nextcloud WebDAV sync, deletion settings and conflicts](#nextcloud-webdav-sync)
6. [Standalone offline viewer, snapshots and folder access](#offline-standalone-application)
    1. [Optional Engine service connection](#optional-standalone-service-client) and [credential handling](#address-and-credential-rules)
    2. [Service capabilities](#capability-negotiation) and [live traversal events](#authenticated-traversal-stream)
7. [Graphiti episodes, ingestion checks and command-line export](#graphiti-and-command-line-export)
8. [Experimental Navigation Effects](#experimental-navigation-effects-reconciliation-scope)
    1. [Implemented read-only components](#implemented-no-write-boundaries)
    2. [Runtime and qualification limits](#runtime-and-qualification-blockers)
9. [Architecture and Engine responsibilities](#controlling-architecture)
    1. [Versions and pinned dependencies](#versions-and-dependency-integrity)
    2. [Read and write boundaries](#readwrite-boundary) and [security and privacy](#security-and-privacy-boundaries)
10. [Build, packaging and verification](#build-package-staging-and-verification)
    1. [Status vocabulary](#scope-and-status-vocabulary) and [roadmap and release limits](#explicitly-excluded-roadmap-and-release-gates)
    2. [Repository map](#repository-map), [related documents](#related-documents) and [licensing](#licensing)

## Scope and status vocabulary

Kosmos-Oden 0.9.5 consumes TypeScript Engine 2.5.2
with the macOS filesystem follow-up at exact commit `44c62208b8a82d350d29bc7fcf44c8a0a13a575b`.
It adds the Personal Notes profile and dual-era MCP; see
[the current alpha test record](docs/v0.9.5/ALPHA-TEST.md) for build evidence and pending
trials. Navigation Effects remain experimental and default-disabled. Earlier
candidate evidence: [REVIEW-0.8.3.md](https://github.com/Odenknight/Kosmos-Oden/blob/e20b1b7dbd7fb2aee3abfc525e518312970d37d9/_archive/docs/REVIEW-0.8.3.md).

Use these states independently:

- **Implemented**: source and relevant tests exist in this repository.
- **Configured**: an operator supplied the settings or external dependency.
- **Authorized**: an applicable human or policy decision permits an effect.
- **Qualified**: the applicable test matrix has evidence at exact commits.
- **Released**: an owner-authorized artifact was versioned and published.

No earlier state implies the next. This README update changes none of them and
makes no GKOS conformance or certification claim.

| Surface | Implemented on main | Default/activation boundary | Current limit |
|---|---|---|---|
| Semantic core | Engine 2.5.2 parsing, projection, graph, temporal, incremental index, Graphiti, Navigation 1.0 | Exact package and lock pin | No configured Effects executor or Rust runtime |
| Local Cluster renderer | Shared cosmology, hierarchical layout, WebGL2 shaders, controls, Chrono, search, playback, agent trails | Viewer starts after a graph is loaded | Visual projection only |
| Offline standalone | Single-file HTML, persistent directory picker, snapshot fallback, incremental rescans, in-memory exports | User selects a source | No bundled service or native wrapper |
| Obsidian plugin | Sandboxed renderer host, live vault deltas, note/folder actions, settings, explicit GKX workflows, optional sync | User installs/enables the plugin | Obsidian supplies host and Secret Storage APIs |
| Obsidian Agent API | Read-only REST and Streamable HTTP MCP (modern and initialize-era), stdio bridge, sensitivity filter, limits | Off by default; loopback and authentication default | Port 4816 compatibility surface, not the standalone service |
| Personal Notes profile | Folder-scoped read policy, in-memory worker search, six read-only tools with exact paged reads, Importer onboarding, optional deterministic tags, Quick Connect | Fresh installs start here with nothing shared and the connection off; upgrades stay on the existing profile | See the [qualification record](docs/v0.9.5/ALPHA-TEST.md) |
| Standalone service client | Loopback address validation, bearer graph fetch, capability negotiation, authenticated event stream | Requires an external compatible service and viewer credential | Client validates Draft.1; service is not bundled |
| Traffic and replay | Per-agent trails, recent-visit heat scalar, explicit bounded record/export/import/replay | Heat and recording off until selected | Observability only; no cost, fuel, quality, or authority meaning |
| GKX maintenance | Deterministic audit/conversion, backups, guarded apply, optional bounded enrichment review | Explicit commands and acknowledgements | Not the newer immutable proposal/decision subsystem |
| Nextcloud sync | WebDAV scan, three-way planning, conditional transfers, conflict preservation | Disabled by default; separately configured | One Nextcloud target; not a backup |
| Experimental Navigation Effects | Operational-path exclusions, fail-closed settings/status, framework-neutral Engine adapter, policy/authority validation, injected adoption/preview components, and a C0 host-neutral adapter contract with unavailable profile descriptors | All Effects and automatic flags false by default; every C0 host operation is unavailable and no host executor is imported or wired | No durable adoption store, executable host adapter, source writer, journal/archive/lease, coordinator, recovery, reconciliation runtime, self-write suppression, complete UI, or qualification |

## Controlling architecture

```text
Markdown / GKX corpus
        |
        v
exact-pinned GKOS-Engine 2.5.2
 parsing | resolution | lineage | temporal projection | graph | Navigation 1.0
        |
        +--------------------+----------------------+-------------------+
        |                    |                      |                   |
        v                    v                      v                   v
Obsidian plugin      standalone HTML       Agent API 4816       kosmos-build CLI
vault events         folder/snapshot       REST + MCP            JSON / Graphiti
        |                    |
        +---------> shared Local Cluster renderer <---------+
                    cosmology/layout/shaders/controls

Optional external read boundary:
compatible loopback service -> /health /capabilities /graph /events
                                  |
                                  v
                         standalone service client
```

GKOS-Engine owns GKX parsing, validation, canonicalization, lineage, temporal
projection, graph construction, the incremental index, Graphiti projection,
and Navigation contracts. Kosmos owns host integration, product settings,
review UI, spatial metaphor, layout, shaders, controls, and observability. The
renderer consumes the Engine-backed graph; it does not reinterpret frontmatter
or define another graph model.

The Effects integration adds a separate no-write configuration and
validation boundary. It does not change the Navigation 1.0 import graph or
insert an executor into the plugin or standalone browser bundles.

## Versions and dependency integrity

Product version: **0.9.5**; minimum Obsidian: **1.13.0**.

Engine is pinned in package.json and package-lock.json to
`github:Odenknight/GKOS-Engine#44c62208b8a82d350d29bc7fcf44c8a0a13a575b` (2.5.2 with the #121 fixes).
The dependency guard verifies the exact lock coordinate. Three.js is
0.187.0. Supported build runtimes are Node 22 and 24. The only dependency
added in 0.9.0 is the development-only MCP test client
`@modelcontextprotocol/client@2.4.0`; it is not bundled. No Rust runtime or
Node Effects executor is added to the browser or Obsidian plugin.
Historical Effects evidence remains in docs/navigation-effects; historical
consumer validation is in [REVIEW-0.8.2.md](https://github.com/Odenknight/Kosmos-Oden/blob/e20b1b7dbd7fb2aee3abfc525e518312970d37d9/_archive/docs/REVIEW-0.8.2.md).

## Semantic and graph behavior

The pinned Engine supplies a tolerant Markdown/GKX parser, path normalization,
wikilink and Markdown-link resolution, ambiguity diagnostics, canonical
lineage, temporal validity, graph assembly, incremental indexing, Graphiti
episodes, and Navigation 1.0.

The product understands human-editable GKX 2.2 properties and exposes a
source-preserving GKX 2.3 validating projection. Authored, derived, suggested,
approved, and effective fields remain separate. Proposed relationships do not
enter the effective graph merely because they are present.

Canonical lineage normalizes declarations into one newer-to-older edge set.
Self-reference, cycles, unresolved or ambiguous targets, multiple successors,
duplicates, and invalid temporal ordering become diagnostics. The point-in-time
projector derives validity intervals and HEAD state from the retained corpus;
it does not invent historical file bytes.

Assessments describe documentation completeness, support, and traceability
under a versioned policy. They are not truth, approval, operational fitness, or
authority.

## Experimental Navigation Effects reconciliation scope

The release contains configuration and validation primitives plus a
browser-safe Packet B ownership/adoption core and trusted preview modal. It has
no source-effect path or durable host/runtime wiring.

### Implemented no-write boundaries

| Surface | Implemented behavior | Explicit non-capability |
|---|---|---|
| Operational exclusions | `src/operational-paths.ts` recognizes `.gkx` and `_archive/moc-runs` roots and descendants across standalone, plugin, migration, enrichment, and agent-facing corpus paths | It is an exclusion predicate, not filesystem containment or write authorization |
| Settings persistence | `NavigationEffectsSettings` schema v1 migrates additively through the existing plugin settings object; missing values produce quiet defaults; malformed/unknown values produce repair diagnostics and force all write flags false | No new settings store, secret persistence, settings UI, prompt, or activation |
| Defaults and timing bounds | Effects, automatic maintenance, and automatic creation default false; debounce defaults to 750 ms, maximum debounce to 3,000 ms, periodic reconciliation to five minutes; fixed roots remain `.gkx/effects` and `_archive/moc-runs` | Values configure future behavior only; no coordinator or reconciliation scheduler consumes them yet |
| Independent status | Navigation 1.0, planner, host adapter, authority provider, journal, policy digest, lease, recovery, reconciliation, ownership, maintenance, and creation have independent ready/state/reason fields | Planner or adapter availability never renders as current authority or runtime safety |
| Engine adapter | `src/navigation-effects/engine-adapter.ts` imports only `gkos-engine/navigation-effects`, exposes the exact experimental contract standing, and maps strict configured booleans | Even when Engine reports configured `apply_managed_moc`, Kosmos reports `currentEffectAuthorized: false` and both automatic modes false |
| Policy validator | Accepts bounded UTF-8 JSON policy bytes, closed identity fields, canonical JSON, and an exact ID/version/lowercase-SHA-256 reference | No policy is bundled, selected, ratified, or made effective by validation |
| Authority boundary | Validates a credential-bound actor, explicit approving actor, exact vault/root/path, operation/object class, sensitivity ceiling, policy binding, expiry, and injected evaluation time; denies agent self-approval and inference fields | No authority provider is configured; connectivity, bearer possession, client label, confidence, approval booleans, or timestamps cannot create a grant |
| Packet B adoption core | Canonical ownership registries and adoption receipts, exact-byte preview/confirmation, stale-state and path/marker rejection, and an atomic/idempotent in-memory test store | No durable store, host adapter, runtime registration, MOC write, or adoption authority |
| Trusted adoption preview | Two-stage modal shows target/digests/ownership/marker validation/exact diff, rechecks freshness, requires an exact confirmation phrase, and reports persistence failures without claiming a source write | The modal is not registered in the plugin or standalone host; its record callback is injected and confirmation fails closed without a freshness provider |
| Packet C0 adapter boundary | Host-neutral byte/effect/recovery/shutdown contract plus deterministic Obsidian and standalone/native capability descriptors | Both descriptors are intentionally unavailable; no writer, Engine Node executor, Vault binding, service endpoint, or runtime registration exists |

Malformed settings, policy drift, noncanonical or unsafe paths, missing
credentials, provider errors, grant mismatch, expiry, sensitivity overflow,
agent self-approval, and unknown runtime facts fail closed. The implemented
functions are pure or injected validators/components; the Packet B store is
in-memory test infrastructure. They do not open files, write notes, hold leases,
or recover effects.

### Runtime and qualification blockers

The following are not implemented in this branch and remain hard blockers:

- durable host/runtime wiring for the ownership registry, adoption receipts,
  freshness reads, and credential-bound recording;
- executable Obsidian and standalone/native host adapters; the C0 descriptors
  intentionally make every operation unavailable;
- target containment and platform filesystem execution;
- durable journal, checkpoint, archive, lease, receipt, rollback, and startup
  recovery wiring;
- the event debouncer, affected-scope coordinator, reconciliation runtime, and
  receipt-bound self-write suppression;
- trusted settings/status/recovery/rollback/audit UI and runtime registration
  of the adoption-preview modal;
- real-process crash qualification, Windows/macOS/Debian adapter parity and
  path-security evidence, 100/2,000/10,000/50,000-note measurements, and the
  24-hour watcher/reconciliation soak; and
- replacement of the development pin with an owner-authorized immutable Engine
  2.2 artifact, plus release/signing/publishing authorization.

Consequently, no existing MOC has been adopted or managed, no generated-region
marker has been inserted, no MOC or source note is written, no current effect
is authorized, and automatic maintenance/creation remain unavailable and off.
The [Packet B working-result receipt](https://github.com/Odenknight/Kosmos-Oden/blob/e20b1b7dbd7fb2aee3abfc525e518312970d37d9/_archive/docs/navigation-effects/PACKET-B-WORKING-RESULT-20260827.md)
and [Packet C0 working-result receipt](https://github.com/Odenknight/Kosmos-Oden/blob/e20b1b7dbd7fb2aee3abfc525e518312970d37d9/_archive/docs/navigation-effects/PACKET-C0-WORKING-RESULT-20260827.md)
record historical local evidence only; neither establishes configured,
authorized, runtime-safe, qualified, or released standing.
The [initial capability matrix](docs/navigation-effects/CAPABILITY-MATRIX.md)
records the independent gate semantics at its stated pre-implementation audit
coordinate; the
[qualification plan](docs/navigation-effects/QUALIFICATION-PLAN.md) separates
local synthetic work from the cross-platform and soak blockers.

## Local Cluster renderer

`src/renderer/cosmology.ts` maps graph nodes into the cluster core, galaxies,
stars, planets, moons, moonlets, asteroids, and Oort objects.
`src/renderer/layout.ts` performs hierarchical packing, orbit placement,
separation, and collision diagnostics. Remaining intersections are reported;
zero overlap is not asserted as a universal mathematical guarantee.

Stars use a relative Hertzsprung–Russell-inspired M-to-O visual scale based on
the weight of their local systems. Planets use terrestrial, super-Earth,
Neptunian, and gas-giant visual categories. Those classifications are renderer
metaphors derived from graph structure.

`src/renderer/renderer.ts` owns:

- Overview, Focus, Depth, and Fly camera modes;
- desktop, touch, and mobile fly controls;
- search and live visibility filters;
- note focus, outgoing links, backlinks, and an inspector;
- labels, all-links/all-objects toggles, minimap, and legend;
- Chrono point-in-time filtering;
- Grow and timeline playback plus the cinematic Trailer;
- note opening and safe folder expansion through host callbacks;
- stable per-agent trails, markers, labels, and recent-visit heat; and
- hidden-view suspension, adaptive pixel ratio, context-loss handling, and
  explicit resource disposal.

The renderer is WebGL2-based. Its low-power path reduces detail and effects
without changing graph semantics.

## Offline standalone application

`scripts/build.mjs` bundles `src/standalone/standalone.ts` and the shared
renderer into `kosmos-oden-stand-alone.html`. All application JavaScript, CSS,
and Three.js code is inline; normal offline use has no CDN or external runtime
URL dependency.

Two source profiles are exposed:

1. **Persistent folder access** uses the File System Access API where available.
   The directory handle can be retained in IndexedDB, but the browser asks for
   permission before reuse. The operator can forget the saved handle.
2. **Imported folder snapshot** uses the standard directory-file input and
   performs a one-time read when persistent access is unavailable.

`DirectoryMonitor` rescans and diffs persistent sources. Added, changed,
removed, and renamed paths are fed into the same `GkxIndex`; ordinary content
changes use incremental parsing. Status distinguishes live monitoring,
snapshot mode, offline mode, graph connection, MCP availability, and traversal
stream state.

Directory reading is source-content read-only. The viewer's downloads—graph,
Graphiti episodes, and traversal sessions—are explicit browser-generated
exports rather than writes into the selected source.

## Optional standalone-service client

`src/standalone/api-feed.ts` is a client adapter. There is no standalone
service implementation or binary in this repository.

### Address and credential rules

- Destinations must use HTTP(S) and the literal loopback hosts `127.0.0.1`,
  `localhost`, or `::1`.
- The optional `api` query parameter carries only the non-secret base address.
- Query-token parsing is absent. The password field provides the bearer token,
  which remains in memory.
- Requests send `Authorization: Bearer ...` and `cache: no-store`.
- A viewer credential does not become an MCP agent identity or write authority.

### Capability negotiation

The client validates a closed capability document and accepts graph data only
when the graph feature reports `available`, `configured`, `authorized`, and
`enabled`. MCP and events are displayed as independent states.

At `main@7a2a025`, the client accepts exactly
`GKOS-LOCAL-SERVICE-1.0.0-draft.1`. A separately developed Draft.2 runtime is
not bundled or released here and fails the client's exact-version check. A
future client/runtime update requires reviewed contract alignment and live
integration evidence; documentation cannot bridge that version boundary.

### Authenticated traversal stream

The client uses authenticated `fetch()` streaming because native
`EventSource` cannot supply the bearer header reliably. It requires the exact
`text/event-stream; charset=utf-8` content type, one traversal frame shape, a
safe sequence number, and a valid service event-session identifier.

Reconnect is bounded. Resume sends both `Last-Event-ID` and the bound event
session. If the service session changes while resuming, the acknowledged state
is cleared and the client fails that resume rather than joining sequences from
different rings.

Traversal envelopes are closed to schema/session/sequence/offset/operation,
agent identity and label, tool, authorized paths, status, and nullable
`cost_units`. Paths reject absolute, traversal, encoded, backslash, control,
non-NFC, Windows-device, and trailing-dot/space hazards. Unknown fields, note
bodies, prompts, credentials, and raw errors do not enter the normalized event.

## Traffic Heatmap and session replay

`src/standalone/observability.ts` is DOM-free and clock-injectable.

### Heat

`TrafficHeatmap` maintains an LRU-bounded map of recent node visits. The
defaults are:

- 15-second exponential half-life;
- 120-second hard horizon, after which the value is exactly zero; and
- 10,000 node entries maximum.

Only validated traversal events increment traffic. The renderer sends the
normalized scalar through the `aHeat` instanced attribute and blends it with
the existing body color, adding no separate draw call. Heat is off by default.
It is not a fuel, cost, truth, quality, importance, confidence, or authority
metric. Non-null `cost_units` remains event data and does not silently change
the heatmap's meaning.

### Recording and replay

`TraversalSessionRecorder` starts only after explicit operator action. It
normalizes a closed metadata and event schema and caps a session at 5,000
events or 2,000,000 encoded bytes. Reaching either limit stops recording and
marks the export truncated. No automatic persistence is implemented.

`TraversalReplay` validates imported size and schema, orders by sequence and
then offset, and supports play, pause, seek, restart, stop, and 1x/2x/5x speed.
Replay events are labelled and never written to the live recorder. Live events
continue into a separately bounded buffer during replay; the operator decides
whether to return to the current live state afterward.

## Obsidian plugin host

`src/plugin/main.ts` owns the Obsidian view, commands, settings, vault events,
API lifecycle, explicit GKX workflows, and Nextcloud lifecycle. The generated
renderer runs in an opaque-origin sandboxed iframe. A closed, versioned
`postMessage` contract carries full snapshots, incremental deltas, navigation
state, traversal notifications, visibility, and validated note/folder actions.

Create, modify, rename, and delete events are debounced and coalesced. Content
changes update the canonical incremental index; structural thresholds can
trigger a complete rebuild. The renderer stops when its leaf is hidden and
resumes when visible.

The plugin is not desktop-only. The Agent API and model integrations are
desktop-gated where their host primitives require it; the renderer itself
supports Obsidian mobile.

## Obsidian Agent API and MCP

`src/plugin/agent-server.ts` is an opt-in, read-only server backed by the same
Engine index as the viewer. Defaults are disabled, loopback port 4816,
authentication required, and an `internal` sensitivity ceiling.

REST includes health/root metadata, overview, diagnostics, graph, note,
lineage, related notes, temporal projection, episodes, and GKX validating
projection routes. MCP provides read tools for overview, search, note content,
lineage, related notes, point-in-time graph, Graphiti episodes, validating
projection, assessments, diagnostics, effective labels, evidence,
relationships, policy, and a bounded vault assessment.

The Streamable HTTP lifecycle is stateless, per MCP `2026-07-28`: it validates
the request envelope, the supported protocol version, and agreement between
the mirrored request-metadata headers and the body. There is no handshake, no
server-issued session and no DELETE termination — GET and DELETE answer `405`,
and `Mcp-Session-Id` and `Last-Event-ID` are ignored. Header/body
disagreement, an unsupported version and an unimplemented method are distinct
errors (`-32020`, `-32022`, `-32601`); see `AGENT-API.md`.
`kosmos-mcp-stdio.mjs` translates line-oriented stdio for clients that cannot
send HTTP headers, mirroring the body fields into those headers. It
deliberately does not synthesize `_meta` a client omitted.

Since 0.9.0 the same endpoint also answers initialize-era clients while
**Accept older MCP clients** is on (default): `2025-11-25`, `2025-06-18` and
`2025-03-26` natively (March-2025 batches included), and `2024-11-05` only
through the bridge. `src/plugin/mcp-compat.ts` classifies each POST by the
presence of modern markers and serves the legacy path statelessly. See
[MCP-COMPATIBILITY.md](docs/v0.9.5/MCP-COMPATIBILITY.md).

### Personal Notes profile

`activeProfile` (settings schema 11) selects which profile the listener
serves. In the Personal profile the server exposes six read-only
tools (`vault_overview`, `search_notes`, `get_note`, `get_related`,
`get_lineage`, `ask_librarian`) and the matching REST routes; every existing-profile tool and
route is unknown. Access is decided by one read policy (shared folders,
always-excluded paths, physical containment, authored sensitivity against the
existing ceiling) with a monotonic policy generation that ends in-flight
answers after any access change. The bearer token is device-local and never
persisted in plugin data. `get_note` returns exact UTF-16 pages with SHA-256
continuation (`kosmos-personal-notes/1`). Search runs in a bundled Web Worker
over an in-memory corpus rebuilt at startup. Optional deterministic tags are
the only note writer the profile adds; the legacy automatic timestamp writer
stands down while it is active. Reference: [AGENT-API.md](AGENT-API.md);
user guide: [docs/PERSONAL-NOTES.md](docs/PERSONAL-NOTES.md).

Security controls include:

- CSPRNG bearer tokens and constant-time comparison;
- Host and Origin validation, including DNS-rebinding defenses;
- byte-accurate 4 MiB request-body cap;
- rate, concurrency, result, note-content, response, and page caps;
- `Cache-Control: no-store` responses;
- sensitivity filtering across notes, links, diagnostics, temporal state,
  Graphiti episodes, and counts; and
- invalid explicit sensitivity failing closed.

LAN mode is separately opt-in, token-required, and unencrypted. It is a
compatibility feature for trusted private networks or secure tunnels, not a
recommendation to expose the API publicly.

### Profiles and sensitivity

Personal Notes starts with an empty include list and a stopped connector. A shared folder admits ordinary unlabeled notes even at the Public ceiling. Exclusions take precedence. An unrecognized sensitivity label or malformed properties block fails closed. The Existing profile projects GKX notes through Engine, using Default sensitivity for unlabeled notes (Secret unless configured). Effective sensitivity can rise above that default. Both profiles cap labeled reads at the selected Agent sensitivity ceiling, Internal by default. The order from least to most sensitive is Public, Internal, Restricted, Confidential, Regulated, PHI and Secret. A profile switch stops the listener. The desktop bearer authenticates possession and profile. A caller’s display name grants no additional permissions. [Folder and label policy](docs/PERSONAL-NOTES.md) · [Agent API reference](AGENT-API.md)

### Import, word search and deterministic tags

**Add notes from another app** guides the user through Obsidian Importer for Google Keep and OneNote. Review the destination and the Importer’s own report. **Search my notes** uses an in-memory worker over the user’s vault with operational files excluded. It matches titles, aliases, tags, paths and bodies, supports quoted phrases, and can open a matching note. The assistant’s word search separately enforces the sharing policy. **Optional tags** previews missing timestamps and UIDs in user-selected folders. **This note supersedes…** records a selected replacement link. Applying selected changes backs up affected notes and checks that the preview still matches. [Personal commands and limits](docs/PERSONAL-NOTES.md)

### Librarian, semantic search and folder maps

The Personal tool `ask_librarian` and its REST mirror return ranked evidence and excerpts for a question. The desktop listener also offers an authenticated browser page at `/ui`. The Librarian combines lexical matches, related terms and note names with optional semantic results. Confidence reflects lexical evidence, and a high score can still point to the wrong note. On a 542-note evaluation the expected note ranked first for 39 of 44 questions. The semantic-only worker ranked the reference page first for 8 of 16 questions on a separate Obsidian Help sample. [Evidence and limitations](docs/v0.9.5/KNOWN-LIMITATIONS.md)

Semantic search runs an embedding model in a worker and stores vectors and note paths in the plugin’s SQLite index. Choose a supported download, supply local model files or configure a loopback or private-network embedding server. That server receives the passages and questions it embeds. The index can resume after interruption, and search falls back to words while models or vectors are unavailable. Ranking only uses notes the caller may already read. [Model and server setup](docs/v0.9.5/SEMANTIC-SEARCH.md)

The folder map command operates on the active note’s folder. It builds a deterministic index of Markdown links in a marked block, preserves text outside that block, refuses the vault root and refuses to overwrite an unmarked existing index. [Librarian and map generation](docs/v0.9.5/LIBRARIAN-AND-MOC.md)

## Graphiti and command-line export

Graphiti episodes are origin-separated, non-authoritative projections. A valid
GKX UUID becomes the stable episode UUID; legacy notes receive a deterministic
fallback. Episodes are chronological, and earlier episodes do not receive
future HEAD, invalidation, or supersession state.

`kosmos-build.mjs` scans a directory with the same ignore and Engine semantics,
writes graph JSON, optionally writes Graphiti episodes, and can watch for
changes. It is a Node CLI, not a server:

```bash
node kosmos-build.mjs <vault-dir> [graph.json]
node kosmos-build.mjs <vault-dir> graph.json \
  --episodes episodes.json --group-id <stable-namespace>
node kosmos-build.mjs <vault-dir> graph.json --watch
```

## Explicit GKX maintenance workflows

The plugin registers commands for scan/repair, conversion to editable GKX 2.2
or native 2.3, enrichment review, Graphiti export, and writing a local Agent API
guide.

### Audit, migration, and conversion

The deterministic scan creates a hash-bound plan. Saving an audit writes a
content-free report. Apply is a distinct boundary requiring backup and policy
acknowledgements; conversion modes add an override acknowledgement. Before
editing, each source is reread and compared with the approved hash. Every
changed note receives a byte-exact local backup under `.gkx/backup/<run-id>`;
Obsidian's atomic processor performs the source edit and a result audit records
outcomes.

### Content-assisted enrichment

The established enrichment workflow selects bounded evidence and produces
human-review suggestions for descriptions, types, tags, and explicitly
evidenced relationships. The deterministic pass always runs. An optional
on-device, private-IP LAN, or HTTPS cloud model pass is disabled by default and
uses strict endpoint, disclosure, sensitivity, timeout, note-count, and
character caps. PHI is blocked from LAN/cloud enrichment, and cloud is limited
to public/internal data.

Nothing is preselected or automatically approved. The reviewer resolves every
suggestion before building a second hash-bound apply preview. Relationship
targets must resolve, current bytes must still match, and the established
backup/apply modal remains the only source writer.

This is not the newer immutable `.gkx/proposals/` and `.gkx/decisions/`
quarantine design. That subsystem is absent from main.

Blocked-note model review is advisory only, restricted to on-device or
explicit private-LAN providers, and cannot generate executable YAML or reach a
writer.

## Nextcloud WebDAV sync

`src/plugin/nextcloud-sync-core.ts` provides settings migration, URL/path
validation, exclusion matching, and deterministic three-way planning.
`src/plugin/nextcloud-sync.ts` implements the Obsidian/WebDAV adapter.

Defaults are disabled, no startup or interval sync, no deletion propagation,
and no `.obsidian` synchronization. `.git/**` and `.trash/**` are excluded;
plugin credential/state data remains protected even if `.obsidian` is enabled.
Up to 200 custom exclusion patterns are accepted.

The adapter scans local binary content, enumerates the configured DAV root,
compares local SHA-256, remote ETag, and last-common state, and uses conditional
requests. Simultaneous changes produce a timestamped local copy of the remote
bytes before the local version becomes common. Changed-versus-deleted cases
remain conflicts; unchanged deletions propagate only after explicit opt-in.

Nextcloud app passwords are stored in Obsidian Secret Storage. HTTPS is
required for public hosts; HTTP accepts only literal private or loopback
addresses. The feature favors correctness over incremental remote performance
and is not a replacement for independent backup.

## Read/write boundary

| Operation | Source-write behavior |
|---|---|
| Renderer, search, Chrono, heat, replay | No source or sidecar write |
| Standalone folder/snapshot scan | Read-only source access |
| Graph/Graphiti/session export | Explicit download outside the source workflow |
| Obsidian REST/MCP API (both profiles) | Read-only; no write routes or tools |
| Personal Notes search, import review, connection | No source write |
| Personal Notes optional tags | Off by default; preview, hash re-check, exact backup, selected keys only; opted-in automatic time stamps on real content changes in tagging folders |
| Navigation 1.0 | Selects existing visual centers; apply capability false |
| Navigation Effects feature-branch planner/settings/status | Pure capability, configuration, policy, and authority-validation values; no source or sidecar write |
| Navigation Effects execution | Not implemented or configured in Kosmos; unavailable and off |
| GKX audit | Read-only until the operator separately saves an audit |
| GKX migration/enrichment apply | Explicit acknowledgements, hash recheck, backup, guarded source processing |
| Nextcloud sync | Separately enabled local/remote file synchronization with conflict and deletion policy |

No connectivity, bearer token, MCP session, client name, model output,
confidence value, or timestamp supplies approval authority.

## Security and privacy boundaries

- Offline single-file use has no external runtime dependency and does not
  contact a service unless the user selects that feature.
- The renderer iframe is sandboxed without `allow-same-origin` and accepts only
  validated host messages.
- The standalone service client is loopback-only and rejects URL credentials.
- The Obsidian Agent API is disabled and loopback-bound by default; LAN mode
  requires authentication.
- API outputs apply the configured sensitivity ceiling before serialization.
- Tokens and Nextcloud passwords are not logged; Nextcloud secrets use Obsidian
  Secret Storage.
- Generated graphs, episodes, diagnostics, assessments, heat, and replay are
  projections and do not replace GKX source.
- `.gkx/**` and `_archive/moc-runs/**` are operational namespaces and are
  excluded from corpus, Navigation, graph, retrieval, enrichment, and agent
  context on the feature branch.
- The Effects adapter is framework-neutral; the optional Engine Node executor
  does not enter the plugin or standalone browser import graph.
- Build invariants check authentication defaults, listener rules, request caps,
  iframe sandboxing, artifact self-containment, and other security properties.

See [SECURITY.md](SECURITY.md) and
[the threat model](docs/THREAT-MODEL.md). Security documentation also records
the limits: no defense against a compromised Obsidian host or authorized agent,
and no encryption for the optional LAN API.

## Build, package staging, and verification

Development requirements are Node.js 22–24 and npm 10 or newer.

| Script | Purpose |
|---|---|
| `npm run typecheck` | No-emit check with implicit `any` rejected. Existing explicit `any` remains. |
| `npm run build` | Plugin, embed, standalone HTML, and Node test/CLI bundles |
| `npm run build:standalone` | Standalone HTML only |
| `npm run dev` | Unminified development build |
| `npm test` | Node test suite after test bundles are built |
| `npm run bench` | Repository benchmark harness |
| `npm run check:versions` | Package/manifest/version-map agreement |
| `npm run check:lockfile` | Exact git dependency integrity |
| `npm run check:artifacts` | Expected artifacts and self-containment |
| `npm run check:invariants` | Declared security and architecture invariants |
| `npm run check:renderer-provenance` | Three.js pin, build marker, and no-CDN provenance |
| `npm run verify` | Typecheck, full build, Node tests, and all invariant/artifact checks |
| `npm run test:browser` | Chromium, Firefox, and WebKit Playwright coverage |
| `npm run test:visual` | Chromium visual-regression suite |
| `npm run test:renderer` | Browser plus visual suites |
| `npm run package:release` | Stage current JS/HTML plugin artifacts, build info, and checksums |

`package:release` creates a conventional release directory for the existing
plugin/HTML artifacts. It is not a Tauri or native package builder, signature,
notarization, publication, or release authorization.

CI type-checks, builds, tests, checks invariants and provenance, performs
dependency review on pull requests, and compares clean executable builds for
byte reproducibility. Browser workflows cover desktop and mobile-oriented
projects. Exact test counts belong to the commit and runner that produced them;
they are not evergreen documentation.

## Explicitly excluded roadmap and release gates

The following are absent from the released/`main` product. Except for the
no-write feature-branch primitives enumerated above, they are also absent from
the current reconciliation branch and must not be described as implemented,
configured, authorized, qualified, or released:

- the new immutable proposal/decision quarantine and confidence-review system;
- durable host/runtime wiring for managed-MOC ownership/adoption and receipts,
  source writing, archives, journal, lease, coordinator, reconciliation,
  recovery, self-write suppression, complete trusted operator and
  rollback/audit UI, and automatic maintenance/creation;
- a Tauri/native desktop shell, bundled standalone sidecar, Docker profile,
  portable/native installers, or uninstall workflow;
- signing, notarization, an automatic updater, cross-platform package
  qualification of native desktop installers; and
- Rust 3.0 engine cutover.

## Repository map

| Path | Responsibility |
|---|---|
| `src/navigation-integration.ts` | Read-only Engine Navigation adapter and truthful capability boundary |
| `src/navigation-effects/` | Feature-branch no-write settings/status, framework-neutral Engine boundary, policy validation, and authority validation |
| `src/operational-paths.ts` | Central `.gkx/**` and `_archive/moc-runs/**` corpus exclusion predicate |
| `src/renderer/` | Cosmology, layout, shaders, controls, trails, heat, and renderer lifecycle |
| `src/standalone/` | Folder/snapshot sources, monitoring, service client, observability, replay, and standalone UI |
| `src/plugin/` | Obsidian lifecycle, message host, Agent API, explicit GKX workflows, and Nextcloud sync |
| `kosmos-build.mjs` | Read-only filesystem graph/Graphiti CLI |
| `kosmos-mcp-stdio.mjs` | Stdio bridge for the Obsidian MCP compatibility surface |
| `scripts/` | Deterministic builds, integrity checks, provenance, and release staging |
| `test/` | Node unit/integration/security fixtures and browser suites |
| `docs/` | Architecture, profiles, threat model, compatibility, and operator guidance |
| `docs/navigation-effects/` | Development pin, independent capability semantics, and qualification/blocker plan |

## Related documents

- [Architecture](docs/ARCHITECTURE.md)
- [Renderer host protocol](docs/RENDERER-PROTOCOL.md)
- [Engine 2.1 compatibility](docs/ENGINE-2.1-COMPATIBILITY.md)
- [GKX 2.3 profile](docs/GKX-2.3-PROFILE.md)
- [GKX migration](docs/GKX-MIGRATION.md)
- [Content-assisted enrichment](docs/GKX-ENRICHMENT.md)
- [Obsidian Agent API](AGENT-API.md)
- [MCP protocol eras](docs/MCP-PROTOCOL-ERAS.md)
- [Navigation Effects development pin](docs/navigation-effects/DEVELOPMENT-PIN.md)
- [Navigation Effects capability matrix](docs/navigation-effects/CAPABILITY-MATRIX.md)
- [Navigation Effects qualification plan](docs/navigation-effects/QUALIFICATION-PLAN.md)
- [Navigation Effects Packet B working-result receipt](https://github.com/Odenknight/Kosmos-Oden/blob/e20b1b7dbd7fb2aee3abfc525e518312970d37d9/_archive/docs/navigation-effects/PACKET-B-WORKING-RESULT-20260827.md)
- [Navigation Effects Packet C0 working-result receipt](https://github.com/Odenknight/Kosmos-Oden/blob/e20b1b7dbd7fb2aee3abfc525e518312970d37d9/_archive/docs/navigation-effects/PACKET-C0-WORKING-RESULT-20260827.md)
- [Security policy](SECURITY.md)
- [Threat model](docs/THREAT-MODEL.md)
- [Contribution gates](CONTRIBUTING.md)
- [Release process](docs/RELEASE-PROCESS.md)

## Licensing

Project-authored software is Apache-2.0. Project-authored documentation and
original graphics are CC BY 4.0 where declared. Third-party and inherited
materials remain under their original licenses and notices. See
[Licensing by artifact](LICENSING.md), [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), and
[ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md).

## MCP qualification scope

The Agent API supports the modern revision and, when **Accept older MCP clients** is enabled, the initialize-era revisions listed in the [compatibility table](docs/v0.9.5/MCP-COMPATIBILITY.md). The separate Engine retrieval client has its own qualification evidence.
