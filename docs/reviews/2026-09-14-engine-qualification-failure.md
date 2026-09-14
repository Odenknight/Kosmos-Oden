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

## Native prevention probe

A subsequent Windows probe tested `CreateFileW` with `GENERIC_READ`,
`FILE_SHARE_READ`, `OPEN_EXISTING`, and `FILE_FLAG_OPEN_REPARSE_POINT`.
It retained the handle during attempted mutation and closed it afterward.
The probe used synthetic files and made no machine configuration changes.

All 200 rename attempts were blocked while the handle was held.
All 200 requests for write access were also blocked.
All 200 rename attempts after releasing the handle succeeded.
All 200 guard acquisitions against an already-open writer were refused.
A separate Node process made 200 rename attempts against a file held by the probe.
All were blocked, and the original bytes remained intact.

This matches Microsoft's documented rule that omitted sharing permissions
prevent conflicting opens until the handle closes, including rename through
delete access. See [CreateFileW sharing rules](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew).

This is native primitive evidence, not a repaired Engine candidate.
The next implementation must hold and release native handles around the complete
retained-authority boundary, bind them to the inspected file identities, and
handle partial acquisition, exceptions and resource limits safely.
It must cover directory ancestry and retained descendants where required.
It also needs supported loading, artifact provenance and native qualification.
The original failing test and full qualification remain required.
