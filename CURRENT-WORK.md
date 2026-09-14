# Current work: Kosmos-Oden

Updated: September 14, 2026.
Implementation owner: Astra-Oden.
This is a reading guide for the owner and other agents.
Earlier details remain in Git history and the linked reports.

## Read aloud

We are upgrading Kosmos-Oden and its supporting engines.
Kosmos-Oden provides the Obsidian interface and desktop viewer.
GKOS-Engine handles search, indexing, and source checks.
GKOS-standard defines the shared rules.
GKOS-Engine-Rust is a separate product under construction.

We are improving search, source history, and recovery after interrupted work.
We are also fixing agent names, comet trails, and pop-out windows.
Agent labels should show the agent's name, such as JEFFREY.
They should not show the connection type, such as MCP.
The trails should remain visible back toward their original source.
The installed interface still needs final visual checks.

The latest Kosmos verification passed 628 tests.
Its pinned Engine passed 1,215 tests on Node 24.
These results do not prove that the whole upgrade is ready.
The native search connection and recovery controls remain unfinished.
Production history and automatic source writes remain disabled.
Indexing also misses its speed target.
One edit took about 10.77 seconds across 2,000 notes.
The target is two seconds.
A newer profiled run took 13.14 seconds.
A small serializer experiment did not establish a useful improvement.
The next target is repeated whole-graph processing during activation.

The same Engine revision is now undergoing full Node 22 qualification.
Terra is scheduled to check long-running results every six hours.
The last recorded check found the run still active.
We can continue independent work while it runs.
The upgrade remains on review branches.
It has not been merged to main.

## Active repositories

| Repository | Branch or review | What another agent should inspect |
| --- | --- | --- |
| Kosmos-Oden | `codex/build-plan-completion-20260913`; [PR 80](https://github.com/Odenknight/Kosmos-Oden/pull/80) | Search, history, recovery integration, and the interface. |
| GKOS-Engine | `codex/effects-host-api-20260914`; [PR 74](https://github.com/Odenknight/GKOS-Engine/pull/74) | Prepared operations, recovery, shutdown, and source checks. |
| GKOS-Engine | `codex/sea-native-guard-20260914`; [PR 75](https://github.com/Odenknight/GKOS-Engine/pull/75) | Embedding and verifying the Windows guard in executables. |
| GKOS-Engine-Rust | `codex/rust-differential-core-20260913` | Validation fixtures and the output comparator. |
| GKOS-standard | Shared specification repository | Contract definitions used by the implementations. |

Kosmos currently pins Engine `13ff119bbe7a1d9dd686d75267a4eb8f2cc65504`.
That exact revision passed all 1,215 tests on Windows Node 24.
The full run finished at 06:42 UTC on September 14.
Both log hashes and the tested source revision were verified.
Its eight focused Node 22 native and asset tests also passed.
A separate full Node 22 run is active under Terra monitoring.
Do not report that newer run as passed without its terminal receipt.

The normal installed plugin remains candidate `59a61ca`.
The isolated Obsidian test vault runs candidate `27309b2`.
Changes on the review branch are not automatically installed.

## Where to look in Kosmos

| File | What it does |
| --- | --- |
| [Native search](src/workspace/native-semantic.ts) | Checks publication evidence and prepares the search client. |
| [Agent server](src/plugin/agent-server.ts) | Handles agent requests and authorized source capture. |
| [History ledger](src/workspace/source-observation-ledger.ts) | Records source observations and checks retained reads. |
| [Deletion authority](src/workspace/history-deletion-authority.ts) | Preserves deletion denials independently of history backups. |
| [Engine receipt mapping](src/navigation-effects/engine-host-receipts.ts) | Validates recovery and shutdown evidence from Engine. |
| [Receipt integration tests](test/navigation-effects-host-receipts.test.mjs) | Exercises the installed Engine package with synthetic data. |
| [Recovery integration handoff](docs/navigation-effects/ENGINE-HOST-RECEIPTS.md) | Explains the missing host connections and safety requirements. |
| [Complete remaining checklist](docs/reviews/2026-09-13-remaining-build-gates.md) | Lists the unfinished work across all original plans. |

## Immediate work

The installed Engine tests cover empty journals, shutdown, and three interrupted states.
The interruption checks cover preparation, temporary writing, and source replacement.
Inspection preserves all directory entries, source files, and journal bytes.
Both host profiles require action and keep writes disabled.
These synthetic checks do not yet prove production recovery.
An inspection result must never grant permission to write.
The host must resolve the actor and current authority separately.
The shared resolver now captures request data before host callbacks run.
This prevents callbacks from substituting a different actor or target during the check.
Then the recovery controls can be connected to the Engine API.

In Engine PR 74, inspect `src/navigation-effects/node/executor.ts`.
Also read `docs/EFFECTS-HOST-API-PROGRESS.md`.
In Engine PR 75, inspect `scripts/sea-native-assets.mjs`.
Also inspect `src/watcher/windows-retained-guard.ts`.
Keep that exact candidate unchanged while its qualification runs.

In the Rust branch, start with `conformance/differential/README.md`.
Its recorded TypeScript outputs are observations, not approved reference results.
The earlier Rust baseline passed 400 Windows tests.
The new branch still needs a working validation product and independent qualification.

## Remaining acceptance work

Native search needs citation, permission-change, outage, and restart checks.
History needs owner controls and live publication checks.
Indexing needs a speed fix, repeated workloads, and a soak test.
The browser run still has three visual failures and two skips.
The desktop shell passed 19 native Windows tests on candidate `4802da1`.
The real-Engine supervisor recovery test now passes on Node 22.
It recovered from five forced crashes and refused a sixth restart.
This required separating writable logs from protected status files.
See the [native executable report](docs/reviews/2026-09-14-node22-native-executable.md).
Agent names, comet trails, and visible pop-out behavior need installed acceptance.
Mailbox reconciliation and older pull-request reviews also remain open.
Final artifact, migration, rollback, and debug checks must precede the main merge.

The earlier Titans search found six documents within its recorded search scope.
The private reading index retains their titles, paths, and content hashes.
Those private details are not published in this repository.

Read the complete checklist before continuing implementation.
Check the branch and exact tested revision before reporting progress.
Keep successful tests, installed behavior, and release approval distinct.
