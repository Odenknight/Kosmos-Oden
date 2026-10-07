# `qualification` workflow

Status: proposed (Fable-FAC, 2026-10-07). Use it to produce browser and release evidence for one exact candidate. It keeps the three tiers that CONTRIBUTING.md defines apart, so that no single screenshot, job or suite is reported as "browsers pass".

| Tier | Command (from `package.json`) | Where it runs today | Gating |
|---|---|---|---|
| Required Chromium | `npm run test:browser:chromium` (projects `chromium` and `mobile-chromium`; specs standalone, embed, context-loss, consumer-identity, standalone-flows) | `Browser / browser-chromium (software WebGL2)`, every PR and path-filtered pushes, GitHub-hosted `ubuntu-latest`, ANGLE/SwiftShader | Required by CONTRIBUTING (policy; the `main-protection` ruleset has no required-status-check rule) |
| Advisory matrix | `npm run test:browser:full` (Firefox + WebKit) and `npm run test:visual` (Chromium screenshots against `test/browser/visual.spec.ts-snapshots/`) | `Browser (full matrix)`, weekly Monday 05:17 UTC and on dispatch, `continue-on-error` | Advisory; never gates a merge |
| Release-time | The advisory suites run locally on a GPU machine, visual baselines reviewed on the reference machine, release prechecks | A maintainer's GPU host before a release | Required before cutting a release (CONTRIBUTING) |

| Stage | Job | Main output |
|---|---|---|
| `01-candidate` | Fix the candidate identity and decide which tiers apply | `candidate.json` |
| `02-required-chromium` | Run or read the required Chromium gate on that exact commit | `required.json` |
| `03-advisory-matrix` | Run or read the advisory suites; record per-suite outcomes, not the job colour | `advisory.json` |
| `04-release-time` | Release candidates only: local GPU runs, baseline review proposal, release prechecks | `release-time.json` or `NOT_APPLICABLE` |
| `05-report` | One report with the tiers in separate tables | `QUALIFICATION.md` |

`02` and `03` may run in parallel after `01`. `04` waits for `02` to pass. For a non-release candidate, `04` is submitted as `NOT_APPLICABLE` with the reason, and `05` proceeds.

**Example.** Renderer fix on `renderer/<slug>-<YYYYMMDD>`: `01` records commit and artifact hashes; `02` passes locally and on the PR's `browser-chromium` job; `03` reads the dispatched `Browser (full matrix)` run and finds the visual step `failure` while the job shows `success`, and records it as an advisory failure on a GPU-less runner; `04` is `NOT_APPLICABLE` (not a release); `05` reports: required PASS, advisory FAIL (visual, software GL), release-time not applicable.
