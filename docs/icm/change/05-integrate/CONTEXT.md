# 05-integrate — combine accepted candidates and own the shared files

## Goal

The integrator builds one combined candidate from current `origin/main` plus the accepted worker candidates (or an accepted PR or PR stack), applies every shared-file edit once, and reruns verification on the combined commit. Done means one integration commit whose difference from the accepted parts is fully explained and whose checks are recorded.

## Governing instructions

- `CONTRIBUTING.md` — `npm run verify` passes; generated artifacts stay uncommitted; docs and README claims match the code.
- `docs/plans/2026-09-10-revised-execution/README.md` — one integrator owns each shared file at a time, including shared test files; hand off a patch or commit rather than co-editing; rebase and rerun affected checks when the base changes.
- `docs/reviews/2026-09-12-branch-disposition.md` — do not replay old trees; check patch equivalence against main; split broad branches rather than merging them whole.
- `.github/dependabot.yml` — build-tool bumps are grouped and never auto-merged.
- `scripts/check-lockfile-sha.mjs` — git dependencies in `package-lock.json` must resolve to a 40-hex commit.
- `docs/plans/2026-09-10-revised-execution/SHA256SUMS` — covers every file in that folder; any edit there requires regenerating it from Git blob bytes, or a superseding record instead.

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | Integration order, shared files assigned to the integrator | SHA-256 in `RUN.json` |
| Accepted parts | `<run>/output/<task-id>/<attempt>/HANDOFF.json` for each accepted worker, or an accepted `pr-triage` disposition | `candidate.commit` per part | Digests recorded in `RUN.json` |
| Base | `origin/main` | Whole tree | SHA recorded at integration start |
| Shared files | `package.json`, `package-lock.json`, `CHANGELOG.md`, `THIRD-PARTY-NOTICES.md`, `README.md`, `renderer-provenance.json`, `kosmos-invariants.yml`, `scripts/build.mjs`, `.github/workflows/` | Only the edits the plan assigned | `origin/main` SHA |

## Dependencies

- `04-verify` accepted for every part being integrated. For a PR, `pr-triage/03-review` accepted its disposition and the owner chose "integrate".

## Allowed writes

- An integration branch from current `origin/main`: `<prefix>/integrate-<slug>-<YYYYMMDD>` using an existing prefix (`codex/`, `fix/`, `docs/`, `renderer/`, `agent/<agent-id>/`).
- The shared files the packet assigns to the integrator.
- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.

## Procedure

1. Record `git fetch origin` and `git rev-parse origin/main`. Create the integration branch from that SHA in a fresh worktree.
2. Apply parts in dependency order with `git cherry-pick <commit>` or by rebasing a copy of the part's branch; never force-push another agent's branch. For the #80 stack, the order is #80, #82, #83, #84, #85, #86, #87 (each PR's base is the previous head branch).
3. Resolve conflicts only in files you own. A conflict in a worker-owned file goes back to that worker as a new attempt.
4. Apply shared-file edits once. Regenerate `package-lock.json` with npm in the integration worktree; never hand-edit it. Keep CHANGELOG entries under the existing dated-heading style. Update README only to claims the combined code proves.
5. Rerun the `04-verify` command list on the combined commit, plus `qualification` stages when renderer, standalone or build paths changed.
6. `git range-diff origin/main <part-branch> HEAD` (or per-part diff) to show nothing unexplained entered.
7. Draft the PR body from `.github/pull_request_template.md`. Do not tick "Generated artifacts rebuilt and committed": that template line contradicts CONTRIBUTING and `.gitignore`; say so in the body.
8. Write `INTEGRATION.md`, `results.json`, then `HANDOFF.json` last.

## Verification

Objective:

- `npm run verify` and `npm run build:standalone` on the combined commit, recorded as in `04-verify`.
- `npm run check:lockfile` exit 0 after any lockfile regeneration.
- `git diff --name-only origin/main..HEAD` equals the union of accepted parts' files plus the assigned shared files.

Interpretation:

- Is every difference between the parts and the combined commit explained in `INTEGRATION.md`?
- For a dependency or Engine-pin integration: did the owner decision reference exist before integration?

## Outputs

| Artifact | Location | Format |
|---|---|---|
| Integration commit | Integration branch | Unpushed unless authorized |
| `INTEGRATION.md` | `output_ref` | Base SHA, part order, conflicts and resolutions, shared-file edits, rerun checks |
| `results.json` | `output_ref` | As in `04-verify` |
| Handoff | `output_ref/HANDOFF.json` | Kit template |

## Failure behavior

- A part passes alone but the combination fails → `BLOCKED`; report both results; do not drop the failing part silently.
- `origin/main` moves during integration → finish on the recorded base, then report `stale` so the coordinator decides whether to re-integrate.
- A required owner decision (Engine pin, `three` upgrade, explicit-review flag) has no reference → stop before committing that part.
