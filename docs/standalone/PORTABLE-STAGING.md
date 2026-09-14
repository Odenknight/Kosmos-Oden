# Portable internal-alpha staging

The release packager can stage an offline viewer with explicitly supplied sidecars.
It does not build, execute, sign, or qualify those sidecars.
Every package reports productionReady=false and runtimeQualified=false.

```sh
node scripts/package-release.mjs --portable --allow-incomplete --output=release/alpha-review-1 --sidecar=windows-x64=/path/to/gkos-agent.exe --sidecar-manifest=windows-x64=/path/to/sidecar-release.json
```

Supported target names are debian-x64, windows-x64, macos-arm64, and macos-x64.
Supply both options for each target. No artifact is discovered implicitly.
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
