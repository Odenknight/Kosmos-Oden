# Spatial bridge implementation contract

Status: required integration work, not a completed capability.

Implemented conversion: `NotesWorkspaceHost.spatialGraph()` now prepares a
presentation graph from the readable summaries under the existing publication
checks. It uses the Engine area palette, derives degrees from readable links,
preserves IDs and paths, and omits raw GKX objects and diagnostics. It rejects
more than 20,000 nodes or 100,000 links and dangling endpoints. Fourteen host
checks pass, including actual cosmology layout with finite positions and stable
IDs. Build and typecheck pass. This is not yet connected to the iframe protocol
or Notes selection controls; byte-level message validation is still required.

The current Notes host captures `qGraph()` with committed corpus, graph object,
default sensitivity and visibility ceiling checks. That query returns readable
note summaries and links whose two endpoints are readable. It does not return
the full `GkxGraph` expected by `renderer.ts`. The current iframe instead parses
source files in its own index without the provider's configured defaults.

The integration must:

1. Convert the readable query into an explicit renderer projection, retaining
   canonical IDs and paths. Derive presentation fields from readable data only;
   never copy hidden-node counts, raw graph diagnostics or unfiltered lineage.
2. Preserve the existing Engine layout implementation. The projection must meet
   its required node, link, aggregate and diagnostic shapes without inventing
   governance fields. Keep unknown assessment and provenance unavailable.
3. Publish a full versioned projection through the host's final snapshot check.
   Attach a generation scoped to that view. Replace the iframe's index only for
   this mode; keep the standalone source-file adapter operational.
4. Validate parent source, message version, bounded payload shape, endpoints and
   generation in the renderer. Reject unknown generations for selection. Queue
   at most the newest requested selection while a projection is pending.
5. Recheck the selected note through its captured publication capability before
   posting its canonical ID and generation. Resolve only within the displayed
   projection. Report unavailable targets instead of silently selecting another
   note or opening the graph without focus.
6. Invalidate projection and selection on corpus, policy or provider changes,
   rename/delete and view teardown. An older asynchronous result must not
   repopulate a cleared view. Retain existing hidden-view suspension behavior.

Acceptance requires real linked visible/hidden fixtures, non-default sensitivity,
policy changes during preparation/publication, stale generation selection,
rename/delete, close/reopen, standalone compatibility, sandbox rejection and
native selection observation. A graph read test alone cannot close these gates.

Source references: `src/workspace/host.ts`, `src/plugin/agent-server.ts:qGraph`,
`src/plugin/embed.ts`, `src/plugin/protocol.ts`, and
`src/renderer/renderer.ts:renderGraph`. The renderer currently compares selected
metadata fields when deciding whether to refresh; projection-field changes and
removal of previous metadata also require explicit regression coverage.
