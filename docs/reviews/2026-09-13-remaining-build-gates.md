# Remaining build gates

Initial inventory was taken at Kosmos `f1f8bb7`. Updated rows include the
`59a61ca` runtime candidate consuming Engine `c4940c4efd98e2cab9118b62c25e708737f62bdb`. This is an incomplete-work audit,
not a completion certificate. The September 14 refresh below distinguishes
current source from installed artifacts. Historical receipts retain their original scope
and must not be silently reassigned to newer installed bytes.

## Requirements and evidence still needed

| Package | Current evidence | Required next evidence or implementation |
| --- | --- | --- |
| R0 / R3 exact runtime and Hermes | Installed `59a61ca` with Engine `c4940c4`; [packaged recovery and current Hermes evidence](2026-09-13-packaged-recovery.md) covers stalled reads, HTTP restart, fresh module ownership, discovery/search/UID/policy-consistent read/traversal/warm requests and actual graceful application restart followed by Hermes acceptance. | Final identity lock including the separate Engine endpoint, restricted denial, first-uncached-read evidence where required, and remaining actual host/viewer recovery assertions. Synthetic partial-host checks do not substitute for native acceptance. Final changes require affected checks again. |
| L0 / R1 / R2 / Q1 / Q2 | Lifecycle, concurrency, protocol and lockfile checks exist and current local verification passes. | Reconcile the named work-package assertions and immutable mutation receipts with the final candidate. Passing the broad suite alone is insufficient. |
| E1 Engine service identity/conflict | The earlier mailbox report identifies an unbound `gkos_*` surface, distinct from the plugin API. | Bind the reported endpoint/build and reproduce matching/mismatching authorized views and ambiguous stable IDs before claiming this issue repaired. |
| G1 readiness claims | Versioned Graphiti correction and recovery reports exist. | Check final exported artifacts and wording against actual backend readback and publication, retaining unavailable states. |
| M1 mailbox | The [reader qualification](2026-09-13-mailbox-reader-qualification.md) now records 16 passing tests, including actual two-recipient CLI execution, raw-hash and role errors, preserved forks/corrections, and no completion inferred from ACKs. | Reconcile remaining mutable status/card summaries against original evidence in the authorized owner scope; retain unresolved manifest authentication and protocol-conformance limits. A report or ACK is not that proof. |
| B1 PR backlog | The September 12 disposition preserves inspected heads and records PR55/23 closure without claiming PR55 merged. The [latest live refresh](2026-09-14-pr-backlog-refresh.md) confirms PR27/38/41 open and PR28/55 closed unmerged; PR27 copy-check behavior is now included. | Refresh the specified PR heads/states and account for all unique behavior in 27/28/38/41 before final disposition. |
| N1â€“N3 retrieval | Local Notes snapshots bind provider identity, graph object and policy; readable query fixtures pass. | Complete negotiated service identity, digest/scope/generation binding and required cross-service pagination/Unicode/revocation fixtures. Preserve transitive Kosmos lineage versus direct-neighbor Engine semantics explicitly. |
| W1â€“W4 workspace | Search, preview, origins/evidence, effective header, lineage declaration status, map, drawers, tabs and UID mode continuity have automated coverage. Native tabs and adapter receipt availability observed on `78abe88`. | Complete accepted fixture matrix and native view/edit/return/layout/performance qualification; hidden-window checks do not prove visible interaction. Evidence targets remain unverified and unresolved in the inspector. |
| T1â€“T3 temporal history | [T1 draft](../workspace/OBSERVATION-HISTORY-CONTRACT.md) defines observation ordering, current authorization, explicit retention, deletion, replay and migration requirements. An isolated [SQLite source-observation ledger](../workspace/SOURCE-OBSERVATION-LEDGER.md) now covers append/retry, known-by selection, source-deletion observations and separate projection records bound to exact source-observation receipts. An independent deny-authority component passes an isolated history-backup restoration test. Local retained-content purge now passes hold, rollback, restart and process-death tests. Native source preparation and a synthetic Obsidian insert/revocation boundary now have evidence. Production storage ownership, owner controls, external derived-data cleanup and the accepted T2 matrix remain open. | Define and implement observation records, authorization, retention/deletion/replay/migration and disabled-by-default storage; prove known-at retrieval from retained records rather than file timestamps. |
| Adoption / Effects | Native SQLite adoption storage and a guarded controller now exist alongside the in-memory test store. Component checks do not prove product-host integration. The consumer now pins Engine `13ff119`, with its full Node 24 suite passed; production adapters remain unavailable because host binding and path/durability evidence are incomplete. Engine draft PR74 at `c8a6348` adds prepared execution, read-only inspection, inspection-bound authorized recovery, and deadline shutdown. Kosmos `a330d05` validates recovery/shutdown evidence; its full verification passed 617 tests. These components do not establish a configured host. | Durable receipt/registry storage and recovery, prepared-intent host support, lifecycle/reconciliation/assistance, exact authority and native acceptance before enabling effects. Preserve default-off behavior. |
| G2 / G3 | Merged managed-host code and scoped synthetic receipts exist. | Exact runtime/model/backend/configuration reconciliation and complete production recovery boundaries; retain ambiguous attempts as quarantined. |
| G4 / watcher / MOC qualification | The [performance follow-up](2026-09-13-watcher-performance-follow-up.md) records a later 2,000-note edit at about 10.77 seconds, still FAIL_BUDGET. Earlier measurements remain historical diagnostics. Neither result is a five-run distribution. | Repair measured end-to-end latency, run declared workload sizes and five-run distributions, reviewed semantic value/cost comparison, and the full 24-hour soak. |
| G5 / G6 | Engine `5f96a71` includes authenticated service queries, authorized source-manifest reconciliation, revision invalidation and a persistent loopback query host. Its isolated synthetic deployment now connects through the actual Engine host adapter. Five gateway queries took 392â€“403 ms; source mutation denied readiness/query access, exact restoration recovered readiness, and all three service processes recovered together after restart. Earlier direct-reader checks covered unauthorized/wrong-binding denial, unchanged graph counts and matching source citations. Kosmos source now pins Engine `13ff119`. All 628 consumer tests and the full verification chain passed with the installed updated dependency. The synthetic Obsidian vault runs candidate `27309b2`; the normal plugin remains `59a61ca`. Candidate installation and load do not prove visible native semantic acceptance. | Connect and qualify the actual native client; complete live vault source/policy/configuration invalidation, resolved citations, governed UI, outage/native fallback and final artifacts. Synthetic deployment and component success do not establish production vault retrieval. |
| G7 / release | Candidate commits and individual receipts are published. Clean `59a61ca` packaging reproduced the qualified plugin hash; installation verified 11 artifacts and preserved a backup. Native debug installer installation, same-version reinstall and ordinary uninstall passed at their earlier scoped source. | Exact final artifact, cross-version migration/rollback rehearsal, operational ownership, all required gates, final debug sweep and reviewed main merge. A backup or same-version reinstall is not a rollback rehearsal. |
| Rust / independent implementation | The independent Rust main baseline passed 400 Windows tests. Branch `f40bd22` adds 18 validation cases, exact comparison, and 72 cross-platform TypeScript observation replays. The real Rust validation command and approved reference results remain unfinished. | Independent contract/parity evidence where required; TypeScript consumer tests cannot substitute for a second functioning implementation. |

## Current Engine qualification boundary

The original `ab38572` full run failed a retained-directory swap check.
The native guard correction at `6f1486f` passed that check in the full suite.
That later suite passed 1,168 tests and failed one observation-runner packaging test.
Neither failed run qualifies the Engine or the consumer pin.

The combined Effects and watcher candidate is `c8a6348` in Engine draft PR74.
It fixes the runner's native module packaging and child-process cleanup.
Its full qualification finished on September 14 at 06:13:30 UTC.
All 1,213 tests passed, with no failures, skips or cancellations.
The receipt binds exact `c8a6348`; both command-log hashes were verified.
Terra has recorded the terminal result while preserving both earlier failures.
The receipt still has `release_qualified: false`. New SEA packaging changes
on `codex/sea-native-guard-20260914` require their own qualification.
Read [CURRENT-WORK.md](../../CURRENT-WORK.md) for the current branch handoff.
The final consumer pin, native installation, other publication paths, and remaining
release gates still require their own evidence even if that suite passes.

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


The [Node 22 native executable report](2026-09-14-node22-native-executable.md)
records eight focused guard checks and the now-passing real Engine supervisor
crash-recovery test. The first full supervisor run exposed a writable-log and
retained-status handle conflict. Kosmos now places new diagnostics in a separate
private directory. Five crash recoveries, bounded restart refusal, initial and
restarted authenticated graph retrieval, and shutdown passed with synthetic
notes and a byte-verified local executable. This is specific Windows native
evidence, not completion of installation, visible acceptance, cross-platform,
full Engine, or release gates.


Engine `13ff119` full Windows Node 24 qualification completed at 06:42:29 UTC
on September 14. All 1,215 tests passed with no failures, skips, or cancellations.
The source revision and both raw command-log hashes were checked. The receipt
still says the release is not qualified. A separate isolated full Node 22.22.1
qualification ended at 07:15:16 UTC with 1,212 passed, two failed, and one skipped.
Its status is FAIL and release_qualified is false. Later focused passes do not
replace that result; see the [terminal update](2026-09-14-node22-terminal-qualification.md).
The Kosmos dependency now includes this revision. Neither this pin update nor
the Node 24 pass completes the remaining product and native acceptance gates.
