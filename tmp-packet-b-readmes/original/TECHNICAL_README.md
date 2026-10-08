# Kosmos-Oden Technical README

## Scope and status vocabulary

This document distinguishes the released/`main` product baseline from the
current Navigation Effects reconciliation feature branch. Repository and
plugin metadata remain **0.8.0**. The released product uses exact-pinned
`gkos-engine#v2.1.1`; the feature branch uses a separate exact development
commit solely for experimental integration work.

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
| Semantic core | Engine 2.1.1 parsing, projection, graph, temporal, incremental index, Graphiti, Navigation 1.0 | Exact package and lock pin | No Engine 2.2 effects dependency or Rust runtime |
| Local Cluster renderer | Shared cosmology, hierarchical layout, WebGL2 shaders, controls, Chrono, search, playback, agent trails | Viewer starts after a graph is loaded | Visual projection only |
| Offline standalone | Single-file HTML, persistent directory picker, snapshot fallback, incremental rescans, in-memory exports | User selects a source | No bundled service or native wrapper |
| Obsidian plugin | Sandboxed renderer host, live vault deltas, note/folder actions, settings, explicit GKX workflows, optional sync | User installs/enables the plugin | Obsidian supplies host and Secret Storage APIs |
| Obsidian Agent API | Read-only REST and Streamable HTTP MCP, stdio bridge, sensitivity filter, limits | Off by default; loopback and authentication default | Port 4816 compatibility surface, not the standalone service |
| Standalone service client | Loopback address validation, bearer graph fetch, capability negotiation, authenticated event stream | Requires an external compatible service and viewer credential | Client validates Draft.1; service is not bundled |
| Traffic and replay | Per-agent trails, recent-visit heat scalar, explicit bounded record/export/import/replay | Heat and recording off until selected | Observability only; no cost, fuel, quality, or authority meaning |
| GKX maintenance | Deterministic audit/conversion, backups, guarded apply, optional bounded enrichment review | Explicit commands and acknowledgements | Not the newer immutable proposal/decision subsystem |
| Nextcloud sync | WebDAV scan, three-way planning, conditional transfers, conflict preservation | Disabled by default; separately configured | One Nextcloud target; not a backup |
| Navigation Effects feature branch | Operational-path exclusions, fail-closed settings persistence/status, framework-neutral Engine adapter, exact policy validation, credential-bound authority decisions | All Effects and automatic flags false by default; no host executor is wired | No adoption, source writer, journal/archive/lease, coordinator, recovery, reconciliation runtime, self-write suppression, UI, or qualification |

## Controlling architecture

```text
Markdown / GKX corpus
        |
        v
exact-pinned GKOS-Engine v2.1.1
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

The Effects feature branch adds a separate no-write configuration and
validation boundary. It does not change the Navigation 1.0 import graph or
insert an executor into the plugin or standalone browser bundles.

## Versions and dependency integrity

`package.json` declares version 0.8.0 and `manifest.json` carries the same
version. `versions.json` maps 0.8.0 to Obsidian 1.11.4.

On the released/`main` line, the dependency is declared as:

```text
gkos-engine: github:Odenknight/GKOS-Engine#v2.1.1
```

That lockfile resolves Engine 2.1.1 to the exact commit recorded in
[Engine 2.1 compatibility](docs/ENGINE-2.1-COMPATIBILITY.md). The lock guard
checks that git dependencies resolve immutably. Three.js is exact-pinned to
0.185.1, and renderer provenance is checked in source and generated artifacts.

The current Effects feature branch instead pins this exact development
coordinate:

```text
gkos-engine: github:Odenknight/GKOS-Engine#41172b91970aac869c161f4842e3526a62fd1fd9
```

The installed package declares version 2.1.2 and exports
`gkos-engine/navigation-effects`. Its contract manifest identifies suite
`ENGINE-NAV-EFFECTS-CONTRACT-1.0.0`, Navigation Effects contract `1.0.0`,
Engine release target `2.2.0`, standing `integration-only`, implementation
phase `node-executor-experimental`, and `gkos_conformance: false`. The optional
`gkos-engine/navigation-effects/node` export exists in the dependency but is
not imported by the Kosmos framework-neutral adapter or its browser build.

This exact commit coordinate is development-only. It is not an Engine 2.2
release or a product release dependency. Its lock coordinate and integrity are
recorded in
[the development-pin ledger](docs/navigation-effects/DEVELOPMENT-PIN.md). An
owner-authorized immutable Engine 2.2 artifact and all qualification gates are
required before any release claim.

The TypeScript Engine remains the active dependency. Rust 3.0 is roadmap work,
not a selected or bundled runtime.

## Semantic and graph behavior

Released Engine 2.1.1 supplies a tolerant Markdown/GKX parser, path normalization,
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

The feature branch implements configuration and validation primitives only.
It has no source-effect path.

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

Malformed settings, policy drift, noncanonical or unsafe paths, missing
credentials, provider errors, grant mismatch, expiry, sensitivity overflow,
agent self-approval, and unknown runtime facts fail closed. The implemented
functions are pure or injected validators; they do not open files, write notes,
hold leases, or recover effects.

### Runtime and qualification blockers

The following are not implemented in this branch and remain hard blockers:

- a digest-bound ownership/adoption registry and marker workflow;
- Obsidian and standalone/native host adapters;
- target containment and platform filesystem execution;
- durable journal, checkpoint, archive, lease, receipt, rollback, and startup
  recovery wiring;
- the event debouncer, affected-scope coordinator, reconciliation runtime, and
  receipt-bound self-write suppression;
- trusted settings/adoption/status/recovery/rollback/audit UI;
- real-process crash qualification, Windows/macOS/Debian adapter parity and
  path-security evidence, 100/2,000/10,000/50,000-note measurements, and the
  24-hour watcher/reconciliation soak; and
- replacement of the development pin with an owner-authorized immutable Engine
  2.2 artifact, plus release/signing/publishing authorization.

Consequently, existing MOCs are not adopted or managed, no generated-region
marker is inserted, no MOC or source note is written, no current effect is
authorized, and automatic maintenance/creation remain unavailable and off.
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

The Streamable HTTP lifecycle validates supported protocol versions,
server-issued sessions, initialization order, request envelopes, and DELETE
termination. `kosmos-mcp-stdio.mjs` translates line-oriented stdio for clients
that cannot send HTTP headers while preserving the upstream session and
protocol headers.

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
| Obsidian REST/MCP API | Read-only; no write routes or tools |
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
| `npm run typecheck` | TypeScript no-emit check |
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
- managed-MOC ownership/adoption, source writing, archives, journal, lease,
  receipts, coordinator, reconciliation, recovery, self-write suppression,
  rollback/audit UI, and automatic maintenance/creation;
- a released Engine 2.2 effects dependency (the feature branch has only an
  exact development commit);
- a Tauri/native desktop shell, bundled standalone sidecar, Docker profile,
  portable/native installers, or uninstall workflow;
- signing, notarization, an automatic updater, cross-platform package
  qualification, or a new release label; and
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
- [Navigation Effects development pin](docs/navigation-effects/DEVELOPMENT-PIN.md)
- [Navigation Effects capability matrix](docs/navigation-effects/CAPABILITY-MATRIX.md)
- [Navigation Effects qualification plan](docs/navigation-effects/QUALIFICATION-PLAN.md)
- [Security policy](SECURITY.md)
- [Threat model](docs/THREAT-MODEL.md)
- [Contribution gates](CONTRIBUTING.md)
- [Release process](docs/RELEASE-PROCESS.md)

## Licensing

Project-authored software is Apache-2.0. Project-authored documentation and
original graphics are CC BY 4.0 where declared. Third-party and inherited
materials remain under their original licenses and notices. See
[LICENSE](LICENSE), [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), and
[ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md).
