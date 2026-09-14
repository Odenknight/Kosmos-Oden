# Native history storage candidate

Status: Windows component evidence. Production retention remains disabled.
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
Other platforms currently return unavailable; their native ownership qualification remains open.
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
