# Implementation and test-candidate status

Updated 2026-09-10. Owner direction: complete release-critical fixes before packaging, and show the identity and current known location of agents traversing notes.

## Implemented in this branch

- R1: request deadlines, disconnect/stop/listener-error finalization, exactly-once logical admission release, captured provider/policy context, suppression of late responses and traversal, bounded partial-body handling.
- R2: shared physical read capacity of 16 across provider/viewer/plugin reload; permits survive logical deadlines until actual settlement. Typed failures distinguish unavailability from absence. Provider commits an unpublished candidate only after generation/policy/deadline checks. Viewer snapshots and deltas retain pending edits on failure and retry visible deferred work with one timer.
- Q1: independent six-method cache oracle, retained private/zero-TTL discovery, and modern ping rejection. Existing metadata/error validation tests are retained.
- Q2: the corrected resolved-ref-only mutation fails the guard, then restores byte-identical lockfile contents; see LOCKFILE-AUDIT-V2.json.
- Agent markers: SVG ships, independent agent names, a bright location anchor, last-visited note, stable separation of same-label agents, off-screen indication and viewport clamping. Last-known positions remain after trails expire and clear with traversal context. The display reports observed note visits, not unobserved agent execution.

The shared index is rebuilt from cached source records before publication. Incremental disk reads remain incremental, but all retained records may be reparsed on a committed update. The target cold search completed in 6.8 seconds; ongoing large-vault update cost remains a performance consideration.

## Live cold-build correction

The first frozen candidate, e0709ab, failed its target cold-search gate cleanly at the 20-second deadline. An extended diagnostic reached no indexing at all: repeated metadata-cache notifications invalidated every read pass. A one-second sample observed 115 metadata events with zero vault modifications. The correction invalidates the source-derived graph and viewer from actual vault create/modify/delete/rename events, not metadata-cache refreshes. The superseded test ZIP remains historical evidence and is not the delivered candidate.

## Evidence and qualification

Baseline reproductions fail before the change for provider failure classification, operational rename revision, disconnect admission, restart accounting, and the MCP oracle. Local verification passes 364 tests including the source-event regression and all build/type/version/lock/artifact/invariant/provenance checks. Desktop/mobile Chromium checks pass 28 cases; marker screenshots were inspected after the boot overlay disappeared. This includes viewer close/reopen recovery, listener-error finalization and synchronous indexing-overrun regressions.

R0 identified the existing loaded 0.8.3 artifact against its source and SHA-256 (see LIFECYCLE-FREEZE.md). The owner's endpoint is accessible using its configured credential, retained only locally. Final Hermes client/SDK/patch identity and native-client acceptance are still open. Direct Node HTTP tests are not Hermes evidence. No main-branch merge or release-qualified claim is made by providing this test candidate.

## Parallel remaining work

1. Integrator (Codex): completed source freeze, clean build/package, direct installed-runtime checks and plan synchronization. See [test package receipt](TEST-PACKAGE.md). Preserve this exact candidate for remaining client acceptance.
2. Any agent with the actual Hermes client (Jeffrey requested): claim R0-client/R3 with the exact package SHA and client SDK/patch identity; run discovery/list/search/allowed UID read/restricted denial/traversal against that installed candidate, with cold/warm results. Publish a sanitized immutable receipt through its own mailbox identity. Do not change source during qualification.
3. Independent reviewer: inspect lifecycle/marker evidence and the candidate manifest without editing integrator-owned files; append findings. Luna owns only its named regression-test files during this run.
4. Future Graphiti/GKOS tracks remain design work under FUTURE-TRACKS.md. Do not change pins or introduce live services as part of this test package.

If qualification exposes a code defect, the integrator fixes it and freezes a new candidate; rerun affected checks and replace the candidate receipt. Preserve previous receipts and rollback artifacts. Synthetic stalls run in isolated tests, never by deliberately hanging the owner's vault API.
