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
