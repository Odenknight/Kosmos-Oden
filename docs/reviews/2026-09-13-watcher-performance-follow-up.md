# Watcher performance follow-up

Date: September 13, 2026.

The two-second gate for a 2,000-note edit remains open.
These are single-cycle diagnostics on Windows with Node 24.18.0.
They are not five-run distributions or a 24-hour soak.

The current Engine baseline was `72689af`.
Caller instrumentation measured 179 canonical-serialization calls lasting at least five milliseconds.
Together they took 6,635.78 milliseconds across startup and one edit.
This is not an edit-only measurement.
The largest caller group was activation-bundle canonicalization.
Its two calls took 854.28 milliseconds in total.
The instrumented edit took 12,332.50 milliseconds.

A separate Unicode-validation experiment preserved 72,764 differential cases.
Its edit still took 11,980.50 milliseconds.
That experiment was not adopted.
It does not establish a performance improvement.

Engine `ba2e65d` removes repeated hashing of the same validated graph delta.
The digest is reused only within one activation validation call.
The detached record, transition comparisons, and graph-state comparison remain validated.
No cache survives the call.

All 31 recovery-contract and coordinator tests passed.
The build, source-inventory check, and whitespace check passed.
The modified full-path diagnostic took 12,381.49 milliseconds for one edit.
It reparsed one source and used about 653.34 MiB of resident memory.
This result does not demonstrate an end-to-end speedup.
The change reduces repeated work, but does not resolve the performance gate.

Next work must address the larger repeated activation serialization and publication costs.
Preserve canonical bytes, detached-input checks, authority checks, and recovery evidence.
The installed plugin and Kosmos dependency pin were not changed for this Engine commit.

## Rejected artifact-byte reuse experiment

A follow-up tested one cached artifact encoding per internally sealed record.
Only records detached and deeply frozen by the private validator could use it.
Caller-frozen records remained uncached.
The test checked all four artifact kinds, canonical-byte equality, nested mutation,
accessor rejection, and artifact-kind isolation.

All 32 recovery-contract and coordinator tests passed.
The source inventory and package checks also passed.
The full 2,000-note edit still took 13,137.69 milliseconds.
Resident memory reached 868.70 MiB.
These single-cycle diagnostics do not establish a speedup or a reliable regression size.
They provide no reason to adopt the extra cache and retained strings.

The experiment was removed.
The Engine source and built modules were restored to `ba2e65d`.
The patch, test output, source hashes, and workload receipt remain in private working records.
Do not repeat artifact-string caching without new evidence addressing memory retention.
The larger work is reducing repeated serialization at its callers while preserving validation.


## Additional serialization and filesystem diagnostics

Two more private experiments ran against unchanged Engine `ba2e65d`.
Neither was adopted. They do not satisfy the two-second gate.

The first reused encoded property names only within a serialization call, capped at 256 keys.
It retained no objects or authority results across calls.
It matched canonical bytes and rejection behavior in 6,967 differential cases, with no getter calls.
A small alternating serialization benchmark improved, but the complete edit still took 12,021.95 ms.
The run reparsed one source and used 657.05 MiB RSS.

The second used a simpler serializer only for the digest of an already detached recovery record.
Strict canonical validation at the external boundary stayed in place.
The complete edit still took 11,913.36 ms and used 661.73 MiB RSS.
This was a diagnostic workload, not complete semantic or security qualification.
The small differences between these single runs do not establish an end-to-end improvement.

A separate unchanged-baseline run instrumented synchronous filesystem calls during the edit only.
It took 12,414.05 ms and used 651.21 MiB RSS.
The sum of inclusive synchronous operation timings was 283.71 ms.
That sum can double-count nested calls and excludes asynchronous filesystem work.
It is not a complete I/O profile.
The largest recorded contributors were:

| Operation | Calls | Inclusive milliseconds |
| --- | ---: | ---: |
| `lstatSync` | 6,743 | 120.90 |
| `readSync` | 1,900 | 53.64 |
| `openSync` | 104 | 38.14 |
| `fsyncSync` | 14 | 27.11 |
| `realpathSync.native` | 333 | 24.42 |

The synthetic source snapshot digest matched the earlier diagnostic.
Each run performed one `apply_changes` operation and reparsed one source.
All three runs ended with `FAIL_BUDGET`, not a runtime error or a qualified pass.

The earlier CPU profile separately attributed substantial time to `stableJsonValue`
and its object-entry callback. That older profile includes startup and edit together.
Taken together, the evidence does not support targeting synchronous disk operations first.
Next work should address repeated canonical validation at its callers, using an edit-only CPU
profile if needed to separate current costs. Preserve hostile-input validation and exact bytes.
The previous validated-clone experiment changed only three pretty-print round trips;
its negative result does not measure replacement of all recovery-record canonical clones.
Engine source, Kosmos's dependency pin, and the installed plugin remain unchanged by these experiments.
