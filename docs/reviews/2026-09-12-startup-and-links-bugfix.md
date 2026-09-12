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
