# Kosmos-Oden — v0.8.0

Turn a folder of Markdown notes into a universe you can explore.

Kosmos-Oden maps top-level folders to galaxies, connected notes to stars and
planets, loose notes to asteroids, and attachments to an outer Oort cloud. It
is a playful visual projection of your files: your Markdown remains the source
of truth, and ordinary viewing does not rewrite it.

Version 0.8.0 uses the released, exact-pinned GKOS-Engine v2.1.1 semantic core.
The offline viewer and Obsidian plugin are the supported product surfaces in
this repository. An optional client for a separately run authenticated local
service is included, but the service itself is not bundled or released here.

![A Kosmos-Oden vault rendered as a navigable night sky](docs/assets/kosmos-oden-night-sky.png)

## Choose your launchpad

### Open the standalone sky

`kosmos-oden-stand-alone.html` is one offline file containing the viewer,
renderer, and browser graph path. It does not require Obsidian, Node.js, a web
server, or an internet connection.

1. Open `kosmos-oden-stand-alone.html` in a current browser.
2. Choose **Open Knowledge Folder**.
3. Select the root of a Markdown folder or Obsidian vault.

Chromium-based browsers can grant a reusable directory handle and rescan while
the page remains open. Other current browsers can import a one-time folder
snapshot. Both modes are read-only and clearly report whether live rescanning
is available.

### Fly from Obsidian

For a source installation, copy `manifest.json`, `main.js`, and `styles.css`
into `<vault>/.obsidian/plugins/vault-kosmos/`, enable the plugin, and run
**Open Vault Kosmos**. The view follows Obsidian vault events and uses the same
cosmology and renderer as the standalone page.

See [the community-plugin guide](docs/COMMUNITY-PLUGIN.md) for the established
packaging workflow.

## What is in the sky

- Top-level folders become galaxies.
- Connected notes form stars, planets, moons, and visible relationships.
- Loose notes become asteroids; attachments form a distant Oort cloud.
- Canonical GKX lineage and the Chrono view reveal the graph at selected
  validity times.
- Named agents retain stable, distinct trail colors when authorized traversal
  events are available.
- The optional **Traffic Heatmap** brightens recently visited nodes. It is off
  by default and measures recent visits only—not truth, quality, importance,
  fuel, cost, confidence, or authority.
- Explicit traversal-session recording and replay supports play, pause, seek,
  restart, stop, and 1x/2x/5x speeds.
- Graph and Graphiti exports are built in memory and downloaded only when you
  ask for them.
- The Obsidian plugin can optionally synchronize through Nextcloud WebDAV.

Drag to orbit, scroll or pinch to zoom, and select a body to focus its
neighbors. Overview, Focus, Depth, and Fly modes offer different ways to move
through the cluster; Chrono lets you scrub the graph through recorded GKX
validity times.

## Recent visits and replay

The Traffic Heatmap is observability, not assessment. Authorized traversal
events increase a bounded per-node score which fades using elapsed monotonic
time. The overlay blends with existing node colors and does not replace the
stable colors used for individual agent trails.

Recording is an explicit, in-memory action. A session contains validated,
redacted traversal envelopes rather than rendered frames and stops at 5,000
events or 2 MB, whichever comes first. Nothing is persisted automatically;
**Export session** is the deliberate download boundary. Replayed events are
visually marked and do not write back into the live recording. Live events can
remain buffered while replay is active.

## Optional local service connection

The standalone page includes a read-only client for a compatible local GKOS
service. The client can negotiate capabilities, retrieve an authorized graph,
and receive authorized traversal events over an authenticated `fetch()`
stream. It accepts only loopback destinations such as `127.0.0.1`, `localhost`,
or `::1`.

The non-secret service address may be supplied as
`?api=http://127.0.0.1:4814`. Credentials must be entered in the password field;
they are not accepted from the URL. A viewer credential is not an MCP agent
identity and grants no write authority.

This repository does not ship an out-of-box service package. The separately
developed `GKOS-LOCAL-SERVICE-1.0.0-draft.2` runtime is not bundled, activated,
or released with Kosmos-Oden 0.8.0. Client source and a draft runtime becoming
reachable in development do not establish packaged compatibility, production
qualification, or release status. Offline folder and snapshot modes continue
to work without any service.

## Navigation stays read-only

Optional Engine 2.1 Navigation changes which existing note is selected as a
visual MOC center. It does not create, rename, rewrite, archive, or delete a
note and continues to report that MOC apply is unavailable. It is off on
upgrade, preserving the earlier visual-name heuristic until enabled.

With Navigation enabled, the built-in MOC names are exactly `index`, `_index`,
`readme`, `moc`, and `contents`. Former aliases such as `home`, `map`, and
`overview` are surfaced as noncanonical findings rather than silently
promoted.

## Roadmap, not current product behavior

The following work is intentionally not implemented or merged into this
approved main scope:

- immutable proposal and decision sidecars and confidence-assisted review;
- Navigation Effects, managed-MOC adoption, writing, journaling, recovery,
  rollback, and automatic maintenance;
- Tauri, portable-alpha, native desktop, Docker, or cross-platform installer
  packaging;
- artifact signing, macOS notarization, publishing, or a new release label;
- the Rust 3.0 engine cutover.

These are roadmap items, not hidden settings or dormant authority. Their
absence must not be interpreted as an invitation to infer write authority from
a token, an MCP connection, confidence, or client identity.

## Obsidian Agent API and sync

The established Obsidian-hosted Agent API remains an optional compatibility
surface on loopback port 4816. Its REST and MCP query tools are read-only. Each
client must follow the documented authentication and lifecycle requirements;
see [Agent API](AGENT-API.md).

Nextcloud WebDAV synchronization is separately configured in the Obsidian
plugin. Credentials use Obsidian Secret Storage, deletion propagation defaults
off, and conflicting remote bytes are preserved rather than silently
overwriting a local file.

## Build and verify from source

Requirements: Node.js 22–24 and npm 10 or newer.

```bash
npm ci
npm run verify
npm run test:renderer
```

Useful focused commands:

```bash
npm run build:standalone
npm run test:browser
npm run test:visual
npm run check:artifacts
npm run check:renderer-provenance
```

Test totals are not treated as permanent documentation. Evidence should always
record the exact command, commit, platform, failures, and documented skips.

## Technical map

- [Technical README](TECHNICAL_README.md)—architecture, service-client
  boundary, observability details, and verification
- [Architecture](docs/ARCHITECTURE.md)—the established module map
- [Renderer protocol](docs/RENDERER-PROTOCOL.md)—the Obsidian host/viewer
  message contract
- [GKOS-Engine 2.1 compatibility](docs/ENGINE-2.1-COMPATIBILITY.md)—the exact
  released dependency and Navigation boundary
- [GKX 2.3 profile](docs/GKX-2.3-PROFILE.md)—validating projection behavior
- [Security policy](SECURITY.md) and [threat model](docs/THREAT-MODEL.md)
- [Release process](docs/RELEASE-PROCESS.md)—the gates for an authorized release

## Origin and licensing

Kosmos-Oden is an independent fork and substantial rebuild of
[H4R7W16/vault-kosmos](https://github.com/H4R7W16/vault-kosmos). See
[ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md) and
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for provenance and bundled
dependency notices.

Project-authored software is Apache-2.0. Project-authored documentation and
original graphics are CC BY 4.0 where declared. Inherited and third-party
assets keep their own licenses. [LICENSE](LICENSE) contains the controlling
licensing structure.
