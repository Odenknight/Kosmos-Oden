# Claimable work packages

Current allocation: Codex owns R1/R2 integration and the marker fix under the owner’s explicit instruction; Luna independently reviews/tests isolated files. Q1/Q2 evidence is complete. R0 Hermes identity and R3 native-client qualification remain available to an agent with that access. Consult [current status](IMPLEMENTATION-STATUS.md) before claiming. The original package definitions follow. Historical seam reservations still require the handoff described in [README](README.md). Any agent with the required access can claim work; suggested experience is not exclusive ownership. Estimates are rough focused effort ranges after access and inputs are available, not commitments or release deadlines.

## R0 — Lock runtime and client identity

**Priority:** release prerequisite. **Effort:** 30–90 minutes plus host availability. **Parallel:** reproductions/instrumentation may proceed; behavioral merges are blocked until this identity lock closes. **Access:** existing authorized operator/client access. **Changes:** evidence only, no restart as part of diagnosis.

Capture the active Kosmos endpoint's server identity, protocol, 18-tool inventory, process/loaded plugin identity, installed source/build/artifact receipts and client SDK/patch identity. Reconcile Claude seq 16's disk receipt with the actual active plugin directory. Map Jeffrey seq 16's `gkos_*` surface to its real service and build using the same evidence fields. Compare the two sessions explicitly; do not assume a proxy or different endpoint without evidence.

Deliver a sanitized identity matrix and per-call results with timestamps, latency and outcome classification. Retain private endpoint/token/config details locally. Prove that the subsequent R3 run uses the intended runtime. Record the actual process/lifetime and loaded-module proof. If either is unavailable, R0 remains open and behavioral merges wait for the operator evidence. Candidate activation later creates a linked receipt for the replacement package. Reconcile the Hermes auto-update patch before testing, rather than disabling unrelated automation.

**Done when:** the exact Kosmos target is identified with process/lifetime, endpoint, loaded source/build, plugin artifact hashes, client/SDK and patch receipt; the other tool surface is distinguished explicitly. Missing evidence is a blocker, not a completed investigation. Revalidate the lock when any identity component changes.

## L0 — Freeze the shared operation-lifecycle contract

**Priority:** prerequisite to R1/R2 behavioral implementation. **Effort:** 1–3 hours after reproductions identify host constraints. **Paths:** [OPERATION-LIFECYCLE.md](OPERATION-LIFECYCLE.md) and a versioned acceptance receipt. **Owner:** one claiming agent; R1 and R2 implementers both review, with Codex resolving integration conflicts. **Parallel:** drafting may overlap R0/reproductions.

Fill and freeze concrete deadline/budget values, cancellability evidence, request/server epoch and build-generation rules, physical and logical finalization owners, late-result/restart behavior, and typed REST/MCP errors. Use the linked contract as the required semantics; do not invent numeric values without host evidence.

**Acceptance:** a versioned contract receipt names both seam reviewers and every concrete configuration/error decision. R1/R2 then depend on L0, not on each other. R0 remains the separate hard gate before merging behavioral changes.

## R1 — Bound provider reads and recover graph builds

**Priority:** release blocker. **Effort:** 1–2 focused days including adversarial tests. **Paths:** `src/plugin/vault-provider.ts`, `src/plugin/read-batches.ts`, package-specific new provider tests; coordinate shared consumers in `src/plugin/main.ts`. **Historical reservation:** Codex provider seam. **Depends on:** frozen L0 before behavioral implementation and completed R0 before behavioral merge. Reproduction/instrumentation/design can start immediately.

Instrument elapsed stages and counts without logging note content: enumerate, read, parse/index, publish. Reproduce one never-settling read, rejection, delayed resolution and edit/settings changes during build. Define per-read and whole-build deadlines, bounded underlying work, a typed failure result and safe retry policy. Establish an explicit contract for direct note-read failures so unavailable data is not reported as an ordinary missing note.

Use actual cancellation only where the host API supports it. Otherwise bound/quarantine outstanding operations and reject further work safely until capacity recovers; a timer race is not cancellation. Fence late results by build/index generation and authorization policy. An old completion must not clear a newer build promise, publish an obsolete graph or erase newer dirty events. Preserve single-flight behavior and prohibit unauthorized stale snapshots or silent partial success.

Fix operational-to-operational `markRenamed` before its revision bump, including full-dirty state. Keep note-to-operational removal, operational-to-note addition, real note renames and concurrent edits correct. Treat this as a discrete regression, not the asserted explanation of the live hang.

**Acceptance:** bounded error on hung/rejected reads; no unhandled late rejection; bounded physical outstanding reads across repeated retries; recovery after a recoverable read settles; no stale generation or sensitivity publication; no lost edit/delete/rename; a successful warm and cold build. Verify both Agent provider and viewer `sendFull` behavior because they share read batching. If synchronous indexing is the delay, report measured evidence and a bounded-work design rather than claiming timers preempt it.

## R2 — Close HTTP lifecycle and accounting gaps

**Priority:** release blocker. **Effort:** 0.5–1.5 focused days. **Paths:** `src/plugin/agent-server.ts`, new lifecycle test file; coordinate existing server tests with Q1. **Historical reservation:** Claude dispatch seam. **Depends on:** frozen L0 before behavioral implementation and completed R0 before behavioral merge; can reproduce and instrument in parallel. Integrate with R1 as one reliability boundary.

Define an application deadline, response/error mapping, disconnect handling and one finalization path for global/per-agent admission. Distinguish an idle socket timeout from a whole-operation deadline. Ensure admission is released exactly once on normal completion, exception, disconnect and deadline. Handle late completion without writing to a closed response or decrementing another request's slot. Define restart/stop behavior so a previous server generation cannot corrupt new counters.

Map provider unavailability to a documented structured error/status, with retry semantics appropriate to whether underlying capacity can recover. Preserve authentication, validation ordering, body/URL limits, fairness, read-only behavior and fail-closed sensitivity. Pair logical slot cleanup with R1's bound on actual unresolved work.

**Acceptance:** an intentionally never-settling provider receives bounded client failure instead of silent socket loss; counters return to the correct values; normal/rejected/aborted/late-finished requests cannot double-release; repeated faults cannot monopolize all request slots or grow underlying work without bound; unrelated metadata requests remain available. Test disconnect before and after headers, and stop/start with old promises still outstanding.

## Q1 — Independent modern MCP conformance

**Priority:** release gate. **Effort:** 0.5–1 focused day. **Paths:** new independent conformance fixtures/test file; any changes to `agent-server.ts` are handed to its current single writer. **Parallel:** schema lookup and fixtures independent of R1/R2; shared source integration sequential.

Pin the official revision/schema references and record their identities. Derive expected methods, cache fields and error cases from those sources, not the production constants. Freeze the corrected six-method expectation first: `server/discover`, `tools/list`, `prompts/list`, `resources/list`, `resources/templates/list`, `resources/read`. Retain discovery cache fields; the baseline is correct to include discovery. Add the missing `resources/read` expectation and reject a valid modern `ping` with `-32601`. Do not add unsupported resource methods just because their result type is cacheable. Check actual schema extra-property rules before describing over-stamping as a strict validation failure.

Build a matrix covering protocol/version signaling, required metadata, method support, cache directives, transport/envelope errors and independent client validation. Preserve existing validation-first error assertions. Replace `ping` metadata-carrier tests with a suitable implemented method rather than deleting coverage.

**Acceptance:** demonstrate the relevant failure on the baseline, pass the corrected candidate, record full narrow outputs and strict SDK validation, and obtain peer review of normative expectations. Carl's lookup is historical input with a corrected discovery error; pin the final schema and do not reuse that exclusion. The complete independent harness remains to be delivered. Run Q1/Q2 to completion on the integrated reliability candidate before release freeze.

## Q2 — Correct the narrow lockfile audit evidence

**Priority:** release evidence gap; quickest small independent item. **Effort:** 20–60 minutes. **Paths:** a new immutable audit bundle, private isolated worktree; no product mutation committed. **Parallel:** fully independent.

Start from the stated verified candidate and clean checker pass. Mutate only the installed git dependency's intended `resolved` commit fragment to a branch ref, leaving root dependency declarations unchanged. Assert the exact target before editing. Capture complete stderr/stdout and require the specific non-40-hex resolved-ref guard to fire, rather than the earlier root-dependency equality guard.

Restore original bytes in `finally`, verify original hashes and the checker passing again, even if the experiment fails. Publish script, full output, structured result, base SHA and checksum manifest under a new versioned artifact directory. Do not replace Dale's old bundle or rerun all four unaffected experiments merely to inflate evidence.

**Acceptance:** baseline pass → intended guard failure → byte-identical restore/pass, with reviewable machine evidence agreeing with the README.

## R3 — Integrated candidate and real Hermes gate

**Priority:** release exit. **Effort:** 1–3 hours after a verified candidate and operator access. **Depends on:** R0 identity lock, frozen L0, integrated R1/R2, completed Q1/Q2, and a single frozen candidate. **Paths:** sanitized release receipt; generated release artifacts only through the established build pipeline. **Roles:** integrator, host operator and independent client tester; one person can perform multiple roles, but record which.

Run `npm run verify` using the supported runtime and dependency lock; run applicable browser/renderer checks when shared viewer code changes. After adversarial and conformance qualification, build/package one release candidate and record source SHA, lock/dependency identities, environment, artifact hashes, candidate install, client/SDK/patch identity and rollback receipt. Bind synthetic verification to those bytes; qualify the packaged candidate before activating it. Any source/artifact or load-bearing client change creates a new candidate receipt and requires affected checks again. Do not modify code between qualification and Hermes testing under the same receipt. Have the operator activate the exact package in the existing plugin location and prove the loaded runtime. No unrelated vault/config changes.

Run the real Hermes client against that same runtime: discovery/list, search, permitted UID read, restricted read denial and a tool that emits an observed traversal. Capture results individually and ensure denied paths/counts/neighbors are not leaked. Include cold-start, warm-read and normal host-indexing observations. Run injected stall/late-resolution recovery against a safe synthetic host fixture using the same candidate bytes, not by damaging the live vault. Confirm a recovered runtime can still serve both metadata and data paths.

**Acceptance:** every required call executes and passes; no advertised-only capability counted as tested, no cross-service results substituted, no unexplained socket loss. A timeout, missing traversal proof, scope leak or unidentified loaded build keeps the gate open.

## E1 — Engine service conflict and identity investigation

**Priority:** independent current Engine issue. **Effort:** 0.5–1 day after runtime identification. **Paths:** Engine-side synthetic tests and diagnosis in a separately claimed GKOS-Engine worktree; no edits to vendored `node_modules`. **Depends on:** R0 identity to reproduce the actual service; source analysis can begin earlier.

Trace `GKOS_P6_AUTHORIZED_VIEW_CONFLICT` in the exact deployed Engine source. Compare authorized view, scope, authority generation, indexed generation and corpus binding without disclosing private records. Test matching and mismatching synthetic views. Investigate `NAV_STABLE_ID_AMBIGUOUS` with deliberate duplicate stable IDs at distinct paths and document resolution policy separately from the timeout work.

**Acceptance:** minimal reproducible cause, explicit authorization-preserving remedy or precise missing evidence, and tests preserving fail-closed mismatch behavior. Navigation fallback must retain the same authorized scope. Do not widen permissions, assume embeddings are responsible, mass-rewrite UIDs or treat name warnings as release blockers. Any Engine change requires its own review, pin and Kosmos qualification.

## G1 — Correct generated Graphiti readiness claims

**Priority:** correctness follow-up after R3; research and isolated test preparation may proceed earlier, with product integration deferred. **Effort:** 0.5–1 day. **Paths:** generator/sample and focused tests located by source search; if Engine owns the generator, claim it in that repository and deliver a reviewed dependency update separately. **Parallel:** independent of server/provider edits.

The source-checked assessment found a generated Python sample that emits searchable/`accepted_is_searchable=True` after awaited ingestion without a verifying query. Change the receipt to report only what is proven. Searchability requires an explicit authorized readback and retained evidence, or remains unverified. Trace generated output and its owning source before editing.

**Acceptance:** successful ingestion without readback never advertises proven searchability; failed/delayed readback remains unverified; positive readback records the scoped evidence. Keep the existing profile pin during this correction. Use stubs/synthetic tests, not a new live deployment. Full 0.30.2 adoption belongs to the future qualification track.

## M1 — Mailbox reader correctness and claim visibility

**Priority:** coordination reliability. **Effort:** 0.5–1 day. **Paths:** new read-only tooling/tests and the author's own status/evidence. **Parallel:** independent.

Parameterize agent identity and recipient ACK directory. Validate raw hashes, target IDs, sender/recipient roles, duplicate sequences/ACK ordinals, forks and corrected historical defects. Report chain ambiguity without editing or hiding original messages. Distinguish receipt from work acceptance and refresh stale card/status summaries from evidence without writing another agent's files.

**Acceptance:** synthetic multi-agent fixtures catch the wrong-recipient-directory bug and role inversion, preserve a disclosed fork, identify a genuine hash mismatch, and never infer completion from a generic ACK. No background monitor/timer is introduced by this package. Protocol changes require a separately reviewed proposal.

## B1 — Disposition of conflicting PR backlog

**Priority:** housekeeping, independent of release repair. **Effort:** 20–60 minutes for a small PR; larger uplift reviews may take a day. **Paths:** one review document per PR; no overlapping implementation. **Parallel:** different agents can claim different PR numbers.

Refresh base/head/state for #23, #27, #28, #38 and #41. Compare each change to current main; classify already present, obsolete pin, unique useful behavior, regression or unresolved. For #28 use the existing detailed supersession report. For broad #38/#41 preserve or explicitly account for every unique feature before proposing closure. Give #27 a renderer/content/provenance review.

**Acceptance:** exact head-specific disposition, preserved follow-up work and evidence for each conclusion. Submit the proposed GitHub action through the existing authorization context; do not batch-close or merge merely because every PR conflicts.
