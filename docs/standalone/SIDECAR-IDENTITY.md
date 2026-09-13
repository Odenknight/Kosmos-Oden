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
