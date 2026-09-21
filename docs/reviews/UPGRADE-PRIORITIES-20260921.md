# Upgrade priorities — 2026-09-21

Scope: repository/build/handoff assessment, not implementation or release qualification.

Repository copy requested by the owner. This document combines the assessment and upgrade priorities; the earlier copy under `_Claude-Code/` is the initial local assessment. Private handoffs and evidence cited below are not included in this public-facing document.

## Assessment

The main problem is the gap between the active checkout, integrated main, and partially qualified development branches. Reconcile those states before adding more implementation. Existing development receipts show substantial progress, but neither a backup publication nor a passing focused suite establishes production readiness. Prioritize contract correctness, native acceptance and recovery ahead of optional semantic features or routine dependency upgrades.

The initial list omitted an explicit work item for governed decision support. The historical Full Engine architecture includes query-intent resolution, policy filtering, authority ranking, source selection, evidence packaging and impact analysis. The historical Rust plan names `gkos-policy` for sensitivity, discoverability, recipient and scope decisions, retaining TypeScript as the reference during parity. These support a planned decision-support capability; they do not establish a separately named autonomous decision maker, completed TypeScript/Rust parity, or delivery to Kosmos. My earlier unqualified “Yes” should be read with that distinction.

## Baseline

- Active checkout: main at 04b099a, Kosmos 0.8.0, Engine 2.1.0. No tracked changes; extensive untracked work and worktrees must be preserved.
- Live `git ls-remote origin refs/heads/main` matches local origin/main b83bfd92574299c6994fd6f889a38af38340bb40: 67 commits ahead of the active checkout. Its package is Kosmos 0.8.3, Engine commit 777ba170b905952817e364f125c794152f118fa4.
- Current resume handoff is SESSION-HANDOFF-20260916-PUBLISHED.md, not the root September 12 Graphiti handoff. It supplements September 15 records and BUILD-PLAN-EXECUTION-20260913.md. Snapshot branches preserve work; they are not qualified releases.
- This review directly checked Kosmos live main only. Other project qualification states below are the latest recorded handoff evidence, not newly rerun results.

## Build instructions

README.md, CONTRIBUTING.md, package.json and docs/RELEASE-PROCESS.md define the build. The v0.5.5 BUILD-DIRECTIVE is historical requirements, not the current release target.

Use an isolated checkout of the chosen current commit, Node 22 or 24 (current main's supported majors), npm >=10, then:

```sh
npm ci
npm run verify
npm run build:standalone
npm run test:browser:chromium
npm run test:browser:full
npm run test:visual
```

`verify` includes typecheck, build, tests, version, lockfile, artifact, invariant and renderer provenance checks. Browser/visual gates are separate. Visual baseline changes require review. Release packaging uses `npm run package:release`; tagged CI produces hashes/provenance. Do not infer current test counts from old README prose.

Fresh checks here: Node 24.18.0, npm 10.9.4; active-checkout typecheck and lockfile check passed. These qualify neither current main nor unfinished candidates. No install, full build, browser suite, native test, service mutation or deployment was performed.

## Recommended order

1. **P0 — Reconcile the build baseline and integration inventory.** Start from verified current main in isolation; compare each candidate/snapshot by feature and commit. Preserve Notes, desktop, viewer and Engine work without blanket-applying backups. Produce one build matrix distinguishing shipped, merged, candidate and unqualified features. This prevents developing against the obsolete 0.8.0 checkout.
2. **P0 — Complete Engine Rust M0 qualification prerequisites.** Resume science WIP f727b14: final review, Rust tests/strict checks and actual 977-entry extraction/audit. Review artifact intent and capture harness before descriptor implementation. Last verified graph baseline 5681e42 has 960 planned entries but remains BLOCKED with 211 unregistered surfaces and eight gates. Finish inventory/intent admission, native Windows/Linux goldens, required Node22/24 CI, WP13/native floor, WP14/WP16 review and coordinator acceptance. Passing development tests are insufficient. Ordinary Rust feature work waits for M0; independent Kosmos/TypeScript work need not.
3. **P1 — Finish governed native retrieval and Notes integration (N/W/R3).** Reconcile the existing candidate rather than recreate it. Bind corpus, revision, generation, scope, continuation and citations; verify stale-selection and revocation behavior. Obtain one final-candidate native Obsidian/Hermes receipt covering discovery, UID lookup, restricted denial, cold/warm reads and traversal. Earlier Notes candidate passed 439 tests; it was not complete native acceptance.

   **P1 — Reconcile and qualify governed decision support across TypeScript, Rust and Kosmos.** Restore this omitted capability to the integration inventory alongside native retrieval. First map the historical Context Compiler/policy/impact requirements to the currently admitted contracts and actual implementations. Specify which decisions are deterministic policy evaluations, which are derived recommendations, and which require human authority. Qualify shared TypeScript/Rust fixtures for authorization, ranking, contradictions, evidence, omissions and refusal; Rust implementation remains subject to M0. Kosmos should consume the accepted Engine contract and expose provenance and review controls without duplicating Engine policy logic. Completion requires exact Engine pins, parity/compatibility evidence and native consumer acceptance. Historical architectural intent alone does not prove that every proposed feature is currently approved or implemented.
4. **P1 — Close reliability and measured performance gaps.** Address the recorded 2,000-note watcher edit budget failure (12,648.90 ms in the cited Engine task), then rerun the applicable fixed workload. Finish bounded admission, deadlines, cancellation, crash recovery and required 24-hour soak. Freeze hardware/configuration/budgets and retain failures. Revalidate that the historical bottleneck persists before further optimization.
5. **P1 — Finish governed writes/Navigation Effects (K1–K4).** Complete production host authority, durable adoption state, scope/freshness binding, effect execution and recovery. Require real conflict/revocation/restart tests and cross-platform receipts before enabling write workflows. Existing prototype modules do not establish product wiring.
6. **P2 — Add authoritative retained history (T1–T3).** Agree retention/deletion/authorization contracts, then persistence and replay. Distinguish valid_at from known_at. File times and Graphiti ingestion cannot reconstruct unretained observation history. This precedes retrospective-history claims, not every optional semantic-search feature.
7. **P2 — Complete optional Graphiti qualification and product integration (G2–G6).** Reuse the managed ledger, recovery and read-only query work already recorded as implemented. Reconcile exact configuration/runtime binding, authenticated product scope, citations and readiness milestones. Complete frozen 1k/10k/50k quality/latency/cost comparisons with at least five measured runs per applicable workload. Keep native fallback. GF-02 is recorded fixed; GF-01 interpretive triplets and GF-03 integrity evidence need explicit dispositions. Select an exact supported dependency during qualification; this review does not recommend blindly adopting the dated 0.30.2 candidate.
8. **P2 — Qualify distribution and promotion (G7 and product release).** Validate standalone/viewer/desktop/sidecar candidates independently, dependency identities and notices/SBOM, exact artifact hashes, reproducibility, platform/native/browser/visual gates and rollback. macOS deferral is not a pass. Refresh evidence after integration and release only the supported, qualified scope.
9. **P3 — Routine dependency and documentation upkeep.** Review renderer/build-tool upgrades individually after the baseline is stable; keep exact pins and rerun affected gates. Fix stale build/test-count/license/engine-ownership prose against the chosen tree. Initial active checkout has README MIT versus package Apache-2.0 and CONTRIBUTING core-ownership language that needs reconciliation. Defer WebGPU, speculative rewrites and extra backends absent a demonstrated need.

The complete Rust M1–M7 program remains open after M0; descriptor preparation does not complete it. Execute its own admitted dependency order, without making unrelated Kosmos fixes wait on the entire rewrite.

## Evidence

Build references: [README](../../README.md), [contributing guide](../../CONTRIBUTING.md), [package scripts](../../package.json), and [release process](../RELEASE-PROCESS.md). These links describe the checked-out revision; the baseline comparison above identifies the newer main revision reviewed separately.

The following handoff and shared-memory references are local evidence locators, not claims that private documents are available in this repository:

- SESSION-HANDOFF-20260916-PUBLISHED.md: verified graph/science state, resume order and required gates.
- SESSION-HANDOFF-20260915.md and SESSION-HANDOFF-20260915-RESTART.md: native runner, parity and M0 constraints.
- BUILD-PLAN-EXECUTION-20260913.md: N/W/T/K/G packages, Notes evidence and later development checkpoints.
- Shared Astra-Oden/projects/gkos-ecosystem/tasks/2026-09-13-managed-graphiti-and-product-engine.md: implemented Graphiti checks and failed watcher budget.
- docs/plans/GRAPHITI-UPDATE-AND-UPGRADE-2026-09-12.md and origin/main revised-execution FUTURE-TRACKS.md: ownership, benchmark and promotion requirements.
- Fresh Git refs/package inspection and two read-only local checks above.
- Historical local architecture input: `GKOS-Engine_v3/instruct/_historical/GKOS-PLATFORM-ARCHITECTURE-v2.0.md`, sections 8 (Context Compiler), impact engine and implementation phases. Lists policy filtering, authority ranking, source selection and evidence packaging.
- Historical local Rust input: `GKOS-Engine_v3/instruct/_historical/GKOS_ENGINE_LITE_FULL_RUST_PRODUCT_BUILD_PLAN_2026-08-21.md`, section 5. Defines `gkos-policy` and the TypeScript reference/oracle during parity. Historical inputs require reconciliation with the current admitted plan before implementation.

No product implementation, merge, remote publication, dependency update or permission request is part of this assessment. Adding this Markdown report to the local repository does not qualify or deploy the proposed upgrades. Historical permissions and pending transfers are not renewed by this report.
