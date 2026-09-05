# Kosmos-Oden Standalone uplift baseline

Date: 2026-08-26

Host: Windows NT 10.0.26200.0, AMD64

Status: Phase 0 implementation baseline; not release qualification

## Repository coordinates

| Repository | Clean starting coordinate | Qualified Phase 0 coordinate | Branch/tag |
|---|---|---|---|
| Kosmos-Oden | `a7113c0ca3be8dd230a9549940e2f387d4cb2a96` | `bc5583214bdd019bc78f4f5dbef1797bfdb26063` | `feature/kosmos-standalone-v0.85`; no tag at the starting commit |
| GKOS-Engine | `e29e04bdad1cd192a25eba2d682a4c46774def28` | `fe190feae101db1900201cdc09a5984dafa6f969` | `integration/kosmos-standalone-20260826`; no tag at the starting commit |

The Kosmos branch starts from `origin/main@a7113c0`. The Engine branch starts
from `origin/codex/phase6-f1-contract-pack@e29e04b`. The separate existing
`GKOS-Engine-check` checkout contained unrelated user changes and was not
modified, stashed, reset, or absorbed. A clean Engine worktree was created at
`C:\Users\FAC\Documents\_AI_builds_GPT\GKOS-Engine-kosmos-v085`.

Relevant remote Engine heads recorded during reconciliation:

- `origin/codex/phase-0-recon-adrs@ba918e6617ece6bb1392f6768b69d4913818035d`
- `origin/codex/phase-1-retrieval-core@0164f3d5b2c698cbf048c8e0e53323def80eb251`
- `origin/codex/phase-5-watcher-recovery@7b5262baee9fcda23d50b0cee0c4977d6e4305e7`
- `origin/codex/navigation-effects-post-phase5@808d875b557f4cfd2bb0addccba44d70c9748f35`
- `origin/codex/phase6-f1-contract-pack@e29e04bdad1cd192a25eba2d682a4c46774def28`

Both `808d875...` and the bounded-frontmatter correction
`95b104e59fe0b322659450a244bea8ac9c94bf72` are ancestors of the selected
Engine baseline. The Phase 6 branch adds nine F1 contract commits above the
effects branch. The frontmatter fence regression passed; no duplicate parser
or replacement correction was introduced.

## Toolchain and dependency locks

| Tool | Value |
|---|---|
| Node | `v24.18.0` |
| npm | `10.9.4` |
| Rust / Cargo | installed at `%USERPROFILE%\\.cargo\\bin`: `rustc 1.98.0 (88d9e12ae 2026-08-18)`, `cargo 1.98.0 (797e8a9bc 2026-08-05)`; the inherited process PATH did not include that directory, so the initial bare commands were unavailable |
| Kosmos `package-lock.json` SHA-256 | `c61314b6e3d0179e9a3df14351f0e128181701c9e979f2a6853916f5f1fce0b4` |
| Kosmos `pnpm-lock.yaml` SHA-256 | `6222c996e30cbd84749877d54cfcf83c147df44f4e96c603b45a3ddfabe439d1` |
| Engine `package-lock.json` SHA-256 | `498f425ee448aa7b7367e7a8730bacc4e6f1ebdf596a0b453182b353b3ba0608` |

## Kosmos-Oden baseline commands

| Command | Result |
|---|---|
| `npm ci` | PASS |
| `npm run verify` | PASS: 215 tests, 215 pass, 0 fail, 0 skip; typecheck, production build, version, lock, artifact, invariant, and renderer-provenance gates passed |
| `npm run test:renderer` | PASS after reviewed baseline repair: 30 cases, 28 pass, 0 fail, 2 documented context-loss skips |
| `git diff --check` | PASS |

The initial renderer run failed because Firefox and WebKit reference images did
not exist. The documented Playwright update workflow generated those six
images. Visual review also found that the committed Chromium `star-focus`
reference still said `Vault Kosmos`, while the exact-pinned current demo fixture
renders `Vault Gkx`; the text-only drift had remained below the perceptual
threshold. Commit `bc55832` records the six missing references and the reviewed
Chromium correction. No renderer source changed in that repair.

The two renderer skips are the checked-in browser context-loss cases whose host
does not expose the required deterministic context-loss primitive. They are not
new skips introduced by this uplift.

## GKOS-Engine baseline commands

| Command | Result |
|---|---|
| `npm ci` | PASS; prepare/build completed, 13 packages added, 0 vulnerabilities |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test` | PASS: 875 tests, 868 pass, 0 fail, 7 skip; 800888.2964 ms |
| `npm run test:navigation` | PASS: 128 tests, 127 pass, 0 fail, 1 skip; 4507.2197 ms |
| `npm run test:intelligence` | PASS: Python unittest 4/4, 0 fail; 0.002 s |
| `npm run pack:check` | PASS: 466 files, 3,113,154 bytes |
| `npm run check:license` | PASS: Apache-2.0 metadata consistent |
| `npm run check:nomenclature` | PASS: zero unapproved legacy matches |
| `git diff --check` | PASS |
| explicit TypeScript 2.1.2 compatibility fixture | PASS: 4/4, 0 skip; 489.5489 ms |
| explicit Navigation Effects suites | PASS: 81/81, 0 skip; 4895.7078 ms |

The first Windows run exposed CRLF checkout drift in byte-governed Phase 6
identity artifacts and the frozen Phase 4 Observation workflow. No expected
digest, manifest closure, protected-path rule, workflow inventory, or test was
weakened. Commit `fe190fe` adds narrow `eol=lf` attributes; the complete suite
then passed.

Documented Engine skips:

1. Navigation CLI physical-temp-root alias: symlink-alias coverage runs in the Windows path-security lane.
2. Provisional Standard SRTP catalog mirror: external `gkos-standard/.../SRTP-DRAFT-FIXTURES-0.1.1` was absent.
3. Coherent-publication non-private entry/post-syscall owner-mode drift: POSIX-only.
4. POSIX transition sibling aliases and owner changes: POSIX-only.
5. Ordinary file read/cleanup/link/unlink/replace non-private mode: POSIX-only.
6. File-transition second-boundary sibling/target/link/parent races: POSIX-only.
7. Linux native watcher shutdown regression: Linux-only.

## Clean-tree evidence

Both worktrees were clean before changes. At their qualified P0 commits, each
`git status --short --branch` printed only its branch/tracking line, with no
modified or untracked paths. Subsequent implementation work is recorded after
these coordinates and must not be mistaken for baseline state.
