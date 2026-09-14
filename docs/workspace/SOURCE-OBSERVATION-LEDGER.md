# Source observation ledger: isolated implementation

This implements part of the [observation-history contract](OBSERVATION-HISTORY-CONTRACT.md).
It does not complete T1, T2, or T3.
The plugin does not open this ledger or retain history automatically.

## Implemented behavior

`src/workspace/source-observation-ledger.ts` owns a dedicated host-supplied SQLite connection.
Missing or disabled retention configuration returns before opening a database.
Explicit initialization refuses an existing schema.
The component checks the application ID, schema version, exact schema, and retained configuration.
It repeats those checks inside each transaction.

The host supplies a corpus identity, authenticated current-state capability, clock, current source-read authorization, and supported parser/schema checks.
The capability must bind the selected corpus, retention revision, authority generation, source identity and host lifetime.
A mutable global enabled flag is insufficient.
The host must prove unique source identity, exact original bytes, and parser receipts before append.
The ledger verifies the source digest through the Engine and validates canonical source paths and authored UIDs.
These checks do not replace native source capture.

Source versions, source-deletion observations, and projection-publication observations share committed sequence order.
Each receives its own host observation timestamp.
Authored validity remains separate and may be unknown.
Equal timestamps use sequence order.
Regressing commit timestamps are refused.
The same operation and input return the original receipt after restart.
Changed retry input is a conflict.
A retry also checks that the retained payload is still available and correct.

The envelope and payload are inserted in one synchronous SQLite transaction.
The connection uses full synchronization and rollback journaling.
A record digest covers sequence, operation, observation time, parent, and canonical input.
Each source's parent sequence and the global sequence are checked when reading metadata.
Projection events have no source-version parent and do not alter a source's parent chain.
Payloads and their supported parser/schema interpretation are checked before being published.

A known-by query chooses the last retained source observation at or before its cutoff.
A deletion observation blocks returning an older version for a later cutoff.
A deletion observation is not a physical purge request.
No retained version means unavailable coverage.
The query never substitutes a current file or a newer observation.

Queries return a one-use, host-held synchronous publication capability.
It holds the cutoff, source identity, and a digest of all committed envelope receipts.
A same-count replacement of ledger contents invalidates the watermark.
Current authorization is checked again before retained payload loading and before publication.
A changed watermark or observed stale host refuses publication.
An observed failed or throwing host-authority check permanently invalidates that ledger instance.
Close it and reopen under a fresh host capability; a restored boolean cannot revive pending reads.
Hidden and absent sources produce null.
Hidden-source payloads are not loaded by unrelated readable-source queries.
Historical paths never provide read authority.

Retention requires positive age, logical-byte, and observation-count limits.
Logical bytes include payload and stored envelope fields; SQLite page overhead is separate.
Current implementation ceilings are 64 MiB of logical records, 10,000 observations, and ten years of age.
The database also has a page-count ceiling.
Capacity exhaustion refuses append without pruning records.
Expired observations are unavailable to queries.

## Projection publication observations

A version-one `projection_published` input records the projection ID, configuration digest,
publication receipt digest, authority and policy digests, and exact source-observation references.
Each reference contains source UID, committed sequence, source digest, and observation receipt digest.
`sourceReference` supplies those coordinates only for a currently readable retained source version.
References to deletion observations, missing records, mismatched receipts, duplicate identities,
future records, or expired versions are refused.
UUID letter-case variants count as the same identity for duplicate-reference checks.
The original stored UID spelling, source bytes and receipt digests are preserved.
Distinct UUIDs remain valid references even when their letter case differs.
References are ordered by committed sequence.

The host must supply `projectionCurrent` in addition to ordinary source authority.
It must attest the exact observed publication, configuration, generation, and referenced sources.
A caller-provided string or remote readiness claim alone is not a witness.
The ledger passes the callback a detached copy and checks the witness again before commit.
Current source read access and retained source bytes are also checked.
A native Graphiti-to-history witness adapter now exists. Its production owner wiring remains unfinished.

Projection append uses the same atomic transaction, retry, capacity and clock rules.
It does not change original source bytes, source observation times, or authored validity.
A projection record is evidence of host-observed publication, not proof of extraction correctness.
Projection inputs are limited to 5,000 unique source references and 1 MiB of canonical input.
Source inputs retain their 16 KiB limit. Both count against the logical-byte retention limit.

The SQLite structure and existing rows are unchanged.
The new projection input is explicitly versioned.
The earlier source-only reader at `9a6edd1` refuses this unknown record kind without modifying records.
The current reader reopens the same database and retains the original source observation.
This compatibility check is not migration, backup restoration, or rollback qualification.

## Evidence

`test/source-observation-ledger.test.mjs` uses actual temporary SQLite databases.
It checks restart persistence, retry identity, equal and regressing clocks, deletion cutoffs,
explicit limits, byte accounting, hidden-source isolation, path reuse, final-boundary revocation,
missing payloads, corrupt metadata, unexpected schemas and triggers, and default-off behavior.
Child processes terminate before commit and after commit without orderly close.
Reopening proves rollback in the first case and durable retry recovery in the second.
All 30 component tests pass. The earlier source-only checkpoint passed all 565 repository tests.
The two added regression tests failed before the authority and watermark fixes.
These are Windows component tests, not native Obsidian acceptance.

An [independent deletion-authority component](HISTORY-DELETION-AUTHORITY.md) now provides durable deny receipts.
An isolated two-database test proves that restoring source history alone cannot undo those denials.
The shared `bindHistoryHost` adapter now checks corpus equality and combines native read authority with independent denial state.
Actual plugin integration and native private-database qualification remain unfinished.

## Remaining work

- Bind the ledger to a qualified private native database capability and actual source-capture receipts.
- Accept the retention contract and owner controls before production activation.
- Bind projection recording to actual native Graphiti publication readback and qualify projection-history queries.
- Connect owner controls and retention holds to local purge, then implement external derived-data cleanup.
- Add independent deletion-watermark reconciliation so backup restoration cannot resurrect purged records.
- Complete replay, import provenance, migration, backup and rollback qualification.
- Add the required valid-at interpretation, cursor binding and complete temporal query interface.
- Complete native durability, startup/rendering budgets, and the accepted T2/T3 fixture matrix.

No production history storage or temporal workspace feature is enabled by this component.

## Local retained-content purge candidate

`purge` requires an operation receipt from the independent deletion authority.
The host must bind its action capability to that receipt and the current hold revision.
A retention hold returns a blocked outcome without committing changes.
The operation removes all retained versions of the denied UID, including case variants.
It also removes each retained projection record that references that UID.
Unrelated source records stay unchanged.

Each affected observation slot becomes a version-one `purged` marker.
The marker retains the original operation ID, corpus, denied UID, denial witness and purge time.
The original sequence and observation time remain reserved for integrity and retry handling.
They do not claim that the purge happened at the original observation time.
Source bytes, paths, content digests, parser receipts and projection references are removed.
Markers still count toward the observation limit. The ledger does not renumber history.
Public append cannot submit a purge marker or resurrect a purged UID.

SQLite secure deletion is enabled for the transaction.
A hold or authority failure after an actual update rolls the transaction back.
A committed retry returns the original purge receipt, even if a later hold exists.
Seven additional tests cover denial requirements, holds, withdrawal after updates,
unchanged unrelated records, restart retry, process death, and raw SQLite sentinels.
All 52 history tests and all 572 repository tests pass on Windows.
This is not forensic erasure or native product qualification.
External Graphiti data, source notes, backups and storage-device remnants are outside this operation.
The remaining native integration, recovery and migration gates still apply.

The earlier reader at `1d47ac0` refuses the new purge marker without modifying the store.
The current reader reopens the same synthetic store and returns no purged content.
This compatibility refusal check does not qualify migration or rollback.

## Native source preparation

`KosmosAgentServer.prepareHistorySource` uses the native provider's committed graph and exact indexed source bytes.
It requires one readable UUID across the complete graph, including hidden case aliases.
It checks the caller's byte limit before publication and reuses the provider's bounded source read.
The returned capability holds bytes privately until one synchronous `publish` call.
That call includes corpus, original UID spelling, path, exact source digest, and the actual Engine projection.
It includes a live `current` function for the owning history transaction.
Source changes, cancellation, corpus changes and observed policy changes invalidate the capability permanently.
No MCP method exposes it. It does not enable storage or choose retention policy.

The history owner must combine that current function with its independent denial and retention authority.
The projection is parsing provenance, not a current read grant or owner approval.
Preparation does not invent known-at or valid-at values from index or file timestamps.
Three new automated fixtures cover exact bytes/provenance, one-use publication, hidden or duplicate IDs,
invalid budgets, and changes during reads or before publication.
Full verification passes 578 tests.

An additional synthetic probe ran the candidate API and ledger inside Obsidian.
It used the actual isolated vault provider and native SQLite, on Node 22.22.1 / Electron 39.8.3.
A revision change after the actual INSERT caused rollback and left zero observations.
A fresh source capture then committed one observation that survived closing and reopening the database.
Temporary storage was removed afterward. The installed plugin was not replaced.
The probe used synthetic owner bindings. It does not qualify private-directory ownership,
production retention approval, independent authority wiring, or the full native history workflow.

## Native publication witness

`prepareNativeHistoryProjection` reuses the publication verifier used by native semantic queries.
It reconciles the retained publication receipt against a fresh authorized source manifest.
It requires an exact retained reference for every distinct published source.
Missing sources, extra references, wrong digests and duplicate UUID identities are refused.
The history corpus must match the native provider identity.
The Graphiti namespace remains a separate identity inside the verified publication binding.

The prepared input records the verified projection ID, configuration, scope and policy digests,
and the exact observation digest from the same detached receipt that was verified.
The immutable source references retain their original observation receipts and times.
`projectionCurrent` attests only that exact input while the native publication remains current.
The owner must wire this callback into its history host before append.
The ledger independently revalidates all source receipts and bytes at append.
A fabricated retained receipt therefore fails even when its source digest matches the publication.

Six synthetic fixtures cover successful append/retry, invalid source coverage, forged retained receipts,
revocation, input mutation during preparation, corpus changes, and a changing publication property.
Full verification passes 584 tests, including existing semantic query behavior.
This native component is not yet connected to production owner controls or publication readback.
The earlier source-capture probe is separate from the publication probe below.

## Obsidian publication-history boundary probe

The candidate publication adapter now also ran inside the actual isolated Obsidian vault.
It reconciled the recorded synthetic publication with the current native source manifest.
It used a temporary SQLite history database and an actual retained source observation.
An injected authority withdrawal after the projection INSERT rolled back that transaction.
Only the source observation remained.
A fresh witness then committed the projection observation.
Reopening the database preserved both records and the original source observation time.
The projection referenced the original source sequence.
Temporary storage was removed, and the installed plugin was not replaced.

This used the previously recorded publication receipt.
It did not query the live publication service or qualify current service readback.
Synthetic owner authority and temporary storage also do not establish production ownership or retention approval.
These remaining gates stay open.

A [Windows native file guard](NATIVE-HISTORY-STORAGE.md) now verifies ownership, ACLs, file identity and journal safety.
Its actual Obsidian probe passed, but permission-check latency remains unqualified.
The guard is not wired into production storage. Other platforms and operational backup separation remain open.


## Case-insensitive UUID selection

History reads now select observations by UUID identity across letter-case variants.
A later uppercase deletion therefore prevents a lowercase query from returning an older version.
An earlier cutoff can still return the version actually retained before that deletion.
Source references accept equivalent UUID spelling but return the exact committed spelling and receipt.
Current authorization must allow both the requested spelling and the selected retained spelling.
An inconsistent host grant cannot use an alias to expose a denied retained version.

Three regression fixtures failed before this change and pass afterward.
They cover deletion and restart, newer-version selection, receipt identity, and current read denial.
The 61 history, deletion-authority, and native-publication fixtures pass together.
No stored envelopes, digests, original times, sequences, or parent receipts are rewritten.
Existing version-1 parent chains remain as recorded; a canonical parent-chain migration is not supplied here.
This fixes read selection. It does not complete migration, owner controls, or T1–T3 qualification.

Full repository verification after the selection fix passed 598 tests with no failures or skips.
