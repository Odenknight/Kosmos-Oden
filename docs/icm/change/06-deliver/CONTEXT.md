# 06-deliver — package the candidate for the owner's decision

## Goal

Produce an owner-facing delivery for one verified candidate: what changed and why, surfaces, risk flags, evidence counts by result, open limitations, and the exact commit, plus a PR body ready to paste. Done means the owner can decide push, PR, review and merge without re-reading the run. Pushing and opening a PR happen only when the packet and an owner instruction both authorize them.

## Governing instructions

- `.github/pull_request_template.md` — the checklist and the review-required flags reviewers verify.
- `CONTRIBUTING.md` — "Changes that require explicit review"; README must not claim more than the code proves.
- `Kosmos-Oden-Engineering-Review/CI-CD-AND-AGENT-OPERATING-DIRECTIVE.md` — proposed: §5 Step 4 PR evidence sections; an agent must not approve or merge its own change.
- `docs/RELEASE-PROCESS.md` — for a release candidate: version source, changelog move, tag equals manifest version with no `v` prefix; tagging is an owner action.
- `docs/REVIEW-0.8.3.md` — open 0.8.3 gates (native Hermes acceptance) that a delivery must not describe as closed.

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | Push/PR authorization fields, if any | SHA-256 in `RUN.json` |
| Candidate | `<run>/output/<task-id>/<attempt>/HANDOFF.json` from `05-integrate` (or `04-verify` on the small path) | `candidate.commit` | Its own SHA-256 |
| Evidence | `<run>/output/<task-id>/<attempt>/results.json` and any `qualification` report | All checks | Digests in handoffs |
| Plan | `<run>/output/<task-id>/<attempt>/PLAN.md` | Scope, non-goals, rollback | Digest in its HANDOFF.json |

## Dependencies

- `05-integrate` accepted, or `04-verify` accepted when the packet records the small path.

## Allowed writes

- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.
- With explicit authorization only: push the candidate branch and open a **draft** PR against `main`. No merge, close, label, review approval, tag or workflow dispatch.

## Procedure

1. Confirm accepted dependencies and that the candidate commit in every evidence file is the same.
2. Count results by vocabulary (`PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `NOT_APPLICABLE`) across `results.json` and the qualification tiers. Keep the three browser tiers separate.
3. Write `DELIVERY.md`: what and why; surfaces affected; review-required flags with a reason for each ticked flag; evidence counts; known limitations; rollback (normally replacing the plugin or standalone asset, since releases are self-contained); exact commit and tree.
4. Write `PR-BODY.md` following `.github/pull_request_template.md`. Leave the "Generated artifacts rebuilt and committed" box unticked and note that generated files are gitignored per CONTRIBUTING.
5. If authorized: `git push origin <branch>` and `gh pr create --draft --base main --head <branch> --body-file PR-BODY.md -R Odenknight/Kosmos-Oden`. Record the PR URL. If not authorized, stop here.
6. Write `HANDOFF.json` last.

## Verification

Objective:

- Every check cited in `DELIVERY.md` exists in a handoff for the same commit.
- `gh pr view <number> --json headRefOid` equals the candidate commit when a PR was opened.

Interpretation:

- Does any sentence in `DELIVERY.md` or the PR body claim more than the evidence shows (for example "qualified", "release-ready", or "all browsers pass" from the Chromium gate alone)?
- Are the explicit-review flags complete?

## Outputs

| Artifact | Location | Format |
|---|---|---|
| `DELIVERY.md` | `output_ref` | Owner summary, counts by result, limitations, commit |
| `PR-BODY.md` | `output_ref` | PR template filled in |
| Handoff | `output_ref/HANDOFF.json` | Kit template, with PR URL if one was opened |

## Failure behavior

- Any required check is `FAIL`, `BLOCKED` or `NOT_RUN` → deliver as "not ready", list the gaps; never present the candidate as ready.
- The candidate commit differs between evidence files → stop; report `stale`.
- No push authorization → the delivery is complete without a PR; the owner pushes.
