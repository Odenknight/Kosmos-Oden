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

The `readable-graph` envelope now validates positive safe-integer generations,
unique IDs/paths, safe vault paths, timestamp syntax and readable link endpoints.
Known consumed text is limited to 8,000,000 UTF-16 units, with per-field and array
limits. This is a consumed-field budget, not a transport byte limit. The renderer
does not yet apply this new message. Conversion lives in `workspace/spatial.ts`
so the protocol need not import the native host implementation.

Renderer application is now implemented: a newer readable generation replaces
the scene through the existing layout and clears the prior source index,
attachments and traversal observability. Older/equal generations and subsequent
raw source graph messages are ignored for that iframe lifetime. Versioned
visibility messages remain operational. Build/typecheck and four sandbox browser
checks pass. The native host sender and generation-bound selection remain open;
normal installed operation does not yet enter this projection mode.

`select-readable-note` now resolves a bounded canonical ID only when its
generation equals the displayed projection. The renderer refuses missing or
hidden file nodes and preserves selection on refusal. Four sandbox checks
observe the actual inspector after current, stale and missing selections;
16 protocol checks, build and typecheck pass. Native host issuance, selection
reauthorization and projection invalidation are still required.

Native wiring candidate: Notes now opens `kosmos-oden-readable-view`, and its
selected-note action reauthorizes before activation. That view captures the
readable graph, validates it, and posts projection plus selection synchronously
inside the final publication callback. It clears the displayed projection before
vault or settings refresh, updates selection paths on rename, and mediates source
opening through the captured graph. The historical Kosmos view types remain
registered. This new view does not yet qualify the full shared spatial track:
native installed lifecycle, revocation, source-opening and selection observation
remain required. Full verification passed 450 tests before the final inspector
clear; final build/typecheck and 48 Notes/embed browser checks pass.

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

Native qualification of 935ecd5 rejected the live graph at the original
2,000,000-unit budget: 2,276 readable nodes and 13,149 links consumed
2,624,962 units. The bounded allowance is now 8,000,000; regression checks
accept a larger valid payload and reject one above that bound. This correction
requires a new installed receipt; the failed attempt remains historical.

Renderer acknowledgements now report generation, selected ID and an enumerated
render/selection error. Rendering returns success explicitly; successful focus
is acknowledged after the existing focus operation. The native host accepts
only its iframe's current-generation response and checks selected IDs against
the readable snapshot. Four sandbox browser checks observe both the inspector
and its acknowledgement; 17 protocol checks, build and typecheck pass. This
acknowledgement increment still requires installation and native observation.

Native locate now reuses a captured graph when its final publication check still
passes, sending only a generation-bound selection. Refusal refreshes the graph;
superseded requests cannot publish or initiate redundant refreshes. Tests invoke
the actual native class with an Obsidian stub and prove zero graph reads for two
successive selections. Full verification passes 453 tests and all build checks.
Installed selection timing and this reuse increment remain to be qualified.
