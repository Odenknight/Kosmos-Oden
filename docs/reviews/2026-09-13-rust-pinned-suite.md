# Independent Rust workspace test evidence

Repository: Odenknight/GKOS-Engine-Rust.
Tested commit: `efb8000fb35d76308d77a5ff6b4f97d2d65a5aab`.
The isolated checkout remained clean.

The pinned Windows MSVC Rust 1.98.0 toolchain is available.
Cargo, rustc, and MSVC 14.44.35207 linker hashes match the frozen
`rust/evidence/contracts/binary-metadata-input-v1.json` contract.
The two audit binaries were recovered from the accepted local admission archive.
Both executable hashes match that contract. Copies were staged outside the checkout.
No frozen hash, source file, lockfile, default toolchain, or test expectation was changed.

With all five documented `BINMETA_TEST_*` directories supplied, the metadata
command target passed all 11 tests. The full workspace command then passed:

```sh
cargo +1.98.0-x86_64-pc-windows-msvc test --manifest-path rust/Cargo.toml --workspace --all-features --locked --offline --no-fail-fast
```

Result: exit 0; 400 passed; zero failed; zero ignored; 33 result groups.
Private logs: `rust-binmeta-admitted-tests.log` and `rust-pinned-full-qualification.log`.
Exact prerequisite hashes are retained in `rust-binmeta-current-toolchain-check.json`.

This supersedes the earlier 390-pass/10-failure workspace result for this commit.
That earlier record remains historical evidence of missing test configuration.
The command tests exercise early refusal paths; they do not prove the separate
successful two-pass binary-metadata build procedure.
Workspace tests alone do not establish independent product functionality,
complete cross-implementation parity, Linux qualification, or release acceptance.
Those remaining requirements must be checked against their actual implementation and plans.

## Executable and integration-branch check

After the passing suite, the `gkx` binary was built and invoked with `--help`.
It exited with code 2 and reported that the WP-13 walking skeleton is unimplemented.
The first cargo invocation required an explicit `--bin gkx` because the package
declares three binaries; the explicit invocation reached the executable.
The Lite and service entry-point sources also report unimplemented behavior and exit 2.

Live GitHub branch discovery found `integration/m0` at
`e50e0c81f3bd4362b54d73d0b26adb93f7b5fa4d` and no `wp/13-*` branch.
Fetching that integration branch and reading its CLI source confirmed the same placeholder.
This is not merely an outdated main-branch README.

Master build plan r5.4 defines the next executable requirement as WP-13:
`gkx validate` on the minimal fixture, with bytes and exit status compared through
the WP-07 classifier against the WP-08 golden. It requires an oracle match or a
reviewed non-blocking disposition. The current placeholder cannot satisfy it.
Before implementation, reconcile those fixture, classifier, and golden prerequisites.
Do not replace the requested independent implementation with a TypeScript wrapper.
