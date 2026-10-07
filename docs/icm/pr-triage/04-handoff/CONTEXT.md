# 04-handoff — ordered owner action list

## Goal

Turn the accepted dispositions into one owner-facing list: for each PR the recommended action, the evidence, the owner decision it needs, and any follow-up packet; ordered so that stacked PRs and shared-file conflicts are handled in a safe sequence. Done means the owner can act on GitHub from this list alone, and nothing on GitHub has been changed by an agent.

## Governing instructions

- `CONTRIBUTING.md` — changes that require explicit maintainer review.
- `.github/pull_request_template.md` — review-required flags that a refreshed PR must carry.
- `docs/plans/2026-09-10-revised-execution/WORK-PACKAGES.md` — B1: submit the proposed GitHub action through the existing authorization context; do not batch-close or merge.
- `docs/RELEASE-PROCESS.md` — dependency or Engine-pin changes are verified by `npm run verify` including the lockfile binding before any release.

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | Run scope | SHA-256 in `RUN.json` |
| Accepted dispositions | `<run>/output/<task-id>/<attempt>/dispositions.json` with an `acceptable` `REVIEW.md` | All accepted PRs | Digests in `RUN.json` accepted results |
| Inventory | `<run>/output/<task-id>/<attempt>/inventory.json` | Overlap and stack edges | Digest in its HANDOFF.json |

## Dependencies

- `03-review` accepted for every PR in the list. PRs without an accepted review are listed as "not yet reviewed", with no action.

## Allowed writes

- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.
- No GitHub writes. No branch pushes.

## Procedure

1. Order actions: stacked chains parent-first; PRs that touch the same shared file (`package.json`, `package-lock.json`, `THIRD-PARTY-NOTICES.md`, `README.md`, `.github/workflows/`) one at a time, each followed by a refresh of the next.
2. For each PR write: number, title, head SHA, classification, recommended action, evidence links, owner decision needed (yes/no and which), explicit-review flags, and the follow-up packet ID if any.
3. For `refresh-and-recheck`, `split-and-rebase` and `integrate-candidate`, draft follow-up packets for the `change` workflow (entry `05-integrate` for a PR as-is, `01-understand` for a split) and, where renderer or build paths change, for `qualification`.
4. List open questions for FAC separately from recommendations.
5. Write `OWNER-ACTIONS.md`, `follow-up-packets.json`, then `HANDOFF.json` last.

## Verification

Objective:

- Every PR in the run appears exactly once in `OWNER-ACTIONS.md` (scripted count; proposed).
- Each action row cites an accepted review.

Interpretation:

- Would following the list in order ever leave a child PR based on a deleted or closed branch without a stated next step?
- Is every owner decision phrased as a decision, not as a done fact?

## Outputs

| Artifact | Location | Format |
|---|---|---|
| `OWNER-ACTIONS.md` | `output_ref` | Ordered table plus open questions |
| `follow-up-packets.json` | `output_ref` | Draft kit TASK.json objects with `write_scope` |
| Handoff | `output_ref/HANDOFF.json` | Kit template |

## Failure behavior

- A disposition was accepted against a head that has since moved → list the PR as `stale`, no action.
- Two accepted dispositions conflict (e.g. both #38 and #41 claim the same unique feature) → list both, mark the conflict, ask the owner.
