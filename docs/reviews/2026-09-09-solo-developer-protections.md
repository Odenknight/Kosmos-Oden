# Solo developer protection update

Owner explicitly authorized these persistent changes for all repositories owned by Odenknight on 2026-09-09: remove mandatory human/code-owner approvals, restrict branch protection to main, retain main's other protections, and merge reviewed green PRs.

Inventory covered 37 currently visible owned repositories, including all repository rulesets and classic branch-protection patterns. No archived repositories were encountered. This is a completed inventory of existing projects, not automatic enforcement on future repositories.

## Applied changes

- Kosmos-Oden, ruleset 18825227: scope changed from all branches to `refs/heads/main`; approving-review count changed from 1 to 0; code-owner and extra unattributed-change approvals disabled; stale-review dismissal disabled. No designated reviewers or last-push approval remain required.
- Computational-Spacetime-Dynamics-Research, ruleset 19679766: extra approval for unattributed changes disabled. It already required zero approvals and protected only its main default branch.
- gkos-standard's branch rules and the classic protections on Marshal-008-OS and GKOS-Engine-Rust already matched the requested review posture. Other projects had no branch protection needing modification. Existing tag protections were left unchanged.

Kosmos main retains PR-based merging, review-thread resolution, code-quality and coverage rules, required signatures, linear history, deletion protection and non-fast-forward protection. Existing bypass actors were not expanded. The API's GET response returned unset coverage thresholds as null, which its update schema rejected; omitting those unset fields retained the coverage rule without inventing thresholds. A rules query against a synthetic Kosmos working-branch name returned an empty list after the update.

The configuration backups, inventory, submitted payloads and API receipts are saved locally under `_Claude-Code/codex-review-20260909/`: `all-rules-before.json`, `classic-protection.json`, `rules-payload-*.json`, `rules-after-*.json`, and `solo-rules-results.json`. The update script guarded against concurrent rule changes before writing.

## Merge controls

Only reviewed Kosmos PRs 45–48 are in scope for merging. Unrelated PRs across the account remain untouched. Each merge uses a pinned head SHA and squash merge to preserve main's linear history; no admin override is used. PR47's reconciliation commit `85e0843c2955aa119d663e3ec00660ff96f382e7` has the same file tree as reviewed candidate `3ecbf479cec1c26e0861709905bc5f8e9b22e750`; only main ancestry was incorporated. Refreshed GitHub checks are required before its merge.

## Completed merges
PR46 merged as ed8c1ea519c682954119b846b0cdfc03f2730715; PR48 as a84a3fd6f3d84870ceff02ad0e9a6a2b061ca540; PR45 as 2321a975ccb9b28ad87a6965cf24c2ec711c9513; PR47 as dcd09b45495df964aede120c650635c4dd592e9c after refreshed checks passed. Final main file tree equals verified combined candidate fd52a6f exactly (git diff exit0). The later adapter seam fb9690e remains separate local work and was not included in these four PR merges.
