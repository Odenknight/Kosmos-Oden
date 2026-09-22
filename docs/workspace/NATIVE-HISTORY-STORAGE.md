# Native history storage candidate

Status: Windows component evidence and an unqualified Debian implementation candidate. Production retention remains disabled.
This does not complete native history ownership, recovery, or performance qualification.

`openNativeHistoryDatabase` accepts an existing native-owned directory, a fixed database name,
an authenticated owner-current callback, and an explicit initialization flag.
The only names are `observations.sqlite` and `denials.sqlite`.
It creates no directory and never changes existing permissions.
Initialization exclusively creates a new file; an existing file is never silently replaced.
Opening existing state refuses a missing or empty database.
The caller's ledger still validates the database application ID, schema and content.

The Windows guard checks a fixed local drive, canonical paths, current-user ownership,
regular files, file identity, link count, bounds and access-control lists.
The directory and database allow the current user, SYSTEM and Administrators.
Ancestor ownership and grants are checked for unsafe replacement or security-changing access.
The Windows installer service is also a trusted ancestor owner.
Journals must be regular, singly linked, private files.
Unexpected WAL/SHM sidecars are refused; history uses SQLite DELETE journaling.

The capability checks live file/directory identities and permissions again on `current`.
An observed change or owner withdrawal invalidates that capability permanently.
Restoring the old path or granting permission again does not revive it.
The database factory opens once.
The history owner must combine this current function with corpus, retention, source,
and independent deletion authority in the ledger's transaction callbacks.
The owner must close its SQLite connection as well as invalidate the capability.
These checks are not protection against the same user or a machine administrator acting maliciously.

Source history and deletion authority still need separate operational storage and backup scopes.
This file guard does not establish that separation or approve retention.
Linux admits only a canonical existing storage directory beneath the current native home on an
ext2/ext3/ext4-family filesystem. The directory must be owned by the current effective user with
mode 0700. Its ancestors must be owned by root or that user and must not be group/other writable.
Database and rollback-journal files must be canonical, singly linked, current-user-owned regular
files with mode 0600. Initialization uses exclusive no-follow creation with mode 0600 and verifies
the opened descriptor before closing it; it never repairs, replaces, or removes a failed file.
The complete directory, ancestor, file, permission, and filesystem identity is checked again on
every capability use. Linux refuses Windows helper profiles rather than ignoring them.

Linux mode checks enforce absence of effective access by other ordinary users, including POSIX ACL
entries because their effective mask is represented by the group mode bits. They do not prove that
ACL metadata is absent. The ext-family allowlist rejects other filesystem implementations; it is
not proof of physical locality, persistence, encryption, or backup behavior. The deployment must
qualify the actual persistent native Debian home separately. As on Windows, these checks do not
protect against deliberate replacement by the same user or root. Node path APIs cannot provide
descriptor-relative `openat2` protection for that stronger threat model.

macOS and other platforms currently return unavailable; their native ownership qualification remains open.
No browser bundle or renderer receives this Node-only capability.

## Evidence and limits

Six Windows fixtures pass using new synthetic directories.
They cover exclusive creation, existing-state reopen, absent authority, invalid filenames,
file replacement/restoration, hard links, owner withdrawal, changed ACLs and linked journals.
Full repository verification passes 590 tests with no skips on this Windows run.
Only the new test directories receive ACL changes, and they are removed afterward.

The candidate also ran inside the actual isolated Obsidian vault.
It verified a new private directory, opened SQLite, wrote synthetic data, and invalidated on close.
One measured preparation took about 1,809 ms. One current-permission check took about 612 ms.
These are single observations, not a performance distribution or a passing budget.
Repeated synchronous ACL subprocess checks are too costly for frequent workspace reads.
A faster implementation must preserve the same permission and replacement checks.
Do not activate this candidate in the product until that cost and the remaining native gates are qualified.

The default temporary directory on the tested workstation has additional account grants.
Its name is not proof of privacy. The fixtures instead explicitly protect new directories under the user profile.
Windows PowerShell must load its own module paths; inheriting PowerShell 7 paths prevented ACL commands from loading.
The test ACL changes use the .NET directory access-control API and require no audit-privilege escalation.

## Optional native ACL helper

A small Windows C++ helper now performs the live ownership and ACL reads without starting PowerShell.
Build it with `npm run build:history-acl` on a Windows host with Visual Studio C++ Build Tools and a Windows SDK.
The build uses the installed compiler and Windows libraries. It downloads no dependencies.
It produces `dist/native/history-acl.exe` and a manifest with the executable and source hashes.
The executable is not automatically installed or included in the plugin by this step.

A trusted native installer may pass `{path, sha256}` as the fifth database-capability argument.
The host must establish the helper's installation authority; renderer input cannot supply that profile.
The guard captures the profile and verifies the actual executable bytes before every execution.
A changed executable invalidates the capability. There is no automatic fallback after helper failure.
When no helper is configured, the original PowerShell checker remains available.

The helper reads current Windows security descriptors on every call.
It preserves raw ACE order, whereas the .NET path normalizes some equivalent allow entries.
The comparison fixture matched the simple ACE multisets and owner/group/control fields.
Both paths refused a shared-directory fixture.
The helper deliberately refuses unknown ACE forms instead of guessing their meaning.
It currently supports standard filesystem allow/deny ACEs.

All seven storage tests pass with the helper, including changed ACLs, file replacement,
hard-linked journals, owner withdrawal, and a changed hash-pinned executable.
The same suite also runs against the PowerShell path in ordinary repository verification.

Five standalone native-helper samples took about 22–25 ms, compared with 601–628 ms for PowerShell.
An actual Obsidian probe measured about 62 ms to prepare the capability and
18.3, 18.5, 18.6, 18.7 and 22.7 ms for its five current checks.
The native probe verified private storage, a SQLite write, and capability invalidation on close.
It reloaded the rebuilt private test module; an earlier cached-module run was discarded as a helper measurement.
These are small synthetic samples. They do not qualify the complete history workload,
production helper packaging, other operating systems, or the separate indexing budget.
Production retention and the remaining native owner/backup workflows stay disabled or unqualified.

## Combined native workflow probe

The actual isolated Obsidian vault now ran the components together.
The probe used separate protected directories for source history and independent denials.
It retained exact native source bytes, recorded the matched publication, and read the retained bytes.
It then committed an independent denial and restored only the earlier history database.
The restored history did not publish the denied source.
A retention hold blocked cleanup. Releasing the hold allowed source and projection purge.
Reopening preserved the purge receipt, including retry under a later hold.
All temporary databases and directories were removed afterward.
The installed plugin and production storage settings were unchanged.

The composition exposed a remaining cost that isolated ACL measurements did not show.
A counted repeat invoked the ACL helper 80 times for a source append, 80 times for a retained read,
and 98 times for a projection append.
Those operations took about 1,511 ms, 1,507 ms and 1,839 ms respectively in that repeat.
The first run took about 1,683 ms, 1,665 ms and 2,044 ms.
These are small synthetic observations, not accepted latency distributions.
The existing nested authority checks repeatedly start the helper process.
The next optimization must reduce that execution overhead without dropping live checks or caching away revocation.

This proves the tested single-source native composition and restoration-denial behavior.
It does not establish production owner approval, a full backup/import workflow, live service readback,
complete temporal coverage, or the final history workload budget.


## In-process experiment (September 13, 2026)

A private Node-API prototype reused the executable's Windows ACL inspection logic.
It compiled against the official Node 22.22.1 headers, targeting Node-API version 8.
It resolved the required Node-API functions from the current Windows process.
The same binary loaded in Node 24.18.0 and actual Obsidian (Node 22.22.1, Electron 39.8.3).
For the synthetic protected directory and file, its returned JSON exactly matched the executable.
Missing, extra, wrongly typed, NUL-containing, and unavailable-path arguments were refused.
Ten isolated Obsidian samples took about 0.3–1.0 ms each.

A second private probe substituted this in-process call for the executable launch in the combined workflow.
It retained the existing guard, executable hash checks, and all nested permission calls.
It did not implement or qualify an addon installation authority or addon hash binding.
The substitution was confined to the synthetic test directories and restored in `finally`.
Production code and the installed plugin were unchanged.

| Operation | Executable repeat (ms) | In-process experiment (ms) | Permission calls in both |
| --- | ---: | ---: | ---: |
| Source append | 1,511.1 | 103.7 | 80 |
| Projection append | 1,838.6 | 123.4 | 98 |
| Retained read | 1,507.1 | 97.3 | 80 |
| Purge commit | 892.0 | 67.5 | 46 |

The combined experiment passed source capture, publication append, retained read, durable denial,
old-history restore refusal, retention hold, purge, reopen, and retry assertions.
These are separate single-run diagnostics, not a latency distribution or release qualification.
The result supports implementing an in-process helper without removing live ACL checks.
Next work must establish trusted loading and artifact identity, run the full storage regression suite,
and repeat the actual native workflow through the implemented adapter.
The prototype is not shipped, and production history remains disabled.


## Implemented Node-API adapter

The Windows helper build now also produces a Node-API module.
Both forms compile the same `history-acl.cpp` permission logic.
The wrapper targets Node-API 8 using the vendored official Node 22.22.1 headers.
The build verifies the header hashes and records source, wrapper, and artifact hashes.
The upstream license and provenance are retained beside the headers.

`dist/native/history-acl-addon.json` describes the optional adapter.
Its profile contains `kind: "node-api"`, an absolute path, and `sha256`.
The filename must be `history-acl-<64 hexadecimal SHA-256 characters>.node`.
Different builds therefore use different paths and cannot silently reuse older mapped code.
A trusted native installer must copy the artifact into a private, current-user-owned directory,
preserve its content-addressed filename, and supply the resulting path and hash.
The build directory itself is not an approved installation directory.
No installer or production history setting is enabled by this change.

Before first load, the adapter independently checks installation permissions with the existing
PowerShell checker. It verifies the artifact hash and file identity before and after loading.
It bypasses JavaScript `require.cache` when loading the native module.
It retains the native function identity, but never caches an ACL result or permission grant.
Every permission call verifies artifact bytes and identity before and after the native check.
Changed files, invalid exports, incorrect names or hashes, and failed checks refuse access.
An observed failure invalidates the owning database capability permanently.
The default PowerShell path and optional executable path remain supported.
There is no fallback after a configured module fails.

The dedicated adapter run passed all eleven storage tests.
It covers changed ACLs, replaced databases, hard links, owner withdrawal, invalid arguments,
profile mutation, loaded-module replacement, and refusal of a shared installation.
The direct native result also matches the executable for the synthetic fixture.
To run that variant, set `KOSMOS_HISTORY_ACL_HELPER_PROFILE` to the trusted installed
adapter profile, then run `node --test test/native-history-database.test.mjs`.
Ordinary verification retains the PowerShell path; adapter-specific branches require this separate run.

The implemented adapter also passed the combined synthetic workflow in actual Obsidian.
This run used a new protected qualification installation, not the earlier call-substitution prototype.
Initial preparation took about 653 ms, including the independent installation permission check.
Source append took 110 ms, projection append 127 ms, retained read 101 ms, and purge 67 ms.
The workflow again refused reads after an independent denial and an old history-only restore.
Holds, purge, reopen, and retry assertions passed.
These remain single-run synthetic diagnostics. Production installation, owner controls,
live publication readback, final latency distributions, and the complete build gates remain open.

Full repository verification passed 595 tests with no failures or skips.
The executable variant also passed its separate storage regression run.

## Debian implementation review and native evidence — 2026-09-14

The Linux implementation is a component candidate; production history remains disabled.
Independent review found no blocker within the documented trusted-user/root and effective-access contract.
The Windows permission and atomic creation paths retain their existing behavior.

On native Debian 13.5, Node 24.21.0, and the existing ext4 home, full `npm run verify`
completed successfully: 639 tests, 626 passed, zero failures, 13 explicit skips (12 Windows-only
and one unavailable non-ext mount). A subsequent focused run with a temporary private tmpfs
mount exercised all six Linux tests: six passed, zero failures or skips. The mount was removed.
The positive SQLite creation test fails with `HISTORY_STORAGE_UNAVAILABLE` on the unchanged
231b996 baseline. Tests cover create/write/reopen, exclusive preservation, authority withdrawal,
file identity/link/mode changes, live ancestor mode changes, canonical-path refusal, live
rollback-journal permissions, WAL refusal, and non-ext filesystem refusal.

Evidence SHA-256 values:

- Tested implementation bytes: `bd75ecdfe3e62cc10ae8e1d4161930cce4bc153874e91064abe5c9abd5d553c9`.
- Full Debian verification log: `746a32c97a7fd0e0eaec9abff34eefaecdd30407a656f1fd78a856c03c41feea`.
- Six-test Debian non-ext fixture run: `0b06c79705cd6775755da6579a24e0ad66b0f13427b199e951fddfa36afa3293`.

The Windows full verification attempt passed 632 tests, failed one reopen test, and skipped
six Linux-only tests. Its log hash is `c54e0fa4d73e733eb65734cc8d722665f607cf146992bb164545a39e52c8a220`.
A later focused run passed all 12 Windows tests; log hash
`565910f650df9baf4b875fbd3f81c60c8e8f38dcd87f75c13a09f1b768091a3c`.
The later pass does not erase the full-run failure or establish its cause.
Cross-platform qualification remains open. These component results do not complete
production ownership, retention, backup/recovery, performance, or macOS qualification.

### Final component follow-up

A controlled Windows harness probe reproduced an explicit `CodexSandboxUsers` Allow rule
(rights 1179817) being added to the same protected synthetic directory after one normal
sandboxed tool invocation. Owner, creation time, and protected-ACL status stayed unchanged.
The before/after receipt hash is `080e8b409a3c54211d75d755fe3ec86d3956d9928832e8bbb2a104c1c3713219`.
This demonstrates harness interference that the production guard must reject; it does not
retroactively identify every earlier failure. No production permission check was weakened.
With normal sandboxed tool invocations paused, complete Windows `npm run verify` passed:
640 tests, 633 passed, zero failures, seven Linux-only skips. Log SHA-256:
`e4384c87f51eaf0b3fd34b5f7db87d8f1d8e133233374042b5d0603565ac9a07`.

The final Linux test revision adds real POSIX ACL coverage using Debian's standard
`acl` package (2.3.2-2+b1). Masked named-user entries remain effectively private; granting
file or directory mask access invalidates the capability permanently, including after
mask restoration. All seven focused tests passed with zero skips on native Debian,
including the temporary tmpfs refusal. The temporary mount was removed.
Final Linux test bytes SHA-256: `a70737741cb2684a1670c0971b4a56df77ea2f31bf3df9d029d211dda68bb3f4`.
Final focused log SHA-256: `b3a57b4c4c7d4bbcfa7838c3d1cd43733b4444ffa388c7f0042f786be612c385`.
The full Debian run above predates only this additional test and the evidence documentation;
implementation bytes are unchanged. These are Windows/Debian component checks, not release
qualification or approval to enable production history. Physical storage, ownership wiring,
retention, backup/recovery, performance, and deferred native macOS gates remain open.
