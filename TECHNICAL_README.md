# Kosmos-Oden Technical README

## Scope and status

This document describes the current `feature/kosmos-standalone-v0.85`
implementation branch. It separates source reachability from runtime
configuration, authority, qualification, and release status.

The branch is an internal-alpha implementation branch. Repository version
metadata remains 0.8.0. This document and the implementation do not by
themselves authorize a merge, tag, release, deployment, managed-MOC write,
proposal ingress endpoint, or Engine cutover; each remains subject to its
applicable owner and qualification gates.

| Area | Implemented | Configured or activated | Qualified or released |
|---|---|---|---|
| Offline Local Cluster | Single-file viewer, folder picker, snapshot fallback, shared graph and renderer | User selects a local folder or snapshot | Existing repository browser/visual gates apply; uplift is not a new release |
| Local service client | Draft capability validation, bearer-auth graph fetch, authenticated SSE-over-`fetch()` traversal client | Requires a compatible loopback service and viewer credential | Matching unified runtime is not present on this branch; no live E2E claim |
| Traffic and replay | Heat scalar, finite monotonic decay, bounded recorder, import/export, deterministic replay | Heat and recording are operator opt-ins | Focused and browser tests exist; cross-platform release qualification remains open |
| Proposal review | Immutable proposal and decision sidecars; explicit reviewed apply boundary | Requires the existing review workflow and Obsidian Secret Storage | No HTTP proposal ingress or autoapproval is implemented |
| Navigation Effects | Settings, status, policy/authority checks, debouncer, reconciliation and self-write primitives | All write modes default off | Host adapters, adoption, journal/archive/lease, recovery and full coordinator are not qualified |
| Desktop/portable | Tauri 2 source shell and portable-alpha staging | Requires separately supplied real sidecar binaries | Unsigned internal-alpha source/staging only; target binaries and cross-platform evidence are missing |

“Implemented” means source and tests exist. “Configured” means the necessary
runtime dependencies and settings are present. “Authorized” requires an
external human or policy decision. “Qualified” requires the applicable test
matrix and recorded evidence. “Released” requires an owner-authorized,
versioned artifact. None of these states implies the next.

## Architecture

```text
Markdown / GKX corpus
        |
        v
exact-pinned GKOS-Engine semantic core
 parsing | resolution | lineage | temporal projection | graph | Navigation 1.0
        |
        +-------------------+--------------------+------------------+
        |                   |                    |                  |
        v                   v                    v                  v
Obsidian host       standalone HTML       Agent API 4816      build/CLI tools
        |                   |
        +---------> shared renderer <-----+
                    cosmology/layout/
                    shaders/controls

Separate draft boundary:
GKOS local service contract -> /health /capabilities /graph /events /mcp
                                      |
                                      v
                             standalone service client
```

Kosmos owns visualization, host integration, local interaction, explicit
review UI, and operational coordination. GKOS-Engine owns parsing,
validation, canonicalization, lineage, temporal projection, graph semantics,
and Navigation contracts. The renderer consumes a graph; it does not introduce
a second GKX parser or alternate graph meaning.

At this commit, the installed dependency is `gkos-engine#v2.1.1` at its exact
lockfile commit. The standalone uplift continues to use TypeScript Engine
2.1.2 outputs as the compatibility oracle. Rust 3.0 is a future
protocol-compatible replacement and is not selected by this branch.

## Offline standalone viewer

`scripts/build.mjs` produces `kosmos-oden-stand-alone.html` as one offline
file. It embeds the exact-pinned Three.js renderer and browser graph path.
`src/standalone/directory-source.ts` supplies two read-only input profiles:

- persistent directory selection where the browser supports the File System
  Access API; and
- one-time folder snapshot import as the portable fallback.

The page works from `file://` without a local server. Folder and snapshot modes
do not require the Engine service and must continue to make no external request
unless the operator explicitly chooses the local-engine connection.

The same renderer is embedded by the Obsidian plugin. Host-to-renderer messages
use the versioned and validated protocol described in
[docs/RENDERER-PROTOCOL.md](docs/RENDERER-PROTOCOL.md).

## Local service client contract

`src/standalone/api-feed.ts` implements the viewer side of
`GKOS-LOCAL-SERVICE-1.0.0-draft.1`.

### Connection rules

- Accepted destinations are HTTP(S) loopback hosts only:
  `127.0.0.1`, `localhost`, or `::1`.
- The non-secret `api` query parameter may select the loopback base URL.
- Query-token parsing is removed. Credentials are accepted only from the
  password control or the desktop shell's secure IPC bridge.
- Requests use `Authorization: Bearer ...` and the fetch `no-store` cache mode.
- Capability negotiation precedes graph acceptance.
- Offline folder/snapshot behavior remains independent of service failure.

The capability document is closed and versioned:

```text
schema_version: 1
protocol: { id: "gkos-local-service", version: "1.0.0-draft.1" }
features:
  graph | notes | graphiti_episodes | mcp | events |
  proposal_ingress | navigation | navigation_effects
```

Every feature reports these fields independently:

```text
available | configured | authorized | enabled | reason_codes
```

The viewer does not translate “available” into “authorized.” Graph connection
requires all applicable graph states to be true. Proposal ingress and
Navigation Effects are not inferred from a bearer token or from connectivity.

### Traversal stream

The event client uses authenticated `fetch()` streaming rather than native
`EventSource`, because the bearer header is required. It expects:

```text
Content-Type: text/event-stream; charset=utf-8
id: <nonnegative safe-integer sequence>
event: traversal
data: <single-line JSON traversal envelope>
```

Reconnect sends `Last-Event-ID` and accepts only events strictly after the
acknowledged sequence when the server retains them. The event envelope is
closed to:

```text
schema_version, session_id, sequence, offset_ms, operation_id,
agent_id, agent_label, tool, paths, status, cost_units
```

Paths must already be literal canonical vault-relative paths. Percent-encoded
or malformed encodings, absolute paths, traversal, backslashes, control
characters, portability hazards, Windows device names, and non-NFC forms are
rejected. Events contain paths, not note bodies, prompts, credentials, tokens,
or unredacted raw errors. `cost_units` remains `null` unless a real metering
contract supplies it.

The matching transport-neutral service foundation exists on a separate draft
GKOS-Engine integration branch. It is contract/build work, not an activated
runtime in this repository. `/health`, `/capabilities`, `/graph`, `/events`,
and `/mcp` must not be described as live end-to-end standalone functionality
until a compatible runtime commit is integrated and tested.

## Renderer observability

### Per-agent trails

Traversal events call the existing renderer traversal API. Stable agent labels
retain stable colors across trails, dust, rockets, and labels. Events are kept
separate by agent so no line segment joins different agents.

### Traffic Heatmap

`src/standalone/observability.ts` maintains a bounded per-node traffic score.
Updates come only from validated traversal events. Decay is calculated from an
injected monotonic clock, not frame count, and an explicit finite horizon
returns exactly zero and evicts expired entries. The scalar is uploaded as the
`aHeat` instanced shader attribute and blended in the existing material pass,
so the normal desktop path adds no draw call.

The control is off by default, including low-power/mobile paths. Its legend
states that it measures recent visits. It does not represent truth, quality,
importance, fuel, cost, confidence, or authority.

### Session recording and replay

Recording is explicit and in-memory only. `TraversalSessionRecorder` accepts
only normalized traversal-envelope fields and an exact metadata field set. It
drops unknown properties and rejects invalid metadata. Limits are:

- at most 5,000 events; and
- at most 2,000,000 encoded bytes.

The first reached limit stops recording and marks the export truncated. Replay
imports are size-checked before reading and validated again before retaining
events. Replay sorts by sequence and then monotonic offset, supports play,
pause, seek, restart, stop, and 1x/2x/5x speeds, and does not write replayed
events back into the live recording.

Live events continue to arrive in a separately bounded buffer while replay is
active. At the end, the operator chooses whether to return to current live
state or remain paused. Context loss or renderer restart clears transient live
state; a replay file is loaded only by an explicit operator action.

## Proposal quarantine and human decisions

`src/plugin/gkx-proposals.ts` defines canonical immutable records in the YAML
1.2 JSON subset:

```text
.gkx/proposals/<proposal-id>.yaml
.gkx/decisions/<decision-id>.yaml
```

A proposal binds its schema/contract, credential-bound producer, target UID
and normalized path, source-byte SHA-256, field and canonical value,
confidence in `0.0..1.0`, bounded evidence, creation operation, provenance,
pending status, and content hash. Equivalent retries preserve the first
creation bytes. Conflicts are computed as a projection; proposal files are not
rewritten.

A decision is a separate accepted, rejected, or deferred record. It binds the
proposal ID/content hash, source path/hash, credential-bound human actor,
operation, creation time, and plan/reviewed-value hashes where applicable.
Reviewer secrets remain in Obsidian Secret Storage; only a stable derived
credential ID/hash enters the record. Secret Storage absence blocks decision
persistence and apply.

Before any decision or source write, every reviewed plan item must match
exactly one canonical proposal by operation, target, source hash, field, and
canonical value. Zero or multiple matches block the complete batch. Decision
persistence uses a same-directory temporary file, read-back verification,
rename, and post-rename verification with idempotency and collision/tamper
failure. Obsidian's adapter does not expose an fsync primitive, so no stronger
fsync guarantee is claimed.

Accepted decisions are persisted after explicit acknowledgements and before
the established guarded apply. Backups, fresh source-hash checks, apply output,
and result receipts remain separate. Rejected/deferred decision-only actions
do not write source notes. Confidence is limited to review ordering, filtering,
and candidate selection; autoapproval is absent.

No standalone `POST /proposals` runtime is implemented here.

## Operational corpus exclusions

`src/plugin/corpus-exclusions.ts` removes these operational roots before graph
or context construction:

```text
.gkx/**
_archive/moc-runs/**
```

The same exclusion intent is used by Navigation and Effects event coalescing.
Proposal, decision, policy/state, diagnostic, journal, receipt, and managed-MOC
archive material must not become Navigation input, graph/Graphiti content,
retrieval input, or agent context.

## Navigation Effects development state

Navigation 1.0 remains source-content read-only and must continue to advertise
no MOC apply capability. The Effects plane is separate and experimental.

Implemented primitives under `src/navigation-effects/` include:

- additive schema-v1 settings migration with all writes off by default;
- exact policy-reference and digest validation;
- credential-bound authority-grant validation that does not infer authority
  from connectivity;
- capability/status separation for planner, adapter, policy, authority,
  journal, lease, recovery, reconciliation, ownership, and enablement;
- bounded stable-identity event coalescing with a 750 ms default quiet period
  and 3,000 ms maximum batch delay;
- persisted reconciliation-intent modeling and fail-closed snapshot
  classification; and
- self-write suppression only when effect ID, path, committed digest, and index
  generation match a completed receipt. There is no timing-only suppression.

The following are not integrated and qualified in this branch:

- immutable Engine 2.2 release artifact and final adapter pin;
- Obsidian and native Effects host adapters;
- digest-bound MOC ownership/adoption registry and UI;
- durable journal, checkpoint, archive, receipt, lease, and startup recovery
  runtime;
- authoritative per-vault coordinator and complete affected-scope planner;
- managed-MOC apply, rollback, and operator audit UI;
- crash matrix, cross-host parity, scale evidence, and 24-hour soak.

Consequently automatic maintenance and creation remain unavailable and off.
Existing MOCs remain unmanaged. Planner reachability is not write authority.

## Desktop shell and portable staging

`src-tauri/` contains a Tauri 2 internal-alpha shell. It embeds the generated
viewer, selects a corpus directory, owns application-state lifecycle, and
offers a narrow IPC bridge so the viewer credential is not placed in a URL or
sidecar process argument. The bundle configuration is intentionally inactive;
this source tree is not a signed installer.

`scripts/package-release.mjs --portable` can stage a target only when a real
sidecar binary is explicitly supplied. It emits build metadata, SHA-256 sums,
and SPDX 2.3 SBOM material, and labels output `internal-alpha`. Missing Debian
x64, Windows x64, macOS arm64, or macOS x64 sidecars are recorded as blockers.
The repository does not relabel binaries across architectures.

Outstanding release work includes native installers, signing, notarization,
clean-machine target tests, and owner-authorized version/release decisions.

## Security and authority boundaries

- GKX source files remain canonical; graphs, layouts, heat, replay, and
  Graphiti are projections.
- Loopback is the only service destination accepted by the standalone client.
- Bearer tokens are never accepted from the URL.
- Capability, configuration, authorization, enablement, qualification, and
  release state remain independent.
- MCP identity, token possession, client name, confidence, and timestamps do
  not grant write authority.
- Proposed values remain non-effective without a separate human decision and
  guarded apply.
- Operational sidecars and archives are excluded from semantic inputs.
- Navigation Effects settings fail closed and never silently enable writes.
- Missing adapters, recovery, reconciliation, policy, authority, ownership, or
  durability state block managed-MOC writes.

See [SECURITY.md](SECURITY.md) and
[docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) for the broader trust model.

## Build and verification

Supported development engines are declared in `package.json`: Node.js 22–24
and npm 10 or newer.

```bash
npm ci
npm run typecheck
npm run build
npm test
npm run verify
```

Renderer qualification commands:

```bash
npm run test:browser
npm run test:visual
npm run test:renderer
```

Focused validation is represented by repository tests for API-feed framing,
observability/replay, corpus exclusions, immutable proposal/decision behavior,
Navigation Effects settings/coordination, desktop-shell boundaries, and
portable staging. `npm run verify` also checks versions, lock integrity,
generated artifacts, invariants, and renderer provenance.

Do not preserve a historical test total as an evergreen claim. Qualification
evidence must record the exact command, commit, platform, failures, and skips.
The current Phase 0 evidence is in
[docs/standalone/BASELINE.md](docs/standalone/BASELINE.md); it is baseline
evidence, not release qualification. Current focused evidence and unresolved
gates are tracked in the
[draft qualification ledger](docs/standalone/QUALIFICATION.md).

## Repository map

| Path | Responsibility |
|---|---|
| `src/renderer/` | Cosmology, layout, shaders, controls, agent trails, and heat rendering |
| `src/standalone/` | Folder/snapshot ingestion, local-service client, observability, replay, and standalone UI |
| `src/plugin/` | Obsidian lifecycle, Agent API compatibility surface, enrichment, proposals/decisions, guarded apply, and sync |
| `src/navigation-effects/` | Fail-closed Effects settings and coordination primitives; not a complete write runtime |
| `src-tauri/` | Internal-alpha desktop shell source |
| `scripts/` | Deterministic builds, artifact checks, and release staging |
| `test/` | Unit, integration, protocol, security, and browser fixtures |
| `docs/` | Architecture, contracts, threat model, migration, and release guidance |

## Related technical documents

- [Architecture](docs/ARCHITECTURE.md)
- [Standalone engine design](docs/STANDALONE-GKX-ENGINE-DESIGN.md)
- [Renderer host protocol](docs/RENDERER-PROTOCOL.md)
- [GKX enrichment](docs/GKX-ENRICHMENT.md)
- [GKX 2.3 profile](docs/GKX-2.3-PROFILE.md)
- [GKX migration workflow](docs/GKX-MIGRATION.md)
- [Existing Obsidian Agent API](AGENT-API.md)
- [Engine 2.1 compatibility](docs/ENGINE-2.1-COMPATIBILITY.md)
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
