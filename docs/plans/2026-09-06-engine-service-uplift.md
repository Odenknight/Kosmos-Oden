# Kosmos Engine service uplift build plan

Planning date: September 6, 2026. This plan follows the request to use current repository capabilities; earlier task pins and procedural gates are superseded. Runtime authorization and data protection remain product behavior. Implementation is staged; planned tools are not advertised as available.

## Baseline and retained behavior

Begin from reviewed Kosmos fbec1f9daeb4c3cc258ddec0d046adc2dac3483d so the 0.8.1 fixes are preserved; main was 3aab1e337a8442d6bc2463cab43cb9b4191291a2 when inspected. Current Engine is f1a95f8f3933f834eb4030f0f0d143051e6eecc2 (2.2.0 candidate). Reconcile newer work at each phase; never overwrite staging material. Use explicit file staging on codex/engine-service-uplift-20260906.

Companion: GKOS-Engine docs/plans/2026-09-06-kosmos-service-contracts.md on the same branch name. Engine phases E0 to E5 own shared semantics and fixtures. This plan owns consumer integration.

Preserve rendering and all nonvisual workflows: local browser folder permissions and rescans, Obsidian events, timestamps, formatting/conversion, enrichment, Graphiti exports, Agent API 4816 and Nextcloud. Engine service 4814 is a separate optional source. No silent switch of source or credential role.

## K0: Publish plans and baseline evidence

Publish both plans before implementation. Record source and remote coordinates and known open PR ancestry. Plans are not release claims. Maintain a phase ledger with changes, exact validation commands, result, unavailable environments and rollback. Existing untracked files are not implementation inputs without review.

## K1: Connection and event boundary foundation

First independent implementation slice: reject credential-bearing, query-bearing, fragment-bearing and path-bearing service base URLs before network access. Preserve valid loopback endpoints and offline operation. Refuse redirects. Treat HTTP 401/403 on SSE as terminal authorization failures, not transient retry signals; require explicit reconnection after credential repair. Retained reconnect and 409 reset behavior remain distinct.

Test with injected fetch for zero requests on invalid URLs and no retry after denial. Add synthetic event fixtures for retained reconnect, generation changes, reset, duplicate delivery, revocation and bounded recording. Run matching Engine live service harness when available. Preserve historical recordings without treating them as current authorization.

Exit: connection and event tests pass, browser safe build remains self contained, no service is required for folder mode. Do not call this full service integration.

## K2: Adopt current Engine and qualify distribution

Select and record a current compatible Engine revision after API review, then update package, lock, allowScripts, SHA checks and provenance together. The earlier d81f9d1 restriction is obsolete. Reproducible exact dependency coordinates remain useful release metadata.

Keep Node only imports out of browser and renderer bundles. Use public library subpaths; run service as a separate packaged executable. Establish artifact digest/platform/source identity before launch, bounded restart/shutdown, stale process handling, port conflicts and state ownership. Protect credentials with host secret mechanisms, keep viewer/MCP identities separate, and avoid raw token Quick Connect output. Native credential broker design must cover HTTP and SSE without sending secrets into renderer messages. Browser manual credentials remain local to its network client and never exports or storage.

Exit: package reproducibility and browser tests pass; wrong executable, missing credentials and wrong port fail clearly. Publish platform evidence separately; no installer claim from source tests.

## K3: Retrieval and selected query integration

Use existing gkos_search with its real citation and provider status contract. Preserve local search in folder mode and existing 4816 tools. Introduce an explicit service query provider, never a second parser. Resolve paths through service-issued references and handle expired or stale references by renewed discovery.

Composition audit: reuse gkos_record_assess for individual scores and gkos_lineage_get for direct lineage. Do not derive canonical evidence/labels/relationships from raw Markdown. Navigation discovery is not a complete corpus list; do not report an average over discovered MOCs as vault assessment. Consume E1 structured projection, public assessment policy and authorized aggregate contracts only after they exist. Proposed tool names are not sent speculatively. Negotiate tools and feature availability independently; an unavailable extension does not disable existing graph access.

Show citations only against their bound source version; handle generation changes and revoked access without stale authoritative results. Keep full source hidden where credentials do not authorize it. Exit: visible/hidden fixture pairs, empty results, stale generation, provider unavailable and truncated aggregate tests pass through real service and consumer.

## K4: Human review and receipts

Map existing enrichment/migration review onto E2 contracts. Preserve explicit accept/reject/defer, edits, source hash checks, backups and host file operations. Store decision and apply receipts immutably with reviewer identity and proposal bindings. Edited proposals require a new digest; acceptance alone never means applied. Report failures without success receipts. Migrate existing records with versioned readers rather than discarding them.

Exit: stale-source refusal, repeat delivery, reviewer separation, source preservation, backup recovery and decision replay tests pass in a real Obsidian test vault. No automatic timestamp or Nextcloud workflow is rerouted through the MOC writer.

## K5: Managed MOC host integration

Consume Engine's existing coordinator. Native host uses the supported Node runtime or a documented service adapter; never import Node executor into browser. Obsidian provides an adapter over its file APIs and lifecycle; browser folder mode continues without managed writing unless separately designed and tested.

Wire explicit adoption, ownership, source snapshot, current grant and policy, target containment, lease, archive/journal, startup recovery, reconciliation and idempotent graph publication. Preserve bytes outside the generated region. Model assistance is optional and review only. Complete runtime state, not configuration booleans alone, determines availability. Handle rename, external edit, lost watcher event, sync conflict and shutdown while pending. Reuse Engine coordination instead of writing a competing debounce/recovery loop.

Exit: synthetic and real host cases prove one intended effect, exact preserved human bytes, restart recovery, duplicate callback handling and conservative refusal on conflicting source changes. Any scale or durability claim must have its own measurements.

## K6: Host adapters and release evidence

Keep Nextcloud transport/conflicts, browser permission/reopen lifecycle and Obsidian automation in Kosmos. Publish regression fixtures describing rename/delete/bulk sync and invalidation events to Engine without moving credentials or provider code upstream.

Run npm verify and browser/visual tests; Node 22/24 blocking and 26 informative; document unsupported odd versions. Run real service/SSE/revocation tests, native supervisor crash/restart and Tauri tests, real Obsidian vault workflows and packaged platform smoke tests. Record each exact commit, command, toolchain, result, skips, workflow/job and artifact digest. Distinguish mocked transport from real service and native compilation from installed application tests.

Update WIRED-CAPABILITIES, compatibility, changelog, technical README and rollback instructions after each wired slice. Bump product version only when the implementation scope is established. Release completion requires compatible producer and consumer evidence; partial work remains labeled partial.

## Rollback and sequencing

K0 then K1. K2 precedes using new Engine runtime APIs. K3 waits for E1 where new queries are required, but existing retrieval integration can progress independently. K4 consumes E2; K5 consumes E4; K6 validates the combined product. Roll back a failed slice with its own commit, not a reset of user work. Restore prior package and sidecar together where relevant. Preserve notes and backups; treat credential rotation and derived-state schema changes separately from code rollback. Keep offline and existing Agent API operation available during service failures.

## Initial implementation ledger

K0: plans authored. K1: queued for implementation after both plan commits are published. K2 through K6: planned, not implemented by this document.
