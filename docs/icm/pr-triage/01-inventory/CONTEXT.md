# 01-inventory — record the exact current state of the named PRs

## Goal

For each PR named in the packet, record at one stated UTC time: number, title, author, head branch and head SHA, base branch, draft flag, mergeability, every check run with its conclusion and failed step names, changed files, stack parent and child, file overlap with the other open PRs, and whether a prior disposition exists for the same head SHA. Done means `inventory.json` has no null fields for any named PR and the head SHAs re-read at the end equal those read at the start.

## Governing instructions

- `docs/plans/2026-09-10-revised-execution/WORK-PACKAGES.md` — B1: refresh base, head and state before classifying; one review per PR; never batch-close or merge because every PR conflicts.
- `docs/reviews/2026-09-12-branch-disposition.md` — prior dispositions and the exact branch tips they were made against.
- `docs/reviews/2026-09-10-pr28-triage.md` — the record format: PR URL, head, reported base, current main, complete scope.
- `CONTRIBUTING.md` — which browser checks are required (`Browser / browser-chromium`) and which are advisory.
- `.github/workflows/browser-full.yml` — advisory jobs use `continue-on-error`, so a green job conclusion does not mean the suites passed.

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | PR numbers, query time window | SHA-256 in `RUN.json` |
| GitHub | `gh pr list` / `gh pr view` / `gh api` on `Odenknight/Kosmos-Oden` | Named PRs, their check runs, ruleset `main-protection` | UTC query time in output |
| Repository | `origin/main` | Whole tree, for later comparison | SHA recorded in output |
| Prior records | `docs/reviews/` | Dispositions naming these PRs or branches | `origin/main` SHA |

## Dependencies

- None. Entry stage. The packet must name the PRs explicitly; "all open PRs" is allowed only with the query and its time recorded.

## Allowed writes

- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.
- Local read-only refs in your own clone (`git fetch origin pull/<number>/head:pr-<number>`).
- No GitHub writes of any kind: no comments, labels, reviews, re-runs, workflow dispatches, closes or merges.

## Procedure

All commands are read-only GitHub CLI or git calls; the first three were executed by Fable-FAC on 2026-10-07 to build the pilot list in INSTRUCTIONS.

1. `gh pr list -R Odenknight/Kosmos-Oden --state open --limit 50 --json number,title,headRefName,headRefOid,baseRefName,isDraft,additions,deletions,changedFiles,mergeable,author,createdAt,updatedAt,labels`
2. Per PR: `gh pr view <number> -R Odenknight/Kosmos-Oden --json headRefOid,baseRefName,mergeable,mergeStateStatus,statusCheckRollup,files`
3. Per failed job: `gh api repos/Odenknight/Kosmos-Oden/actions/jobs/<job-id> --jq '[.name,.conclusion,(.steps[]|select(.conclusion=="failure")|.name)]'`. Record the failed step name, not only the job.
4. Rules in force: `gh api repos/Odenknight/Kosmos-Oden/rulesets/18825227` (ruleset `main-protection`; on 2026-10-07 it required a PR, signed commits, linear history and resolved threads, and had no required-status-check rule).
5. `git fetch origin main` and `git rev-parse origin/main`; fetch each PR head to a local ref.
6. Stack edges: a PR whose `baseRefName` is another open PR's `headRefName` is that PR's child.
7. Overlap: for each pair of PRs, the intersection of changed files; flag `package.json`, `package-lock.json`, `THIRD-PARTY-NOTICES.md`, `README.md`, `CHANGELOG.md`, `scripts/build.mjs` and `.github/workflows/` as shared-file hotspots.
8. Prior disposition: search `docs/reviews/` for the PR number and branch; record whether the inspected tip equals the current head SHA.
9. Re-read every head SHA; if any changed, record both and mark that PR `stale`.
10. Write `inventory.json`, `overlap.csv`, then `HANDOFF.json` last.

## Verification

Objective:

- `inventory.json` parses and every named PR has non-null `head_sha`, `base_ref`, `is_draft`, `mergeable`, `checks[]`, `files[]` (scripted; proposed).
- Start and end head SHAs match, or the PR is marked `stale`.

Interpretation:

- Are advisory job conclusions labeled advisory, and are path-filtered or skipped jobs recorded as not run rather than passing?
- Are stack edges complete?

## Outputs

| Artifact | Location | Format |
|---|---|---|
| `inventory.json` | `output_ref` | `{queried_at, origin_main, ruleset, prs:[{number, title, author, head_ref, head_sha, base_ref, is_draft, mergeable, merge_state, additions, deletions, files[], checks:[{name, conclusion, failed_steps[], advisory}], stack_parent, stack_children[], prior_disposition_ref, prior_tip_matches}]}` |
| `overlap.csv` | `output_ref` | `pr_a,pr_b,shared_files` |
| Handoff | `output_ref/HANDOFF.json` | Kit template |

## Failure behavior

- `gh` not authenticated or rate-limited → `BLOCKED`; do not fill fields from memory, old handoffs or scraped web pages.
- A PR head branch was deleted → record it; the PR goes to `02-disposition` as `unresolved`.
- A head changes during the stage → record both SHAs, mark `stale`, continue with the others.
