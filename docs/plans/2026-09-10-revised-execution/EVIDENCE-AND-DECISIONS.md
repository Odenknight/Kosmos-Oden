# Evidence and decisions

The mailbox was read directly, including messages, ACKs, agent/status records, quarantine records and artifact bundles. The local audit read and hashed every file, parsed the messages and ACKs, and checked supplied checksum manifests. This is a bounded audit, not a certification that every historical message satisfies the complete protocol. Raw mailbox contents remain local; this packet publishes only the findings needed for work allocation.

## Current release blocker

**Observed by Jeffrey, seq 15:** modern discovery/list and strict SDK validation work; Kosmos vault-backed REST and MCP reads repeatedly hang for about 30 seconds and the socket closes without a response. Search/read/denial/traversal qualification therefore did not complete. The successful metadata gate remains useful evidence, but does not establish data-path health.

**Confirmed source mechanism at the baseline:** `src/plugin/agent-server.ts` installs a 30-second socket timeout without application failure handling. Request counters are released in the dispatch promise's `finally`; a promise that never settles never reaches that cleanup. `src/plugin/read-batches.ts` uses batches of 16 and `Promise.all` without a read or operation deadline. The provider's full/incremental reads and direct note reads depend on `cachedRead`; a never-settling read can hold the shared build indefinitely. Direct `getNoteContent` currently catches read errors and returns `null`, conflating infrastructure failure with an absent note. R1 must distinguish `not_found` from typed `provider_unavailable`/`timeout`.

**Limits of the diagnosis:** host indexing activity correlates with the hang; it is not a proven root cause. Claude seq 17 reports a first call after restart also hanging, so the problem need not follow a previously successful graph build. Claude seq 18's occupied-slot estimate is inferred from requests, not instrumented counter telemetry. Do not present it as a measured counter value or claim the defect is fixed by inactivity.

Moving cleanup to another `.finally()`, replacing `Promise.all` with `Promise.allSettled`, or racing a timer does not by itself settle/cancel an underlying hung operation. Releasing request slots without bounding unresolved work can permit unlimited orphan reads. Synchronous indexing can also block the event loop; timers alone cannot preempt it. R1/R2 must instrument stages and distinguish these cases.

**Separate confirmed bug:** `markRenamed` increments `revision` before excluding operational-to-operational renames, including when already full-dirty. Fix that unnecessary invalidation while preserving real cross-boundary renames and edits during a rebuild. It is not established as the cause of the hang or of duplicate stable identifiers.

## Identity and evidence reconciliation

| Evidence | Assessment | Required action |
|---|---|---|
| Claude seq 16 reports a clean `b0c7ee2` installation and all ten artifact checksums passing | Disk build provenance has evidence; later blanket claims of an unverified package are stale | R0 verifies the active loaded module, installation path and endpoint without discarding the existing receipt |
| Historic installation directory names differ from version labels | Directory suffix alone does not prove the active version | Verify the existing active plugin directory; do not create a duplicate plugin installation |
| Jeffrey seq 16 reports `gkos_*` results and `GKOS_P6_AUTHORIZED_VIEW_CONFLICT` | This differs from Kosmos's 18 unprefixed tools. The examined Engine service implementation contains this tool/error surface; the actual runtime mapping is unresolved | R0 maps endpoint, server identity, tool inventory, loaded build and client. Keep seq 15 open until the same Kosmos gate passes |
| Seq 16 labels the round “8/10 PASS” | The table includes availability/prior-session entries and nine nonfailure rows; advertised capability is not a current executed test | Record each call as advertised, executed-pass, executed-fail or not-tested, with receipt/time |
| Engine authorized-view conflict | An immediate fail-closed Engine error, distinct from the observed Kosmos socket timeout | E1 investigates exact Engine build and scope/generation/index binding. Do not widen authorization or assume embeddings are the cause |
| Stable-ID ambiguity findings | Worth a separate corpus/identity investigation; rename causality is unsupported | Use synthetic duplicate-ID cases and a private read-only audit; no automatic live UID rewrite |
| Empty viewer traversal trail | Selected operations emit visual events; this is not a universal read-health signal | Pair a known event-emitting successful tool with the receiving viewer and event identity |
| Hermes client patch was overwritten by auto-update, then reapplied locally | Test client behavior is load-bearing and can drift independently of server | Preserve patch/commit receipt; rerun negotiation checks if client identity changes |

## Protocol and independent audit

**Correction to revision 1:** the owner-supplied review identified a factual error in this plan's adoption of Carl seq 10. The final 2026-07-28 schema declares `DiscoverResult` as a `CacheableResult`; retain `server/discover` and its cache fields. The baseline is correct on that point. The independent oracle must cover six methods: `server/discover`, `tools/list`, `prompts/list`, `resources/list`, `resources/templates/list`, and `resources/read`. The missing `resources/read` expectation and modern `ping` handling remain work items. A valid modern `ping` must yield unsupported method `-32601`; malformed requests retain validation-first errors. Do not add unsupported resource handlers merely to test normative membership. [Final schema](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts), [official SDK cache-operation list](https://github.com/modelcontextprotocol/python-sdk/blob/main/docs/client/caching.md), [revision changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog).

The earlier claim that discovery was over-stamped is withdrawn. A changelog summary and peer consensus were insufficient to freeze the oracle. Q1 must pin final schema bytes/commit and recheck each expectation independently; this plan correction does not claim the complete harness has been delivered.

The narrower normative lookup was delivered but its discovery exclusion was incorrect. The broader independent conformance matrix remains outstanding. Preserve the established validation-first behavior: missing header `-32020`, missing body metadata `-32602`, unsupported revision `-32022`, and valid-modern `initialize` as unsupported method `-32601`. Replace tests that use `ping` merely as a metadata carrier with an appropriate implemented method, preserving their original assertion. The unused local `-32021` constant is a cleanup decision, not proof that the specification lacks that code.

Dale's five-check audit is delivered and its supplied hashes match. However, the bundle's `audit.mjs` still mutates the first matching git SHA, and `audit-results.json` records a root dependency mismatch. The README claims the corrected targeted resolved-ref failure. Those bytes do **not** demonstrate that narrower claim. Q2 must append a corrected immutable bundle with the exact resolved-ref mutation and full expected guard output. Retain the four other demonstrations as scoped evidence; do not call the whole delivered audit missing or claim that one planted defect proves every checker branch.

## Repository disposition

The source baseline is `b0c7ee2845f24c53586c5bc6feaa9ae28fbff50b`. The root mailbox checkout remains at `04b099a`; other review worktrees can also be stale. New code work starts from a freshly verified base, not from the nearest folder. Preserve all unrelated local files.

The reviewed open PR backlog is #23, #27, #28, #38 and #41, all reported conflicting at inspection. #28 already has a [scoped supersession assessment](https://github.com/Odenknight/Kosmos-Oden/blob/3146fb53377b3a5f079b77c7b31e705bf2cfe262/docs/reviews/2026-09-10-pr28-triage.md); it remains open. #23/#38/#41 need a current-equivalent/unique-change inventory before disposition, and #27 needs renderer-specific review. Old pins and conflicts alone are insufficient reasons to discard unique work. Record each head SHA when claiming B1 and refresh before taking action.

The [cleanup disposition](https://github.com/Odenknight/Kosmos-Oden/blob/3146fb53377b3a5f079b77c7b31e705bf2cfe262/docs/reviews/2026-09-10-cleanup-disposition.md) remains nonblocking: unused error constant, write-only visual protocol version and FIFO visual identity eviction. Do not put these ahead of the data-path blocker.

## Mailbox integrity and coordination

The snapshot contains 95 messages, 119 ACKs, five agent cards and 49 artifact files, among 283 total files; all 42 supplied artifact checksum entries matched. Heads are recorded in [SNAPSHOT.json](SNAPSHOT.json). Refresh before claiming work: this is a time-bounded snapshot.

Historical Jeffrey parent-hash defects and Dale's duplicate sequence/fork remain in the immutable record. Later corrections must be interpreted explicitly; do not restart Dale's identity or use the largest integer alone as chain proof. Some messages omit required reply metadata. Some ACKs invert sender/recipient roles even when their target bytes match; another older ACK cites the wrong target hash and has a later correction. Distinguish schema/role errors from raw-byte mismatches. Reused ACK ordinals and generic receipt acknowledgements are not proof of task completion.

Agent cards, status documents, README registration claims and monitor snapshots lag the messages. A monitor that checks only one recipient's ACK directory can hide other agents. M1 should validate identity-specific paths and report discrepancies without rewriting history. Preserve quarantine evidence and corrections. Do not publish raw operational or vault details with the plan.

## Graphiti disposition

The verified upstream stable release is Graphiti 0.30.2, while the current generated adapter profile targets 0.29.0. See the [source-checked assessment](https://github.com/Odenknight/Kosmos-Oden/blob/3146fb53377b3a5f079b77c7b31e705bf2cfe262/docs/reviews/2026-09-10-graphiti-assessment.md), including corrections to Luna's initial version/API conclusions. The findings and correction were delivered as Codex seq 28/29; receipt ACKs now exist from Carl and Dale.

Current exports and status reporting do not demonstrate a deployed, searchable Graphiti service. Jeffrey's statement that no service exists anywhere in the environment exceeds the inventory evidence available here. G1 addresses the generated sample's unjustified readiness claim; a separate qualification effort evaluates 0.30.2. No dependency upgrade is needed to fix the release blocker.

## Revision 2 execution controls

R0 is now a hard pre-merge identity lock. L0 supplies one shared provider/server operation-lifecycle contract before either behavioral implementation. R1/R2 form one reliability boundary: physical-operation budgeting, generation-safe publication and exactly-once request accounting must be tested together. Q1/Q2 completion precedes a single frozen release candidate and R3. Larger product architecture advances only after the release blocker closes; early work is confined to diagnosis, research, fixtures and interface design.

The mailbox and PR counts in this packet remain the historical revision-1 snapshot; this revision applies the supplied review and rechecks the MCP sources, rather than asserting a fresh full mailbox audit.
