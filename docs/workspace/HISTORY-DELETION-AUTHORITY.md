# Independent history deletion authority

This is an isolated native component for the [observation-history contract](OBSERVATION-HISTORY-CONTRACT.md).
It does not delete source history, source notes, or Graphiti data.
No plugin hook opens it automatically.

`src/workspace/history-deletion-authority.ts` stores durable deny receipts in a separate, host-owned SQLite database.
The host must keep this authority outside source-history backup and restore operations.
A history backup cannot establish that no later denial exists.
Missing or unavailable independent authority must prevent history activation.

Opening is disabled by default.
Initialization requires an explicit corpus, receipt-count limit, and current owner capability.
Each denial additionally requires a synchronous owner-action capability bound to that operation and source.
The database checks its exact schema, application identity, configuration, canonical receipts, sequence and digest chain.
It uses full synchronization and rollback journaling.
An identical operation retries its original receipt.
Conflicting retries and regressing commit clocks are refused.
Receipt count is explicitly bounded at a maximum of 10,000.
Logical receipt bytes are also capped at 16 MiB, with a separate SQLite page-count ceiling.
Capacity exhaustion is an error, not a successful deletion acknowledgement.

Receipts contain corpus, operation, sequence, source UID, denial time, predecessor digest and receipt digest.
They contain no source path, source-content digest, source bytes or model output.
Denials do not expire and there is no undelete operation.
UUID case variants match the same denial without rewriting historical source records.
This is denial metadata, not a physical purge receipt.

## Binding source-history access

`capture()` returns a native-only capability with corpus, watermark, `current` and `isDenied`.
The complete capability stays in the trusted host.
The host must require its corpus to equal the source-history corpus before opening that ledger.
It must combine current source authorization with the deny check.
For example, `canRead` must require both `nativeCanRead(uid) === true` and `!deletion.isDenied(uid)`.
The source-history `current` callback must also require the native epoch and deletion capability to remain current.
The native epoch must cover database identity, authority generation and host lifetime.

Each currency check validates the full denial chain.
A changed chain, corruption, closed authority or observed owner failure invalidates the captured capability.
Restoring an earlier head does not revive an already invalidated capability.
Reopen under a fresh verified native capability to establish new state.
The implementation does not provide a safe way to restore the deletion authority itself from an old backup.
That authority needs its own independently verified recovery procedure.

## Verified component behavior

All nine deletion-authority tests and all 28 source-history tests pass.
Full repository verification passes all 557 tests.
The tests use actual synthetic SQLite databases.
They cover default-off behavior, current owner/action checks, bounded capacity, retry conflicts,
clock regression, UUID case variants, missing authority, corrupt chains and unknown schemas.
Process termination immediately after the INSERT but before COMMIT leaves no readable denial.
Termination after commit preserves the denial and its original retry receipt.

The two-database test creates a source-history backup, then commits a separate denial.
The old pending history read is rejected.
Restoring only the earlier history database still returns no source content under the current deny authority.
Closing that authority makes history access unavailable.
This proves the isolated restore-denial invariant, not a complete production migration or rollback rehearsal.

## Remaining work

- Bind this authority to the qualified native private-directory capability and operational ownership.
- Complete the owner deletion flow and exact operation/source approval binding.
- Check retention holds before destructive purge and expose a blocked outcome when they conflict.
- Purge retained payloads, source references and derived outputs after durable denial.
- Record and qualify purge recovery, including crashes during cleanup.
- Reconcile import and migration with this independent current authority.
- Qualify actual native restoration, authority recovery, and startup/rendering costs.

Both this authority and production source-history retention remain unwired and disabled.
