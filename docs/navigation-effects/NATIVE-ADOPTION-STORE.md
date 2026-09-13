# Native adoption metadata store

`src/navigation-effects/sqlite-adoption-store.ts` implements a native-only store
using Node's built-in SQLite. It is not imported into the plugin/browser bundle,
wired into the adoption modal, or a source-note writer. Runtime availability and
host integration must be qualified before enabling it in Obsidian.

The caller supplies an existing canonical private local directory. Supplying an
empty initial registry explicitly creates `adoption.sqlite` exclusively; normal
open refuses missing, empty, unrelated or unsupported-version databases. The
directory must remain under the operating account's exclusive control. UNC
paths and noncanonical/symlinked directory paths are refused; mapped/network
filesystem suitability is not established by that check. Windows ACL and host
path replacement protection remain integration responsibilities.

Every commit stores the next registry and its receipt together in one SQLite
transaction. An append-only sequence and unique operation/receipt IDs preserve
history. Reopening replays through the existing adoption registry and receipt
validators, including scope preservation, digest binding and stale generation
checks. After asynchronous validation, an immediate write transaction rechecks
the captured sequence count before append. Idempotent replay cannot substitute
different receipt bytes. Input bytes are cloned before asynchronous work.

`commit` also requires a trusted synchronous `stillCurrent` callback. It must
return exactly true after checking current source bytes and authority. The store
invokes it inside the write transaction immediately before append, after all
asynchronous digest validation. Missing callbacks, Promise-returning callbacks
and late revocation refuse the commit; replay also requires the current host
check. This callback is a host capability, not a renderer-supplied approval
boolean. Wiring an actual source/authority check remains required before UI use.
The callback itself is not a filesystem lock: the host must provide appropriate
fencing for external writers where atomic source-state guarantees are required.

The Kosmos authority resolver now distinguishes `moc:adopt` from source effects.
An explicit credential-bound human grant for that operation is required by the
adoption host contract. A `moc:replace` grant does not authorize adoption, and an
adoption grant does not authorize replacement. Agent/system adoption requests
are refused. This is a product authority operation, not a new Engine source-write
effect or a GKOS conformance claim. The pure resolver neither authenticates an
operator nor creates grants; the actual provider remains to be configured.

SQLite uses a rollback journal and FULL synchronous commits. Each serialized
record is limited to 1 MiB, the log to 1,000 commits, and the database has a
16,384-page ceiling; opens also refuse files exceeding 64 MiB. Journals require
additional disk headroom. Capacity exhaustion refuses further commits; there is
no implicit pruning, reset or retention policy. Explicit migration/retention is
required before those limits are reached.

## Evidence and remaining gates

Real temporary-database tests on Windows cover reopen, receipt/registry pairing,
idempotent and conflicting replay, competing writers and corrupt receipt refusal.
Child processes exit immediately before and after the actual SQLite transaction
commit: before commit publishes neither record; after commit preserves both;
reopen and retry complete without duplication. Existing source-byte/marker and
adoption validation tests remain unchanged.

These checks establish local process-exit behavior, not physical power-loss,
other filesystems, cross-platform qualification, native UI confirmation,
credential authority, atomic source replacement or durable Effects prepared
intent. No live vault, adoption registry or source document was modified.
Private logs are `adoption-sqlite-tests-20260913.log`,
`adoption-sqlite-crash-tests-20260913.log` and
`adoption-sqlite-verify-20260913.log` under `_Claude-Code`.

Additional refusal tests preserve empty and unrelated database bytes, refuse
explicit reinitialization of either, and reject oversized proposed records
without altering the registry or receipts. The focused suite now passes 18 tests.

At 2026-09-13T12:34:53Z, the component from source `659d28c` was bundled into a
temporary native probe and executed by actual Obsidian Node 22.22.1 / Electron
39.8.3. A synthetic metadata adoption committed, reopened and replayed with one
registry generation and the matching receipt digest. The temporary directory
was removed in `finally` after verifying its parent. This establishes that
runtime's component execution, not installed-plugin wiring or human confirmation.
Private receipt: `_Claude-Code/native-adoption-probe-20260913.json`; harness and
temporary bundle use the same basename prefix. Refusal-test log:
`_Claude-Code/adoption-sqlite-refusal-tests-20260913.log`.
