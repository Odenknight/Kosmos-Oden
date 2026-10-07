# 03-advisory-matrix — Firefox, WebKit and visual suites, labeled advisory

## Goal

Record the outcome of each advisory suite for the candidate — Firefox and WebKit renderer specs (`npm run test:browser:full`) and visual regression (`npm run test:visual`) — with the environment that produced it. Done means `advisory.json` has one entry per suite with its own outcome, labeled advisory, and no entry is derived from the job's overall colour.

## Governing instructions

- `CONTRIBUTING.md` — these suites are advisory in CI because GPU-less runners cannot answer reliably; an agent may propose a baseline update but must never self-approve one.
- `.github/workflows/browser-full.yml` — `workflow_dispatch` and weekly schedule; both suite steps have `continue-on-error: true`, so the job concludes `success` even when a suite fails; the step summary table carries the real outcomes; reports kept 14 days.
- `playwright.config.ts` — Firefox WebGL2 prefs; WebKit has no software-WebGL setting; screenshot tolerance and snapshot path template.
- `test/browser/visual.spec.ts` — what the visual suite captures.

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | Local run, CI read, or both; dispatch authorization if any | SHA-256 in `RUN.json` |
| Candidate | `<run>/output/<task-id>/<attempt>/candidate.json` from `01-candidate` | `commit` | Digest in its HANDOFF.json |
| Baselines | `test/browser/visual.spec.ts-snapshots/` | All PNGs | Candidate commit |
| Specs | `test/browser/` | Specs listed in `test:browser:full` and `test:visual` | Candidate commit |

## Dependencies

- `01-candidate` accepted, with the advisory tier marked applicable.

## Allowed writes

- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.
- Report and diff images inside the throwaway worktree.
- Never `--update-snapshots` in this stage. Never commit to `test/browser/visual.spec.ts-snapshots/`.
- `gh workflow run browser-full.yml` only when the packet and an owner instruction authorize a dispatch (it starts a GitHub Actions run).

## Procedure

1. Confirm the candidate commit and clean tree.
2. CI read: find the `Browser (full matrix)` run for the candidate commit: `gh run list -R Odenknight/Kosmos-Oden --workflow browser-full.yml --json databaseId,headSha,conclusion,event,createdAt`. Then `gh run view <run-id> -R Odenknight/Kosmos-Oden --json jobs` and read the outcome of the steps "Renderer specs — Firefox + WebKit (advisory)" and "Visual regression (Chromium / SwiftShader baselines)". The scheduled run tests `main`, not a branch candidate.
3. Local run (from CONTRIBUTING.md; not executed during layout authoring): `npm run build`, `npx playwright install chromium firefox webkit`, `npm run test:browser:full`, `npm run test:visual`. Record whether a hardware GPU was present.
4. For each visual difference, keep the diff image and the spec name; propose nothing beyond "baseline review needed" here.
5. Write `advisory.json`, then `HANDOFF.json` last.

## Verification

Objective:

- Each suite entry has its own outcome from the step outcome or the local Playwright exit code, plus the commit it ran on.
- No entry's outcome is copied from the job conclusion.

Interpretation:

- Is a failure environmental (software GL, headless WebKit) or a renderer regression? State the evidence for either; if unclear, say unclear.

## Outputs

| Artifact | Location | Format |
|---|---|---|
| `advisory.json` | `output_ref` | `{tier:"advisory", commit, suites:[{name:"firefox-webkit"|"visual", source:"ci"|"local", outcome, environment, gpu, report_ref, diffs[]}]}` |
| Handoff | `output_ref/HANDOFF.json` | Kit template |

## Failure behavior

- Advisory failures never block a merge on their own; they are reported, and they become inputs to `04-release-time`.
- No run exists for the candidate and dispatch is not authorized → `NOT_RUN` with that reason.
- A visual failure that looks like a real regression → report it to the coordinator as a finding for the `change` workflow; do not update baselines.
