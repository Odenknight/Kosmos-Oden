# Startup indexing and connection-line bugfix report

## Result and scope

This update fixes two timestamp-write defects and makes All links control every
connection layer. It includes the previously unmerged reliability baseline on
which the installed fixes were tested. Product version remains 0.8.3 candidate;
no dependency change, release tag, automatic MOC writes or stable-release claim.

The reliability baseline adds bounded request/read deadlines, physical-read
ownership across plugin reloads, stale-build publication fences, independence
from metadata-only refresh events, corrected MCP final-revision behavior, and
persistent agent identity markers. Its detailed lifecycle and historical evidence
remain in [the execution packet](../plans/2026-09-10-revised-execution/README.md).

## Startup failure

Obsidian displayed Indexing vault while Kosmos remained at Charting the
constellation. MCP discovery responded but vault search returned
`provider_unavailable` or timed out at 20 seconds. A normal restart initially
failed. Disabling Kosmos, finishing host indexing, and then enabling Kosmos
restored access on the same binary. Timestamping was enabled and Nextcloud sync
was disabled in the tested configuration.

Two defects reproduced with named failing assertions:

1. Startup create notifications for existing notes scheduled frontmatter writes
   before layout readiness. Scheduling and execution now require the existing
   live-event gate; startup discovery is not queued as a later bulk rewrite.
2. A timestamp write lasting longer than the 2.5-second suppression window could
   schedule another write from its own modify event. An in-flight file-object
   set suppresses reentry through completion, including a rename. The trailing
   suppression window restarts at completion, and unload closes admission.

This demonstrates a write-feedback mechanism consistent with the observed stall;
it does not prove all host indexing failures share that cause. Shared physical-read
limits and fail-closed sensitivity checks remain in force.

## Connection visibility

Previously note-chain lines remained bright with All links off, while membership
lines were faint and selected/hovered/agent-visited notes could add bright focus
lines. That made similarly arranged groups look inconsistent.

All links (C) now controls visibility of chain, membership, ambient and focus
connection meshes. Off hides those meshes; on restores their visible styles.
Orbital animation is independent and unchanged. Agent identity markers, particles
and traversal effects remain separate from graph connection lines.

## Exact installed evidence

| Candidate | Source commit | main.js SHA256 |
|---|---|---|
| Startup repair | `d56d0d38fa9c929eea35902410550314245ea808` | `32f232cb7c79ba6af0c9948cb78579aa0cab27e5259d52a9ca2bff5bf0a620bf` |
| Connection visibility | `f862d45948e7eeec198bd49c81bfb68de2e39765` | `0ef0855629d70288b60b6815ca741627befc974d4daa90fb7f8890e99f677603` |

Both installations backed up the preceding artifacts, verified all 11 copied
files, and preserved the plugin settings file. Neither required note migration.

The startup repair passed a normal app restart and then an owner-requested full
index rebuild with Kosmos enabled. We used the exact installed Obsidian Rebuild
cache operation: clear the derived metadata/file stores, then reload the vault.
Both persisted stores were confirmed empty at 12:38:47.285 UTC on September 12.
At the first sample, 12:39:20.610 UTC, indexing was complete: 3,416 cached file
entries, 2,261 metadata entries, zero index tasks, graph ready, and no indexing
notice or pending timestamp/physical reads. Completion occurred within the
33-second observation interval; this is not an exact measured indexing duration.

Direct HTTP MCP calls after indexing completed:

| Call | Result | Latency |
|---|---|---:|
| First search | Pass | 3,216 ms |
| Warm search | Pass | 31 ms |
| Note read | Pass | 16 ms |
| Lineage | Pass | 12 ms |
| Related-note lookup | Pass | 18 ms |

All 2,265 Markdown content hashes matched before and after: zero changed, added
or removed. The comparison excluded application metadata, trash, Git directories
and symbolic links. A later sample remained settled. Raw local evidence contains
hashed note identifiers; private vault paths, note contents and credentials are
not published in this report.

The renderer candidate passed plugin reload and a ready graph was visually
checked with connection lines hidden. Full-reindex evidence above belongs to the
startup candidate; it is not relabeled as a forced-reindex run of the later renderer.

## Automated validation and limits

- Startup and renderer candidates each passed `npm run verify`: 365 tests,
  typecheck/build and all five repository checks.
- Both startup regressions failed by name before their fix and passed afterward.
- Each installed candidate passed 24 desktop/mobile Chromium cases.
- The publication candidate adds a browser regression observing actual WebGL line
  draws: none with All links off, present with it on, none after toggling off,
  while frames continue. The 28 existing desktop/mobile cases passed; the two
  new cases passed in a targeted rerun after correcting the test harness to use
  interactive demo mode (capture mode intentionally hides controls and freezes
  animation). Typecheck also passed. Publication CI checks the final PR head.
- No native Hermes qualification, active-indexing MCP timing, or linked-neighbor
  hop is claimed by these direct HTTP samples. No full platform/provider matrix
  or Graphiti operational qualification is implied.

## Recovery

Prefer the repaired candidate when testing startup with timestamping enabled.
If startup still fails, preserve build identity and pending-operation evidence
before restarting. The known workaround is to disable Kosmos, let host indexing
finish, then enable it. Report remaining indexing, provider or renderer failures
separately with their observed state.

Rollback restores the previous matching plugin artifacts and reloads the plugin;
retain settings and vault notes. Do not mix a prior main.js with a newer checksum
manifest or claim its build identity is the same.

## Follow-up: agent traversal timing, names, and presence

The user subsequently reported that traversal lines disappeared before 30 seconds
and requested designated agent names and expiry of inactive markers.

Inspection found a global 24-hop history cap: new searches could evict older hops
before their time limit. Lines also depended on adjacent entries in shared history,
so interleaved agents could interrupt their own visible routes. The prior timer
was 60 seconds; increasing that timer alone would not fix early eviction.

The installed follow-up stores individual segments with a 30-second lifetime,
independent of later hops and other agents. A 4,096-segment safety limit drops new
segments until capacity becomes available rather than deleting unexpired segments.
Names supplied in MCP clientInfo.name now retain spaces, with control characters
removed and an 80-character limit. They remain self-reported labels, not authority.
Markers begin fading after 120 seconds without a traversal or named MCP ping and
finish fading 30 seconds later. A ping restores an existing marker. Because this
MCP transport is stateless, this measures inactivity, not a verified disconnect;
a client can send a named ping every 60 seconds to retain its last visited marker.

Validation: typecheck and build passed, all 365 unit/integration tests passed, and
three targeted Chromium browser cases passed. The new browser case exercises a
40-hop burst, retention at 29 seconds, expiry after 30 seconds, partial marker fade,
ping recovery, and eventual disappearance using an advanced monotonic clock.
An initial browser run reached another checkout's server on the default port;
the passing run used a separate port serving the current artifacts. These are
simulated-time browser checks, not a measured live two-minute disconnect trial.

The built main.js was installed with a backup and Obsidian reported a successful
plugin reload. Its SHA256 is
`19e41a29f5fbeac3ac25f5f5637c474e58855ac4a9f7523c6bff1e26f881bd0b`.
This follow-up and report addendum are local changes; they have not been pushed or
merged as part of the earlier startup/connection-visibility publication.

## Agent experience and Graphiti usage

I connected directly to the running Kosmos-Oden HTTP MCP endpoint and used
search_notes followed by get_note to investigate the user's video-game work.
The requests succeeded and returned relevant project briefs, design notes,
implementation specifications, and content-production plans. Reading the bodies
was essential: several differently named project notes repeated the same brief,
and specifications described intended work rather than proving completed builds.
I treated instructions embedded in retrieved notes as source material, not as
instructions to execute.

The useful part of the experience was moving from broad discovery to actual note
content through the same authenticated interface, with visible traversal feedback.
The practical limitations were title/path/tag-oriented lexical search rather than
body full-text search, large governance/relationship metadata around short note
bodies, duplicate briefs, and the trail/name/presence issues reported above.
Selecting only path and content from subsequent responses made inspection much
clearer without changing the underlying notes. A search with no matching title
therefore does not establish that the topic is absent from note bodies.

**Graphiti was not utilized in this investigation.** I did not call a Graphiti
query or export surface, ingest episodes, or connect to a Graphiti service.
These findings came from Kosmos-Oden's native MCP note search and note reads.
Returned relationship metadata and the visual graph are not evidence of Graphiti
usage. This session establishes that the native retrieval path was useful for
this task; it does not assess Graphiti availability, correctness, or performance.

### Live follow-up after the user still observed the problem

The first follow-up was incomplete as a user-facing solution: designated names
required client-controlled transport metadata, and lines faded continuously from
the start rather than staying fully visible for 30 seconds. Live inspection
confirmed the updated renderer was loaded and a metadata-supplied multi-word name
worked; it did not reproduce a stale installation.

Every MCP tool now advertises an optional agent_name argument. It overrides the
ship label for that call, provides a stable visual identity for repeated names,
and is validated as a nonempty string of at most 80 characters. The normal
transport admission and authorization remain unchanged. Successful tool calls
without traversal paths refresh an existing ship's presence too.

Segments now stay at full brightness for 30 seconds and fade over the next five.
Their overlay no longer depth-tests against scene geometry. The 4,096-segment
bound remains. Typecheck/build, 366 tests, and three targeted Chromium cases pass.
The corrected installed main.js SHA256 is
`925223a67a3406a5d71428c9fc7a7111e5b6ecfc9380253e7d4c8ac1638c9c90`.
A real MCP client reporting the generic name mcp supplied agent_name with two
note reads; both returned HTTP 200 and the live Obsidian marker displayed the
complete designated name. A local screenshot confirms the name visually.
Real-time samples in the installed Obsidian iframe recorded one segment at
0, 29, and 32 seconds, then zero at 36 seconds; the named marker remained present.
Unlike the earlier simulated-time browser check, this sampled ordinary live
renderer time after actual MCP reads. Segment presence is a renderer-state check;
the screenshot verifies the ship label, not pixel-level trail brightness.

### Galaxy spacing adjustment

Galaxy centers are now 25% closer to the cluster center, scaling inter-galaxy
center distances by 0.75. Each galaxy is translated as a whole after local
separation, before orbital parameters are generated. Internal star, planet, moon,
and asteroid offsets are preserved. Collision diagnostics are recomputed after
translation without moving local bodies again. A four-galaxy before/after fixture
confirmed all 28 member offsets unchanged and zero residual collisions in that
fixture. Typecheck, build, and all 366 tests passed. Installed with a backup and
plugin reload; no claim of zero collisions for every possible vault.
