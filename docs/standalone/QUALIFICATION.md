# Kosmos-Oden Standalone qualification ledger

Date: 2026-08-26

Status: **Draft evidence ledger — not release qualification**

This document records evidence produced during the v0.85 implementation uplift. It does not by itself authorize a merge, release, deployment, write-plane activation, signing, notarization, conformance claim, or TypeScript-to-Rust cutover. The requested merge remains conditional on the controlling gates; a blank or blocked row is not a pass.

## Status vocabulary

| Label | Meaning in this ledger | Current product status |
|---|---|---|
| Implemented | Source exists at the cited commit and its cited focused checks passed. | Partial |
| Configured | Required runtime dependencies and operator configuration are present on the tested host. | Partial development configuration only; every new write mode remains off |
| Authorized | An owner has granted the relevant runtime or release authority. | Draft implementation and a gate-conditional merge were requested; no write-plane, release, signing, deployment, or conformance authority |
| Qualified | The complete applicable matrix passed at fixed clean-tree release-candidate SHAs and artifact hashes. | No; focused and clean Debian 13 evidence exists, but the F1 and cross-platform matrices remain open |
| Released | Signed/published artifacts were approved and distributed. | No |

## Source coordinates and tree state

| Repository | Clean implementation base | Latest committed coordinate inspected for this draft | Evidence state |
|---|---|---|---|
| Kosmos-Oden | `a7113c0ca3be8dd230a9549940e2f387d4cb2a96` (`origin/main`) | `6cc30bfea88f41e17505b8497935f58040193969` on `feature/kosmos-standalone-v0.85` before the current ledger update | Clean at the recorded KnightsAI test coordinate; this ledger is the only modified tracked path. An untracked copy of the 2026-08-26 build plan is present locally and preserved outside this packet |
| GKOS-Engine | `e29e04bdad1cd192a25eba2d682a4c46774def28` (`origin/codex/phase6-f1-contract-pack`) | `d88c639d155e0ec291f6c2bb18cbec3f9e672553` on `integration/kosmos-standalone-20260826` | Committed runtime plus fresh-profile repair coordinate; the local integration worktree also contains four uncommitted stdio/canary files that are not part of this SHA |

The clean P0 evidence coordinates are Kosmos `bc5583214bdd019bc78f4f5dbef1797bfdb26063` and Engine `fe190feae101db1900201cdc09a5984dafa6f969`. Both worktrees were clean at those P0 commits. See [BASELINE.md](./BASELINE.md) for branch reconciliation, remote heads, the bounded-frontmatter ancestry, and the original clean-tree records.

The coordinates above are not final release-candidate coordinates. The final documentation commit is necessarily later than the Kosmos evidence coordinate recorded here, and active unrelated work makes both current trees unsuitable for release qualification.

## Host, toolchains, and dependency locks

| Item | Recorded value |
|---|---|
| Windows host | Windows NT `10.0.26200.0`, AMD64 |
| KnightsAI build guest | Unprivileged Proxmox LXC, Debian `13.1` (`trixie`) x86-64; 4 cores, 6 GiB RAM, 2 GiB swap, 32 GiB ZFS root; no device or bind-mount passthrough |
| Node / npm | `v24.18.0` / `10.9.4` |
| KnightsAI Node / npm | Official checksum-verified Node `v22.23.2` / npm `10.9.8` |
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
| Authorized Engine service foundation and hardening | Runtime `dff93129bed237115223334c4006dfbad9984de2`; fresh-profile repair `d88c639d155e0ec291f6c2bb18cbec3f9e672553`. At the repaired SHA, typecheck/build, focused desktop/service 48/48, and KnightsAI desktop/watcher 45/45 pass. Full suite: 918 total, 914 pass, 1 fail, 3 documented skips; the sole failure is the frozen F1 protected-path gate. Navigation 128/128, intelligence 4/4, pack 492 files/3,219,582 bytes, license, nomenclature, and diff checks pass | Yes | Development only | No runtime authority | Blocked by F1 path closure; fresh-profile defect repaired and synthetically retested | No |
| Traffic heatmap and bounded traversal replay | Kosmos `da9f77035bf39fd6c4244e9d2697dddc54da1501`; `npm run verify` 251/251; renderer 37 pass with 2 documented context-loss skips and visual stage 3/3 | Yes | Viewer development build | N/A (read-only observability) | Focused only | No |
| Immutable proposal quarantine and decisions | Final decision integration `baceb263d5b5be4a844aaa72d09b5adbdcf9d769`; `npm run verify` 258/258, 0 fail/skip; focused proposal/decision checks 16/16 | Yes | Ingress not enabled in a shipped profile | No proposal-ingress or apply activation | Focused only | No |
| Navigation Effects coordination primitives | `70dcc7ce3a1e8320b989316e2ffec12828d2a668`, corruption fix `c6a9790dbea10287b823603ef8880c35edf79aa1`; typecheck/build and coordination checks 9/9 | Primitives only | Write settings fail closed/off | No MOC write authority | No host/runtime qualification | No |
| Native desktop-shell source | `fec7c0a403137a7b0345ded5de2d822c2ddd4173`, lifecycle fix `9cbce42276a326540e3242119e6cca2353042b35`; focused Node 3/3; Cargo format/check/test-build passed; associated Kosmos source verification 251/251 | Alpha source only | Windows development source | No packaging/release authority | No executable runtime test | No |
| Portable alpha staging | Included in `fec7c0a...`; synthetic fixture proves checksum/SBOM-input staging and honest absent-target reporting | Stager only | Synthetic fixture only | No publishing authority | No real target set | No |
| Debian read-only Docker profile | Engine `b96f0989c4b99b4378c9ecd45a1fb6a0ec53890d`; focused static/adversarial tests 5/5; typecheck/build/license/nomenclature passed | Yes | Documented, not instantiated | No deployment authority | Docker unavailable; no image smoke | No |

The later Kosmos head contains the listed work, but no clean-tree integrated rerun at final Kosmos and Engine release-candidate SHAs has been recorded. Results remain bound to the commits stated in each row.

## KnightsAI Debian 13 synthetic qualification

The exact local branch histories were transferred without pushing through SHA-256-verified Git bundles and cloned into an isolated, non-autostarting KnightsAI build container. The guest is unprivileged, has no GPU/KVM/FUSE/TUN/device passthrough, and is administered through the Proxmox host rather than a guest SSH service. Debian 13 requires `nesting=1` for healthy systemd mounts on this Proxmox host; that expanded namespace/mount surface remains an explicit isolation limitation. The guest SSH server was removed after audit, and the final listener audit found no non-loopback TCP listener.

Kosmos at `6cc30bfea88f41e17505b8497935f58040193969` produced this evidence:

- `npm ci`: 21 packages, 0 vulnerabilities.
- `npm run verify`: 258 pass, 0 fail, 0 skip.
- Two standalone builds were byte identical: 1,009,478 bytes, SHA-256 `013586c0d97dd540312859036ed51ea7b112ba9a048d83ff8a15a49978a91292`.
- Renderer under Xvfb and Mesa llvmpipe: browser stage 37 pass, 0 fail, 2 documented Firefox/WebKit context-loss skips; chained Chromium visual stage 3/3 pass. No GPU passthrough or snapshot update was used.
- Exact Rust/Cargo `1.98.0`: `cargo fmt --check`, `cargo check --locked`, and `cargo test --no-run --locked` passed; `cargo test --locked` ran 5 tests with 5 pass, 0 fail/ignore. The Cargo lock SHA-256 remained `24a3fa1c4a2be919507c471c12cc6cae5044c43c8d6dee8d14e38c44245b1e03`.

Engine at `dff93129bed237115223334c4006dfbad9984de2` produced this evidence:

- `npm ci`: 13 packages, 0 vulnerabilities; typecheck and build passed.
- Focused service/desktop 47/47, Navigation 128/128, and intelligence 4/4 passed.
- The complete suite ran 917 tests: 913 pass, 1 fail, and 3 documented skips. The only failure is the unchanged Phase 6 F1 protected-path assertion. The committed deltas are `src/desktop-agent.ts`, `src/watcher/host.ts`, and `src/watcher/service.ts`; the gate was not weakened or regenerated.
- The uncommitted compatibility stdio packet passed 6/6 and the cross-surface secret canary passed 1/1 on Linux. These files are not part of the Engine SHA or package export.
- A Linux x64 SEA was built as internal evidence: ELF64 x86-64, 126,291,136 bytes, SHA-256 `929c9ad65ab54d83d5cf294ebfbafadf0791ca5500bf61fb62134e98ffb990b4`. Authenticated health/graph, credential separation, loopback binding, redaction, SIGTERM exit, non-empty valid-GKX graph, and unchanged corpus bytes passed.
- The SEA smoke consistently exposed `failed to write status file: GKX_WATCHER_FS_DIRECTORY_CHANGED` after an authorized status/credential leaf changes the sealed state directory. This fresh-profile defect remains a blocker pending a capability-safe fix and retest.

Engine repair `d88c639d155e0ec291f6c2bb18cbec3f9e672553` shares one already-validated status-directory capability between the legacy status writer and watcher locator lifecycle only after exact path, device, inode, mode, link-count, and full namespace-coordinate agreement. It does not reopen or rebaseline after an unexplained change. Typecheck/build and focused desktop/service tests passed 48/48; the combined desktop/watcher packet passed 45/45 on KnightsAI, including Linux-only shutdown behavior and an injected external-leaf handoff race. The rebuilt Linux SEA remained 126,291,136 bytes with SHA-256 `ba5cca6d4e501f8b13c105d815883deea4d97a609aafa30f3adc9ce7e1619f86`. A new private state directory advanced to a committed one-note status with no status-write or directory-change error. Authenticated graph access, one visible graph node, distinct viewer/MCP credentials, `0600` status and credential files, token redaction, loopback-only binding, clean zero-code SIGTERM, service-locator removal, and byte-identical source corpus all passed. The prior defective SEA remains evidence of the discovered regression, not the repaired artifact.

The complete clean-clone Engine rerun at the repaired SHA used Linux x86-64 kernel `7.0.14-14-pve`, Node `v22.23.2`, and npm `10.9.8`. `npm test` ran 918 tests: 914 passed, one failed, and three were explicitly skipped in `347310.026593 ms`. Two skips are Windows-only path/junction cases; the third requires the absent external `SRTP-DRAFT-FIXTURES-0.1.1` catalog. The only failure was `diff is all-and-only allowed and protected paths are byte-identical`: expected no protected diff, but found exactly `src/desktop-agent.ts`, `src/watcher/host.ts`, and `src/watcher/service.ts`. A direct F1 rerun passed 7/8 with the same sole failure. Its manifest, schema, inventory, fail-closed identifier, deterministic archive/receipt, secret-scan, and frozen-workflow checks all passed. Navigation passed 128/128, intelligence passed 4/4, package verification reported 492 files and 3,219,582 bytes, and license, nomenclature, `git diff --check`, exact-SHA, and clean-tree checks passed. The F1 contract was neither regenerated nor weakened.

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
| Final Engine runtime commit | **Blocked:** runtime and the fresh-profile repair exist at `d88c639d155e0ec291f6c2bb18cbec3f9e672553`, and the repaired Linux SEA smoke is green; however, the frozen F1 gate still rejects protected-path deltas |
| Immutable Navigation Effects dependency | **Blocked:** no owner-authorized Engine 2.2 artifact, exact version, integrity, or binary/package SHA-256 |
| Unified live service E2E | **Partial:** focused watcher-to-MCP/event E2E, Linux SEA health/graph smoke, and a cross-surface secret canary passed; packaged viewer-to-SEA browser E2E at a final gate-clean SHA remains open |
| MOC host profiles | **Not implemented/qualified:** no complete Obsidian and standalone adapter parity, adoption, archive, journal, recovery, reconciliation, rollback, or exact-byte region evidence |
| Tauri runtime | **Platform-partial:** Windows GNU WebView loader still exits `0xc0000139` and MSVC remains unavailable; Debian 13 compile plus 5/5 Rust tests passed, but no packaged desktop runtime or installer was produced |
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
| Merge/release/deployment | **Merge not performed:** the requested merge is conditional on gates that remain open. No tag, publish, signing, deployment, write activation, or conformance claim is authorized by this ledger |

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
