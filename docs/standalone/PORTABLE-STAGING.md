# Portable internal-alpha staging

## Preserving ordinary releases

The ordinary plugin packager also preserves earlier packages.
It writes the complete new package into a unique `.release-stage-*` directory.
It then moves the existing `release` directory into `.release-history-*/release`.
The complete staged package takes its place.
The history copy includes any portable artifacts inside the old release.
Both staging and history directories are ignored by Git.
They are retained for inspection rather than automatically deleted.

A failed write leaves the old release in place.
A handled promotion failure restores the old location when that location is free.
A process crash between the two renames can leave `release` absent.
The old package remains under `.release-history-*/release` in that case.
Inspect the history and staging directories before manually restoring a package.
Run only one packager against a checkout at a time.
This is not a crash-atomic directory exchange or a power-loss durability guarantee.
Injected write and promotion failures are covered by `test/package-release.test.mjs`.

## Portable targets

The release packager can stage an offline viewer with explicitly supplied sidecars.
It does not build, execute, sign, or qualify those sidecars.
Every package reports productionReady=false and runtimeQualified=false.

```sh
node scripts/package-release.mjs --portable --allow-incomplete --output=release/alpha-review-1 --sidecar=windows-x64=/path/to/gkos-agent.exe --sidecar-manifest=windows-x64=/path/to/sidecar-release.json --sidecar-inventory=windows-x64=/path/to/gkos-agent.exe.build-inputs.json
```

Supported target names are debian-x64, windows-x64, macos-arm64, and macos-x64.
Supply all three sidecar options for each target. No artifact is discovered implicitly.
Without --allow-incomplete, missing targets produce exit code 2 after writing
an explicit incomplete-target report. With that flag, partial staging can exit 0.
Neither status asserts production readiness.
Unknown/duplicate options and mismatched bindings are refused.
Existing output directories are never replaced. Choose a new --output path.

The supplied manifest has exactly these fields:

```json
{
  "schema": 1,
  "version": "2.2.0",
  "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "os": "windows",
  "arch": "x86_64",
  "bytes": 123,
  "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

The example values are placeholders, not usable release evidence.
Use linux/x86_64, windows/x86_64, macos/aarch64, or macos/x86_64 as appropriate.
Serialize with JSON.stringify(manifest, null, 2) plus one final LF.
This canonical input requirement rejects duplicate keys and ambiguous encodings.
The script checks regular files, target, byte length, and SHA-256 before staging.
It copies the exact checked bytes and writes BUILD-INFO.json and SHA256SUMS.
The manifest is a supplied binding, not a signature or trusted release admission.
An authorized release process must independently establish its commit and build provenance.

The SEA inventory is the exact `*.build-inputs.json` emitted by Engine's SEA builder.
Staging requires canonical two-space JSON with a final LF, schema version 1,
the matching target triple, matching final executable size and SHA-256,
a nonempty observed-input list, and the producer's explicit incomplete-SBOM scope.
It refuses absent, stale, duplicate-key, wrong-target or unsupported-scope inventories
before creating output. It does not independently authenticate or re-open the
inventory's internal input files. A supplied inventory is an artifact binding,
not proof of its claimed build observations or complete component/license coverage.
Each target carries the exact bytes as `sidecar-build-inputs.json`; BUILD-INFO.json,
SHA256SUMS and the target entry in SBOM-INPUT.json bind that file's digest.

The top-level report lists all four target states.
SBOM-INPUT.json records the npm lock digest and staged artifacts.
It explicitly reports completeSbom=false. Complete viewer/sidecar SBOM generation,
license validation, signed installers, notarization, and native runtime acceptance
remain required. The current desktop loader still has no admitted embedded sidecar.
Portable staging does not change that loader or enable automatic discovery.

A failed write can leave a new incomplete directory. The completion manifest is
written last. Inspect or retain failed output as evidence; use a fresh path for retry.
Prior output is preserved. No credentials are needed or copied by this command.

## Standalone build inputs

`npm run build` and `npm run build:standalone` now produce
`dist/standalone-build-inputs.json` alongside the viewer.
This records the actual esbuild input/output graph, final HTML size and SHA-256,
bundler version, lockfile hash, build-script hash, and page-composition input hashes.
Paths are relative to the build root. Page-input hashes are explicitly post-build
observations. They are not an atomic source snapshot or authenticated source receipt.
The manifest is deterministic and contains no build timestamp or absolute host path.

`npm run check:artifacts` rejects a missing manifest or stale artifact, lockfile,
build script, bundler version, or page input binding.
The new inventory did not change the standalone HTML bytes in the qualification run.
It is not yet a complete SBOM. In particular, the pre-bundled Engine dependency
needs its own internal component evidence, and a sidecar needs its own build inventory.
The installed npm tool can generate a lockfile SPDX inventory, but that inventory
alone does not prove what is contained in either generated executable artifact.

Portable staging now requires this generated inventory. Before creating output,
it verifies the viewer size/hash and lockfile hash, requires the recorded bundler
graph, and preserves the incomplete-SBOM and post-build-observation scope.
Each staged target includes the exact inventory bytes in standalone-build-inputs.json.
BUILD-INFO.json, SHA256SUMS, and the package SBOM input record bind its digest.
This proves the inventory accompanies its matching viewer; it does not authenticate
an externally supplied inventory or prove the contents of pre-bundled dependencies.

Focused packaging tests reject mismatched viewer/lock hashes, an empty bundler graph,
and an unsupported complete-SBOM claim before creating output. They verify the
copied inventory, build-info digest, checksum entry, and CLI dispatch.
A separate local staging check used the real built viewer and inventory with a
synthetic non-executable sidecar. Both viewer and inventory matched byte-for-byte.
No sidecar runtime qualification was performed by that check.
# Viewer component observations

The build also emits `dist/standalone.cdx.json` in CycloneDX 1.5 format. It binds
the final viewer hash and exact input-inventory digest to the observed packages,
source input hashes, and license-document hashes. Known MIT and Apache-2.0 package
declarations map to SPDX IDs; other declarations remain explicit properties.
No independent license adjudication is claimed. The composition is marked
`incomplete`, and unknown transitive dependencies are not represented as empty
dependency lists. Engine pre-bundle and native sidecar coverage remain open.

Artifact checks reject stale generator code or a BOM differing from the inventory.
Portable staging requires the matching BOM before creating output, copies its
exact bytes, and binds its digest in BUILD-INFO, SHA256SUMS and SBOM-INPUT.
The security workflow retains it alongside the dependency BOM and viewer inputs.
These records remain incomplete evidence and do not close the full SBOM gate.

The standalone build inventory records SHA-256 hashes of direct files with
positive byte contributions in the actual bundler output. Each file is assigned
to the source package or its nearest installed dependency, including nested and
scoped packages. Package names, versions, declared license strings, manifest
hashes, and available root license/notice document hashes are retained. The
artifact check rejects changed observations and a changed observer script.

These are post-build observations. A same-length change during compilation is
not ruled out, and package license declarations are not license adjudication.
An Engine pre-bundle still needs its own nested source/component closure. Missing
notice files are not invented or treated as evidence of no notice requirement.
The inventory therefore retains `completeSbom: false`; it does not qualify a
release or replace the complete artifact SBOM gate.
