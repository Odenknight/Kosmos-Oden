# Desktop inspection consumer verification

Signed consumer `4ba6faf028b09e1faf4b78024017aa219174f4ec` combines Engine
`a6ab4764ba858a1af07333311337230f3a1d4f29` with the separate desktop-only
read-only Effects inspection host. The isolated implementation is retained at
`61f99d954817b77043ddb6b7783fac5a88ba0099`; its consumer integration is
`542af2c8bf26fa0536c1d155ec879a5faeeebff0`.

The plugin loads the optional host only for an explicit desktop inspection with
an actual FileSystemAdapter. Adapter identity and vault root are checked before
inspection and before publishing results. Unload invalidates pending results.
The host exposes no execution or recovery operation and never invokes durable
shutdown, which would write a checkpoint. See the
[installation and authority boundary](../navigation-effects/READ-ONLY-INSPECTION-HOST.md).

## Executed checks

| Check on the signed consumer | Result | Raw log SHA-256 |
| --- | --- | --- |
| Windows full verification chain | 639 passed, 0 failed, 7 Linux-only skips | `716ea886036329d33a984c8243dfea9b444abdf5e1cdb2bfc0464461171ce96e` |
| Native Debian fresh checkout, full verification chain | 633 passed, 0 failed, 13 platform/environment skips | `8e99a34b155afd60be7c2829b0dd715c6eb3fb71b52456f6ab90240c2638f151` |
| Four-browser matrix, including existing visual references | 246 passed, 2 declared context-loss skips | `1ccebb01ecd03895d17aeb5879a743d8a6d9720d67395a14d21452324446c34b` |

The full chains include type checking, builds, package/artifact, version, exact
dependency, policy, renderer provenance and branding checks. Reference images
were not updated. The focused integration checks passed 15 cases, including
real installed-Engine empty/interrupted inspections, unchanged directory entries
and bytes, stale binding/unload refusal, error sanitization, mobile module loading
without Node imports, browser import purity and packaging preservation.

The first combined Windows run at `542af2c` failed before two existing test
modules could load: their Obsidian stubs did not export FileSystemAdapter.
Its raw log remains `1018059b1ea2757770c0ab4ed630ae682d4460bc09bf21cb3822da1648c81984`.
Adding that export preserved the original assertions; the five affected tests
passed before the complete rerun. The correction log is
`2b2d041ed7c083450df9e45a541d6411684e741a090b27d0700f63b8cf2817d6`.

The verified Windows build produced main.js SHA-256
`e4ebf9836596249e3cd63989d98d0cbe95fcc13c160e9091fab56c7d9efbe3f3`
and optional host SHA-256
`c109f3e55035c0ab650a4524896e13c0180ea3f8166a36f77b67dc353c8e6a10`.
These are candidate artifacts, not the currently installed plugin.

This does not qualify visible installed inspection, source execution, authorized
recovery, persistent reconciliation, native macOS, watcher performance or soak.
The standard Community/BRAT installation does not fetch the optional host.
Source effects remain unavailable; no release or main merge is authorized.
