# Current work: Kosmos-Oden

## September 14 qualified Engine adoption candidate

This isolated candidate updates the consumer dependency to exact Engine
`e114d09a628f81c3dddee22abd8fe8218d596caa`. It supersedes the older active pin
statements below; historical receipts retain their original revisions. Engine
runtime run 34875741679 passed all six Windows/Ubuntu Node 22/24/26 lanes,
with exact source and raw-log verification (1,223 Windows and 1,225 Ubuntu
tests per lane, zero skips). Node 26 is informational. Consumer qualification
for this adoption passed on Windows: 641 tests passed with seven platform skips,
and all build/artifact/invariant checks passed. Installed Engine verification
matched 160 shipped source files, five governance documents and 23 bundle
artifact hashes; hosted consumer checks remain pending. Earlier hosted timing failures remain preserved;
this result does not establish their causes or close release gates.

## September 14 portable packaging and qualification update

This update supersedes older active-branch pointers below; earlier results keep
their original revision and installation scope.

Kosmos [draft PR82](https://github.com/Odenknight/Kosmos-Oden/pull/82), stacked
on PR80, requires the supplied SEA build-input inventory when staging a sidecar.
It checks target and final executable size/hash, preserves exact inventory bytes,
and binds them in package checksums. The inventory remains incomplete component
evidence and does not authenticate the supplied build claims. See
[portable staging](docs/standalone/PORTABLE-STAGING.md).

At `52da5fba9d12fd4aef9f7c9638be91f5143fdccb`, hosted CI, browser and security
checks passed. The browser run passed 46 tests without retries; CI recorded 633
passes with 13 platform skips and all three Windows history backends passed
12/12. The dependency CycloneDX generator now propagates failures. Its successful
28-component inventory is not a complete portable executable SBOM.
The earlier heartbeat test retry remains recorded in PR82; the follow-up waits
for old trail expiry before asserting that a heartbeat creates no traversal.

Engine [draft PR83](https://github.com/Odenknight/GKOS-Engine/pull/83) records
SEA composition inputs and preserves native guard coverage. Exact `c7de783`
passed native Windows 1,223/1,223 and Debian 1,225/1,225 with zero skips; all 708
source-file hashes and raw logs were independently verified. Its original
`769d795` Windows fixture failure remains historical evidence. Hosted Ubuntu
Node 22/24/26 receipts passed and were verified; hosted Windows qualification
was still running at this update. Check current terminal receipts before adoption.

Engine [draft PR84](https://github.com/Odenknight/GKOS-Engine/pull/84), stacked
on PR83, preserves the existing NOTICE and referenced governance documents in
npm packages. Its actual archive contains all five checked governance documents
byte-for-byte. Full runtime qualification for `843460f` remains separate from
parent receipts and was still running at this update.

The consumer Engine pin remains `851239a`; these packaging changes do not
install a plugin, adopt a newer Engine dependency, enable production history or
source writes, close native macOS acceptance, or qualify a release. Keep all
drafts open until the complete remaining-gates audit has direct evidence.


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

The current signed consumer passed 639 Windows tests and the verification chain,
and 633 tests from a fresh native Debian checkout, with declared platform skips.
The complete four-browser run passed 246 checks with two declared platform skips.
All twelve reference images have independent approval. Earlier Windows history
failures remain preserved. Explicit private file creation and correct helper
installation now pass all three hosted storage backends, 12 tests each.
The earlier Engine pin passed 1,216 tests on each hosted Windows runtime lane.
The current development pin and its separate runtime evidence are recorded in the
[native build reproducibility report](docs/reviews/2026-09-14-engine-native-repro-qualification.md).
The earlier [UTF-16 candidate report](docs/reviews/2026-09-14-engine-native-string-qualification.md)
retains the prior pin and its performance measurements.
The [combined consumer verification](docs/reviews/2026-09-14-effects-inspection-consumer.md)
records its exact tested commit, raw logs and remaining installed-host limits.
These results do not prove that the whole upgrade is ready.
The native search connection and recovery controls remain unfinished.
Production history and automatic source writes remain disabled.
The owner deferred native macOS qualification on September 14.
That gate remains open and is not waived for the final merge.
Indexing also misses its speed target.
One edit took about 10.77 seconds across 2,000 notes.
The target is two seconds.
A newer profiled run took 13.14 seconds.
A five-pair encoding comparison did not justify adopting Engine PR 77.
Median edits were 12.02 seconds for the base and 11.62 seconds for the candidate;
candidate memory increased in every pair. All ten edits failed the speed target.
The next target is repeated whole-graph processing during activation.

The original `13ff119` Node 22 qualification failed at 07:15 UTC on September 14.
It recorded 1,212 passes, two failures, and one skip across 1,215 tests.
Both failing cases later passed in focused runs; that historical full run remains failed.
The witness-rename fix at Engine `3cab7a2` subsequently passed all 1,216 tests
in a full Windows Node 22.22.1 run. Draft Engine PR 78 preserves that candidate.
The same commit also passed all 1,216 tests on Windows Node 24.18.0.
Draft Engine PR 79 fixes CI dependency setup and adds actual Linux rename-refusal
coverage. Its final hosted matrix passed on Node 22, 24 and 26 on Windows
and Ubuntu. At that stage the consumer pinned `3ed9127`; all 633 local tests
and required verification checks passed. The older `13ff119` failure remains preserved.
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

Kosmos currently pins Engine `851239a32a81ed794addd1ab6ecf3f02904b60fc`.
Its complete hosted matrix passed 1,218 tests per Windows lane and 1,220 per
Ubuntu lane, with no failures or skips. Native Windows and Debian runs also
passed. All 705 source files and raw logs were verified; Node 26 is informative.
Two complete local npm packages reproduced byte for byte after a rebuild.
See the [current Engine report](docs/reviews/2026-09-14-engine-native-repro-qualification.md)
and [Engine PR 81](https://github.com/Odenknight/GKOS-Engine/pull/81).
Consumer `a031b777` passed full Windows and fresh native Debian verification,
plus all four browser projects with the declared platform skips. All 652 installed
Engine files match the verified package exactly. Earlier receipts remain bound
to their original revisions; installed acceptance and release gates stay open.
The earlier failed `13ff119` Node 22 result remains historical evidence in the
[Node 22 qualification update](docs/reviews/2026-09-14-node22-terminal-qualification.md).

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
Preserve that exact candidate and its terminal qualification receipts.

In the Rust branch, start with `conformance/differential/README.md`.
The original TypeScript observations remain unchanged. A separate 18-case raw
validation golden subset is now approved and hash-bound in Rust draft PR 17.
Its verifier passed from fresh Windows and native Debian checkouts.
Other golden surfaces and required filesystem-attack fixtures remain open.
The earlier Rust baseline passed 400 Windows tests.
The new branch still needs a working validation product and independent qualification.
The owner approved a one-fixture directory for WP-13 to match the frozen CLI.
Rust commit `c0d5537` records that invocation amendment on
`wp/13-directory-skeleton-20260914`; the original plan remains unchanged.
The later `a45f62e` commit adds the sealed raw subset and checkout evidence
in [Rust PR 17](https://github.com/Odenknight/GKOS-Engine-Rust/pull/17).
The real candidate runner design is explicitly unapproved and unimplemented.

## Remaining acceptance work

Native search needs citation, permission-change, outage, and restart checks.
History needs owner controls and live publication checks.
Indexing needs a speed fix, repeated workloads, and a soak test.
The latest browser run passed 246 checks with two declared context-loss platform skips.
All twelve reference images have independent visual approval; native acceptance remains open.
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

## 2026-09-14 Debian history component follow-up

Signed implementation a9fc58cdc11bcd8b1b2fe5d04fdb4aad6c8ebdbd adds the bounded native Linux/ext-family history file guard. It does not enable production history. Independent review and real Debian checks cover SQLite creation/reopen, ownership/modes, ACL masks, permanent invalidation, journal privacy, and non-ext filesystem refusal. All seven focused Debian cases passed without skips. Full Debian verification passed 626 tests with 13 platform/environment skips before the final additional ACL test; full Windows verification passed 633 tests with seven Linux skips after isolating the tool-harness ACL mutation reproduced by a controlled probe. Historical failures remain recorded. Exact source/log hashes and scope are in `docs/workspace/NATIVE-HISTORY-STORAGE.md`.

This does not close production owner integration, persistent storage deployment, retention/backup/recovery, performance, installed acceptance, or deferred macOS gates. The installed plugin candidates and Engine 3ed9127 pin are unchanged. Hosted checks for this new component must be assessed against its new source, separately from the successful 231b996 run.

## Hosted combined-consumer evidence

At `422ccdc43f2b35b385c13af32959fa5a89b13206`, hosted CI, Chromium and security
checks passed. CI recorded 633 Ubuntu passes with 13 declared skips and all
36 Windows history checks across three backends. Chromium recorded 46 passes.
The two-build artifact comparison includes the optional Effects host. These
results supplement the four-browser and native consumer evidence; installed
acceptance and all remaining release gates stay open.
