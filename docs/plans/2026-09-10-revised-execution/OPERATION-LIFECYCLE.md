# L0: shared operation-lifecycle contract

Status: required semantics for review; numeric budgets and wire mapping must be frozen in an implementation receipt before R1/R2 behavioral implementation. This document does not claim implementation agreement or runtime qualification.

**Invariant: a logical timeout never establishes cancellation of the physical vault operation.** Provider and server form one reliability boundary even when different agents own their files. R0 independently locks the actual runtime before any behavioral merge.

## Ownership and lifetimes

| Resource | Owner | Rule |
|---|---|---|
| HTTP/global/per-agent admission | Server request finalizer | Each admitted request owns an exactly-once release token scoped to its server epoch. Normal result, error, disconnect, deadline and stop compete for one terminal transition. |
| Physical read permit | Provider operation registry | Acquire before issuing a host read. Release only on observed settlement or proven completed cancellation. Timeout/disconnect/cancellation request alone cannot release it. |
| Shared graph build | Provider generation owner | One build per current generation. A caller leaving does not implicitly cancel a build needed by other callers. Cancellation is coordinated by the build owner. |
| Publication | Provider generation owner | Publish only if build/index/policy generation still matches; stale results cannot replace the graph, clear a newer promise, or discard newer dirty events. |
| Runtime target | R0/candidate receipt owner | Bind process/lifetime, endpoint, loaded plugin, artifacts and client/patch; a restart produces a new epoch and load receipt. |

## Deadlines, capacity and cancellation

Use a monotonic whole-operation deadline propagated through the request and provider. Define read and build budgets and the relationship between them; a socket idle timeout is not the operation deadline. Bound both issued physical reads and queued waiters. Track stages without note contents. Document limits of timer enforcement when synchronous indexing blocks the event loop and qualify that path separately.

When a host API supports cancellation, retain the physical permit until cancellation actually completes. When cancellation is impossible, timed-out work remains registered and consumes its physical permit until settlement. Return a typed bounded failure and refuse additional work when capacity is exhausted; repeated logical retries cannot create unlimited orphan reads. Define recovery when remaining work settles and an operator recovery path when it never does. Never reset the physical ledger merely because the HTTP server restarts.

A server restart invalidates old request callbacks and response writes; old finalizers can release only their own old-epoch token, never decrement new counters. Physical work surviving that restart stays accounted for across epochs. A full host-process termination can establish that its physical operations ended; prove the new process identity before rebuilding its accounting. Define the same behavior for plugin/provider replacement within a surviving host process, where resetting an object is not proof that its I/O ended.

## Failure and late-result semantics

Distinguish successful content, authorized `not_found`, provider timeout, provider unavailable/capacity exhausted and authorization denial. Read exceptions must not collapse into `null`/not-found. Freeze exact REST status/body, MCP result/error envelope and retryability in the receipt; preserve existing authentication and validation ordering, and do not allocate a reserved protocol code to an unrelated infrastructure error.

After logical finalization, consume any late promise outcome without an unhandled rejection or second response. It may settle its physical registry entry but cannot publish stale data or mutate a newer generation. Preserve single-flight behavior and sensitivity revocation; prohibit silent partial snapshots and unauthorized stale fallback. Keep real rename/edit/delete events, including changes during a full rebuild. Operational-to-operational renames must not bump the data revision.

## Freeze receipt and joint acceptance

The claiming L0 owner records a contract version/digest, R0 target reference, R1/R2 reviewer agreement, exact deadline/physical-capacity/queue limits, host cancellation evidence, generation identifiers, finalization owners, REST/MCP mapping, retry/recovery policy and instrumentation fields. Every unresolved field keeps L0 open. Contract changes require a new receipt and affected tests.

Joint tests cover: never-settling and rejected reads; late success/rejection; physical budget exhaustion across retries; disconnect and deadline races; shared-build callers leaving independently; stop/start and plugin replacement with outstanding reads; sensitivity changes; stale build publication; dirty events and cross-boundary renames; distinct not-found/unavailable outcomes; recovery when physical work settles. Assert logical counters and physical outstanding counts separately. A healthy metadata endpoint alone is not an acceptance result.
