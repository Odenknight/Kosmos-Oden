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
