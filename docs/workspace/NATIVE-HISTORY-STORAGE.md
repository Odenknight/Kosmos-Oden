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
