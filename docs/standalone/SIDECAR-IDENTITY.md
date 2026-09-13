# Sidecar identity candidate

`src-tauri/sidecar-release.json` is compiled into the shell. Its default `null`
disables sidecar discovery and launch. Packaging must supply a reviewed manifest
with schema `1`, version, 40-character source commit, OS, architecture, byte length
and lowercase SHA-256. A colocated runtime manifest cannot grant trust.

Discovery, version display and launch verify the binary against that embedded
record. Version display reads the verified manifest rather than running an
unbounded `--version` subprocess. The manifest's source commit is a build claim;
release qualification must establish its relationship to the executable bytes.

Verification streams at most the declared size (maximum 1 GiB), rejects a final
symlink and retains an open file through process creation. Windows opens deny
write/delete sharing. The synthetic Windows test confirms write-open refusal
while the handle is held and rejects modified bytes and a wrong target.

This is an isolated implementation candidate, not desktop acceptance. Packaging
manifest generation, actual executable launch, ancestor replacement/reparse-point
tests, non-Windows race behavior, hash-work responsiveness, Windows state ACLs,
and the canonical viewer build remain unqualified. The temporary generated
frontend used for Rust tests is explicitly a test fixture, not the viewer.

Start, reconnect, stop, status and version IPC commands now run on a blocking
worker with one-operation admission. The worker retains admission until it exits,
even if its caller disappears; additional requests receive a busy error. A panic
cleanup fixture verifies subsequent admission. Startup discovery, diagnostics
and application shutdown still require responsiveness/lifecycle review. This
change does not yet establish a responsive complete shell or cancellation of
an in-progress filesystem operation.

Supervisor shutdown is permanent and shares the launch lock. An already-admitted
worker released after shutdown cannot create state or start another child; normal
Stop remains a separate reusable operation. A queued-worker regression verifies
this ordering. Shutdown can still wait for work holding the lock, so bounded
shutdown latency and full application-close acceptance remain open.

Initial discovery now hashes candidates on one background worker rather than in
Tauri setup. The shared selection is published once and is refused after shutdown.
Availability remains false until a candidate verifies; launch still verifies again.
Tests cover one-time publication and late-result suppression. Slow or stuck
filesystem reads are not yet cancellable, and full native responsiveness remains
unqualified.

## Windows artifact check — 2026-09-13

Engine source `c4940c4efd98e2cab9118b62c25e708737f62bdb` produced the Windows
x86-64 SEA sidecar using the existing build script. The artifact is 94,172,160
bytes with SHA-256
`4ba4d111e8cba8c64db4b9d0400d1cf70b0e06b722c6ef7993030e45d35cd618`.
Its bounded `--help` invocation exited zero and identified version 2.2.0.

The `verify_sidecar` Cargo example accepted that file with a temporary embedded
manifest. Restoring `null` and rebuilding caused the same verifier to reject it
with no valid embedded manifest. The repository retains the disabled default.
This checks real artifact bytes and the disabled configuration; it does not run
the service, qualify its protocol, or establish a reproducible/released package.

## Windows permission boundary review

At Engine `c4940c4`, `loadOrCreateToken` in `src/desktop-agent.ts` explicitly
describes Windows mode bits as advisory. Its watcher filesystem authority also
separates Windows mode handling from POSIX owner-mode enforcement. These checks
do not supply a reusable Windows DACL implementation. The retained shell's
`owner_only_directory` and `owner_only_file` likewise do nothing on Windows.

The remaining host repair must establish the current OS principal, inspect and
protect the actual state directory and existing credential/log leaves, reject
unsupported links or ownership, and verify the resulting ACL. Do not infer
privacy from a successful `chmod`, an absent error, or a parent directory name.
Qualification must include permissive inherited and explicit ACEs, existing
files, newly created files, failed ACL updates and path replacement. Preserve
the existing data and refuse startup when protection cannot be established.

Windows ACL updates require deliberate inheritance handling: Microsoft's
[SetNamedSecurityInfo documentation](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-setnamedsecurityinfow)
describes propagation of inheritable ACEs to child objects. A directory-only
change is not by itself proof that every existing credential has the required
effective access. No live ACL was inspected or changed in this review.

The isolated `scripts/protect-sidecar-state.ps1` prototype now applies a protected
DACL granting the current Windows user full control, removes previous access
rules, and reads back owner, inheritance and access entries. It rejects final
reparse points and ownership outside the current identity/token owner. The
synthetic test passed for an existing Everyone-readable file, a protected parent,
a new inherited file, repeat application and unchanged contents. It uses .NET
access-control setters to apply modified sections only; the first PowerShell
`Set-Acl` attempt failed on an unnecessary security privilege and was corrected.

This helper is not wired into the native host. Ancestor replacement, hard links,
foreign-owner refusal fixtures, all existing state leaves, bounded subprocess
execution and final host readback remain required before using it on real state.
Tests used process-only `RemoteSigned` for local scripts; no configured execution
policy or live application ACL was changed.

The helper also checks ancestor reparse points and refuses filesystem-provider
hard-link entries. Expanded synthetic tests passed for a hard link, a final
junction and a leaf beneath a junction, with target ACLs unchanged after refusal.
These are static alias checks. The check-to-update race remains open; do not
wire this path-based prototype into live startup until handle-bound validation
and ACL application are qualified.

Before applying an inheritable directory ACL, the prototype now inspects up to
256 immediate children and refuses excess entries, child aliases, nested
directories or foreign owners. This bounds the prototype's supported state
layout; it is not a vault-size limit. Synthetic tests confirm unchanged parent
and leaf ACLs when a hard-linked child exists, and unchanged ACLs on inspection
overflow. Foreign-owner and concurrent-replacement qualification remain open.

Leaf ACL reads, writes and readback now use one .NET `FileStream` opened with
read, permission-change and ownership rights, with only read sharing allowed.
The handle is disposed in `finally`. Synthetic tests passed for rename/write
refusal while held, successful rename after release and unchanged payload bytes.
This binds the leaf operation after opening; it does not close the earlier
path-to-open race or make directory ACL operations handle-bound. The prototype
remains excluded from live startup pending those boundaries and host integration.

Before a leaf ACL changes, `SidecarFileIdentity.cs` now reads file attributes and
link count from the retained handle and compares its resolved path with the
intended path. Direct synthetic tests reject a multiply linked open file and a
wrong expected path, independently of the earlier PowerShell alias checks.
The path comparison follows ordinary case-insensitive Windows behavior;
case-sensitive directories and directory ACL operations remain unqualified.
The helper is still not a complete namespace-race qualification or a live host
permission implementation.

Directory ACL operations now use an opened directory handle with native
`GetSecurityInfo`/`SetSecurityInfo`, requesting only owner and DACL fields.
The handle opens reparse points themselves for rejection and requests list/read
access in addition to metadata/ACL rights. A metadata-only first attempt did not
prevent rename; that failed fixture led to the corrected access mask. Synthetic
tests now confirm rename refusal while held, rename after release, and ACL
readback through the handle. Parent/child enumeration races and full namespace
replacement qualification remain open; this is still an isolated prototype.

`CreatePrivateDirectory` now supplies a protected current-user DACL to Windows
at creation, under an opened host-owned parent. It refuses existing paths rather
than modifying them. Synthetic tests passed for initial permissions, inherited
permissions on a new marker file, and unchanged ACL/content after a second
creation attempt. This is a primitive for new state, not an existing-state
migration or proof that an arbitrary parent is trustworthy.

The implementation retains supported filesystem security APIs. Microsoft's
[SetKernelObjectSecurity guidance](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-setkernelobjectsecurity)
explicitly directs filesystem callers to `SetSecurityInfo` or
`SetNamedSecurityInfo`; that alternate API was therefore not adopted to avoid
inheritance behavior. Existing-state enumeration and migration remain open.

`ensure-private-sidecar-state.ps1` provides a non-repair entry point: create
missing state with a private DACL, or validate existing state and its bounded
immediate leaves without changing ACLs or contents. It requires the exact owner,
access, inheritance and propagation settings. Synthetic tests passed for private
creation, unchanged reuse, refusal of an Everyone-readable leaf, and refusal of
nonstandard directory propagation with unchanged ACLs. Native host integration,
trusted-parent qualification and concurrent namespace mutation remain open.

Startup no longer creates sidecar state during shell setup. State creation now
occurs only after release and executable verification in the common spawn path,
including restarts. Failed initial launch clears running intent and retains its
error. The default-null-manifest regression proves no state directory is created
even when discovery previously published a candidate. The source-tree Rust suite
passes 10 tests; this does not qualify Windows ACL enforcement or native UI.

The Rust Windows launch path now calls `windows_state::ensure` directly after
binary verification. It uses the already locked Microsoft `windows-sys` bindings,
creates new state with an explicit current-user protected DACL, validates existing
directory and immediate file ACLs without repair, and retains parent/directory
handles through spawn. No PowerShell subprocess or runtime compilation is used.
The 12-test Rust suite passes, including new/reused private state, hard-link
refusal, broad existing ACL refusal preserving contents, blocked rename while
handles are held and successful rename after release. This supersedes the earlier
statement that no native permission implementation is wired in.

The default release manifest remains disabled. Full native product launch,
credential read/write handling, trusted-parent provisioning, concurrent ancestor
and child namespace mutation, and cross-platform qualification remain open.
The synthetic helper coverage does not establish those broader boundaries.

Viewer credential IPC now uses the same bounded worker admission as other sidecar
operations. Parsing reads at most 67 bytes and accepts exactly 64 hexadecimal
bytes with an optional LF/CRLF. Windows reads retain a validated private directory
and single-link regular-file handle, check current-user ACLs, and reject static
ancestor reparse points. Errors do not include credential content or paths.
The 13-test Rust suite passes, including synthetic private credential success,
hard-link and unsafe-directory refusal, malformed input and an infinite-reader
fixture proving bounded consumption. Unix permission/ownership qualification and
concurrent namespace mutation remain open; no live credentials were accessed.

Windows log creation now uses an append-only handle validated for single-link
regular-file identity and current-user ACL before any output is written. Existing
logs are opened without truncation; new logs inherit the checked private parent.
The same handle is passed to child output. Synthetic checks prove append
preservation, replacement/write-open refusal while held and hard-link refusal
without changing existing bytes. All 14 Rust tests pass. Filesystem tests sharing
the temporary parent are serialized because retained parent handles otherwise
interfere with sibling rename fixtures; the initial failure receipt is retained.
Actual child startup and its atomic status/token writes still require qualification
against the lifetime of the retained launch guards.

A synthetic publication fixture reproduced a sharing violation when state
handles allowed only read sharing: renaming a temporary child to its status name
failed while the launch guard was held. Directory handles now allow read/write
sharing but continue to omit delete sharing. File handles remain read-share only.
The 15-test suite proves first publication and replacement of a status file work
with retained guards, while the existing state-directory rename refusal and
credential/log protection tests still pass. The initial failure receipt remains
historical evidence. This fixes the demonstrated guard conflict; actual Engine
process startup and native UI qualification are still required.

Native debug sweep: `cargo clippy --locked --offline --all-targets -- -D warnings`
passes after simplifying the nested discovery guard without changing its lock or
closed-state semantics. No lint suppressions were added. This is Windows static
analysis of the isolated desktop checkout, not a full release debug certificate.

`qualify_windows_startup` now exercises the verified Engine executable with the
native state/log helpers, a synthetic folder and an ephemeral loopback port. With
an explicit temporary qualification manifest, Engine 2.2.0 reached `serving` and
the native credential reader accepted the generated token without printing it.
The harness kills/reaps its child on exit and caps observation at 30 seconds.
The source manifest was restored to null and the child PID was absent afterward.
All-target clippy with warnings denied passes for the new example.

The initial harness incorrectly expected `ready` and timed out; its retained
status showed `serving`, and the corrected test passed. This receipt proves
helper-level process startup only: it does not exercise Supervisor discovery,
restarts, native UI, or indexed-note retrieval. The synthetic plain Markdown note
was not an accepted indexed-document fixture. These remain separate gates.

The process fixture now uses the accepted GKX 2.3 frontmatter shape from Engine's
watcher CLI tests and requires exactly one indexed document. It also requests the
live loopback `/graph`: no credential returns 401; the native-read viewer token
returns 200 with `synthetic.md` in graph nodes. Both checks passed against the
verified binary. Requests have connection/read/write bounds and response-size
limits; no token is printed. The child was absent afterward, source manifest null,
and all-target clippy passes. This adds actual indexed graph retrieval evidence;
Supervisor lifecycle, native UI and full cross-service authorization remain open.

The process harness now repeats startup against the same generated state after
terminating and reaping the first child. Both initial and restart phases passed
one-document indexing, native credential validation, unauthenticated 401 and
authenticated graph retrieval. Status acceptance also requires the current child
PID, preventing retained status from satisfying the next launch. The final child
was absent and source manifest null afterward; all-target clippy passed.
This is an actual Engine restart through the native helper boundaries, not yet
Supervisor automatic recovery/backoff or native desktop lifecycle acceptance.
