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
The Engine implementation is now at `ba2e65d`.
Kosmos now pins Engine `885b0b3`.
The Engine now exports its existing pure manifest helpers for native consumers.
Their package API, compatibility, source inventory, and package checks passed.
Kosmos now prepares native manifests through that package API.
It reads only authorized sources and retains a live revision check.
Source edits or observed configuration changes invalidate prepared state.
The Engine now shares publication reconciliation between service and native hosts.
Its Python-ledger, authenticated HTTP, compatibility, and package checks passed.
Kosmos now composes native manifest preparation, receipt validation, and the query client.
It rejects stale host authority and source revisions before showing results.
The plugin now owns the connection lifecycle and passes it into the Notes view.
It reads an optional private profile bound to the native vault identity.
Reconnection invalidates old clients and cannot replace newer work with a late result.
Deployed-profile and visible native acceptance checks remain open.
See the [native connection handoff](docs/workspace/NATIVE-SEMANTIC-CONNECTION.md).
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

The latest completed Kosmos verification passed 565 tests.
The persistent reader passed 53 Python tests on Windows and Linux.
Each result applies to its tested revision.
Later changes still need their affected checks.

## The latest bug fixed

A new test reproduced a client deadline bug.
Synchronous authority checks can consume the entire time budget.
The client can then start a network request after its deadline.
The fix checks elapsed time before starting transport.
The regression test now passes.
All four client tests and full repository verification passed after the fix.
See `src/workspace/semantic-client.ts` and its matching test file.

The export path also had a source-binding gap.
Vault identity or Graphiti settings could change during an export.
The export now rejects those changes before returning results.
Ten new regression cases failed before the fix and passed afterward.
See `src/plugin/agent-server.ts` and `test/source-evidence.test.mjs`.

Native profiles now retain the published projection time.
This fixes a reproduced mismatch after restarting an unchanged source provider.
The deployed service and native export use different projection envelopes.
A separate native synthetic publication now exists.
A recreated native provider reproduced its manifest and accepted its real receipt.
The clean plugin package is staged in an isolated synthetic vault.
The new native HTTP route passed five live queries with published citations.
The isolated vault is open in Obsidian and its loaded plugin reproduced the manifest.
The visible Notes baseline works. Connecting it to the live service remains open.
See the [synthetic publication report](docs/reviews/2026-09-13-native-synthetic-publication.md).

The workspace now has an Open cited source button.
The host checks the citation against the accepted result.
It requires a unique readable note UID and matching original source bytes.
Changed or hidden sources remain unavailable.
Changing the search discards a pending source resolution.
All 31 Chromium workspace tests passed.
The native plugin is wired to the connection owner; its deployed profile still needs qualification.

The latest indexing check still fails the two-second gate.
Engine now reuses a validated delta digest within each activation check.
The affected 31 tests pass, but the full edit still takes about 12.38 seconds.
A follow-up byte-cache experiment passed correctness checks but showed no speed benefit.
It was removed. Engine remains at `ba2e65d`.
See the [performance follow-up](docs/reviews/2026-09-13-watcher-performance-follow-up.md).

The first durable source-history component now exists.
It stores source observations in SQLite and preserves retry identity across process restarts.
It checks current read authority before publishing retained bytes.
An observed authority failure permanently invalidates that history connection.
Pending reads also refuse changes to the full committed-record watermark.
Projection publications now reference exact committed source observations.
They keep their own observation time and preserve the original source times.
Projection references now reject duplicate UUID identities written with different letter case.
Existing source records are preserved.
An actual native publication-witness adapter still needs to be connected.
An independent deny authority now keeps deletion decisions outside history backups.
A synthetic restore test confirms that an old history backup cannot undo a current denial.
A shared host binding now checks corpus identity and combines native permission with the deny authority.
It refuses stale grants and cannot treat the absence of a denial as permission.
This records a denial; it does not physically purge data.
Storage remains off in the plugin. Purge, migration, and native integration remain unfinished.
See the [source-history handoff](docs/workspace/SOURCE-OBSERVATION-LEDGER.md).

## What still needs work

- Qualify the deployed semantic profile through the actual native Notes view.
- Verify real vault permissions and source changes through that view.
- Qualify source resolution and the visible user experience in the native plugin.
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
