# Engine main consumer upgrade

The build candidate moves from Engine
`25208e014e001f95b7660165618cc337af960dbe` to
`91433b158b4b9bc30bd4d43b7dd8f61363647960`, retaining the 2.2.0 development
version. The package declaration, lockfile, lifecycle-script allowance, immutable
pin guard and adapter test agree on that commit. The previous recovery-consumer
receipt remains historical evidence for its own pin.

The merged Engine history includes PR63's broker/HTTP/ledger hardening, subsequent
managed ingestion and query deadline fixes, and validated graph-comparison
optimization. The private managed Python implementation remains outside public
package exports. Updating this dependency does not start a service, ingest the
vault, enable writes, or supply authenticated managed-query integration.

The shared Engine task records a 2,000-note edit at 12,648.90 ms against its
declared budget: FAIL_BUDGET. Full soak, reviewed semantic relevance comparison,
product-host authorization and promotion remain open. Its short synthetic live
receipts cannot close those gates. New-main hosted workflows were queued when
this upgrade began; consumer validation is recorded separately below.

Installed Obsidian remains on the earlier drawer package `db48c12` until a new
exact package is deliberately qualified and installed. Native resize acceptance
for that package remains unresolved while its document reports hidden.

## Consumer validation

Installation changed only the Engine dependency and reported no npm audit
vulnerabilities. Full verification passed 454 tests and the type, build, version,
immutable lockfile, artifact, invariant and renderer-provenance checks.

The four-target browser run covered Notes, embedded rendering, standalone boot
and standalone import/export flows: 126 passed, two Chromium cases exceeded the
unchanged 30-second test deadline. Those cases were snapshot export and compact
viewport controls. Each then passed three times with one browser worker and
unchanged assertions/deadlines (six successful rechecks). The initial failures
remain evidence; this is not a claim that the parallel run passed or that heavy
parallel software-rendering performance is qualified. No production code was
changed to hide these timeouts.

Private logs: `engine-main-upgrade-install-20260913.log`,
`engine-main-upgrade-verify-20260913.log`,
`engine-main-upgrade-browser-20260913.log` and
`engine-main-upgrade-timeout-recheck-20260913.log` under `_Claude-Code`.
