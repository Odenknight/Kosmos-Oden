# Remaining build gates

Initial inventory was taken at Kosmos `f1f8bb7`. Updated rows include the
`59a61ca` runtime candidate consuming Engine `c4940c4efd98e2cab9118b62c25e708737f62bdb`. This is an incomplete-work audit,
not a completion certificate. Historical receipts retain their original scope
and must not be silently reassigned to newer installed bytes.

## Requirements and evidence still needed

| Package | Current evidence | Required next evidence or implementation |
| --- | --- | --- |
| R0 / R3 exact runtime and Hermes | Installed `59a61ca` with Engine `c4940c4`; [packaged recovery and current Hermes evidence](2026-09-13-packaged-recovery.md) covers stalled reads, HTTP restart, fresh module ownership, discovery/search/UID/policy-consistent read/traversal/warm requests and actual graceful application restart followed by Hermes acceptance. | Final identity lock including the separate Engine endpoint, restricted denial, first-uncached-read evidence where required, and remaining actual host/viewer recovery assertions. Synthetic partial-host checks do not substitute for native acceptance. Final changes require affected checks again. |
| L0 / R1 / R2 / Q1 / Q2 | Lifecycle, concurrency, protocol and lockfile checks exist and current local verification passes. | Reconcile the named work-package assertions and immutable mutation receipts with the final candidate. Passing the broad suite alone is insufficient. |
| E1 Engine service identity/conflict | The earlier mailbox report identifies an unbound `gkos_*` surface, distinct from the plugin API. | Bind the reported endpoint/build and reproduce matching/mismatching authorized views and ambiguous stable IDs before claiming this issue repaired. |
| G1 readiness claims | Versioned Graphiti correction and recovery reports exist. | Check final exported artifacts and wording against actual backend readback and publication, retaining unavailable states. |
| M1 mailbox | A dated mailbox candidate report exists. | Verify the actual parameterized reader and multi-agent fixtures against all named hash, role, recipient-directory, fork and ACK requirements. A report or ACK is not that proof. |
| B1 PR backlog | The September 12 disposition preserves inspected heads and records PR55/23 closure without claiming PR55 merged. The [latest live refresh](2026-09-14-pr-backlog-refresh.md) confirms PR27/38/41 open and PR28/55 closed unmerged; PR27 copy-check behavior is now included. | Refresh the specified PR heads/states and account for all unique behavior in 27/28/38/41 before final disposition. |
| N1â€“N3 retrieval | Local Notes snapshots bind provider identity, graph object and policy; readable query fixtures pass. | Complete negotiated service identity, digest/scope/generation binding and required cross-service pagination/Unicode/revocation fixtures. Preserve transitive Kosmos lineage versus direct-neighbor Engine semantics explicitly. |
| W1â€“W4 workspace | Search, preview, origins/evidence, effective header, lineage declaration status, map, drawers, tabs and UID mode continuity have automated coverage. Native tabs and adapter receipt availability observed on `78abe88`. | Complete accepted fixture matrix and native view/edit/return/layout/performance qualification; hidden-window checks do not prove visible interaction. Evidence targets remain unverified and unresolved in the inspector. |
| T1â€“T3 temporal history | [T1 draft](../workspace/OBSERVATION-HISTORY-CONTRACT.md) defines observation ordering, current authorization, explicit retention, deletion, replay and migration requirements. An isolated [SQLite source-observation ledger](../workspace/SOURCE-OBSERVATION-LEDGER.md) now covers append/retry, known-by selection, source-deletion observations and separate projection records bound to exact source-observation receipts. An independent deny-authority component passes an isolated history-backup restoration test. Local retained-content purge now passes hold, rollback, restart and process-death tests. Native source preparation and a synthetic Obsidian insert/revocation boundary now have evidence. Production storage ownership, owner controls, external derived-data cleanup and the accepted T2 matrix remain open. | Define and implement observation records, authorization, retention/deletion/replay/migration and disabled-by-default storage; prove known-at retrieval from retained records rather than file timestamps. |
| Adoption / Effects | Native SQLite adoption storage and a guarded controller now exist alongside the in-memory test store. Component checks do not prove product-host integration. Native adapter still reports `split-prepare-api-missing`; Obsidian adapter reports durable intent unimplemented. | Durable receipt/registry storage and recovery, prepared-intent host support, lifecycle/reconciliation/assistance, exact authority and native acceptance before enabling effects. Preserve default-off behavior. |
| G2 / G3 | Merged managed-host code and scoped synthetic receipts exist. | Exact runtime/model/backend/configuration reconciliation and complete production recovery boundaries; retain ambiguous attempts as quarantined. |
| G4 / watcher / MOC qualification | Latest shared task records a 2,000-note edit at 12,648.90 ms, FAIL_BUDGET. | Repair measured end-to-end latency, run declared workload sizes and five-run distributions, reviewed semantic value/cost comparison, and the full 24-hour soak. |
| G5 / G6 | Engine `5f96a71` includes authenticated service queries, authorized source-manifest reconciliation, revision invalidation and a persistent loopback query host. Its isolated synthetic deployment now connects through the actual Engine host adapter. Five gateway queries took 392â€“403 ms; source mutation denied readiness/query access, exact restoration recovered readiness, and all three service processes recovered together after restart. Earlier direct-reader checks covered unauthorized/wrong-binding denial, unchanged graph counts and matching source citations. Kosmos remains pinned to `7f28b2a`; its candidate UI/client work is not installed. | Connect and qualify the actual native client; complete live vault source/policy/configuration invalidation, resolved citations, governed UI, outage/native fallback and final artifacts. Synthetic deployment and component success do not establish production vault retrieval. |
| G7 / release | Candidate commits and individual receipts are published. Clean `59a61ca` packaging reproduced the qualified plugin hash; installation verified 11 artifacts and preserved a backup. Native debug installer installation, same-version reinstall and ordinary uninstall passed at their earlier scoped source. | Exact final artifact, cross-version migration/rollback rehearsal, operational ownership, all required gates, final debug sweep and reviewed main merge. A backup or same-version reinstall is not a rollback rehearsal. |
| Rust / independent implementation | Separate implementation remains historical input. | Independent contract/parity evidence where required; TypeScript consumer tests cannot substitute for a second functioning implementation. |

## Immediate implementation priority

The adoption storage component is implemented; the remaining work is actual
product-host authority, prepared intents, recovery integration and native
acceptance. Reuse the existing receipt/registry validation and SQLite store.
Keep source-note mutation disabled until the separate Effects authority and
prepared-intent requirements are met.

Native drawer acceptance remains open because the observed document was hidden
and its resize transition did not arrive. Repeating the same probe without new
window evidence does not advance that gate. The pending isolated Hermes denial
endpoint approval is separate from already-authorized Observatory synthetic
code transfers; neither must be inferred from automatic goal continuations.

## Authoritative inputs

- [Release work packages](../plans/2026-09-10-revised-execution/WORK-PACKAGES.md)
- [Native, workspace, temporal and Graphiti tracks](../plans/2026-09-10-revised-execution/FUTURE-TRACKS.md)
- [Graphiti upgrade packages and acceptance](../plans/GRAPHITI-UPDATE-AND-UPGRADE-2026-09-12.md)
- [Effects handoff](../navigation-effects/IMPLEMENTATION-HANDOFF.md), [qualification plan](../navigation-effects/QUALIFICATION-PLAN.md), and [capability matrix](../navigation-effects/CAPABILITY-MATRIX.md)
- [Installed Notes evidence](2026-09-13-installed-notes-acceptance.md) and [Engine consumer upgrade](2026-09-13-engine-main-consumer-upgrade.md)
- [Historical branch disposition](2026-09-12-branch-disposition.md) and [mailbox report](2026-09-12-mailbox-test-candidate.md)
- Owner-supplied governed workspace plan retained locally under `_Claude-Code/claude-handoff/governed-workspace-implementation-plan.md`.
