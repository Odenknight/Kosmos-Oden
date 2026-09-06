# K2 Engine 2.2 library adoption

September 6, 2026. Kosmos parent: 88538f2a77fbbd9b174f281ea9a027e49fd488fe.
Engine selected from current main: f1a95f8f3933f834eb4030f0f0d143051e6eecc2,
package 2.2.0 candidate. This is the library adoption portion of K2.

## Changes

Updated the dependency, lockfile, allowScripts entry, exact commit guard,
Engine version assertions, technical guide and development provenance together.
The guard now also requires the active Engine specifier in allowScripts.
No application API adapter changes were needed for the tested public imports.

The embedded parser, projections, lineage, temporal graph, incremental index,
Graphiti and Navigation now use Engine 2.2. Existing capabilities retain their
host ownership. The new managed MOC APIs are available in the dependency but
are not registered as a Kosmos writer. The Node executor remains outside the
browser and Obsidian adapter import graphs.

## Validation

Host: Windows, Node 24.18.0.

- npm install --package-lock-only --ignore-scripts: passed.
- npm ci: passed, clean dependency installation.
- npm run verify: passed, 320 tests, zero failures or skips. Includes typecheck,
  production build, artifact checks, version synchronization, exact dependency
  checks, invariants and renderer provenance. Adapter tests verify isolation
  from Node execution authority.
- Chromium and mobile Chromium, workers=1, standalone, standalone-flows,
  embed, context-loss and consumer-identity specs: 36 passed in 43.0 seconds.
- The additional allowScripts guard was checked separately after introduction.

These are consumer tests against the installed Engine library, not a claim of
real Engine service, real Obsidian, packaged desktop, native MOC or other
platform qualification. Node 22/26 and full platform matrix remain subsequent
work. Product version remains 0.8.1; the changelog records this as unreleased.

## Provenance and rollback

Exact installation and lock digest are in
../navigation-effects/DEVELOPMENT-PIN.md (repository path:
docs/navigation-effects/DEVELOPMENT-PIN.md). Git dependencies are selected by
commit; npm's warning that Git installation skips integrity verification is
recorded there and is not hidden as a verified release signature.

Revert the library adoption commit as a unit and run npm ci and npm run verify
to return to the prior Engine coordinate. No authored source data or settings
format changed. Do not delete unrelated staging files. No sidecar was replaced,
so this slice requires no native service rollback.

## Remaining work

K2 still needs verified sidecar artifacts, native credential handling and
distribution tests. K3 adds service retrieval and available query contracts;
K4 integrates review receipts; K5 connects managed MOC host adapters. A passing
library upgrade does not make any of those workflows wired.
