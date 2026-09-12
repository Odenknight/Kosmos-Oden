# Branch, data and release disposition — 2026-09-12

Scope: all fetched branches and local worktrees in Kosmos-Oden and the Observatory,
plus retained workspace data and new peer mail. Fork snapshots are test inputs,
not branches to merge into either product. Baseline Kosmos main `8fb43c6`,
Observatory main `6d0086c`. Branch tips below are the inspected identities; later
remote changes require another check. No branch or private data was deleted.

## Integration decisions

- Merge PR 56's Graphiti qualification findings (CI green); append the already
  completed GF-02 disposition instead of rewriting its historical evidence.
- Preserve the two uncommitted managed-MOC consumer tests on main. They exercise
  the existing Engine coordinator and grant no host or write authority.
- Merge the locally deployed Observatory observer/lab branch after its candidate
  checks. Keep public VPS activation and complete-profile claims separate.
- Refresh this roadmap's obsolete session-based identity description.
- Do not merge the broad PR 38/41 trees: they would replace current protocol,
  rendering and source-write safeguards. PRs 61/62 already preserved standalone
  export/scan fixes and explicit proposal decisions. Remaining unique code is
  described below, not silently discarded.

## Remaining items and suggested dispositions

| Item | Assessment | Suggested disposition |
| --- | --- | --- |
| Kosmos PR 23 | Engine 1.1.3 pin predates the current exact 2.2 development pin; current guards cover dependencies and devDependencies | Close as superseded; do not downgrade |
| Kosmos PR 27 | Naming is adopted; proposed Google OKF provenance text changes historical claims | Hold until provenance evidence is reviewed; retain current notices |
| Kosmos PR 38 / PR 41 | Large desktop/service uplift, including vendored glib; selected features already integrated | Split remaining native shell, sidecar and coordinator work; require platform tests and current contracts |
| Retrieval/MOC branch | Loopback-only 2025 MCP client and explicit trusted Node MOC host; not compatible as-is with the LAN Observatory or modern Kosmos endpoint | Rebase a bounded service client; qualify its wire contract and host recovery before integration |
| Debouncer/reconciliation/self-write suppression | Unique orchestration helpers accompany the old uplift; current main already exports the Engine coordinator | Reuse Engine where possible; integrate only with an actual supported host and end-to-end lifecycle tests |
| Corpus exclusions in uplift | Current operational-path predicate is broader and already wired | Keep current implementation |
| Kosmos PR 55 | Timeout invariant and checker match main exactly; PR targets old reliability branch | Close as superseded by main |
| Kosmos PR 58 / Observatory PR 6 | Moves hosted jobs to R720; queued/incomplete or failed/cancelled checks at inspection | Hold until every required matrix lane and package comparison passes; preserve hosted fallback |
| Observatory PR 2 | Patch-equivalent to main; replacing its old tree would remove newer connection, reader and release checks | Close as superseded; no additional merge |
| Celestial renderer handoff (received during review) | Patch targets Kosmos 8fb43c6; four renderer files, compressed astronomy mappings, shader detail, atlas APIs and enlarged frame. Consumer reports 16 tests/11 browser checks; full upstream suite not run | Retain as explicitly requested future integration; rebase, adapt host lifecycle, measure rendering/size impact and preserve orbit spacing before a separate feature PR |
| Native Hermes/client acceptance | JEFFREY has instructions but no new execution receipt (head 18) | Keep release gate open; do not substitute direct HTTP or synthetic browser evidence |
| Full GKOS/GKX qualification | Fork-pair lab run has 5 pass/3 fail; catalog has no complete qualifying profiles | File exact-version discrepancies upstream; keep failures, add missing profile criteria separately |
| Public lab | Local observer works; VPS scaffold is not a tested public multi-tenant service | Keep anonymous observer disabled publicly; add isolated stores, scoped credentials, quotas and cleanup before launch |
| Large-vault layout | Latest synthetic 50k run reports 2,073 residual intersections and ~2,825 MB RSS | Profile and reproduce overlaps; preserve requested local orbit spacing; no claim of collision-free layout |
| Graphiti GF-01/GF-03 | Source-level criteria, no live backend qualification | Retain optional track; require identity, scope, revocation and readback evidence |
| Mailbox qualification claims | Later owner decision requires a Viewer claim/evidence and permits shared ownership without granting independence | Use current README; retain historical peer corrections; no qualification inferred |
| Diagram/doc-lint offers | Peer proposals and corrected false-positive reports, not product defects | Optional documentation work; verify each source before applying |

## Release decision

Kosmos-Oden remains **0.8.3 candidate**. There is no 0.8.3 release tag; 0.8.2 is
the latest inspected stable tag. These are fixes to an unreleased candidate, so
0.8.4 would add a number without closing Hermes acceptance or the exact Engine
release gate. Keep exact commit/hash receipts, then release a qualified candidate
through the existing tagged CI process. Modern MCP's legacy-client break remains
explicitly documented; this review does not claim backward compatibility.

Observatory gains **0.2.0-rc.1** because local observation and executable lab lanes
are additive features, rather than a 0.1.1 patch. No stable tag, public deployment
or conformance certification is created by that version label.

## Data disposition

| Data group | Assessment and disposition |
| --- | --- |
| Existing worktrees | 20 registered Kosmos worktrees checked; no tracked modifications at inventory time. Preserve active worktrees; offer archive only after ownership/use checks |
| Root patches and staging TS/MJS | 51 root files hashed locally. Treat patches as historical candidates, not authoritative current source; compare against current feature implementations before reuse |
| Untracked managed-MOC compatibility test | Useful executable consumer evidence; included in consolidation |
| Revisions 3/4 plans, handoff packets and adoption proofs | Preserve exact historical snapshots; current implementation/release documents take precedence. Do not bulk-copy older plans into current architecture |
| Desktop src-tauri, prototype and vendored data | Retain with the deferred native/managed-host track; no recursive cleanup or implicit shipping |
| Build packages, logs and benchmarks | Retain exact package manifests and raw failed/passed runs; index the final package separately from superseded attempts. Do not publish private live-note outputs |
| Raw mailbox and ACKs | Preserve append-only bytes including known chain/ordinal defects. Corrections are later messages; ACK is not completion |
| Marius fork checkouts | Retain exact commits as lab test inputs; no upstream changes or qualification inferred |
| Observatory original checkout | Contains earlier tracked/untracked operator work; isolated lab branch preserves its own source without overwriting that checkout |
| Private runtime configuration / credentials / vault | Operational data, excluded from Git integration and public reports |

The all-branch table below is a disposition inventory, not a claim that every
historical file has been executed on current main. Whole-tree diffs and current
feature implementations were reviewed for unique work; runnable checks are used
for selected integrations. Raw local hashes are retained separately.

## Every inspected branch/ref

| Repository / ref | Tip | Disposition |
| --- | --- | --- |
| Kosmos-Oden / `codex/adapter-sensitivity-seam` | `fb9690e6e056` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `codex/agent-presence-galaxy-spacing` | `10c90ca047d5` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `codex/branch-consolidation` | `8fb43c646325` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `codex/engine-service-uplift-20260906` | `65e9354f220b` | Retain and split: unique desktop/reconciliation/retrieval/MOC prototypes; do not merge whole branch |
| Kosmos-Oden / `codex/fix-startup-timestamps` | `d56d0d38fa9c` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `codex/hide-links-by-default` | `5328036d4705` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `codex/main-engine-review-20260908` | `b35b27e0b0a4` | Patch-equivalent to main; no content merge needed; archive candidate |
| Kosmos-Oden / `codex/mcp-compliance-fix` | `bb2f6c4c1fed` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `codex/modern-mcp-and-engine-adapter` | `7afdd983b15f` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `codex/note-ambiguity-heartbeat-history` | `1dd823d053a0` | Patch-equivalent to main; no content merge needed; archive candidate |
| Kosmos-Oden / `codex/pr45-modern-only` | `81acaaf1be1e` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `codex/pr47-main-reconcile` | `85e0843c2955` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `codex/proposal-review-receipts` | `1efab7bd566d` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `codex/release-0.8.3-candidate` | `71f4ac932d75` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `codex/release-cleanup-disposition` | `b087ab37f0f7` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `codex/release-final-docs` | `4303c750c121` | Patch-equivalent to main; no content merge needed; archive candidate |
| Kosmos-Oden / `codex/release-r0-final` | `0d3342b3655e` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `codex/release-reliability` | `6d3417ab2edd` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `codex/retrieval-moc-next-update` | `35644f103771` | Retain and split: unique desktop/reconciliation/retrieval/MOC prototypes; do not merge whole branch |
| Kosmos-Oden / `codex/reviewed-pr45-48` | `fd52a6f9f32b` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `codex/roadmap-mailbox-upgrades` | `37247ea5f81c` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `docs/modernize-readmes-20260826` | `dd92d07cf49e` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `feat/engine-adapter-seam` | `a38aefe50cef` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `feat/modern-mcp-transport` | `7fb7181d871d` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `feature/kosmos-standalone-qualified` | `7a2a02501b7a` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `feature/kosmos-standalone-v0.85` | `fbec1f9daeb4` | Retain and split: unique desktop/reconciliation/retrieval/MOC prototypes; do not merge whole branch |
| Kosmos-Oden / `feature/navigation-effects-reconciliation-20260827` | `cef2adf22e36` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `fix/uid-selector-allowlist` | `f368ba853b57` | Patch-equivalent to main; no content merge needed; archive candidate |
| Kosmos-Oden / `main` | `04b099a851d4` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `origin` | `8fb43c646325` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `origin/Kosmos-Oden_v0.5.5` | `454ae6726199` | Historical naming/version/roadmap line; no rollback; archive candidate |
| Kosmos-Oden / `origin/Kosmos-Oden_v0.6.5` | `df43aba76f06` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `origin/agent/adopt-engine-v1-1-3` | `096b92ad8962` | Superseded dependency pin; close PR 23 without merge; retain history |
| Kosmos-Oden / `origin/agent/current-naming-and-pin-clarity-20260804` | `eb8486aa4c7c` | Historical naming/version/roadmap line; no rollback; archive candidate |
| Kosmos-Oden / `origin/agent/ecosystem-roadmap-alignment` | `f77a9cf98171` | Historical naming/version/roadmap line; no rollback; archive candidate |
| Kosmos-Oden / `origin/agent/gkx-compatibility-r12-20260803` | `a326f7e9b72e` | Naming superseded; provenance wording requires historical evidence; hold PR 27 |
| Kosmos-Oden / `origin/agent/kosmos-product-graphics` | `2d935a8936e5` | Patch-equivalent to main; no content merge needed; archive candidate |
| Kosmos-Oden / `origin/agent/krs-gkx-branding` | `c28e13ca3b1b` | Patch-equivalent to main; no content merge needed; archive candidate |
| Kosmos-Oden / `origin/agent/rename-vault-kosmos-to-kosmos-oden` | `1bbbc541f4b3` | Historical naming/version/roadmap line; no rollback; archive candidate |
| Kosmos-Oden / `origin/ci/r720-linux-routing-20260912` | `0977e020cd71` | Hold: exact-head CI not fully green; runner migration is operational, not needed for product fixes |
| Kosmos-Oden / `origin/codex/agent-presence-galaxy-spacing` | `10c90ca047d5` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `origin/codex/complete-identity-protocol-20260901` | `e52be4eaf615` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `origin/codex/docs-owner-decisions-20260912` | `93bd37a2f35a` | Patch-equivalent to main; no content merge needed; archive candidate |
| Kosmos-Oden / `origin/codex/engine-service-uplift-20260906` | `65e9354f220b` | Retain and split: unique desktop/reconciliation/retrieval/MOC prototypes; do not merge whole branch |
| Kosmos-Oden / `origin/codex/hide-links-by-default` | `5328036d4705` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `origin/codex/integrate-kosmos-identity-20260831` | `52b843c50a9e` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `origin/codex/main-engine-review-20260908` | `b35b27e0b0a4` | Patch-equivalent to main; no content merge needed; archive candidate |
| Kosmos-Oden / `origin/codex/modern-mcp-and-engine-adapter` | `7afdd983b15f` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `origin/codex/note-ambiguity-heartbeat-history` | `1dd823d053a0` | Patch-equivalent to main; no content merge needed; archive candidate |
| Kosmos-Oden / `origin/codex/proposal-review-receipts` | `1efab7bd566d` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `origin/codex/reconstruct-kosmos-identity-protocol-20260901` | `280c2e896d36` | Old per-session identity/protocol design superseded by modern stateless main; preserve as history |
| Kosmos-Oden / `origin/codex/recover-kosmos-identity-protocol-20260901` | `e52be4eaf615` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `origin/codex/release-0.8.3-candidate` | `71f4ac932d75` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `origin/codex/release-cleanup-disposition` | `b087ab37f0f7` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `origin/codex/release-final-docs` | `4303c750c121` | Patch-equivalent to main; no content merge needed; archive candidate |
| Kosmos-Oden / `origin/codex/release-r0-final` | `0d3342b3655e` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `origin/codex/release-reliability` | `6d3417ab2edd` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `origin/codex/retrieval-moc-next-update` | `35644f103771` | Retain and split: unique desktop/reconciliation/retrieval/MOC prototypes; do not merge whole branch |
| Kosmos-Oden / `origin/codex/roadmap-mailbox-upgrades` | `37247ea5f81c` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `origin/docs/graphiti-qualification-review-2026-09-12` | `c7d915650337` | Merged as PR 56; preserve historical finding and append current GF-02 fix |
| Kosmos-Oden / `origin/docs/mcp-2026-07-28-protocol-era` | `81acaaf1be1e` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `origin/docs/modernize-readmes-20260826` | `dd92d07cf49e` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `origin/feat/r3-engine-service-reporting` | `85e0843c2955` | Integrated/superseded candidate history (often squash-merged); do not replay old tree; archive after ownership check |
| Kosmos-Oden / `origin/feature/kosmos-standalone-qualified` | `7a2a02501b7a` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `origin/feature/kosmos-standalone-v0.85` | `fbec1f9daeb4` | Retain and split: unique desktop/reconciliation/retrieval/MOC prototypes; do not merge whole branch |
| Kosmos-Oden / `origin/feature/navigation-effects-reconciliation-20260827` | `cef2adf22e36` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `origin/fix/artifact-guard-delete-regex` | `8054783da496` | Exact invariant/guard files retained on main; close redundant PR 55 where applicable |
| Kosmos-Oden / `origin/fix/engine-version-metadata` | `92c20f810aac` | Patch-equivalent to main; no content merge needed; archive candidate |
| Kosmos-Oden / `origin/fix/modern-wire-cache-fields` | `a1b1341bca4c` | Patch-equivalent to main; no content merge needed; archive candidate |
| Kosmos-Oden / `origin/fix/renderer-overview-dpr-ceiling` | `173cad665ad3` | Patch-equivalent to main; no content merge needed; archive candidate |
| Kosmos-Oden / `origin/fix/timeout-ordering-invariant` | `64a6001ceedf` | Exact invariant/guard files retained on main; close redundant PR 55 where applicable |
| Kosmos-Oden / `origin/fix/uid-selector-allowlist` | `f368ba853b57` | Patch-equivalent to main; no content merge needed; archive candidate |
| Kosmos-Oden / `origin/main` | `8fb43c646325` | Already in main history; retain/archive after workspace ownership check |
| Kosmos-Oden / `origin/pr52` | `8054783da496` | Exact invariant/guard files retained on main; close redundant PR 55 where applicable |
| Kosmos-Oden / `origin/review-pr23` | `096b92ad8962` | Superseded dependency pin; close PR 23 without merge; retain history |
| Kosmos-Oden / `origin/review-pr27` | `a326f7e9b72e` | Naming superseded; provenance wording requires historical evidence; hold PR 27 |
| Kosmos-Oden / `origin/review-pr28` | `eb8486aa4c7c` | Historical naming/version/roadmap line; no rollback; archive candidate |
| Kosmos-Oden / `origin/review-pr38` | `fbec1f9daeb4` | Retain and split: unique desktop/reconciliation/retrieval/MOC prototypes; do not merge whole branch |
| Kosmos-Oden / `origin/review-pr41` | `65e9354f220b` | Retain and split: unique desktop/reconciliation/retrieval/MOC prototypes; do not merge whole branch |
| Kosmos-Oden / `origin/review-pr56` | `c7d915650337` | Merged as PR 56; preserve historical finding and append current GF-02 fix |
| Kosmos-Oden / `recovery/feature-nextcloud-sync-v0.6.5-beta.3` | `45242ff233e0` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `codex/governance-lab` | `aefb925ff8f8` | Merge reviewed lab; 0.2.0-rc.1 candidate, public qualification deferred |
| GKOS-Observatory / `codex/observatory-experience-20260905` | `03b7ec743dc0` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `github` | `6d0086cba952` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `github/ci/r720-linux-routing-20260912` | `02e25a3b6b99` | Hold: exact-head CI not fully green; runner migration is operational, not needed for product fixes |
| GKOS-Observatory / `github/codex/engine-settings-handoff-20260831` | `916ecc1c36fd` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `github/codex/integrate-observatory-identity-20260831` | `2c01d9ea1263` | Patch-equivalent to main; no content merge needed; archive candidate |
| GKOS-Observatory / `github/codex/observatory-experience-20260905` | `03b7ec743dc0` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `github/codex/observatory-plan-execution` | `f8f703c5aa00` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `github/codex/observatory-test-qualification-20260908` | `25ab4b863492` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `github/codex/observatory-testing-handoff` | `ae89a1ffb009` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `github/fix/mcp-workload-scheduling` | `7e9e5637e456` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `github/main` | `6d0086cba952` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `origin` | `03b7ec743dc0` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `origin/codex/observatory-experience-20260905` | `03b7ec743dc0` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `origin/codex/observatory-plan-execution` | `f8f703c5aa00` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `origin/codex/observatory-testing-handoff` | `ae89a1ffb009` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `origin/fix/mcp-workload-scheduling` | `7e9e5637e456` | Already in main history; retain/archive after workspace ownership check |
| GKOS-Observatory / `origin/main` | `34ef79bfb804` | Already in main history; retain/archive after workspace ownership check |


The celestial handoff also reports a newer local Observatory deployment, `20260912-observer-render-merge`. This review does not overwrite that deployment with the earlier lab branch. Its source/reference package is retained in the original Observatory checkout for the separate renderer integration track.
