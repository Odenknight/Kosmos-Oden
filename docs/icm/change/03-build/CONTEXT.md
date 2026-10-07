# 03-build — implement one packet on its own branch

## Goal

Implement exactly one packet's change on the packet's branch, inside its `write_scope`, with the tests the plan named. Done means a committed candidate whose changed files are a subset of `write_scope`, whose focused tests pass locally, and whose handoff records `commit`, `tree_sha` and `dirty`.

## Governing instructions

- `CONTRIBUTING.md` — Node 22 via `nvm use`, `npm ci` from the committed lockfile; never fork semantics into a surface; new behavior has tests, fixed defects get a regression test; do not commit generated artifacts; version changes go through `src/kosmos-version.ts`; focused commits that explain "why".
- `.gitignore` — generated outputs that must never be staged: main.js, kosmos-oden-stand-alone.html, dist, release, plus the plugin's data.json and a filled-in .mcp.json (both hold the Agent API token).
- `.gitattributes` — LF line endings for the repository; artifacts are line-ending sensitive.
- `kosmos-invariants.yml` — read-only Agent API, no write routes, no `latest` dependencies.
- `.nvmrc` — Node major 22 (`package.json` engines also accept 24).

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | `write_scope`, `branch`, `base_commit`, `acceptance_criteria` | SHA-256 in `RUN.json` |
| Plan | `<run>/output/<task-id>/<attempt>/PLAN.md` from `02-plan` | Sections for this packet | Digest in its HANDOFF.json |
| Repository | Files in `write_scope` plus their tests under `test/` | Full files | Packet `base_commit` |
| Scripts | `package.json` | `test`, `pretest`, `typecheck`, `build` | Packet `base_commit` |

## Dependencies

- `02-plan` accepted, or the packet records the small path and `01-understand` is accepted.

## Allowed writes

- Source: the packet's `write_scope` only, on the packet's branch, in your own worktree.
- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.
- Never: generated outputs (main.js, kosmos-oden-stand-alone.html, dist, release), `data.json`, `.mcp.json`, integrator-owned shared files unless this packet is the integrator's, `test/browser/visual.spec.ts-snapshots/` (baselines are proposed only through `qualification/04-release-time`).

## Procedure

1. Confirm the assignment generation and accepted dependencies.
2. Create a worktree from `base_commit`: `git worktree add ../kosmos-<task-id> -b <branch> <base_commit>`. Record `git rev-parse HEAD` and `git status --porcelain`.
3. `nvm use` and `npm ci` (from CONTRIBUTING.md; not executed during layout authoring). `npm ci` fetches the GKOS-Engine git dependency pinned in `package-lock.json`.
4. Make the change. Keep Engine semantics in the Engine: if the fix belongs in `gkos-engine`, stop and report it as an upstream dependency request.
5. Add or update tests. Run `npm test` (from `package.json`: `pretest` runs `node scripts/build.mjs --for-tests`, then `node --test "test/*.test.mjs"`). Run `npm run typecheck`.
6. Optional manual check: `npm run build` produces main.js for local testing; do not stage it. `git status --porcelain` must not list generated outputs.
7. Write in LF. On Windows avoid editors or PowerShell `Set-Content` calls that convert to CRLF; check with `git diff --check`.
8. Commit with focused messages. Do not push unless the packet and an owner instruction both authorize it.
9. Write `changed-files.txt` and test notes, then `HANDOFF.json` last with `commit`, `tree_sha` (`git rev-parse HEAD^{tree}`) and `dirty`.

## Verification

Objective:

- `git diff --name-only <base_commit>..HEAD` is a subset of `write_scope` (scripted comparison; proposed).
- `npm run typecheck` exit 0; `npm test` exit 0 (from `package.json`; record the Node version).
- `git diff --check <base_commit>..HEAD` exit 0.

Interpretation:

- Did the change put parsing, resolution, lineage, temporal or graph logic in a surface?
- Does each acceptance criterion have a test that fails without the change?

## Outputs

| Artifact | Location | Format |
|---|---|---|
| Candidate commit(s) | Packet branch | Git commits, unpushed unless authorized |
| `changed-files.txt` | `output_ref` | One path per line |
| `tests.md` | `output_ref` | New/changed tests and the failing-before / passing-after evidence |
| Handoff | `output_ref/HANDOFF.json` | Kit template; `candidate.commit`, `tree_sha`, `dirty` |

## Failure behavior

- A needed file is outside `write_scope` → stop; ask the coordinator for a scope revision.
- `npm ci` cannot fetch the pinned Engine commit → `BLOCKED`; do not change the pin to make it install.
- A test needs a GPU or a real browser → record `NOT_RUN` with the reason and route it to `qualification`.
- `base_commit` no longer matches `origin/main` when the packet requires current main → report `stale`; rebase only when the coordinator reissues the packet.
