# Current work: Kosmos-Oden and GKOS-Engine

Updated: September 13, 2026.
Owner of this implementation task: Astra-Oden.
This is a short reading guide for the owner and other agents.
Start with the “Read aloud” section when explaining this work to the owner.
It describes work in progress. It is not a release certificate.
Earlier checkpoints remain in Git history and the linked reports.

## Read aloud

We are upgrading Kosmos-Oden and its supporting engines.
Kosmos-Oden is the Obsidian interface.
GKOS-Engine handles search, indexing, and source checks.
GKOS-standard defines their shared rules.
GKOS-Engine-Rust is a separate implementation under construction.

Search works with synthetic documents.
The complete search experience inside Obsidian still needs testing.
We are also building source history with permission checks and deletion protection.
Production history remains disabled.

The candidate refreshes agent names when a heartbeat arrives.
The comet trails and names still need final checks in the installed interface.
Pop-out windows now use their own visibility and message handling.
The latest full Kosmos verification passed 601 tests.
The separate browser run had three visual failures and two skips.
Those failures remain open.

Indexing is still too slow.
One measured edit took about 10.77 seconds across 2,000 notes.
The target is two seconds.

The Rust baseline passed 400 Windows tests with its required tools.
Its command-line product is still unfinished.
New work adds validation fixtures and an exact output comparator.
Passing component tests does not prove the complete product works.

Terra is scheduled to check long-running qualification every six hours.
The upgrade remains on review branches.
It has not been merged to main.
We still need the remaining build work, final debug checks, and release qualification.

## Repositories and revisions

| Repository | Active work | Review |
| --- | --- | --- |
| Kosmos-Oden | Native search, history, permissions, and workspace behavior | [PR 80](https://github.com/Odenknight/Kosmos-Oden/pull/80) |
| GKOS-Engine | Search service, source verification, and indexing performance | [PR 73](https://github.com/Odenknight/GKOS-Engine/pull/73) |
| GKOS-Engine qualification base | Broader Engine qualification | [PR 72](https://github.com/Odenknight/GKOS-Engine/pull/72) |

GKOS-standard defines the shared contracts used by these products.
GKOS-Engine-Rust needs its own working implementation evidence.
Its pinned Windows workspace suite now passes 400 tests with the exact admitted tools.
See the [Rust test evidence](docs/reviews/2026-09-13-rust-pinned-suite.md) for scope and remaining gaps.
A passing TypeScript test does not prove that the Rust product works.

Kosmos work is on `codex/build-plan-completion-20260913`.
The executable helper was introduced at `785aecd`.
The current branch also implements the in-process helper.
The combined native test report was recorded at `c251a77`.
Engine work is on `codex/graphiti-product-binding-20260913`, at `70b6a75`.
Engine PR 73 builds on PR 72.
Kosmos currently pins Engine `885b0b39ca1f4c20c27623cdb49b625a8be3d52b`.
The pin and the Engine working branch are different revisions.
The normal installed plugin remains the earlier `59a61ca` candidate.
Branch changes must not be described as installed.
The separate synthetic Obsidian vault now runs candidate `27309b2`.
Its installation and plugin load passed. Visible native acceptance remains open.

## Rust work another agent can inspect

Repository: [GKOS-Engine-Rust](https://github.com/Odenknight/GKOS-Engine-Rust).
Branch: `codex/rust-differential-core-20260913`.
Verified branch revision: `f40bd22`.
This branch builds on `integration/m0`.

Read `conformance/differential/README.md` for the handoff.
Read `compat/fixtures/m0/manifest.json` for the 22 source files and 18 cases.
Read `compat/oracle-observations/validate-windows-node24-724ab12/README.md` for recorded TypeScript outputs.
These outputs are observations. They are not approved reference results.
Run `node tools/verify-validation-observations.mjs` to check their integrity.
Windows and Debian now reproduce all 18 cases twice on Node 22.
The retained 72 executions match the Windows Node 24 reference.
The verifier checks every retained stream and run against that reference.
It rejects missing evidence, altered bytes, forged hashes, and changed identities.
This still does not approve goldens or qualify the Rust product.

Read `rust/crates/gkos-conformance/src/lib.rs` for the comparator.
It compares exit codes and exact output bytes.
It also records which difference classes need review or must block.
Its five unit tests and Clippy check passed.
The mock command now runs eight comparisons through that core.
From the Rust workspace, run `cargo xtask differential --surface validate --candidate mock`.
Its two command tests and Clippy check passed.
The mock report explicitly says that no product or reference results are qualified.
The real executable runner, approved reference results, and working Rust validation command remain unfinished.
The earlier 400-test result applies to the tested main baseline, not this entire new branch.

## Where to look in the code

| File or report | What it explains |
| --- | --- |
| [Native search connection](src/workspace/native-semantic.ts) | Verifies publication evidence and prepares the native search client. |
| [Agent server](src/plugin/agent-server.ts) | Captures authorized source bytes and prepares native manifests. |
| [History ledger](src/workspace/source-observation-ledger.ts) | Stores observations, checks retained reads, and performs local purge. |
| [Deletion authority](src/workspace/history-deletion-authority.ts) | Keeps denials independent of history backups. |
| [History publication adapter](src/workspace/native-history.ts) | Connects verified publications to exact retained source receipts. |
| [Windows storage guard](src/workspace/native-history-database.ts) | Checks ownership, permissions, and database file identity. |
| [Native permission helper](native/windows/history-acl.cpp) | Performs Windows access-control checks. |
| [Storage report](docs/workspace/NATIVE-HISTORY-STORAGE.md) | Records native evidence, limitations, and permission-check costs. |
| [Search handoff](docs/workspace/NATIVE-SEMANTIC-CONNECTION.md) | Explains the native search integration. |
| [History handoff](docs/workspace/SOURCE-OBSERVATION-LEDGER.md) | Explains storage contracts and recovery behavior. |
| [Performance report](docs/reviews/2026-09-13-watcher-performance-follow-up.md) | Records the indexing failure and tested experiments. |
| [Browser qualification](docs/reviews/2026-09-13-browser-candidate-qualification.md) | Records the full browser result and repeatable visual failures. |

In GKOS-Engine, inspect `src/watcher/contracts.ts` on the branch listed above.
One change computes each canonical sort key once.
It avoids repeating serialization inside the sort comparison.
The latest change rejects unsafe artifact inputs before reading their digest.
That prevents getters or proxies from running during validation.
The performance report links the measured result and its limits.

## Evidence and limits

The latest full Kosmos verification passed 601 tests.
Pop-out views now use their own document for visibility and their own window for frame messages.
Window visibility events now pause rendering and resume deferred updates when the view is visible again.
Component tests cover this correction. Actual visible pop-out acceptance remains open.
The readable spatial view now follows the same owner-window rules and pauses when its document is hidden.
The separate browser matrix finished with 231 passes, three failures, and two skips.
All three failures concern the desktop star-focus reference image.
The generated mobile reference images remain untracked and unapproved.
Their passing comparisons do not establish approved visual acceptance.
The in-process adapter passes all eleven dedicated Windows storage tests.
The executable variant also passes its storage regression run.
The combined history workflow passed in an isolated Obsidian vault.
It used synthetic data and a recorded publication receipt.
It did not qualify live publication readback or production retention controls.
The permission helper reduced individual checks to about 18–23 milliseconds.
The new in-process adapter removes those repeated launches.
The final workload budget still needs qualification.

Live synthetic search requests passed service checks.
The native Notes baseline works.
The live service connection through that view remains unfinished.
An SSH forwarding configuration decision is pending.
Credentials and private deployment receipts are not stored in this repository.

## What comes next

Qualify production installation and the full history workload for the new adapter.
Qualify native search, citations, permission changes, and outage recovery.
Fix indexing latency and finish the required repeated runs and soak.
Complete workspace acceptance, history owner controls, and recovery tests.
Complete adoption authority before enabling writes.
Finish mailbox, agent identity, duplicate-ID, and older-PR reconciliation.
Establish independent Rust implementation evidence.
Verify final artifacts, migration, rollback, comet trails, and agent labels.
Run the final debug sweep, then merge only after the required gates pass.

The [remaining build gates](docs/reviews/2026-09-13-remaining-build-gates.md) are the complete checklist.
They link the original plans and historical evidence.
This short guide does not replace or reduce that scope.
Another agent should read that checklist before continuing implementation.
It should check the current branch and test revision before reporting progress.


## Earlier document-search request

The Titans document search was already completed in an earlier native test session.
Its private report records six matching documents and the search limits.
A local Markdown recheck confirmed those six matches.
The reading index and content hashes remain in the local task evidence directory.
Private document titles, paths, and contents are not published here.
This closes the document-finding follow-up within its recorded search scope.
It does not qualify the final upgraded plugin or attachment search.
