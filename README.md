# Kosmos-Oden

Turn a folder of Markdown notes into a little universe you can explore.

Kosmos-Oden maps top-level folders to galaxies, connected notes to stars and
planets, loose notes to asteroids, and attachments to an outer Oort cloud. It
is a visual projection of your files: the sky is playful, but your Markdown
remains the source of truth.

> Development status: this branch is an internal-alpha uplift. The offline
> viewer and Obsidian plugin are usable from source, but the new standalone
> service, managed-MOC write plane, native installers, signing, notarization,
> and cross-platform release qualification are not complete. Package metadata
> still identifies version 0.8.0; no 0.85 release is claimed here.

![A Kosmos-Oden vault rendered as a navigable night sky](docs/assets/kosmos-oden-night-sky.png)

## Pick your launchpad

### Open the standalone sky

`kosmos-oden-stand-alone.html` is a single offline file with the renderer and
parser bundled inside it. It does not need Obsidian, Node.js, a web server, or
an internet connection.

1. Open `kosmos-oden-stand-alone.html` in a current browser.
2. Choose **Open Knowledge Folder**.
3. Select the root of your Markdown or Obsidian vault.

Chromium-based browsers can grant a reusable directory handle and rescan while
the page stays open. Other browsers can import a one-time folder snapshot. In
either mode the viewer reads the selected files; it does not rewrite them.

### Fly from Obsidian

For source builds, copy `manifest.json`, `main.js`, and `styles.css` into
`<vault>/.obsidian/plugins/vault-kosmos/`, enable the plugin, and run **Open
Vault Kosmos**. The view updates from Obsidian vault events and keeps the same
cosmology and renderer as the standalone page.

See [the community-plugin guide](docs/COMMUNITY-PLUGIN.md) for packaging and
release details. This uplift branch is not a published community-plugin
release.

## What you can explore

- Galaxies, stars, planets, moons, asteroids, and attachments derived from one
  shared GKOS-Engine graph.
- Canonical lineage and a Chrono view for seeing which note version was valid
  at a selected time.
- Stable, distinct trails for named agents when authorized traversal events
  are available.
- An optional **Traffic Heatmap** that brightens recently visited nodes. It is
  off by default and measures recent visits only—not truth, quality,
  importance, fuel, cost, or model confidence.
- Explicit traversal-session recording and replay at 1x, 2x, or 5x. A session
  contains redacted event envelopes, not rendered frames, and is bounded to
  5,000 events or 2 MB, whichever comes first. Recording is in memory and is
  never persisted unless you choose **Export session**.
- Offline graph and Graphiti exports built in memory.
- Optional, separately configured Nextcloud WebDAV sync in the Obsidian
  plugin. It is not part of ordinary read-only viewing.

Drag to orbit, scroll or pinch to zoom, and select a body to focus its
neighbors. The Overview, Focus, Depth, and Fly modes offer different ways to
move through the cluster; Chrono lets you scrub the graph through recorded GKX
validity times. The full source-onboarding paths for GKX notes and the existing
Obsidian Agent API remain documented below.

## Optional local Engine connection

The standalone viewer contains a client for a loopback-only local service. It
can negotiate capabilities, fetch an authorized graph, and consume traversal
events over an authenticated `fetch()` stream. The non-secret convenience URL
may contain `?api=http://127.0.0.1:4814`.

Credentials never belong in that URL. Query-token support has been removed
from the standalone client. Enter the viewer credential in the password field,
or let the internal-alpha desktop shell provide it through secure IPC. The
client refuses non-loopback addresses.

The matching unified Engine service is still on a separate draft Engine
integration branch. Its contract foundation is not the same thing as an
activated runtime. A live graph/MCP/event end-to-end connection is therefore
not claimed for this Kosmos branch yet. Offline folder and snapshot mode remain
available without it.

## Suggestions stay suggestions

Kosmos can help a reviewer sort and filter GKX enrichment candidates by
confidence, but confidence grants no authority and nothing is auto-approved.

When the optional review workflow is used:

- pending proposals are immutable records under `.gkx/proposals/`;
- accepted, rejected, or deferred human decisions are separate immutable
  records under `.gkx/decisions/`;
- a decision binds the proposal and reviewed plan by hashes;
- the local human reviewer identity is credential-bound through Obsidian
  Secret Storage, while the secret itself is never written to the decision;
- accepted changes still pass through the existing explicit acknowledgement,
  backup, source-hash recheck, guarded apply, and separate result receipt.

An agent cannot approve its own proposal. Proposal records do not modify a
source note, and proposed values do not become effective merely because they
exist. Details are in [GKX Content-Assisted Enrichment](docs/GKX-ENRICHMENT.md).

## Navigation and managed MOCs

Navigation 1.0 remains read-only. This branch also contains fail-closed
Navigation Effects settings, capability reporting, event debouncing,
reconciliation classification, and receipt-bound self-write-suppression
primitives. Every write setting—including automatic maintenance and automatic
creation—defaults to off.

Those primitives are development work, not a qualified managed-MOC runtime.
The full Engine adapter, Obsidian and native host adapters, digest-bound
adoption registry, durable journal/archive/lease, startup recovery controller,
coordinator, and operator UI are not integrated and qualified here. Existing
MOCs remain unmanaged, and this branch must not be described as automatically
maintaining them.

Operational state under `.gkx/**` and managed-MOC archives under
`_archive/moc-runs/**` are excluded from Navigation, corpus graphs, retrieval,
Graphiti, and agent context.

## Desktop and portable packages

A Tauri 2 shell and portable staging script exist in source for internal-alpha
work. They provide a secure IPC boundary and can stage checksums, provenance,
and an SPDX SBOM when real sidecar binaries are supplied.

They are not finished installers. The repository does not currently supply the
required signed Debian x64, Windows x64, macOS arm64, and macOS x64 sidecars;
native installers are not signed, macOS output is not notarized, and clean-host
cross-platform results are not recorded. Missing binaries stay reported as
missing rather than being fabricated or relabelled.

## What the status words mean

| Word | Meaning in this repository |
|---|---|
| **Implemented** | Source and focused tests exist. |
| **Configured** | Required host adapter, policy, credential, or runtime setting is present. |
| **Authorized** | A valid external human or policy decision permits the operation. Connectivity alone never does. |
| **Qualified** | The applicable security, crash, browser, platform, and performance gates have recorded evidence. |
| **Released** | An owner-authorized artifact is versioned, packaged, and published. |

These states are independent. “Implemented” does not mean configured,
authorized, qualified, or released.

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

Test totals are intentionally not advertised as permanent documentation; the
commands and exact commit are the evidence. See [CONTRIBUTING.md](CONTRIBUTING.md)
before changing renderer snapshots, protocol validation, security boundaries,
or generated artifacts.

## Technical map

- [Technical README](TECHNICAL_README.md)—current architecture, contracts,
  boundaries, implementation state, and verification commands
- [Architecture](docs/ARCHITECTURE.md)—the established module map
- [Standalone uplift baseline](docs/standalone/BASELINE.md)—recorded Phase 0
  repository and toolchain evidence
- [Draft qualification ledger](docs/standalone/QUALIFICATION.md)—implemented
  evidence and open release blockers
- [Threat model](docs/THREAT-MODEL.md) and [security policy](SECURITY.md)
- [Renderer protocol](docs/RENDERER-PROTOCOL.md)
- [GKX 2.3 validating projection profile](docs/GKX-2.3-PROFILE.md)
- [GKX authoring and migration](docs/GKX-AUTHORING-MIGRATION.md)
- [GKX migration workflow](docs/GKX-MIGRATION.md)
- [Existing Obsidian Agent API](AGENT-API.md)
- [Release process](docs/RELEASE-PROCESS.md)
- [Roadmap](ROADMAP.md)

## Engine direction

At this commit, the installed consumer dependency remains exact-pinned to
GKOS-Engine v2.1.1. GKOS-Engine TypeScript 2.1.2 is the compatibility oracle
for the standalone uplift until the separately governed Rust 3.0 engine passes
parity and cutover gates. Navigation Effects integration remains experimental
and must not be presented as released Engine 2.2 compatibility.

## Origin and licensing

Kosmos-Oden is an independent fork and substantial rebuild of
[H4R7W16/vault-kosmos](https://github.com/H4R7W16/vault-kosmos). See
[ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md) and
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for provenance and bundled
dependency notices.

Project-authored software is Apache-2.0. Project-authored documentation and
original graphics are CC BY 4.0 where declared. Inherited and third-party
assets keep their own licenses. [LICENSE](LICENSE) contains the controlling
project licensing structure.
