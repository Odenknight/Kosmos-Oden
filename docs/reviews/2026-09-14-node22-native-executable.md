# Node 22 Windows executable qualification

Recorded September 14, 2026.
Engine source: `13ff119bbe7a1d9dd686d75267a4eb8f2cc65504`.
Host: Windows x64. Runtime: Node 22.22.1.
The Engine checkout remained clean throughout these focused checks.

## Focused guard checks

Both commands used the recorded Node 22.22.1 executable explicitly:

```text
node --test test/native/windows-retained-guard-sea.mjs
node --test test/native/windows-retained-guard.mjs test/sea-native-assets.test.mjs
```

The first command passed one test. The second passed seven tests.
There were no failures, skips, or cancellations.
The executable test built actual Windows PE files with the real SEA builder.
It loaded the embedded guard without an adjacent native directory.
The guard blocked 100 rename attempts and 100 write attempts.
It preserved the protected source bytes and released the guard afterward.
The loader extracted one verified native asset per process.
Executables with missing or altered assets were refused before extraction.

The Node executable hash matches the retained official distribution checksums:
`923a41f268ab49ede2e3363fbdd9e790609e385c6f3ca880b4ee9a56a8133e5a`.
The retained runtime receipt identifies the Node project distribution as its source.
This check verifies retained bytes; it is not a fresh signature verification.

Retained raw log SHA-256 values:

| Log | SHA-256 |
| --- | --- |
| `engine-sea-node22-focused-20260914.log` | `15b6a0a73b647894c817f786f34eaa86f5dc314cd79bdbfca47d07b7488ae7df` |
| `engine-guard-node22-focused-20260914.log` | `fc0863a1fc813249f70e0f99e6bb6bf0dcac86d555b2572a9a5b14ee0c5d3ebe` |

## Limits

These focused checks establish the tested Node 22 guard and executable behavior.
They do not establish full Engine qualification on Node 22.
They do not establish Electron loading or visible Obsidian acceptance.
They do not authorize a release or qualify other operating systems.
The full Engine candidate qualification and final product gates remain separate.


## Full Engine under the native desktop supervisor

The real Engine executable was built from the same `13ff119` desktop bundle
and verified native assets using Node 22.22.1. Its size is 88,849,920 bytes.
Its SHA-256 is `f2f41f1e0fa2b85530bf59ca3fb24095650207596eecce85fc5dcc579ff14e47`.
An isolated Kosmos checkout at `2397f94` used an explicit local qualification
manifest for those bytes. This manifest is not a production release approval.
The default repository release manifest remains unchanged.

The first real supervisor test failed. Engine could not publish status because
the supervisor held a writable log handle in the status directory. The Engine
Windows guard correctly refused to protect that same file as retained read-only
state. The child repeatedly exited and exhausted the restart limit.
A diagnostic executable showed that the loader itself succeeded; the native
retained-file guard refused the conflicting handle.

The Kosmos correction places new logs in private `sidecar-logs/`, beside the
`sidecar/` status directory. It retains existing logs in their original location.
The Windows startup example now uses the same separation. No Engine guard or
sharing restriction was weakened.

With only this supervisor source correction and the unchanged real executable,
the previously ignored recovery test passed. It indexed one synthetic note,
recovered from five forced child terminations, refused a sixth restart, and
verified shutdown with no remaining child. The run reported one pass, zero
failures, zero ignored, and 19 filtered tests. It took 27.26 seconds.

```text
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib real_engine_recovers_through_supervisor -- --ignored --exact sidecar::tests::real_engine_recovers_through_supervisor --nocapture
```

The explicit binary environment variable and local manifest were supplied only
in the isolated qualification checkout. This proves the tested Windows native
supervisor recovery behavior. It does not qualify final installation, the visible
window, all Engine functions, other platforms, or the complete release.

`kosmos-supervisor-node22-qualification-20260914.log`: `1adcc504551f692465ea79ec6858352d58b454ff804ed094a299cc66e6d4d375`.

`kosmos-supervisor-node22-fixed-20260914.log`: `368901d3c8a48f0db6c7819542cb6c8c35d74d612ed5e85a33d9307c95d5d91b`.


The corrected Windows startup example also passed both initial startup and
restart. Each phase indexed one synthetic document, verified native credential
retrieval, rejected an unauthenticated request, and served an authenticated graph
request. The default-manifest native suite passed 19 tests with its one opt-in
recovery test ignored; the explicit run above covers that test separately.
Five desktop contract checks also passed.

`kosmos-separated-log-native-20260914.log`: `175d91875d052294ce2c2a533eb35054c2d3f0a8ce9f2021ff82c140dcca7f8b`.

`kosmos-separated-log-contract-20260914.log`: `a5300e7d6735c77d0cec23ed538059423789701d050cbea36732afd29bc93932`.

`kosmos-separated-log-startup-20260914.log`: `2723156446f8430e3577061361dca8edbc464bdd70d4e780def29da5404cd62d`.


Separately, the exact Engine revision completed full Windows Node 24.18.0
qualification with 1,215 passes and no failures, skips, or cancellations.
The run ended at 06:42:29.961 UTC on September 14. The tested source revision
and both log hashes were verified. The build log SHA-256 is
`e0af3c9d29a96d73df7cd9c0b3df1829625e805428667c1b123c388d157d4794`.
The test log SHA-256 is
`7c8a222812e63522605c9714937db6c70c36f820ffd3e8fd3e6c0b892c0851dc`.
A new isolated full Node 22.22.1 run is in progress. These two full-suite results
must remain distinct. The Node 24 receipt explicitly keeps release qualification false.
