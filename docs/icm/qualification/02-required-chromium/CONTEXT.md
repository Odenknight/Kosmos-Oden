# 02-required-chromium — the required per-push browser gate

## Goal

Establish whether the candidate passes the required Chromium gate: `npm run test:browser:chromium` on the exact candidate commit, locally and/or as the `browser-chromium (software WebGL2)` job on that commit. Done means `required.json` states `PASS`, `FAIL`, `BLOCKED` or `NOT_RUN` for this tier only, with the run's commit, environment and any retry recorded.

## Governing instructions

- `CONTRIBUTING.md` — `Browser / browser-chromium` is the required browser check; a required check that is always red is as harmful as no check.
- `.github/workflows/browser.yml` — Chromium only, software WebGL2 via ANGLE/SwiftShader on `ubuntu-latest`; `npm ci`, `npm run build`, `npx playwright install --with-deps chromium`, `npm run test:browser:chromium`; on push it runs only for listed paths; on pull requests it always runs; the Playwright report is kept 14 days.
- `playwright.config.ts` — Chromium launch flags; `retries: 1` under CI; `forbidOnly` under CI.
- `package.json` — the exact spec list in `test:browser:chromium`.

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | Local run, CI read, or both | SHA-256 in `RUN.json` |
| Candidate | `<run>/output/<task-id>/<attempt>/candidate.json` from `01-candidate` | `commit`, artifact hashes | Digest in its HANDOFF.json |
| Specs | `test/browser/standalone.spec.ts`, `test/browser/embed.spec.ts`, `test/browser/context-loss.spec.ts`, `test/browser/consumer-identity.spec.ts`, `test/browser/standalone-flows.spec.ts` | Full files | Candidate commit |
| Harness | `test/browser/embed-harness.html`, `scripts/serve-static.mjs` | Full files | Candidate commit |

## Dependencies

- `01-candidate` accepted, with the required tier marked applicable.

## Allowed writes

- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.
- `playwright-report/` and `test-results/` inside the throwaway worktree (gitignored).
- No workflow dispatch or re-run unless the packet and an owner instruction authorize it.

## Procedure

1. Confirm `git rev-parse HEAD` equals `candidate.json.commit` and the tree is clean.
2. Local run (commands from `.github/workflows/browser.yml`, not executed during layout authoring): `npm ci`, `npm run build`, `npx playwright install --with-deps chromium` (on Windows or macOS omit `--with-deps`), `npm run test:browser:chromium`. Record the port if `KOSMOS_TEST_PORT` is set.
3. CI read: `gh api repos/Odenknight/Kosmos-Oden/commits/<commit>/check-runs --jq '.check_runs[]|select(.name|startswith("browser-chromium"))|[.conclusion,.html_url]'`. A missing run for a push that only changed documentation is `NOT_RUN` (path filter), not `PASS`.
4. If a spec passed only on retry, record the first failure and the retry; report it as a flaky pass, as `docs/REVIEW-0.8.3.md` did for a mobile viewport timeout.
5. Write `required.json`, attach the report archive reference, then `HANDOFF.json` last.

## Verification

Objective:

- Playwright exit code 0 with zero failed specs, on the candidate commit; or a CI `browser-chromium` conclusion `success` whose head SHA equals the candidate commit.
- Spec count equals the specs listed in `package.json` across both projects.

Interpretation:

- Did the run use software WebGL (CI) or a hardware GPU (local)? Report which; do not generalize one to the other.

## Outputs

| Artifact | Location | Format |
|---|---|---|
| `required.json` | `output_ref` | `{tier:"required", commit, source:"local"|"ci"|"both", result, specs_total, specs_failed, retries[], environment, report_ref}` |
| Handoff | `output_ref/HANDOFF.json` | Kit template |

## Failure behavior

- `FAIL` here blocks delivery of any candidate that changes renderer, standalone, embed, build scripts or browser tests; `release-time` does not start.
- Browser install fails (offline host, missing system libraries) → `BLOCKED`, record the error; do not substitute another browser.
- The CI run is for a different SHA → ignore it; run locally or record `NOT_RUN`.
