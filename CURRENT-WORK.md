# Current work: Kosmos-Oden and GKOS-Engine

Updated: September 13, 2026.

This is a handoff for the owner and other agents.
Read it aloud if the owner asks for a short progress report.
It records progress. It does not certify a finished release.

## What we are doing

We are completing the Kosmos-Oden build plans.
We are connecting its workspace to governed semantic search.
Graphiti supplies related facts and source references.
GKOS-Engine checks which sources the caller may use.
Kosmos-Oden presents the results in the workspace.
Ordinary search must remain available when semantic search fails.

The owner also requested brighter comet trails and real agent names.
Those changes belong to the wider upgrade.
Their final installed behavior still needs to be checked with the final build.
An MCP connection type must not replace the agent's declared name.

## Repositories being changed

| Repository | Working branch | Review |
| --- | --- | --- |
| Kosmos-Oden | `codex/build-plan-completion-20260913` | [PR 80](https://github.com/Odenknight/Kosmos-Oden/pull/80) |
| GKOS-Engine | `codex/graphiti-product-binding-20260913` | [PR 73](https://github.com/Odenknight/GKOS-Engine/pull/73) |
| GKOS-Engine qualification base | `codex/scoped-lineage-inspection-20260913` | [PR 72](https://github.com/Odenknight/GKOS-Engine/pull/72) |

Engine PR 73 builds on PR 72.
These are separate review branches.
They have not been merged to main as part of this work.

Before this handoff, Kosmos was at `c4a3ee3`.
The Engine implementation was at `5f96a71`.
Kosmos still pins Engine `7f28b2a`.
The newer Engine service work is not yet included in that dependency pin.
The installed plugin is an earlier candidate, `59a61ca`.
Do not describe branch changes as already installed.

## What now works

The Engine can build a manifest from authorized source bytes.
It checks the published Graphiti record against those sources.
It rejects stale source, scope, policy, and generation information.
It exposes authenticated query and readiness routes.

An isolated synthetic service is running on Observatory.
It uses test material rather than vault documents.
Its reader preserves the published search state across restarts.
Its Engine gateway rejects changed source material.
Five gateway queries completed in about 392 to 403 milliseconds.
Restart checks passed.

The actual Kosmos semantic client also queried that service successfully.
Five client queries completed in about 430 to 448 milliseconds.
Cancellation and changed-source checks passed.
Wrong credentials and an unavailable gateway returned the fallback result.
The client recovered after the gateway restarted.
This was a client-module test. Native Obsidian acceptance is still open.

The latest completed Kosmos verification passed 503 tests.
The persistent reader passed 53 Python tests on Windows and Linux.
Each result applies to its tested revision.
Later changes still need their affected checks.

## The immediate bug being fixed

A new test reproduced a client deadline bug.
Synchronous authority checks can consume the entire time budget.
The client can then start a network request after its deadline.
The proposed fix checks elapsed time before starting transport.
At this handoff, the regression test exists and the fix is pending.
See `src/workspace/semantic-client.ts` and its matching test file.

## What still needs work

- Connect the semantic client to the actual native Notes view.
- Verify real vault permissions and source changes through that view.
- Resolve source references and test the visible user experience.
- Fix indexing latency and complete the required performance runs and soak.
- Complete workspace acceptance and durable observation history.
- Complete adoption authority, prepared operations, and recovery before enabling writes.
- Finish mailbox, service identity, duplicate-ID, and older-PR reconciliation.
- Establish the required independent Rust implementation evidence.
- Test final artifacts, migration, and rollback.
- Run the final debug sweep before merging qualified changes to main.

The complete requirements remain in the [remaining build gates](docs/reviews/2026-09-13-remaining-build-gates.md).
That file links the original plans and historical evidence.
Preserve those records when updating status.

## How another agent should continue

Read this file first.
Then read the remaining build gates and the relevant source files.
Check the current branch and dependency pin before making claims.
Keep synthetic service success separate from native vault acceptance.
Keep credentials and private deployment receipts out of GitHub.

A Terra monitor is scheduled to check long-running qualification every six hours.
It should report meaningful changes, completion, failure, or a needed decision.
Repeated unchanged polling is unnecessary.
Continue independent build work while qualification runs.

The owner's requested outcome is a completed, tested upgrade on main.
That outcome has not yet been reached.
