# Kosmos Oden capability inventory

Version 0.8.1. Source wiring reviewed on 2026-09-05.

This inventory follows real entry points: visible controls, registered
Obsidian commands and events, HTTP routes, MCP tools, and executable scripts.
An exported helper or passing isolated test does not count as a product feature
unless the host calls it.

**Wired** means that an entry point reaches an implementation. It does not
mean that a user has enabled it, that an external service is available, or
that every real host has been tested. The final merge and test evidence belong
in the [build review](assessments/2026-09-05-build-review.md).

## Browser viewer

These features run in the built `kosmos-oden-stand-alone.html`.

| Capability | How it is reached | Conditions and effects |
| --- | --- | --- |
| Open a local knowledge folder | Open Knowledge Folder | Requires browser directory access. Reads notes and attachment metadata. |
| Import a folder snapshot | Open Folder Snapshot | File input fallback. Imports current files without continued access. |
| Remember and reopen a folder | Reopen Last Folder | Stores a browser directory handle when supported. Permission may need renewal. |
| Rescan a folder | Rescan Now; periodic, focus and visibility events | Persistent folders only. Computes changes and updates the index. |
| Pause and resume monitoring | Status panel controls | Persistent folders only. Paused or stopped scans cannot publish late callbacks. |
| Forget the stored folder | Forget Folder | Removes the remembered handle and stops monitoring. Does not delete the folder. |
| Switch source | Open Another Folder | Reloads the page and returns to source selection. |
| Explore sample data | Load Demo | Uses the bundled sample corpus and stops an old monitor. |
| Load a prepared graph | Sibling `graph.json` on HTTP(S) startup | Automatic same origin graph fetch. This path is not attempted from `file://`. |
| Export the displayed graph | Export Graph JSON | Downloads graph data for the active folder, demo, prepared graph, or service. Retains attachment paths. |
| Export Graphiti episodes | Export Graphiti Episodes | Available for a local folder or folder snapshot, where note bodies are available. Downloads JSON. |
| Inspect source status | Kosmos Status | Source, mode, scan time, counts, unresolved links, lineage, overlaps, and connection state. Panel can be collapsed. |
| See and dismiss errors | Error alerts | Shows import, permission, connection, recording and replay errors. |

Entry points: [standalone host](../src/standalone/standalone.ts),
[controls](../src/standalone/ui.ts),
[directory sources](../src/standalone/directory-source.ts),
[monitor](../src/standalone/directory-monitor.ts), and
[handle persistence](../src/standalone/persistence.ts).

## Shared map and navigation

The browser viewer and Obsidian embed use the same renderer and Engine graph.

| Capability | How it is reached | Conditions and effects |
| --- | --- | --- |
| Folder and note cosmology | Loading a graph | Galaxies, stars, planets, moons, asteroids, attachment objects, and connection lines. |
| Orbit and zoom | Pointer drag, wheel, touch and pinch | Camera movement without source changes. |
| Overview, Focus, Depth and Fly | Mode buttons and keyboard controls | Alternate camera modes; Fly also has touch controls. |
| Inspect a selected body | Select a body | Shows its name, path, available metadata and connected notes. |
| Search | Search field | Filters the visible graph by its indexed text fields. |
| Filter the map | Filters panel | Area, tag, type, status, and unresolved node controls. |
| Show labels, links and objects | Labels, All links, All objects | Changes visual visibility. |
| Clear selection and reset view | Clear | Clears focus and returns to Overview. |
| Show the key and minimap | Key | Displays the legend and minimap. |
| Navigate using the minimap | Click, wheel, drag and double click | Recenter, zoom, pan, and reset its view. |
| View temporal validity | Chrono and its slider | Shows note validity from retained GKX dates and lineage. Does not recover historical file bytes. |
| Replay graph growth | Grow | Animation from available graph dates and event data. |
| Run a camera tour | Trailer | Automated camera presentation of the current graph. |
| Switch interface language | EN/DE button | English and German renderer labels. Standalone and plugin settings copy is not fully localized by this toggle. |
| Display agent traversal | Host traversal messages or authorized service events | Distinct trails, breadcrumbs and bounded particles; stable identity is separate from the display name. |
| Suspend and recover rendering | Visibility and WebGL context events | Pauses hidden rendering, handles resize, and rebuilds after context restoration. |

Entry points: [renderer](../src/renderer/renderer.ts),
[body controls](../src/renderer/kosmos-body.html),
[layout](../src/renderer/layout.ts), and
[embed](../src/plugin/embed.ts).

## Browser traffic, recording, and local service

These controls are wired in the standalone host. The service is an external
dependency. The Obsidian Agent API is a separate service with a different
contract and normally a different port.

| Capability | How it is reached | Conditions and effects |
| --- | --- | --- |
| Connect to a compatible local Engine | Connect to Local Engine; address and token fields | Requires a service implementing the draft contract. Health and capability negotiation precede graph acceptance. |
| Receive a desktop credential | Desktop IPC during startup with `?api=` | Requires the native wrapper and a ready credential. The token is not placed in the URL. |
| Refresh a service graph | Refresh Graph | Fetches a new graph from the selected service. |
| Check service connectivity | Periodic health probe | Updates connection status. A healthy service does not imply every capability is enabled. |
| Receive live traversal events | Authorized events capability after connection | Authenticated fetch stream with reconnect and sequence resume. |
| Highlight recent visits | Traffic Heatmap | Off by default. Shows visits, not quality, truth, cost or authority. |
| Start and stop recording | Start recording; Stop recording | Requires an enabled and authorized service event capability. Stores events in memory. |
| Export a recording | Export session | Explicit JSON download. Bounded to 5,000 events or 2,000,000 bytes. |
| Import a replay | Load replay | Validates file size, metadata and event shape before retention. No live service is required to load a file. |
| Control replay | Play, Pause, Restart, Stop, slider and speed selector | Supports seeking and 1x, 2x and 5x playback. |
| Return from replay | Return live; Stay paused | Live events buffer during replay; the user chooses when to return. |

Service requests accept loopback addresses only, use bearer credentials,
disable caching, and reject redirects. URL tokens are ignored and removed.
The full service lifecycle has not been qualified against a real bundled
runtime in this repository.

Entry points: [service client](../src/standalone/api-feed.ts),
[host handlers](../src/standalone/standalone.ts), and
[recording and replay](../src/standalone/observability.ts).

## Obsidian host and note workflows

These are actual plugin registrations and workflow callbacks. Real Obsidian
host qualification is a separate step from the existing mocks and browser
embed tests.

| Capability | How it is reached | Conditions and effects |
| --- | --- | --- |
| Open the map in Obsidian | Ribbon icon; Open Vault Kosmos command | Registers and opens the plugin view. |
| Follow vault changes | Create, modify, delete, rename and metadata events | Incremental indexing and renderer deltas, with batching and deferred updates for hidden views. |
| Open a note from the map | Note context action | Opens a note in a new Obsidian tab. Requires the plugin host. |
| Reveal a folder | Folder context action | Uses the Obsidian file explorer when that host API is available. |
| Show vault connectivity | Periodic adapter probe | Updates the view's connectivity indicator. |
| Select Engine Navigation centers | Enable Engine Navigation centers setting | Uses canonical existing centers and reports legacy names. Does not create or maintain MOCs. View refresh or reopen is required after changing the setting. |
| Maintain note timestamps | Timestamp setting and create/modify events | Writes configured timestamp fields when enabled; UTC or explicit local offset. Preserves existing creation timestamps. |
| Exclude files from GKX workflows | Developer preset and custom exclusions | Changes scan eligibility. Operational namespaces are excluded separately. |
| Audit and repair formatting | Scan and repair human editable GKX formatting | Opens a scan and review workflow with preview and backup gates. |
| Convert to editable GKX 2.2 | Convert recoverable notes command | Explicit preview and guarded source changes. |
| Convert to native GKX 2.3 | Convert recoverable notes command | Separate explicit preview and guarded source changes. |
| Review blocked or malformed notes | Migration workflow review controls | Shows findings and supported repair choices; unresolved cases remain blocked. |
| Propose labels and relationships | Re scan editable GKX notes | Deterministic proposal generation for eligible notes. Does not automatically apply proposals. |
| Use a model for enrichment | Second pass provider settings and workflow | Requires a configured local, LAN, or cloud endpoint and applicable disclosure approval. Environment variable holds the API key name; per run caps and timeouts apply. |
| Review proposals by confidence | Enrichment review controls | Sort, filter, select, inspect, edit, accept, reject or defer. Confidence itself grants no approval. |
| Save immutable proposals | Enrichment workflow save path | Writes proposal sidecars, not source note changes. |
| Record human decisions | Reviewed decision controls | Requires bound reviewer identity and Obsidian Secret Storage. Persists separate immutable decisions. |
| Apply accepted enrichment | Governed apply preview and acknowledgements | Rechecks hashes, backs up, applies reviewed changes, and writes separate results. |
| Export Graphiti data and sample code | Export Graphiti episodes command | Writes episodes, ingestion profile and a sample Python script into the vault. Does not run an ingestion service automatically. |
| Write an Agent API guide | Registered command or settings button | Writes `AGENT-API.md` into the vault with configured address and token. This file contains credentials. |

Entry points: [plugin registration](../src/plugin/main.ts),
[settings](../src/plugin/settings.ts),
[migration](../src/plugin/gkx-migration.ts),
[blocked review](../src/plugin/gkx-blocked-review.ts),
[enrichment](../src/plugin/gkx-enrichment.ts), and
[reviewed apply](../src/plugin/gkx-enrichment-apply.ts).

## Obsidian Agent API and connection setup

The server is wired on desktop Obsidian. It is disabled by default and normally
uses port 4816. Mobile Obsidian cannot start this Node HTTP server.

Settings wire server start and restart, port selection, loopback or LAN binding,
token regeneration, authentication, default sensitivity, and the read
sensitivity ceiling. LAN requires authentication. Query token authentication
is a deprecated explicit setting and is rejected in LAN mode.

The following MCP tools are registered and dispatched:

| Tool | Function |
| --- | --- |
| `vault_overview` | Read vault summary and graph statistics. |
| `search_notes` | Search allowed notes, with bounded filters and results. |
| `get_note` | Read an allowed note and its metadata. |
| `get_lineage` | Read its canonical version chain. |
| `get_related` | Read relationships, outgoing links and backlinks. |
| `graph_at_time` | Read a temporal validity projection. |
| `export_graphiti_episodes` | Read a page of chronological export episodes. |
| `graphiti_ingestion_status` | Report export readiness and the external verification boundary. |
| `get_gkx_note` | Read the structured GKX projection. |
| `get_assessment` | Read a deterministic note assessment. |
| `get_diagnostics` | Read note validation diagnostics. |
| `get_effective_labels` | Read labels with origin separation. |
| `get_evidence` | Read supporting and contradicting evidence declarations. |
| `get_relationships` | Read typed relationships with origin separation. |
| `get_policy` | Read the bundled assessment policy. |
| `validate_note` | Validate a note in memory. |
| `assess_note` | Calculate or read an in memory assessment. |
| `assess_vault` | Read a bounded vault assessment summary. |

REST entry points include `/health`, `/overview`, `/diagnostics`, `/graph`,
`/notes`, `/note`, `/lineage`, `/related`, `/at`, `/episodes`, `/gkx/note`,
`/gkx/assessment`, `/gkx/diagnostics`, `/gkx/labels`, `/gkx/evidence`,
`/gkx/relationships`, `/gkx/validate`, `/gkx/policy`, `/gkx/assess-vault`, and
`/graphiti/status`. `/mcp` handles protocol and session lifecycle. Compatibility
aliases remain documented in the [Agent API guide](../AGENT-API.md).

Sensitivity filtering, host and origin validation, request and result limits,
rate limits, session validation, and traversal callbacks are wired in the
server. These routes and tools do not expose source writes or proposal approval.

Quick Connect has working copy controls for MCP HTTP commands, project JSON,
Codex configuration, bundled stdio bridge configuration, universal connection
details, and cURL checks. It generates connection material; it does not install
or configure those external applications automatically.

Entry points: [server and tool dispatcher](../src/plugin/agent-server.ts),
[vault data provider](../src/plugin/vault-provider.ts),
[settings](../src/plugin/settings.ts), and
[stdio bridge](../kosmos-mcp-stdio.mjs).

## Nextcloud synchronization

| Capability | How it is reached | Conditions and effects |
| --- | --- | --- |
| Store connection settings and credentials | Sync settings panel | URL, username, remote folder and password. Password uses Secret Storage. |
| Test a connection | Test connection | Reads the configured WebDAV endpoint. |
| Run a manual sync | Sync now; registered command | Requires configuration and credentials. Can run even when scheduled sync is disabled. Writes local or remote files according to the sync plan. |
| Sync after startup | Sync on startup and enabled setting | Runs after the workspace is ready. |
| Run scheduled sync | Enabled setting and interval | Registers periodic runs. Overlapping runs are refused. |
| Preserve conflicts | Three way sync planning and conditional transfers | Treats incompatible concurrent changes as conflicts. |
| Propagate deletions | Explicit deletion setting | Off by default. Enables deletion behavior subject to conflict handling. |
| Include Obsidian configuration | Separate `.obsidian` setting | Off by default. Other path and operational exclusions still apply. |

This is one Nextcloud target. Settings for S3, Dropbox, OneDrive, Google Drive,
and simultaneous providers are disabled placeholders, not working connectors.

Entry points: [sync host](../src/plugin/nextcloud-sync.ts),
[planner](../src/plugin/nextcloud-sync-core.ts),
[registration](../src/plugin/main.ts), and
[settings](../src/plugin/settings.ts).

## Command line and desktop development tools

`kosmos-build.mjs` scans a folder and writes graph JSON. Its `--episodes`
option writes Graphiti episodes, `--group-id` selects their namespace, and
`--watch` rebuilds outputs after filesystem changes. The command requires the
built core. Output paths are explicit filesystem writes.

The build scripts generate plugin, browser, and test artifacts. The ordinary
release script stages files, provenance and checksums. The portable staging
path requires supplied service binaries and reports missing targets. These
scripts are wired development tools, not an installer or automatic updater.

The native source shell wires corpus selection, service start, stop, reconnect,
status, credential IPC, and redacted diagnostic export through Tauri commands
and the generated browser bridge. Those actions require a built native host;
service actions also require a real compatible sidecar. Source wiring has been
examined and Rust tests exist, but a complete native application session and
distribution have not been qualified. Do not count the external service as a
bundled working feature.

Entry points: [graph CLI](../kosmos-build.mjs),
[build](../scripts/build.mjs),
[packaging](../scripts/package-release.mjs),
[desktop bridge](../scripts/prepare-desktop.mjs), and
[native commands](../src-tauri/src/lib.rs).

## Present in source but not wired as working product actions

* Automatic MOC creation or maintenance.
* A complete Navigation Effects coordinator or affected scope execution loop.
* Executable Obsidian or native Effects adapters. Their descriptors report
  operations unavailable.
* Durable adoption storage and a registered adoption preview action. The
  preview component and injected test store are not runtime registration.
* Integrated Effects journal, archive, lease, rollback and startup recovery.
* Standalone HTTP proposal ingress or an agent approval endpoint.
* A bundled unified service, finished native installers, automatic updates,
  signing, notarization or a Rust Engine cutover.
* Automatic Graphiti database ingestion, combined extraction execution, or
  measured provider cost and quality telemetry. The exported example script
  requires its own runtime and credentials.
* S3, Dropbox, OneDrive, Google Drive, or simultaneous provider synchronization.

The Effects settings do migrate and persist through plugin settings. The
additional validators and coordination helpers are real source code, but their
presence does not turn the actions above into working features.
