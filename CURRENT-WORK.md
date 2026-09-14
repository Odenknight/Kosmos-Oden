# Current work: Kosmos-Oden and GKOS-Engine

Updated: September 13, 2026.
Owner of this implementation task: Astra-Oden.
This is a short reading guide for the owner and other agents.
It describes work in progress. It is not a release certificate.
Earlier checkpoints remain in Git history and the linked reports.

## Read aloud

We are upgrading Kosmos-Oden and GKOS-Engine together.
We want useful search with correct permissions and clear source references.
The search service works with synthetic test documents.
The complete search experience inside Obsidian still needs qualification.

We are also building a safe source-history store.
It preserves exact observations and their original times.
A separate record keeps deletion decisions safe from old backup restores.
An isolated Obsidian test passed capture, restore, denial, and purge checks.
Production history remains disabled.

The current problem is speed.
History reads repeatedly launch a Windows permission-checking program.
One retained read launched it 80 times and took about 1.5 seconds.
The new adapter now runs the same checks inside Obsidian.
It verifies the module and its private installation before use.
A synthetic retained read took about 101 milliseconds.
Permission checks remain live.
History selection also now recognizes different letter cases of the same UUID.
That prevents a differently spelled deletion from exposing an older version.
Production installation and owner controls remain unfinished.

Indexing also misses its performance target.
A 2,000-note edit takes about 12.38 seconds against a two-second target.
The comet trails and real agent names still need final installed visual checks.
Terra is scheduled to check long-running qualification every six hours.
The upgrade is on review branches. It has not been merged to main.

## Repositories and revisions

| Repository | Active work | Review |
| --- | --- | --- |
| Kosmos-Oden | Native search, history, permissions, and workspace behavior | [PR 80](https://github.com/Odenknight/Kosmos-Oden/pull/80) |
| GKOS-Engine | Search service, source verification, and indexing performance | [PR 73](https://github.com/Odenknight/GKOS-Engine/pull/73) |
| GKOS-Engine qualification base | Broader Engine qualification | [PR 72](https://github.com/Odenknight/GKOS-Engine/pull/72) |

Kosmos work is on `codex/build-plan-completion-20260913`.
The executable helper was introduced at `785aecd`.
The current branch also implements the in-process helper.
The combined native test report was recorded at `c251a77`.
Engine work is on `codex/graphiti-product-binding-20260913`, at `ba2e65d`.
Engine PR 73 builds on PR 72.
Kosmos currently pins Engine `885b0b39ca1f4c20c27623cdb49b625a8be3d52b`.
The pin and the Engine working branch are different revisions.
The normal installed plugin remains the earlier `59a61ca` candidate.
Branch changes must not be described as installed.

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

## Evidence and limits

The latest full Kosmos verification passed 598 tests.
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
