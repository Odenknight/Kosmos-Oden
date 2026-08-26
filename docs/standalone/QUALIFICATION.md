# Kosmos-Oden Standalone qualification ledger

Date: 2026-08-26

Status: **Draft evidence ledger — not release qualification**

This document records evidence produced during the v0.85 implementation uplift. It does not authorize a merge, release, deployment, write-plane activation, signing, notarization, conformance claim, or TypeScript-to-Rust cutover. A blank or blocked row is not a pass.

## Status vocabulary

| Label | Meaning in this ledger | Current product status |
|---|---|---|
| Implemented | Source exists at the cited commit and its cited focused checks passed. | Partial |
| Configured | Required runtime dependencies and operator configuration are present on the tested host. | Partial development configuration only; every new write mode remains off |
| Authorized | An owner has granted the relevant runtime or release authority. | Implementation on draft branches only; no write, merge, release, or deployment authority |
| Qualified | The complete applicable matrix passed at fixed clean-tree release-candidate SHAs and artifact hashes. | No; only P0 and focused implementation evidence exists |
| Released | Signed/published artifacts were approved and distributed. | No |

## Source coordinates and tree state

| Repository | Clean implementation base | Latest committed coordinate inspected for this draft | Evidence state |
|---|---|---|---|
| Kosmos-Oden | `a7113c0ca3be8dd230a9549940e2f387d4cb2a96` (`origin/main`) | `6a7cffc82075980868534bbcfb0d000aae56616d` on `feature/kosmos-standalone-v0.85` before this ledger commit | Dirty: a concurrent `README.md` modification was present; this ledger is the only path owned by this packet |
| GKOS-Engine | `e29e04bdad1cd192a25eba2d682a4c46774def28` (`origin/codex/phase6-f1-contract-pack`) | `b96f0989c4b99b4378c9ecd45a1fb6a0ec53890d` on `integration/kosmos-standalone-20260826` | Dirty: pending service edits in `src/service/authorized-view.ts`, `events.ts`, `types.ts`, and untracked `auth.ts`; runtime integration is not yet a committed candidate |

The clean P0 evidence coordinates are Kosmos `bc5583214bdd019bc78f4f5dbef1797bfdb26063` and Engine `fe190feae101db1900201cdc09a5984dafa6f969`. Both worktrees were clean at those P0 commits. See [BASELINE.md](./BASELINE.md) for branch reconciliation, remote heads, the bounded-frontmatter ancestry, and the original clean-tree records.

The coordinates above are not final release-candidate coordinates. The final documentation commit is necessarily later than the Kosmos evidence coordinate recorded here, and active unrelated work makes both current trees unsuitable for release qualification.

## Host, toolchains, and dependency locks

| Item | Recorded value |
|---|---|
| Host | Windows NT `10.0.26200.0`, AMD64 |
| Node / npm | `v24.18.0` / `10.9.4` |
| Rust / Cargo | `rustc 1.98.0 (88d9e12ae 2026-08-18)` / `cargo 1.98.0 (797e8a9bc 2026-08-05)` from `C:\Users\FAC\.cargo\bin` |
| Kosmos `package-lock.json` SHA-256 | `c61314b6e3d0179e9a3df14351f0e128181701c9e979f2a6853916f5f1fce0b4` |
| Kosmos `pnpm-lock.yaml` SHA-256 | `6222c996e30cbd84749877d54cfcf83c147df44f4e96c603b45a3ddfabe439d1` |
| Desktop `src-tauri/Cargo.lock` SHA-256 | `24a3fa1c4a2be919507c471c12cc6cae5044c43c8d6dee8d14e38c44245b1e03` |
| Exact desktop dependencies | Tauri `2.11.5`, `tauri-build` `2.6.3`, `rfd` `0.17.2`, Serde `1.0.229`, serde_json `1.0.151` |
| Engine `package-lock.json` SHA-256 | `498f425ee448aa7b7367e7a8730bacc4e6f1ebdf596a0b453182b353b3ba0608` |
| Declared Kosmos version | `0.8.0`; an owner-approved v0.85 release version has not been set |
| Current locked Engine consumer | `gkos-engine` 2.1.1 at `f4dfda16eac7...`; this is not an authorized immutable Engine 2.2 effects artifact |

## Baseline evidence (P0)

| Repository and command | Exact recorded result |
|---|---|
| Kosmos `npm ci` | Pass |
| Kosmos `npm run verify` at the P0 coordinate | 215 tests, 215 pass, 0 fail, 0 skip; typecheck, build, versions, lock, artifacts, invariants, and renderer provenance passed |
| Kosmos `npm run test:renderer` | 30 cases, 28 pass, 0 fail, 2 documented context-loss skips after reviewed reference creation/correction |
| Engine `npm ci` | Pass; prepare/build completed, 13 packages added, 0 vulnerabilities |
| Engine `npm test` | 875 tests, 868 pass, 0 fail, 7 documented platform/external-fixture skips; `800888.2964 ms` |
| Engine `npm run test:navigation` | 128 tests, 127 pass, 0 fail, 1 documented skip; `4507.2197 ms` |
| Engine `npm run test:intelligence` | 4 pass, 0 fail; `0.002 s` |
| Engine `npm run pack:check` | Pass: 466 files, 3,113,154 bytes |
| Engine compatibility fixture | 4 pass, 0 fail, 0 skip; `489.5489 ms` |
| Engine Navigation Effects suites | 81 pass, 0 fail, 0 skip; `4895.7078 ms` |
| Both repositories | Typecheck/build/license/nomenclature/diff gates applicable at P0 passed |

The seven Engine skips and two renderer skips are enumerated in `BASELINE.md`; none is converted to a pass here.

## Implementation and focused evidence

| Area | Commit/evidence | Implemented | Configured | Authorized | Qualified | Released |
|---|---|---:|---:|---:|---:|---:|
| Authorized Engine service foundation and hardening | Engine `d592a4bc51a2faa87290776805107daa604d3efb`; focused service 9/9, F1 8/8, compatibility 4/4; final full run 884 total, 877 pass, 0 fail, 7 documented skips, `958502.3051 ms`; Navigation 127 pass/1 skip; intelligence 4/4; pack 483 files/3,128,201 bytes; license/nomenclature clean | Yes | Development only | No runtime authority | No live cross-product E2E | No |
| Traffic heatmap and bounded traversal replay | Kosmos `da9f77035bf39fd6c4244e9d2697dddc54da1501`; `npm run verify` 251/251; renderer 37 pass with 2 documented context-loss skips and visual stage 3/3 | Yes | Viewer development build | N/A (read-only observability) | Focused only | No |
| Immutable proposal quarantine and decisions | Final decision integration `baceb263d5b5be4a844aaa72d09b5adbdcf9d769`; `npm run verify` 258/258, 0 fail/skip; focused proposal/decision checks 16/16 | Yes | Ingress not enabled in a shipped profile | No proposal-ingress or apply activation | Focused only | No |
| Navigation Effects coordination primitives | `70dcc7ce3a1e8320b989316e2ffec12828d2a668`, corruption fix `c6a9790dbea10287b823603ef8880c35edf79aa1`; typecheck/build and coordination checks 9/9 | Primitives only | Write settings fail closed/off | No MOC write authority | No host/runtime qualification | No |
| Native desktop-shell source | `fec7c0a403137a7b0345ded5de2d822c2ddd4173`, lifecycle fix `9cbce42276a326540e3242119e6cca2353042b35`; focused Node 3/3; Cargo format/check/test-build passed; associated Kosmos source verification 251/251 | Alpha source only | Windows development source | No packaging/release authority | No executable runtime test | No |
| Portable alpha staging | Included in `fec7c0a...`; synthetic fixture proves checksum/SBOM-input staging and honest absent-target reporting | Stager only | Synthetic fixture only | No publishing authority | No real target set | No |
| Debian read-only Docker profile | Engine `b96f0989c4b99b4378c9ecd45a1fb6a0ec53890d`; focused static/adversarial tests 5/5; typecheck/build/license/nomenclature passed | Yes | Documented, not instantiated | No deployment authority | Docker unavailable; no image smoke | No |

The later Kosmos head contains the listed work, but no clean-tree integrated rerun at final Kosmos and Engine release-candidate SHAs has been recorded. Results remain bound to the commits stated in each row.

## Desktop and portable evidence details

The desktop source uses the generated `kosmos-oden-stand-alone.html` through a build/copy step rather than maintaining a second renderer. Its implemented source paths cover corpus selection, bounded sidecar restart, start/stop/reconnect, version reporting, redacted diagnostic export, application-data state, and credential delivery through Tauri IPC rather than a URL or sidecar argument. The write plane is absent from the shell rather than represented by a permissive placeholder.

The Rust checks produced this bounded evidence:

- `cargo fmt --check`: pass.
- `cargo check`: pass with the installed Windows GNU toolchain.
- `cargo test --no-run`: pass; the test binary linked.
- Tauri-linked test execution: unavailable. The Windows GNU WebView test binary exited with loader status `0xc0000139` before tests ran.
- Windows MSVC qualification: unavailable. Visual Studio Build Tools installation required elevation; the UAC attempt was cancelled before payload installation, so the MSVC linker/toolchain gate remains open.

Portable staging used a synthetic sidecar fixture only. Its generated checksums demonstrate the stager, not the provenance or safety of a real `gkos-agent` binary. No staged file is a release artifact, and no artifact digest from that synthetic run is promoted into this ledger.

## Known durability and host limits

- The desktop shell creates private application-state directories with the strongest implemented Unix owner-only mode where applicable. Windows ACL hardening has not been independently proven and is not claimed.
- The Windows GNU loader failure means sidecar supervision, shutdown, restart backoff, secure IPC, state placement, and diagnostic export have source/unit evidence but no successful native Tauri runtime execution on this host.
- The Debian profile uses a fixed non-root identity, a read-only corpus mount expectation, writable `/state`, a read-only root filesystem, and direct PID 1 `SIGTERM` delivery. Docker was absent, so container permissions, token/status persistence, loopback reachability, corpus byte identity, and graceful termination were not observed in a real container.
- No complete Obsidian or standalone/native MOC host adapter has passed archive, journal, lease, receipt, recovery, adoption, rollback, race, or shutdown qualification. The current Kosmos work is coordination/settings/reconciliation primitives only.
- No filesystem-specific durability claim has been established for NTFS, ext4, APFS, network filesystems, Obsidian Vault APIs, or Tauri-hosted sidecar state.
- The inspected Navigation Effects implementation remains integration-only/experimental. There is no owner-authorized immutable Engine 2.2 package and integrity binding.

## Open qualification and release blockers

| Required row | Current evidence / blocker |
|---|---|
| Final Engine runtime commit | **Pending:** active uncommitted `src/service/*` work; insert exact clean-tree SHA and rerun evidence |
| Immutable Navigation Effects dependency | **Blocked:** no owner-authorized Engine 2.2 artifact, exact version, integrity, or binary/package SHA-256 |
| Unified live service E2E | **Not run:** no recorded one-service graph + MCP + authenticated event-stream viewer flow; no secret-note cross-surface canary at final runtime |
| MOC host profiles | **Not implemented/qualified:** no complete Obsidian and standalone adapter parity, adoption, archive, journal, recovery, reconciliation, rollback, or exact-byte region evidence |
| Tauri runtime | **Blocked on this host:** GNU WebView loader exit `0xc0000139`; MSVC Build Tools/linker unavailable without completed elevated installation |
| Docker runtime | **Unavailable:** Docker command absent; no Debian image build, smoke, network-boundary, SIGTERM, restart, or byte-identity result |
| Debian/Linux x64 artifact | **Absent:** release workflow is contract-protected and has no authorized Linux SEA artifact job |
| Windows x64 package | **Absent:** no tested `.exe`/installer, architecture evidence, signing, malware scan, install/uninstall result, or artifact hash |
| macOS arm64 and x64 packages | **Absent:** no binaries, package smoke, architecture evidence, Developer ID signature, notarization, or Gatekeeper result |
| Portable target archives | **Absent:** staging logic only; no complete real four-target artifact set, SBOM, notices, checksums, or clean-machine smoke |
| Scale/performance | **Not run:** no bound 100/1k/2k/10k/50k fixtures, convergence percentiles, parse counts, queue depth, memory, journal growth, or reconciliation duration |
| Crash/recovery matrix | **Not run:** no real-process interruption at each transaction boundary and no resulting recovery classifications |
| Watcher/reconciliation soak | **Not run:** no 24-hour command, timestamps, event counts, faults, reconciliations, raw log, or machine-readable summary |
| Cross-platform accessibility | **Not run:** keyboard/focus/labels/reduced-motion/contrast matrix remains open on packaged targets |
| Supply chain | **Incomplete:** locks exist, but final artifact checksums, full SPDX SBOM, notices, provenance, secret scan, architecture scan, signatures, and notarization are absent |
| Rust 3.0 cutover | **Not started/authorized:** no frozen final protocol fixtures, shadow comparison, parity evidence, cutover approval, or rollback artifact |
| Merge/release/deployment | **Not authorized:** no merge to main, tag, publish, signing, deployment, write activation, or conformance claim is permitted by this ledger |

## Required final evidence placeholders

These fields must be replaced with evidence, not prose assertions, before a release-candidate qualification review:

| Field | Required value |
|---|---|
| Final Kosmos clean-tree SHA | `PENDING` |
| Final Engine runtime clean-tree SHA | `PENDING` |
| Engine immutable effects version and integrity | `PENDING OWNER-AUTHORIZED ARTIFACT` |
| Effects contract version and artifact source | `PENDING` |
| Viewer, sidecar, portable archive, and installer SHA-256 values | `PENDING REAL ARTIFACTS` |
| Debian 13 result and raw-log reference/hash | `PENDING` |
| Windows 11 x64 result and raw-log reference/hash | `PENDING` |
| macOS arm64 result and raw-log reference/hash | `PENDING` |
| macOS x64 result and raw-log reference/hash | `PENDING` |
| Obsidian/Electron/browser/filesystem/hardware matrix | `PENDING` |
| Authorization and secret-canary byte-search report | `PENDING` |
| MOC crash-transition results and recovery classifications | `PENDING` |
| Scale fixture generators, raw measurements, and performance report | `PENDING` |
| 24-hour soak start/end, command, counts, faults, and logs | `PENDING` |
| Final SBOM, licenses/notices, provenance, and secret-scan evidence | `PENDING` |
| Signing/notarization identities and results | `PENDING OWNER/RELEASE ACTION` |
| Owner decisions for proposal ingress, MOC adoption/enablement, release labels, and Rust cutover | `PENDING OWNER DECISIONS` |

Until every applicable placeholder is resolved at fixed clean-tree SHAs, Kosmos-Oden Standalone remains an implementation build with partial synthetic evidence, not a qualified or released product.
