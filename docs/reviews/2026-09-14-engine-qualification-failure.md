# Engine qualification failure

Candidate: `ab38572fe5e32103f834373146a08a863bc458e9`.
Platform: Windows x64, Node 24.18.0.
Run: September 14, 2026, 04:14:25–04:34:39 UTC.

The full Engine qualification failed.
The build passed.
The test runner reported 1,163 tests: 1,162 passed and one failed.
No tests were skipped or cancelled.
The terminal receipt reports release_qualified=false.
Both retained command logs match their receipt hashes.

The failing test is `reserved derivation rejects retained authority swap-and-restore`
in `test/watcher-pointer-host.test.mjs`.
It renames a retained sibling away, creates and removes a substitute,
then restores the original during `writeReservedWatcherFile` body derivation.
The operation was accepted instead of throwing `GKX_WATCHER_FS_DIRECTORY_CHANGED`.
A single focused rerun passed. That did not resolve the full-run failure.

A separate 200-iteration Windows stress test reproduced the issue.
The original watcher implementation accepted 14 swaps and rejected 186.
A proposed additional directory-stat boundary accepted seven and rejected 193.
The proposed fix was therefore rejected and removed.
Its generated artifacts were rebuilt from the restored candidate source.
No timestamp-only repair is claimed.

This gate needs a stronger Windows filesystem observation or prevention mechanism.
Do not replace the requirement with a retry, sleep, test skip, or passing spot check.
The candidate must pass the retained-authority requirement and full qualification
before its success can be reported or the consumer pin advanced on that basis.
The separate Effects API component results do not override this failure.
