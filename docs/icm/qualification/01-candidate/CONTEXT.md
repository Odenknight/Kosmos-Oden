# 01-candidate — fix the identity of what is being qualified

## Goal

Record one candidate identity that every later qualification stage binds to: commit, tree, dirty flag, Node and npm versions, Playwright version from the lockfile, `three` version, GKOS-Engine commit, and SHA-256 of the built executables. Decide which tiers apply and why. Done means `candidate.json` is complete and a rebuild from the same commit reproduces the recorded hashes.

## Governing instructions

- `CONTRIBUTING.md` — the browser test table: required Chromium, advisory Firefox/WebKit and visual; advisory suites must be run locally on a GPU machine before a release.
- `playwright.config.ts` — projects `chromium`, `firefox`, `webkit`, `mobile-chromium`; software-GL flags; fixed viewport 1280x800 and DPR 1; screenshot tolerance `maxDiffPixelRatio` 0.02; CI retries 1; snapshot path template.
- `.github/workflows/browser.yml` — the required job builds first, installs Chromium for the lockfile-pinned Playwright, then runs the Chromium suite.
- `.github/workflows/browser-full.yml` — advisory job; steps continue on error.
- `docs/RELEASE-PROCESS.md` — executable artifacts are byte-reproducible; only BUILD-INFO.json build time varies.
- `renderer-provenance.json` — the stable renderer is `three` 0.185.1, WebGL2, inlined with no CDN.

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | Candidate reference, release intent | SHA-256 in `RUN.json` |
| Candidate | Commit named in the packet, or `<run>/output/<task-id>/<attempt>/HANDOFF.json` from `change/04-verify` or `change/05-integrate` | `candidate.commit` | Its own SHA-256 |
| Lockfile | `package-lock.json` | `@playwright/test`, `three`, `gkos-engine` entries | Candidate commit |
| Manifest | `manifest.json` and `src/kosmos-version.ts` | Version | Candidate commit |

## Dependencies

- None within this workflow. The candidate must already be committed; uncommitted bytes are never qualified as a clean candidate.

## Allowed writes

- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.
- Build outputs inside a throwaway worktree only.

## Procedure

Commands from `package.json` and the workflow files; not executed during layout authoring.

1. Fresh worktree at the candidate commit; record `git rev-parse HEAD`, `git rev-parse HEAD^{tree}`, `git status --porcelain` (must be empty), `node --version`, `npm --version`, OS, CPU, GPU model and driver if any.
2. `npm ci`; `npm run build`.
3. `sha256sum main.js kosmos-oden-stand-alone.html dist/kosmos-embed.html` (Linux or Git Bash).
4. `npx playwright --version`; read `three` and `gkos-engine` resolved versions from `package-lock.json`.
5. Tiers: required applies when the candidate changes `src/`, `scripts/`, `test/browser/`, `playwright.config.ts` or the package files, or when the packet asks; advisory applies when renderer, standalone or embed behavior changed, or the packet asks; release-time applies only when the packet states release intent and names the version.
6. Write `candidate.json`, then `HANDOFF.json` last.

## Verification

Objective:

- `git status --porcelain` empty at the candidate commit.
- A second clean build gives the same three SHA-256 values (as in the CI `reproducibility` job).

Interpretation:

- Is the tier decision justified by the changed paths and the packet, not by convenience?

## Outputs

| Artifact | Location | Format |
|---|---|---|
| `candidate.json` | `output_ref` | `{commit, tree_sha, dirty, node, npm, os, gpu, playwright, three, gkos_engine_commit, version, artifacts:{"main.js","kosmos-oden-stand-alone.html","dist/kosmos-embed.html"}, tiers:{required, advisory, release_time, reasons}}` |
| Handoff | `output_ref/HANDOFF.json` | Kit template |

## Failure behavior

- Dirty tree → `BLOCKED`; commit or discard first, or record base + patch + untracked manifest and label the result dirty.
- Two clean builds differ → record both hashes as a reproducibility `FAIL`; later stages may proceed but the report must show it.
- `npm ci` fails → `BLOCKED` with the error; no tier can run.
