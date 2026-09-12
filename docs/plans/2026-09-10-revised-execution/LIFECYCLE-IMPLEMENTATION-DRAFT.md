# L0 implementation decisions for review

Status: historical proposal, superseded by [LIFECYCLE-FREEZE.md](LIFECYCLE-FREEZE.md). Reproduction baseline `b087ab3` has four independently exercised failures: direct read exceptions collapse to not-found; operational rename bumps revision; disconnect retains logical admission; old-lifetime completion decrements a new request. Q2's corrected targeted resolved-ref audit passes with byte-identical restore.

## Proposed concrete limits

- Whole HTTP operation: 25 seconds from admission, monotonic clock. Keep the existing 30-second idle-socket backstop. Client disconnect may end logical work earlier.
- Individual physical read: 10-second logical deadline. Whole shared build: 20-second logical deadline. All values injectable into isolated tests through constructor options; production defaults remain bounded and documented. Qualify these proposed values against the active target before freeze.
- Physical host read capacity: 16 across provider reads and the viewer's shared read helper for one host vault. No unbounded queue: provider uses ordered batches; excess independent calls receive typed unavailable. Existing single-flight graph callers share the build and do not issue duplicate host operations. Bound waiting callers by server admission plus the single viewer build; document any additional callers found during integration.
- A module-level registry keyed by the host vault is insufficient across plugin reload; retain the registry for the host-process lifetime with a collision-resistant versioned key. Do not release permits when a plugin/server object is replaced. Validate host access to the registry and compatibility across reloads before implementation.

## Proposed state and errors

The server owns an epoch object with counters and idempotent request finalizers. Stop finalizes that epoch's live logical requests; old callbacks keep references only to that epoch. A response-close listener releases logical admission once. A whole-operation timer returns a structured failure if possible, while late dispatch completion is prevented from writing or emitting stale traversal events.

The provider owns physical read permits. Timeout marks the logical operation failed; permits stay occupied until settlement. Read/build generations invalidate timed-out results, sensitivity changes and old index instances. Build publication is conditional and atomic; pending dirty events survive failure and late completion. A finally handler clears the shared build pointer only if it still owns that pointer.

Direct note results remain strings or null for actual absence; typed `ProviderError` carries `timeout` or `provider_unavailable` for infrastructure faults. REST maps timeout to 504 and unavailable/capacity to 503. MCP tools return a structured tool error (`isError: true`) with the same application reason, not a fabricated reserved RPC code. Whole-request deadline before a tool envelope is available requires an explicit transport-error mapping reviewed against Q1. Error bodies exclude source content and private paths. Retryability distinguishes pending capacity from proven recovery; no success or not-found response may hide a timeout.

## Review and freeze inputs still needed

R0 active process/loaded module and Hermes client identity; the server seam handoff; reviewer agreement on concrete limits, host-process registry lifetime, cancelled/late traversal suppression, whole-request MCP envelope behavior and authorization-preserving retry policy. Existing installed disk provenance is verified, but the local process/listener checks found no active target. This draft does not waive those gates or authorize a behavioral merge.
