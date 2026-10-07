# 04-verify — run the repository's checks on the exact candidate

## Goal

Independently of the author, run Kosmos-Oden's verification on the exact candidate commit from `03-build` (or `05-integrate`) and record each check with argv, exit code, environment and result. Done means `results.json` has one entry per required check, each `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` or `NOT_APPLICABLE` with a reason, all bound to one commit.

## Governing instructions

- `CONTRIBUTING.md` — `npm run verify` must pass; security-relevant changes keep `npm run check:invariants` green; the browser table (Chromium required, Firefox/WebKit and visual advisory).
- `.github/workflows/ci.yml` — the CI order: lockfile SHA guard before `npm ci`, typecheck, build, `build:standalone`, tests, version, artifact, invariant and renderer-provenance checks; plus the double-build reproducibility job.
- `.github/workflows/browser.yml` — the required `browser-chromium (software WebGL2)` job; on push it runs only when `src/`, `scripts/`, `test/browser/`, `playwright.config.ts`, the package files or the workflow change; on pull requests it always runs.
- `kosmos-invariants.yml` — the policy the invariant check enforces.
- `renderer-provenance.json` — the exact `three` version and integrity the provenance check expects.
- `Kosmos-Oden-Engineering-Review/CI-CD-AND-AGENT-OPERATING-DIRECTIVE.md` — proposed: a test agent must not change production code to make a test pass.

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | `required_checks`, candidate reference | SHA-256 in `RUN.json` |
| Candidate | `<run>/output/<task-id>/<attempt>/HANDOFF.json` from `03-build` or `05-integrate` | `candidate.commit`, `tree_sha` | Its own SHA-256 |
| Scripts | `package.json` and `scripts/` | `verify` and `check:*` scripts | Candidate commit |
| Lockfile | `package-lock.json` | Engine and `three` entries | Candidate commit |

## Dependencies

- `03-build` accepted, or `05-integrate` accepted when verifying a combined candidate.

## Allowed writes

- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.
- No source changes. Build outputs stay in the throwaway worktree and are never committed.

## Procedure

Commands are from `package.json` and `.github/workflows/ci.yml`; none was executed during layout authoring except the two marked.

1. Fresh worktree at the candidate commit; record `git rev-parse HEAD`, `git status --porcelain`, `node --version`, `npm --version`, OS.
2. `npm run check:lockfile` (runs before install in CI; reads only `package.json` and `package-lock.json`; executed by Fable-FAC at `175ce29` on Node 24.18.0: exit 0).
3. `npm ci`.
4. `npm run verify` — expands to `typecheck`, `build`, `test`, `check:versions`, `check:lockfile`, `check:artifacts`, `check:invariants`, `check:renderer-provenance`. Record each sub-check separately if one fails. (`node scripts/check-versions.mjs` alone was executed at `175ce29`: exit 0.)
5. `npm run build:standalone` (separate CI step).
6. Reproducibility, as in the CI `reproducibility` job: `npm run build`, `sha256sum main.js kosmos-oden-stand-alone.html dist/kosmos-embed.html > first.sha256`, `git clean -xfd -e node_modules -e first.sha256`, `npm run build`, hash again, `diff -u first.sha256 second.sha256`. Run on Linux or Git Bash; a Windows-only difference is a finding, not a pass.
7. If the candidate touches any path in the `browser.yml` filter, run `qualification/02-required-chromium` or record its result here by reference.
8. If the candidate is pushed, read the GitHub checks for the exact head: `gh pr checks <number> -R Odenknight/Kosmos-Oden`, or `gh api repos/Odenknight/Kosmos-Oden/commits/<sha>/check-runs`.
9. Write `results.json`, logs, then `HANDOFF.json` last.

## Verification

Objective:

- Each check's argv, exit code, commit, Node version and OS are recorded; the commit equals the candidate commit.
- A check that did not run is `NOT_RUN`, never `PASS`. A CI job that was skipped by a path filter is `NOT_RUN` with that reason.

Interpretation:

- Did the evidence test the submitted candidate rather than an earlier branch tip?
- Are flaky retries reported with the first failure kept (CI uses one retry for Playwright)?

## Outputs

| Artifact | Location | Format |
|---|---|---|
| `results.json` | `output_ref` | `[{check, argv, exit_code, result, commit, node, npm, os, log_ref}]` |
| Logs | `output_ref/logs/` | Raw stdout/stderr per check, tokens redacted |
| Handoff | `output_ref/HANDOFF.json` | Kit template, status `submitted`, `blocked` or `uncertain` |

## Failure behavior

- A check fails → record `FAIL` with the failing assertion; do not fix the source in this stage; the coordinator issues a new `03-build` attempt.
- `npm ci` fails on the Engine git dependency → `BLOCKED`, record the exact error.
- A renderer-provenance failure after a `three` change is expected until `renderer-provenance.json` and `scripts/check-renderer-provenance.mjs` are updated together; record `FAIL`, not `NOT_APPLICABLE`.
