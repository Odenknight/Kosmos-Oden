# 03-review — independent check of each disposition

## Goal

A reviewer who did not author the disposition re-derives its evidence at the same head and main SHAs and returns `acceptable`, `changes-required` or `blocked` for each submission. Done means one `REVIEW.md` per submitted disposition, bound to its packet digest and to the exact SHAs it reviewed.

## Governing instructions

- `docs/plans/2026-09-10-revised-execution/WORK-PACKAGES.md` — B1 acceptance: exact head-specific disposition, preserved follow-up work, evidence for each conclusion; no batch closure.
- `docs/plans/2026-09-10-revised-execution/README.md` — a reviewer is any qualified peer who did not author the evidence being checked.
- `CONTRIBUTING.md` — explicit-review list; an agent may propose but never self-approve a visual baseline.
- `docs/reviews/2026-09-12-branch-disposition.md` — earlier recommendations a new disposition must either confirm or explicitly supersede.

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | Submissions to review | SHA-256 in `RUN.json` |
| Submission | `<run>/output/<task-id>/<attempt>/dispositions.json` and `DISPOSITION-<number>.md` | Full | Digests in that HANDOFF.json |
| Inventory | `<run>/output/<task-id>/<attempt>/inventory.json` | Entries for the reviewed PRs | Digest in its HANDOFF.json |
| GitHub | `gh pr view <number> -R Odenknight/Kosmos-Oden --json headRefOid,baseRefName` | Head and base now | Query time in review |

## Dependencies

- `02-disposition` accepted by the coordinator as a complete submission for review (handoff valid, digests match, every PR covered). Acceptance of its conclusions is this stage's result; the coordinator records it in `RUN.json`.

## Allowed writes

- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.
- No edits to the submission; corrections are requested as a new attempt.

## Procedure

1. Confirm you are not the author of the submission (compare `owner_id` in its handoff with your identity).
2. Confirm head SHAs are unchanged since inventory. If any changed, mark that PR `stale` and stop reviewing it.
3. For each PR, re-run at least one load-bearing check yourself: the blob comparison or `git cherry` behind `already-present`, the failed step behind a dependency PR's disposition, or the pin diff behind an Engine-pin finding.
4. Check that broad PRs list every unique feature with a destination, and that stacked-chain actions are ordered and conditional.
5. Check public safety of any proposed `docs/reviews/` record: no private handoffs, mailbox content, vault paths, hostnames, IP addresses or tokens.
6. Write one `REVIEW.md` per submission using the kit template (`_Agents/_work/agent-orchestration/2026-09-16-icm-proposal/templates/REVIEW.md`), then `HANDOFF.json` last.

## Verification

Objective:

- Re-run commands and their outputs are recorded in the review with argv and exit code.
- Head SHAs in the review equal those in the submission.

Interpretation:

- Is each classification supported by evidence of that class, not by intent or by the PR title?
- Does any action pre-empt an owner decision (pin change, `three` upgrade, workflow or runner change)?

## Outputs

| Artifact | Location | Format |
|---|---|---|
| `REVIEW.md` | `output_ref`, one per reviewed submission | Kit REVIEW.md, result `acceptable`, `changes-required` or `blocked` |
| Handoff | `output_ref/HANDOFF.json` | Kit template |

## Failure behavior

- Reviewer authored or co-authored the submission → decline the packet; the coordinator reassigns.
- Head moved → `stale` for that PR; others continue.
- Evidence cannot be re-derived (e.g. CI logs expired after the 14-day artifact retention) → `blocked` with the reason; do not accept on trust.
