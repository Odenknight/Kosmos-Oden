# Retrieval and managed MOC integration

September 6, 2026. Branch: `codex/retrieval-moc-next-update`.
Parent: `65e9354f220b19a16c67504ff228e58caf8128ca`.
Engine: `f1a95f8f3933f834eb4030f0f0d143051e6eecc2`, package 2.2.0 candidate.
This is unreleased work toward K3 and K5. Product version remains 0.8.1.

## What works

The standalone viewer offers **Search with Engine** after connecting to an
Engine graph. Enter the separate MCP credential, connect search, and submit a
query. Kosmos negotiates the MCP protocol, tool catalog and search capability
before sending searches. Results show note paths, excerpts, verified line
citations and source digests. Cursor requests retain the original query.
The ranked result window is bounded and is not a complete vault listing.

Credentials stay in memory and request headers. Closing the dialog clears
results and credentials and attempts to delete the session. Authorization
denial terminates the client. Redirects are refused. Returned excerpts render
as text. Existing local search and browser folder operation remain available
without Node or a service. Engine remains on 4814; the Kosmos Agent API remains
on 4816. The search dialog does not configure either server.

`kosmos-moc.mjs` provides a Node host for the public Engine managed MOC runtime.
It requires explicit enablement, a trusted snapshot provider and live
precondition validation. Engine owns reconciliation, durable ownership and
recovery. The Node executor stays outside the browser dependency graph.

## Running a managed MOC host

Build and install dependencies first. A trusted local JavaScript module must
export `createHostOptions()`. It returns `NodeManagedMocRuntimeOptions` from
`gkos-engine/navigation-effects/node`, plus `enabled: true`.

```text
node kosmos-moc.mjs --host C:\trusted\kosmos-host.mjs --once
node kosmos-moc.mjs --host C:\trusted\kosmos-host.mjs --watch
```

Use a module you maintain as application code. Never load an untrusted note,
download or vault attachment as the host module. No provider is discovered
from note content. `--once` recovers and reconciles registered targets before
shutdown. `--watch` retains Engine monitoring and periodic reconciliation.
Only explicitly registered targets can participate.

The host must supply current snapshots, configuration, policy, allowed
sensitivities and target authority. Its `validatePreconditions` callback must
recheck live adoption, grants, actor, policy, adapter, leases and operator
enablement before writes. A permissive test callback is not a production host.
Supply idempotent publication handling where needed. Engine checks and recovery
requirements remain in force. The declared filesystem threat model is
`cooperative-vault`.

## Compatibility findings

The actual packaged desktop agent refused startup with
`GKX_WATCHER_STATUS_NAMESPACE_CHANGED` when its status directory was the same
`.gkx` directory that vault initialization changed. A separate temporary status
directory passed the actual service test. Future sidecar configuration must
keep status and credentials isolated and verify this on every target platform.
The installed Engine was not patched to bypass this check.

The real MCP endpoint requires an initialization notification containing only
`jsonrpc` and `method`. The client now sends that exact shape. Test notes must
also satisfy current GKX admission, including the current epistemic vocabulary.
Successful negotiation alone does not prove that a note is searchable.

## Validation and remaining scope

Windows, Node 24.18.0: `npm run verify` passed 327 tests with zero failures or
skips, including typecheck, builds, dependency checks and repository invariants.
The real service test launches the installed packaged desktop agent against a
synthetic vault, obtains a verified citation and rejects an invalid credential.
Managed MOC tests create a synthetic target, reconcile without another change,
restart with durable ownership, shut down cleanly and preserve the source note.
Mock tests cover capability refusal, cursor propagation, authorization denial,
notification shape and unverified citation rejection.

`npm run test:browser:chromium -- --workers=1` passed all 38 desktop and mobile
Chromium checks in 40.1 seconds after correcting the browser fetch binding.
Local command logs are retained under `_Claude-Code/retrieval-validation/`.
The browser fixture checks separate credentials, session header exposure,
literal excerpt rendering and clearing results when the dialog closes.

This does not complete the Obsidian MOC adapter, production authority provider,
supervised sidecar, native credential bridge, installers, service event replay,
real revocation rotation, crash recovery or the Node 22 and 26 platform lanes.
No semantic model is installed by Kosmos. No automatic MOC maintenance is
enabled in the ordinary browser or Obsidian workflows. Search result display
does not open or modify a note, and results are historical until a new request.

## Merge and rollback

PR 41 for the parent uplift remains open because GitHub requires an approving
review: https://github.com/Odenknight/Kosmos-Oden/pull/41 . Main is unchanged.
This branch builds on that reviewed candidate and does not bypass protection.
There is no release artifact or qualification workflow claimed for this slice.

To roll back this slice, stop a running MOC host cleanly and revert its commit.
Rebuild Kosmos. No settings migration is required. Preserve Engine journals,
ownership records and generated targets for recovery; a code revert does not
undo a MOC write. Restore a target only through the host's verified recovery
procedure or an operator reviewed backup. Leave unrelated staging untouched.
