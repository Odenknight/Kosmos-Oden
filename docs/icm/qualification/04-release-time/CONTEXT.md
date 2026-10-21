# 04-release-time — pre-release GPU runs and release prechecks

## Goal

For a release candidate only, produce the evidence CONTRIBUTING requires before a release is cut: the advisory suites run locally on a GPU machine, any visual-baseline change proposed for human review on the reference machine, and the release-process prechecks. Done means `release-time.json` records each item, or the stage is submitted as `NOT_APPLICABLE` with the reason when the candidate is not a release candidate. Cutting the tag is an owner action and is not part of this stage.

## Governing instructions

- `CONTRIBUTING.md` — "Before cutting a release, run the advisory suites locally on a GPU machine"; generate or refresh baselines only on the reference machine; an agent may propose but never self-approve a baseline.
- `docs/RELEASE-PROCESS.md` — update `src/kosmos-version.ts`, `npm run check:versions`, move CHANGELOG items, `npm run verify`, tag equals the manifest version with no `v` prefix; CI builds and publishes from the tag.
- `.github/workflows/release.yml` — tag patterns, `npm run verify`, tag/manifest equality, `npm run package:release`, `sha256sum -c SHA256SUMS`, `contents: write`.
- `.github/workflows/standalone-html-release.yml` — `viewer-v*` tags publish the HTML viewer prerelease; separate from plugin tags.
- `docs/REVIEW-0.8.3.md` — gates still open for 0.8.3, including native Hermes acceptance; browser evidence does not close them.
- `Kosmos-Oden-Engineering-Review/CI-CD-AND-AGENT-OPERATING-DIRECTIVE.md` — proposed §8.3 soak list and §8.4 promotion steps; agents prepare evidence, a human authorizes promotion.

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | Release intent, intended version, GPU host | SHA-256 in `RUN.json` |
| Candidate | `<run>/output/<task-id>/<attempt>/candidate.json` | `commit`, `version`, artifact hashes | Digest in its HANDOFF.json |
| Required tier | `<run>/output/<task-id>/<attempt>/required.json` | Result | Digest in its HANDOFF.json |
| Release config | `manifest.json`, `versions.json`, `src/kosmos-version.ts`, `CHANGELOG.md` | Version fields, latest section | Candidate commit |
| Baselines | `test/browser/visual.spec.ts-snapshots/` | All PNGs | Candidate commit |

## Dependencies

- `01-candidate` accepted with release intent; `02-required-chromium` accepted with `PASS`.
- Not a release candidate → submit `NOT_APPLICABLE` immediately; nothing else runs.

## Allowed writes

- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.
- A baseline proposal only on a separate branch `renderer/baselines-<YYYYMMDD>` containing `test/browser/visual.spec.ts-snapshots/` changes, unpushed unless authorized, for human approval.
- `release/` inside the throwaway worktree (gitignored). No tags, no pushes of tags, no releases.

## Procedure

Commands from CONTRIBUTING.md, `docs/RELEASE-PROCESS.md` and `.github/workflows/release.yml`; not executed during layout authoring.

1. On the GPU host, at the candidate commit, clean tree: record GPU model, driver, OS, browser versions.
2. `npm ci`, `npm run build`, `npx playwright install chromium firefox webkit`, `npm run test:browser:full`, `npm run test:visual`.
3. If visual differences are intended: `npx playwright test test/browser/visual.spec.ts --update-snapshots` on the reference machine, commit the PNGs on the baseline branch, and list each changed image for human review. Never mark a baseline approved.
4. Prechecks: `npm run check:versions`; confirm `manifest.json` version equals the intended tag exactly, no `v` prefix (pre-release tags use a semver suffix); `npm run verify`.
5. Local packaging dry run: `npm run package:release`, then `cd release && sha256sum -c SHA256SUMS`. Local `release/` is evidence of the script, not a release.
6. List release gates that browser evidence does not close (for 0.8.3: native Hermes acceptance, exact Engine release; macOS deferral is not a pass).
7. Write `release-time.json`, then `HANDOFF.json` last.

## Verification

Objective:

- Exit codes for every command above, on the candidate commit and named GPU host.
- `sha256sum -c SHA256SUMS` reports every file OK.

Interpretation:

- Are the open gates stated as open? Does any wording imply the release is approved?

## Outputs

| Artifact | Location | Format |
|---|---|---|
| `release-time.json` | `output_ref` | `{tier:"release-time", commit, host, gpu, suites:[...], baseline_proposal_ref, prechecks:[...], open_gates[]}`, or `{result:"NOT_APPLICABLE", reason}` |
| Baseline proposal | `renderer/baselines-<YYYYMMDD>` branch | PNG changes for human review |
| Handoff | `output_ref/HANDOFF.json` | Kit template |

## Failure behavior

- No GPU host available → `BLOCKED`; software-GL results from `03` do not substitute.
- Tag/manifest mismatch or `check:versions` failure → `FAIL`; fix through `change` (version files are integrator-owned).
- A suite fails on the GPU host → `FAIL` for this tier; the owner decides whether to release with a documented limitation.
