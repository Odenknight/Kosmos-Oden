# Kosmos-Oden Technical README

## Scope and release status

This document describes the approved Kosmos-Oden 0.8.0 main scope plus the
read-only viewer observability changes prepared for integration. It separates
code availability from configuration, qualification, and release.

The product remains version 0.8.0 and consumes the released, exact-pinned
`gkos-engine#v2.1.1`. Nothing in this document changes a version, publishes an
artifact, activates write authority, or claims production qualification for a
separately developed service.

| Area | Current repository scope | Activation | Release statement |
|---|---|---|---|
| Offline Local Cluster | Single-file viewer, folder picker, snapshot fallback, shared graph and renderer | User selects a folder or snapshot | Part of Kosmos-Oden 0.8.0 |
| Obsidian plugin | Live vault adapter, renderer host, read-only Agent API, explicit existing write workflows, optional WebDAV sync | Installed and configured by the user | Part of Kosmos-Oden 0.8.0 |
| Local service client | Loopback validation, bearer-auth graph fetch, capability negotiation, authenticated traversal stream | Requires a separately running compatible service and viewer credential | Client only; no standalone service package is bundled or released |
| Traffic and replay | Stable agent trails, bounded recent-visit scalar, explicit recorder/export/import, deterministic replay | Heat and recording are off until selected | Approved integration scope; no new version or release claim |

Roadmap-only work is listed separately below. Source or contracts in another
branch or repository do not make that work part of this main scope.

## Architecture

```text
Markdown / GKX corpus
        |
        v
exact-pinned GKOS-Engine v2.1.1
 parsing | resolution | lineage | temporal projection | graph | Navigation 1.0
        |
        +----------------------+----------------------+------------------+
        |                      |                      |                  |
        v                      v                      v                  v
Obsidian host          standalone HTML       Agent API 4816      build/CLI tools
vault events           folder/snapshot       REST + MCP           graph exports
        |                      |
        +----------> shared Local Cluster renderer <----------+
                     cosmology/layout/shaders/controls

Optional external boundary:
compatible loopback service -> /health /capabilities /graph /events
                                  |
                                  v
                         standalone service client
```

GKOS-Engine owns parsing, validation, canonicalization, lineage, temporal
projection, graph semantics, and Navigation contracts. Kosmos owns host
integration, visual layout, shaders, controls, and local interaction. The
renderer consumes a graph; it does not introduce a second GKX parser or graph
meaning.

## Version and dependency boundary

The package and lockfile pin `gkos-engine#v2.1.1`; the resolved Engine version
is 2.1.1. See
[Engine 2.1 compatibility](docs/ENGINE-2.1-COMPATIBILITY.md) for the resolved
commit and consumer gates.

The TypeScript Engine 2.1 line remains the active semantic dependency. Rust
3.0 is a future cutover candidate, not a selected runtime. No Engine 2.2 or
Navigation Effects dependency is present in this approved scope.

## Offline standalone viewer

`scripts/build.mjs` produces `kosmos-oden-stand-alone.html` as one offline
file. It embeds exact-pinned Three.js and the browser graph path.
`src/standalone/directory-source.ts` provides:

- persistent directory selection where the browser supports the File System
  Access API; and
- one-time folder snapshot import as the portable fallback.

The page works from `file://` without a local server. Folder and snapshot modes
make no service request unless the operator explicitly chooses a local-engine
connection. The directory reader does not rename, delete, rewrite, normalize,
or move source files. Graph and Graphiti downloads are generated in memory.

The Obsidian plugin embeds the same generated renderer. Host/view messages use
the closed, versioned contract in
[the renderer protocol](docs/RENDERER-PROTOCOL.md).

## Optional local service client

`src/standalone/api-feed.ts` is a client adapter, not a service implementation.
It implements four important boundaries:

1. normalize and accept only HTTP(S) loopback service addresses;
2. keep the non-secret `api` address separate from the bearer credential;
3. negotiate a closed capability document before accepting graph data; and
4. receive traversal events with authenticated `fetch()` streaming rather
   than placing credentials in an `EventSource` URL.

### Authentication and addressing

Accepted hosts are `127.0.0.1`, `localhost`, and `::1`. The optional `api`
query parameter can contain a loopback address. Token query parsing is absent;
the password field supplies the in-memory bearer credential. Requests use
`Authorization: Bearer ...` and `cache: no-store`.

The viewer credential is only a credential for authorized viewer routes. It
does not become an MCP agent identity and never confers source-write,
proposal, approval, or MOC authority.

### Capability and protocol truth

The client accepts only the exact protocol shape it declares in source. The
separately developed Engine service has advanced to
`GKOS-LOCAL-SERVICE-1.0.0-draft.2`; that Draft.2 runtime is not contained in
this repository, not bundled in the standalone HTML, and not released with
Kosmos-Oden 0.8.0.

At this source coordinate, the client validator still names
`GKOS-LOCAL-SERVICE-1.0.0-draft.1` and fails closed on any other protocol
version. Draft.2 compatibility therefore requires a separately reviewed client
contract update and live integration evidence; documentation cannot bridge the
version boundary.

Consequently, client source availability is not an end-to-end compatibility
claim. The exact client and runtime revisions must agree on the versioned
contract and pass live integration gates before anyone describes the service
path as packaged or production-qualified. Service absence leaves offline
folder and snapshot modes available.

Capability state is evaluated rather than inferred from connectivity. A graph
is accepted only when its advertised capability is available, configured,
authorized, and enabled. The UI reports graph connection, MCP availability,
event-stream connection, and offline folder mode separately. Displaying MCP
availability does not turn the viewer into an MCP server.

### Traversal stream

The event client requires `text/event-stream; charset=utf-8`, one traversal
event per frame, a nonnegative safe-integer sequence, and a closed event
envelope. It reconnects with bounded backoff and sends `Last-Event-ID` after a
validated sequence.

The normalized envelope includes session, sequence, monotonic offset,
operation, agent, tool, authorized paths, status, and nullable `cost_units`.
Events with malformed, absolute, traversing, encoded, non-NFC, or
portability-hazard paths are rejected. The envelope contains no note bodies,
prompts, bearer tokens, credentials, or raw server errors.

`cost_units: null` means no metering data exists. The Traffic Heatmap never
reinterprets traffic as fuel, price, efficiency, or cost.

## Renderer observability

### Stable agent trails

Traversal events call the existing renderer traversal API. Stable agent labels
produce stable colors across trails, dust, rockets, and labels. Per-agent
buffers prevent a line segment from connecting two different agents. Replay
events are visibly labelled as replay.

### Traffic Heatmap

`src/standalone/observability.ts` maintains a bounded per-node recent-visit
score. Updates come only from validated traversal events. Exponential decay is
based on an injected monotonic clock rather than frame count. The default
half-life is 15 seconds, the hard horizon is 120 seconds, and the map is
bounded to 10,000 node entries.

The renderer uploads the score through the `aHeat` instanced scalar and blends
it in the existing material path, preserving canonical node and agent colors.
The overlay is off by default. Its label states that it measures recent visits
only.

### Session recording and replay

`TraversalSessionRecorder` is explicit and in-memory only. It retains a closed,
validated event envelope and bounded metadata. Limits are:

- 5,000 events; and
- 2,000,000 encoded bytes.

The first reached limit stops recording and marks the export truncated. The
viewer persists nothing automatically; export is an explicit browser download.
Import checks the byte cap before parsing and validates the complete session
again before retaining events.

`TraversalReplay` orders events by sequence and then monotonic offset. It
supports play, pause, seek, restart, stop, and 1x/2x/5x speeds. Replayed events
do not enter the live recording. Live events remain in a separately bounded
buffer during replay and do not interrupt the displayed replay.

## Obsidian surfaces

The plugin supplies live vault events to the shared renderer. Its existing
loopback Agent API remains on port 4816 as a compatibility surface with
read-only REST and MCP query tools. That surface is distinct from the separate
standalone service draft.

Optional Nextcloud WebDAV synchronization is an explicit plugin write workflow
with its own credentials, conflict preservation, and exclusions. It is not
part of ordinary visualization or traversal observability.

## Navigation 1.0 boundary

Engine Navigation is optional and source-content read-only. Disabled mode
preserves the existing visual-name heuristic. Enabled mode delegates MOC
discovery to Engine 2.1.1 and uses `index`, `_index`, `readme`, `moc`, and
`contents` as built-ins.

Navigation can select an existing visual center and report findings. It cannot
create or modify a MOC, insert generated markers, archive content, apply a
write, or execute rollback. Capability reporting continues to advertise the
false apply boundary.

## Security boundaries

- GKX source files remain canonical; graph layouts, heat, replay, and Graphiti
  are projections.
- Ordinary folder/snapshot viewing is read-only.
- Local service destinations are loopback-only and bearer credentials are not
  accepted from URLs.
- Externally supplied graph and traversal data must pass closed validation
  before reaching the renderer.
- Traffic and replay never write source files or sidecars.
- Confidence, timestamps, connectivity, and bearer possession are not approval
  or write authority.
- Capability, configuration, authorization, qualification, and release remain
  separate states.

See [SECURITY.md](SECURITY.md) and
[the threat model](docs/THREAT-MODEL.md) for the broader trust analysis.

## Explicitly excluded roadmap

The following do not exist in this approved main scope and must not be
described as implemented, dormant, bundled, or released:

- immutable proposal quarantine, decision records, and confidence-assisted
  batch review;
- Navigation Effects settings or runtime, managed-MOC ownership/adoption,
  host adapters, writing, archives, journal, lease, receipts, reconciliation,
  recovery, rollback, or automatic maintenance;
- Tauri or another native desktop shell, portable release staging, Docker
  profiles, native sidecars, installers, or uninstall workflows;
- signing, notarization, an automatic updater, cross-platform release
  qualification, or a 0.85 release;
- an immutable Engine 2.2 dependency or Rust 3.0 cutover.

Any future implementation requires its own reviewed contracts, focused tests,
integration evidence, authority decisions, and release gates.

## Build and verification

Supported development runtimes are Node.js 22–24 and npm 10 or newer.

```bash
npm ci
npm run typecheck
npm run build
npm test
npm run verify
```

Renderer-focused commands are:

```bash
npm run test:browser
npm run test:visual
npm run test:renderer
npm run check:renderer-provenance
```

Relevant coverage includes API-feed address/auth/capability/event validation,
stable agent colors, cross-agent trail separation, fake-clock heat decay,
bounded session recording, deterministic replay, offline folder behavior, and
renderer provenance. Historical totals are evidence for their exact commit,
not evergreen pass-count claims.

## Repository map

| Path | Responsibility |
|---|---|
| `src/core/` | Kosmos host-facing graph compatibility code around the Engine dependency |
| `src/renderer/` | Cosmology, layout, shaders, controls, agent trails, and heat rendering |
| `src/standalone/` | Folder/snapshot input, optional local-service client, observability, replay, and UI |
| `src/plugin/` | Obsidian lifecycle, Agent API compatibility, explicit existing enrichment/apply workflows, and sync |
| `scripts/` | Deterministic builds and artifact/provenance checks |
| `test/` | Unit, integration, protocol, security, and browser fixtures |
| `docs/` | Architecture, profiles, threat model, compatibility, and release guidance |

## Related documents

- [Architecture](docs/ARCHITECTURE.md)
- [Renderer host protocol](docs/RENDERER-PROTOCOL.md)
- [Engine 2.1 compatibility](docs/ENGINE-2.1-COMPATIBILITY.md)
- [GKX 2.3 profile](docs/GKX-2.3-PROFILE.md)
- [Existing Obsidian Agent API](AGENT-API.md)
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
