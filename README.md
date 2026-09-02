# Kosmos-Oden — v0.8.0

Turn a folder of Markdown notes into a universe you can explore.

Kosmos-Oden maps folders to galaxies, connected notes to stars and planetary
systems, loose notes to asteroids, and attachments to a distant Oort cloud.
Fly through it, search it, rewind it, or simply enjoy seeing the shape of your
knowledge from a new angle.

Your Markdown remains the source of truth. Ordinary viewing is local and
read-only, and the standalone viewer works without Obsidian or the internet.

> **Status:** repository and plugin metadata remain at **0.8.0**. The released
> product and `main` line use exact-pinned **GKOS-Engine v2.1.1**. This
> experimental feature branch temporarily pins an exact unreleased Engine
> development commit to test Navigation Effects boundaries. That pin is not
> Engine 2.2, a new Kosmos release, write authority, production readiness,
> certification, or a conformance claim.
>
> The review branch `codex/complete-identity-protocol-20260901` adds a bounded
> visual-identity successor. Its implementation evidence coordinate is
> `caac0248529bcea94d7d37d582a9e45b3cc6df94`; later documentation commits require
> their own exact-SHA checks. It has local unit and Chromium
> evidence, but remains an unreleased review candidate. Hosted browser/mobile
> lanes, cross-GPU qualification, and a live Engine request-to-render chain are
> still required before promotion.

![A Kosmos-Oden vault rendered as a navigable night sky](docs/assets/kosmos-oden-night-sky.png)

## Pick a launchpad

| Experience | Best for | What it needs |
|---|---|---|
| **Standalone sky** | Opening a local Markdown folder as one offline visual | `kosmos-oden-stand-alone.html` and a current browser |
| **Obsidian plugin** | Live updates, note navigation, GKX tools, Agent API, and optional sync | Obsidian 1.11.4+ |
| **Build CLI** | Producing graph JSON or Graphiti episodes in scripts | Node.js 22–24 and a source checkout |

All three use the same pinned Engine semantics rather than inventing separate
parsers for each surface.

## Open the standalone sky

`kosmos-oden-stand-alone.html` is a self-contained offline file: the parser,
graph path, Three.js renderer, controls, and styles are bundled inside it.

1. Open the HTML file in a current browser.
2. Choose **Open Knowledge Folder**.
3. Select a Markdown folder or Obsidian vault.

Chromium-based browsers can grant a reusable read-only directory handle. While
the page stays open, Kosmos rescans and incrementally applies changes. Browsers
without that API can import a one-time folder snapshot instead. The status
panel labels the active mode honestly, and **Forget Folder** removes the saved
handle.

Folder and snapshot viewing do not require Node.js, Python, a web server, a
local service, or network access. Graph and Graphiti exports are assembled in
memory and downloaded only when you ask for them.

## Fly from Obsidian

For a source installation, copy `manifest.json`, `main.js`, and `styles.css`
into `<vault>/.obsidian/plugins/vault-kosmos/`, enable the plugin, and run
**Open Vault Kosmos**. The view follows Obsidian create, modify, rename, and
delete events without rebuilding the whole vault for an ordinary note edit.

The same renderer works on desktop and mobile. It pauses its render loop while
hidden, adapts geometry and pixel ratio for lower-power devices, and provides
touch controls alongside keyboard and mouse navigation.

See [the community-plugin guide](docs/COMMUNITY-PLUGIN.md) for the established
plugin workflow.

## What your notes become

| In your folder | In the Local Cluster |
|---|---|
| A recognized root MOC | The bright cluster core |
| A top-level folder | A galaxy |
| A well-connected note | A star and solar-system hub |
| Linked descendants | Planets, moons, and moonlets |
| A loose note | An asteroid |
| An image, PDF, or other attachment | An Oort-cloud object |

Star size and spectral color follow the relative weight of each note system,
from cool red M-class stars through hotter blue classes. Planets use the four
broad NASA exoplanet families—terrestrial, super-Earth, Neptunian, and gas
giant—based on their local note-system structure. These are visual metaphors,
not scientific classifications of your ideas.

Kosmos packs each hierarchy, runs separation passes, and reports residual
layout collisions as diagnostics. It does not promise a mathematically perfect
zero-overlap arrangement.

## Ways to explore

- **Overview** surveys the whole cluster.
- **Focus** moves close to a selected body and its neighbors.
- **Depth** dives further into a local system.
- **Fly** enables free-flight controls, with touch pads on mobile.
- **Search** filters the visible universe without rebuilding it.
- **Chrono** projects the graph at a selected validity time.
- **Grow** reveals the cluster in creation order.
- **Trailer** takes a cinematic tour through the largest galaxies.
- **Labels, links, objects, minimap, and legend** can be toggled independently.

Right-click or long-press a note to open it in Obsidian. A galaxy backed only
by a folder offers **Expand Folder** instead; it never creates a fake note just
to satisfy the visual metaphor.

## Lineage, time, and GKX

The released product reads human-editable GKX metadata through GKOS-Engine
v2.1.1. Declaring
either `supersedes` or `superseded_by` contributes to one canonical lineage
graph. Cycles, ambiguous targets, self-links, multiple successors, and invalid
time order are reported instead of silently becoming trusted edges.

The Chrono view uses retained timestamps and supersession intervals to show
which note versions were valid at a selected time. It does not reconstruct old
file bytes that are no longer present.

Kosmos also exposes the GKX 2.3 validating projection: authored, derived,
suggested, approved, and effective data remain origin-separated. Its
documentation/support assessment is not a truth score and never authorizes
use. This is a bounded product profile, not a claim of full GKOS conformance or
certification.

### Optional read-only Navigation

Engine Navigation is off on upgrade. When enabled, it changes which existing
note is selected as a visual MOC center and recognizes exactly `index`,
`_index`, `readme`, `moc`, and `contents` as built-ins. Former aliases such as
`home`, `map`, and `overview` become noncanonical findings.

Navigation cannot create, rename, rewrite, archive, or delete a note. Kosmos
continues to report that MOC apply is unavailable.

### Experimental managed-MOC groundwork

There is a new workshop off to the side of the observatory—but the doors to
the write machinery are still firmly locked.

On the current Navigation Effects feature branch, Kosmos has implemented
no-write groundwork for a future, separately governed managed-MOC plane:

- `.gkx/**` and `_archive/moc-runs/**` are centrally excluded from the corpus,
  graph, Navigation, enrichment, and agent context;
- versioned settings migrate additively, persist quietly, and keep the Effects
  plane, automatic maintenance, and automatic creation off;
- status reports planner, adapter, authority provider, journal, policy, lease,
  recovery, reconciliation, ownership, and automatic modes independently;
- a browser-safe adapter imports only the framework-neutral Engine Effects
  surface and treats configured infrastructure as capability—not current
  authority;
- policy validation binds exact ID, version, canonical bytes, and lowercase
  SHA-256 digest; and
- authority evaluation requires a credential-bound actor and exact grant for
  the operation, vault, root, object class, sensitivity ceiling, policy, and
  time. Agents cannot approve their own grants; and
- browser-safe ownership/adoption registry and receipt primitives,
  deterministic exact-byte preview/confirmation logic, an in-memory test
  store, and a two-stage trusted adoption-preview modal are present as injected
  components; and
- the Packet C0 host-neutral adapter contract and intentionally unavailable
  Obsidian and standalone/native descriptors report primitive-specific gaps and
  make every host operation unavailable.

These pieces validate inputs and denials; they do not provide a source-effect
path or write an MOC. The adoption components are not registered with the
plugin or standalone runtime and are not backed by a durable host store. The
branch still has no executable or registered Obsidian/standalone effect adapter,
durable
journal/archive/lease, event coordinator, recovery or reconciliation runtime,
self-write suppression, complete operator workflow, rollback/audit workflow,
cross-platform crash evidence, scale evidence, or 24-hour soak. No MOC has
been adopted or written; automatic writes remain unavailable and off. The
[Packet B working-result receipt](docs/navigation-effects/PACKET-B-WORKING-RESULT-20260827.md)
and [Packet C0 working-result receipt](docs/navigation-effects/PACKET-C0-WORKING-RESULT-20260827.md)
record historical local evidence, not runtime or qualification standing.

The dependency is an exact development pin to Engine commit
`41172b91970aac869c161f4842e3526a62fd1fd9`. Its Effects contract says
`integration-only`, targets an unreleased Engine 2.2, labels the Node executor
experimental, and claims no GKOS conformance. See the
[development pin](docs/navigation-effects/DEVELOPMENT-PIN.md),
[initial capability matrix](docs/navigation-effects/CAPABILITY-MATRIX.md), and
[qualification plan](docs/navigation-effects/QUALIFICATION-PLAN.md).

## Watch authorized agent activity

Stable agent identities keep stable, distinct colors across trails, dust,
rocket markers, and labels. The viewer never draws a line segment between two
different agents.

For MCP traffic, the Agent API host mints a random visual identifier for each
session and keeps it separate from the human-readable agent label. The
renderer receives that opaque visual identifier across live, buffered, and
replay paths, so two sessions with the same label remain visually distinct and
a renamed label does not create a new identity. The visual identifier is not
client supplied, is not returned to the client, and is not the
`Mcp-Session-Id`; session credentials never enter renderer state. REST traffic
continues to use label-only grouping because it has no equivalent session
identity.

This is display continuity only. A stable color, trail, label, or marker does
not authenticate an agent and grants no GKOS authority, capability, approval,
or Effects permission. See the
[host/renderer protocol](docs/RENDERER-PROTOCOL.md) for the exact boundary.

The optional **Traffic Heatmap** brightens recently visited nodes using a
bounded score that fades with elapsed monotonic time. It is off by default and
measures recent visits only—not truth, quality, importance, fuel, cost,
confidence, or authority.

Traversal recording is explicit and in memory. A session stores validated,
redacted event envelopes rather than rendered frames and stops at 5,000 events
or 2 MB, whichever comes first. Replay supports play, pause, seek, restart,
stop, and 1x/2x/5x speeds. Replayed events are marked and never re-enter the
live recording; live events can remain buffered while replay is active.

Nothing is persisted automatically. **Export session** is the deliberate
download boundary.

## Optional standalone-service client

The standalone page includes a read-only client for a compatible, separately
run GKOS local service. It can negotiate capabilities, retrieve an authorized
graph, and receive authorized traversal events over authenticated `fetch()`
streaming.

Only HTTP(S) loopback destinations—`127.0.0.1`, `localhost`, and `::1`—are
accepted. The non-secret address may appear as
`?api=http://127.0.0.1:4814`; credentials are entered in the password field and
are not accepted from the URL. Graph, MCP-availability, event-stream, and
offline-mode states are shown independently.

This repository does **not** bundle an out-of-box standalone service. The
client on main validates `GKOS-LOCAL-SERVICE-1.0.0-draft.1`. A separately
developed Draft.2 runtime is not bundled, released, or automatically compatible
with it. Offline folder and snapshot modes remain fully usable when no service
is present.

## Obsidian Agent API and Graphiti

The plugin can optionally expose a read-only REST and MCP API on loopback port
4816. It is disabled by default, authenticated by default, and answers from the
same Engine-backed index as the viewer. The API includes graph, search, note,
lineage, related-note, temporal, diagnostics, assessment, policy, evidence,
relationship, and paginated Graphiti query surfaces.

The MCP endpoint uses Streamable HTTP with session and protocol-version
validation. `kosmos-mcp-stdio.mjs` is included for stdio-only clients. Request,
response, rate, concurrency, and episode-page limits bound resource use.
Sensitivity filtering applies before serialization; invalid explicit labels
fail closed.

LAN mode is a separate opt-in compatibility feature of the Obsidian API. It
requires a token and uses unencrypted HTTP, so use a trusted private network or
a secure tunnel. The standalone-service client described above remains
loopback-only.

See [Agent API](AGENT-API.md) for exact routes, tools, and setup.

## Human-controlled GKX improvement

The Obsidian plugin includes explicit GKX audit, repair, and conversion
commands. A scan produces a content-free, hash-bound plan before any source
change. Applying it requires visible acknowledgements, creates byte-exact local
backups, and rechecks current source bytes so a stale plan cannot quietly
overwrite a newer edit.

Content-assisted enrichment can produce review suggestions for descriptions,
types, tags, and explicitly evidenced relationships. Deterministic selection
runs first; an on-device, private-LAN, or HTTPS model pass is optional and off
by default. Nothing is preselected. A reviewer must resolve every suggestion
before a second, hash-bound apply preview can reach the existing backup and
write boundary.

This is the established enrichment workflow, not the newer immutable
`.gkx/proposals/` and `.gkx/decisions/` subsystem described in roadmap work.
Confidence helps explain a suggestion; it never supplies approval authority.

## Optional Nextcloud WebDAV sync

The Obsidian plugin can synchronize one configured vault folder with
Nextcloud. The feature is disabled by default and keeps its app password in
Obsidian Secret Storage.

Sync compares local SHA-256 values, remote ETags, and the last common state.
When both sides changed, the remote bytes are preserved as a timestamped
conflict copy. Deletion propagation is off by default. `.git/**`, `.trash/**`,
and `.obsidian/**` are excluded by default; `.obsidian` can be opted in, but
Kosmos's credential-bearing plugin data remains forcibly excluded.

HTTPS is required for public hostnames. Plain HTTP is accepted only for literal
private or loopback addresses. Sync is useful, but it is not a backup—keep an
independent, restorable copy of important data.

## Security and privacy at a glance

- Offline folder/snapshot viewing makes no network request unless you
  explicitly choose a networked feature.
- The plugin renderer runs in an opaque-origin sandbox and communicates through
  a closed, versioned message protocol.
- The Obsidian Agent API is off by default, loopback by default, and read-only.
- Bearer tokens are generated from a CSPRNG, compared in constant time, and
  never logged. Query-token authentication is deprecated and off by default.
- Nextcloud and optional model credentials do not enter synchronized plugin
  data or ordinary logs.
- Graphs, Graphiti episodes, assessments, heat, and replay are projections;
  none replaces canonical source content or grants authority.

Report vulnerabilities privately through GitHub Security Advisories. Do not
include real vault content or live credentials. See [SECURITY.md](SECURITY.md)
and [the threat model](docs/THREAT-MODEL.md).

## Roadmap and feature-branch boundary

The released product and `main` do not include a Navigation Effects dependency
or managed-MOC runtime. The experimental feature branch contains only the
no-write groundwork described above. The following remain roadmap work rather
than working or qualified product behavior:

- the new immutable proposal/decision quarantine and confidence-review system;
- durable host/runtime wiring for managed-MOC ownership/adoption and receipts,
  source writing, archives, durable journal, vault lease, coordinator, recovery,
  reconciliation, self-write suppression, complete trusted operator and
  rollback/audit UI, or automatic maintenance/creation;
- Tauri, native desktop, Docker, or cross-platform standalone-service packages;
- installer signing, macOS notarization, publishing, or a new release label;
- an owner-authorized released Engine 2.2 effects dependency or Rust 3.0
  engine cutover; and
- cross-platform path/crash/durability qualification, scale results, and the
  required 24-hour soak for any Effects host profile.

They are not hidden settings, dormant authority, or production-ready features.

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

Build a graph or Graphiti export from a shell:

```bash
node kosmos-build.mjs /path/to/vault graph.json
node kosmos-build.mjs /path/to/vault graph.json \
  --episodes graphiti-episodes.json --group-id my-vault
node kosmos-build.mjs /path/to/vault graph.json --watch
```

The release-staging script packages the existing JavaScript/HTML plugin
artifacts with `BUILD-INFO.json` and `SHA256SUMS`; it is not a native installer,
signature, notarization, or publication step.

Test totals are not permanent documentation. Evidence should always name the
exact command, commit, platform, failures, and documented skips.

## Technical map

- [Technical README](TECHNICAL_README.md)—architecture, current capabilities,
  boundaries, scripts, and verification
- [Architecture](docs/ARCHITECTURE.md)—the established module map
- [Renderer protocol](docs/RENDERER-PROTOCOL.md)—the Obsidian host/viewer
  message contract
- [Engine 2.1 compatibility](docs/ENGINE-2.1-COMPATIBILITY.md)—the pinned
  dependency and read-only Navigation boundary
- [GKX 2.3 profile](docs/GKX-2.3-PROFILE.md)—validating projection behavior
- [GKX migration](docs/GKX-MIGRATION.md) and
  [content-assisted enrichment](docs/GKX-ENRICHMENT.md)
- [Agent API](AGENT-API.md)
- [Navigation Effects development pin](docs/navigation-effects/DEVELOPMENT-PIN.md),
  [initial capability matrix](docs/navigation-effects/CAPABILITY-MATRIX.md), and
  [qualification plan](docs/navigation-effects/QUALIFICATION-PLAN.md)
- [Release process](docs/RELEASE-PROCESS.md)

## Origin and licensing

Kosmos-Oden is an independent fork and substantial rebuild of
[H4R7W16/vault-kosmos](https://github.com/H4R7W16/vault-kosmos). See
[ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md) and
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for provenance and bundled
dependency notices.

Project-authored software is Apache-2.0. Project-authored documentation and
original graphics are CC BY 4.0 where declared. Inherited and third-party
assets retain their own licenses. [LICENSE](LICENSE) contains the controlling
licensing structure.
