# Historical PR backlog refresh

This is a live-state refresh and partial behavior reconciliation.
It does not close the complete backlog gate or authorize a release.
The current Kosmos candidate before these changes was 5c4af13.

| PR | Live state | Inspected head | Remaining disposition |
| --- | --- | --- | --- |
| [#27](https://github.com/Odenknight/Kosmos-Oden/pull/27) | open; mergedAt is null | `a326f7e9b72e278d996ab8276284ff7e10c1f666` | Current UI uses GKX. The missing copy check is adopted below. Other historical claims still require reconciliation. |
| [#28](https://github.com/Odenknight/Kosmos-Oden/pull/28) | closed; mergedAt is null | `eb8486aa4c7c51b0c63869a4139c748c69b63745` | Closed without merge. Preserve its historical pin and naming proposal. |
| [#38](https://github.com/Odenknight/Kosmos-Oden/pull/38) | open; mergedAt is null | `fbec1f9daeb4c3cc258ddec0d046adc2dac3483d` | Open. Standalone packaging and release behavior still require full comparison. |
| [#41](https://github.com/Odenknight/Kosmos-Oden/pull/41) | open; mergedAt is null | `65e9354f220b19a16c67504ff228e58caf8128ca` | Open. Service uplift and standalone behavior still require full comparison. |
| [#55](https://github.com/Odenknight/Kosmos-Oden/pull/55) | closed; mergedAt is null | `64a6001ceedf2e640e989606c1655308c3482c83` | Closed without merge. Do not describe the PR as merged. |

## PR27 check adopted

The current plugin and renderer already use GKX naming.
PR27 also proposed a check for accidental current-format OKF+ wording.
That check was absent from this candidate.
`scripts/check-branding.mjs` now supplies it and `npm run verify` runs it.
The status message uses the current Kosmos-Oden product name.
The check covers the README, package and plugin manifests, and the immediate
TypeScript files under src/plugin and src/renderer. It is a textual guard,
not a complete UI parser or proof that every rendered string is correct.
Explicit historical and compatibility references remain permitted.
Old documents and Git history are preserved.

The current third-party notice named a superseded Engine pin.
It now records the actual package and lockfile pin, 885b0b39ca1f4c20c27623cdb49b625a8be3d52b.
No dependency version or runtime artifact was changed by that notice correction.
PR27's older provenance wording is not copied over the later namespace policy.

The focused check passes. A temporary current-format OKF+ sentence was rejected.
A temporary explicit historical reference was accepted. The README was restored
byte-for-byte after both checks. The lockfile check passes.
Full `npm run verify` passed: 601 tests, zero failures, zero skips.
Type checking, build, version, lockfile, artifact, invariant, renderer-provenance,
and branding checks all completed successfully.
This run does not close the separate native or visual acceptance gates.

## PR38 and PR41 component recovery

A comparison against candidate 2e22292 found 13 changed paths absent from PR38
and 16 absent from PR41. These counts include documents and tests.
Identical file counts were 130 and 131 respectively. File equality alone does
not prove that all remaining changed behavior has been reconciled.

Three absent pure Effects components were recovered from PR41 head
65e9354f220b19a16c67504ff228e58caf8128ca:

- `event-debouncer.ts` coalesces deliveries with quiet/max delays and bounded queues.
- `self-write-suppression.ts` matches completed receipt references by effect, path, digest, and generation.
- `reconciliation.ts` classifies snapshot and pending-intent differences.

Their historical nine-test suite was restored through the existing test bundle.
These modules own no runtime timers, filesystem writes, or host registration.
Reconciliation intents are serializable values; the modules do not persist them.
The self-write lookup expects already verified durable receipts from a trusted host.
It cannot authenticate an arbitrary caller-supplied receipt or grant write authority.

Review exposed unsafe historical reconciliation cases. Truthy non-booleans could
satisfy journal/checkpoint flags. Missing recovery state could pass. An empty
queue could be classified safe despite incomplete dependencies or a forced full
reconciliation. Intent mutation could discard corrupt scopes/reasons or overflow
its revision. A new regression test failed before the corrections.

The recovered version requires exact safety booleans, preserves forcing conditions,
rejects corrupt intent mutation, and uses the existing portable watcher path rules.
All ten focused tests and type checking pass after the corrections.
Full `npm run verify` passes 611 tests with zero failures or skips.
All build, type, version, lockfile, artifact, invariant, provenance, and branding checks pass.

The actual host coordinator, durable recovery integration, and source-write gates
remain unfinished. This restoration does not activate Effects or close PR38/41.
Their remaining desktop, service, packaging, exclusion, and documentation changes
still need a behavior-by-behavior disposition.
