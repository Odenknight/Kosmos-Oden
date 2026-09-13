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
