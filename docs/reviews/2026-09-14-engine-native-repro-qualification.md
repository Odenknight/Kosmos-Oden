# Engine native Windows reproducibility qualification

Engine commit `851239a32a81ed794addd1ab6ecf3f02904b60fc`, tree `c36a15c1204100082ad5050510c93df4c6e3a069`, contains 705 committed source files. This change adds the MSVC linker flag `/Brepro` to the Windows retained-guard build and a focused regression that compiles the exact source and pinned Node-API headers in two fresh, time-separated roots. The regression compares the raw native binary bytes and the manifest's native hash. It does not rewrite or normalize timestamps or any other binary fields.

The local repeatability evidence applies to the installed MSVC 14.44.35207 toolchain on Windows x64. It does not establish reproducibility for every compiler or linker version. The earlier `a6ab4764ba858a1af07333311337230f3a1d4f29` non-reproducibility evidence remains retained; this qualification records the later candidate and does not replace that historical result.

## Runtime evidence

The coordinator independently verified all eight terminal receipts in `_Claude-Code/engine-native-repro-all-runtime-root-verification-20260914.json`. Verification covered the exact commit and tree, all 705 Git blobs, source snapshot digests, actual command arguments, raw build and test log hashes, and terminal counts.

| Environment | Node | Result | Tests | Skips | Receipt SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| GitHub Windows | 22.23.2 | PASS | 1,218 | 0 | `adda49b5c18ffe20fac65ac8a48c43b7359f8bb4ea5d23355e664590e047ca5b` |
| GitHub Windows | 24.20.0 | PASS | 1,218 | 0 | `e720b8be7e0d611d21b93a9860e7094887403a813b2591036ac6441efaf2da27` |
| GitHub Windows | 26.8.2 | PASS | 1,218 | 0 | `ef98bd980d7dc5ffb41f99a21aff8f84d523491dfab3d45e5ca37e2a3fe2619e` |
| GitHub Ubuntu 24.04 | 22.23.2 | PASS | 1,220 | 0 | `0ed4a454287993bafc324697e86194a72472332f52f433ecb451f09443ff2d3b` |
| GitHub Ubuntu 24.04 | 24.20.0 | PASS | 1,220 | 0 | `a648587093550eb90d6d4bf0fb33a464cc12f305e62ccc4aa858e40734d1a90c` |
| GitHub Ubuntu 24.04 | 26.8.2 | PASS | 1,220 | 0 | `abcf991cf2b4a5cdd15b31a18806041f90eb486634be25a4a11c55ff52004f0b` |
| Native Windows | 24.18.0 | PASS | 1,218 | 0 | `bc8808d50aef87da0828e7afa2d25f8273260a36462a3e0d233cd0cbfe495f78` |
| Native Debian 13.5 | 24.21.0 | PASS | 1,220 | 0 | `5a6b16f6d771cd3d72151b37b591ba5fe2066b3f15525346a89808bf1e556c46` |

Hosted GitHub Actions run [34848875736](https://github.com/Odenknight/GKOS-Engine/actions/runs/34848875736) completed successfully at the exact commit. Its six current-runtime lanes all passed with no failures, cancellations, skips, or todos. Node 26 is informative because those workflow lanes use `continue-on-error`; it is not a release-qualification lane.

The native Windows run passed 1,218 tests and the native Debian run passed 1,220 tests, both with no skips. The qualified native guard SHA-256 is `2b88137b26e2f5585443960fd3a345f0455f93534c85ff2d61f67482a57d3036`. Independent fresh-root builds produced that same raw binary identity.

## Package repeatability and scope

Two actual npm packs separated by a complete rebuild were byte-identical. Each archive contains 652 files, is 6,941,263 bytes, and has SHA-256 `f326521211ca1fc61dafc67a95cd354ad52df05a6af5ef0d136ae66d3e24527e`. The packaged native guard matches the qualified native hash above.

This closes the bounded Windows retained-guard reproducibility check for the observed MSVC 14.44 environment and records passing runtime evidence for the candidate. The separate consumer verification is recorded below. This review does not claim installed consumer adoption, a main-branch merge, release publication, release readiness, native macOS qualification, or any broader product approval.


## Consumer verification

Signed consumer `a031b777f0407a7016dc84268ddf6d9e22a595da` pins this exact
Engine commit. All 652 installed Engine files matched the verified npm archive
byte for byte, including the native guard, manifests and dependent bundles.
The comparison receipt SHA-256 is `9b97ed940093216bb163bbeeb17754dd485c854dc11df18d060a57a968457275`.

| Consumer check | Result | Raw log SHA-256 |
| --- | --- | --- |
| Full Windows verification | 639 passed, 0 failed, 7 Linux-only skips | `06bb52a6a485c86340f24cb43370a8ef0bf8e2efb04861ceb1b801ff9de1652d` |
| Fresh native Debian checkout, full verification | 633 passed, 0 failed, 13 declared skips | `a2d2fdde7566a0d6bfdf5fb48751f354768d01edf39440b7bc08c842beba2a79` |
| Four browser projects and existing visual references | 246 passed, 2 declared context-loss skips | `10c3f9deea3827ba63f3fc8837ca9c8e5ca3f8818711dbe183a4fa0973ebd564` |

Both full chains also passed type checking, builds, version and lockfile guards,
artifact checks, invariants, renderer provenance and branding. No reference
images were updated. The built plugin and optional inspection host retain their
previous qualified hashes; this build-only Engine change does not alter those
consumer bundles. These checks do not prove visible installed acceptance,
performance-budget compliance, soak, history ownership, source-effects authority,
deferred native macOS qualification, or final release readiness.
