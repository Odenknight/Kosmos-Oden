# 02-disposition — classify each PR against current main, with evidence

## Goal

For each PR (or the one stacked chain) in the packet, compare the head recorded in `inventory.json` with the recorded `origin/main`, classify it as `already-present`, `obsolete-pin`, `unique-useful`, `regression` or `unresolved`, and recommend exactly one owner action: `close-superseded`, `hold`, `split-and-rebase`, `refresh-and-recheck` or `integrate-candidate`. Done means every conclusion cites the head SHA and a `path:line` or blob identity, and every unique feature of a broad PR is either preserved in a follow-up or explicitly accounted for.

## Governing instructions

- `docs/plans/2026-09-10-revised-execution/WORK-PACKAGES.md` — B1: classify already present, obsolete pin, unique useful behavior, regression or unresolved; preserve or account for every unique feature of broad PRs before proposing closure; give #27 a renderer/content/provenance review.
- `docs/reviews/2026-09-12-branch-disposition.md` — prior recommendations: hold #27 pending provenance evidence; do not merge the broad #38/#41 trees, split them; hold #58 until every required lane and package comparison passes and keep the hosted fallback.
- `CONTRIBUTING.md` — explicit-review list (new dependency, bundle size, auth/Host/Origin/LAN, sandbox/protocol, network or write capability, release workflow); generated artifacts not committed.
- `README.md` — the exact GKOS-Engine pin on main and "It includes no Rust build"; a PR that moves the pin is a dependency change needing an owner decision.
- `renderer-provenance.json` and `scripts/check-renderer-provenance.mjs` — `three` 0.185.1 and revision 185 are hard-coded; any `three` bump fails `validate` until both change together.
- `.github/dependabot.yml` — build-tool bumps (esbuild, typescript, `@types/*`) are grouped and never auto-merged.
- `Kosmos-Oden-Engineering-Review/CI-CD-AND-AGENT-OPERATING-DIRECTIVE.md` — proposed: §9 a renderer upgrade is its own PR, never mixed with other changes.

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | PR numbers for this worker | SHA-256 in `RUN.json` |
| Inventory | `<run>/output/<task-id>/<attempt>/inventory.json` from `01-inventory` | Entries for these PRs | Digest in its HANDOFF.json |
| PR content | `gh pr diff <number> -R Odenknight/Kosmos-Oden` and local ref `pr-<number>` | Full diff | Head SHA from inventory |
| Main | `origin/main` | Files the PR touches | SHA from inventory |
| Prior records | `docs/reviews/` | Records naming this PR or branch | Same `origin/main` SHA |

## Dependencies

- `01-inventory` accepted, and the head SHAs for these PRs are not marked `stale`.

## Allowed writes

- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.
- Only if the packet's `write_scope` lists it: one public-safe record `docs/reviews/<YYYY-MM-DD>-pr<number>-triage.md` on branch `docs/pr<number>-triage-<YYYYMMDD>`, unpushed.
- No GitHub writes.

## Procedure

1. Confirm the assignment and that the inventory heads still match: `gh pr view <number> -R Odenknight/Kosmos-Oden --json headRefOid`.
2. `git fetch origin pull/<number>/head:pr-<number>`; `git merge-base origin/main pr-<number>`; `git diff --stat origin/main...pr-<number>`. A shallow clone has no merge base: run `git fetch --unshallow origin` first. `gh pr diff` returns HTTP 406 for PRs over 300 files (#80 has 307); use the local diff or `gh api repos/Odenknight/Kosmos-Oden/pulls/<number>/files --paginate`.
3. Patch equivalence: `git cherry -v origin/main pr-<number>`; for each changed path compare `git rev-parse origin/main:<path>` with `git rev-parse pr-<number>:<path>`. Equal blobs support `already-present`; similar intent alone does not.
4. Dependency PRs: read the failed step from `inventory.json`. A `three` bump failing "Renderer provenance" and the Chromium smoke step is a renderer upgrade, not a routine bump. A build-tool bump failing "Type check" needs a source change in a `change` packet. A clean bump with all checks green may be `integrate-candidate`, still subject to owner review because CONTRIBUTING lists dependency changes for explicit review.
5. Engine pin: if the PR changes the `gkos-engine` commit in `package.json` or `package-lock.json`, record old and new commits, whether README and the current Engine qualification record (the one README links as "Current Engine development-pin qualification") would need a successor, and mark it for an owner decision.
6. Stacked chain: evaluate the parent first; a child's action is conditional on its parent's. Record the merge order and what happens to each child base if a parent is closed instead of merged.
7. Broad PRs (#38, #41, #80): list unique features by path; for each say preserved on main (blob or behavior evidence), proposed follow-up packet, or deliberately dropped with reason. Vendored trees such as `src-tauri/vendor/` count as dependencies.
8. Write `DISPOSITION-<number>.md` per PR (format of `docs/reviews/2026-09-10-pr28-triage.md`: PR URL, head, base, current main, complete scope, intent-vs-current table, decision, validation performed), then `dispositions.json`, then `HANDOFF.json` last.

## Verification

Objective:

- Each PR has exactly one classification and one action in `dispositions.json` (scripted; proposed).
- Every "already present" claim has a blob or `git cherry` result recorded.
- For the optional review record: `git diff --check` exit 0 and no private paths, hostnames, mailbox content or tokens (manual check plus `git grep -n "192\.168\." -- <file>` returning nothing).

Interpretation:

- Is any recommendation a batch closure in disguise?
- Are explicit-review flags and owner decisions (Engine pin, `three`, workflows, runner routing) called out rather than decided?

## Outputs

| Artifact | Location | Format |
|---|---|---|
| `DISPOSITION-<number>.md` | `output_ref` | One per PR; stacked chain may be one file with a section per PR |
| `dispositions.json` | `output_ref` | `[{number, head_sha, main_sha, classification, action, evidence[], owner_decision_needed, explicit_review_flags[], follow_up[]}]` |
| Optional review record | `docs/reviews/<YYYY-MM-DD>-pr<number>-triage.md` on its branch | Only if in `write_scope` |
| Handoff | `output_ref/HANDOFF.json` | Kit template |

## Failure behavior

- Head moved since inventory → `stale`; return to `01-inventory` for that PR.
- Evidence cannot be produced locally (e.g. native Windows or Tauri jobs) → cite the CI job result and mark local reproduction `NOT_RUN`.
- The PR's intent depends on private evidence not in the repository → classification `unresolved`, action `hold`, name the missing evidence.
