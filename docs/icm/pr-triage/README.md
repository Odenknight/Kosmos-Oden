# `pr-triage` workflow

Status: proposed (Fable-FAC, 2026-10-07). Use it to decide, with evidence, what should happen to open pull requests. It generalizes work package **B1 — Disposition of conflicting PR backlog** in `docs/plans/2026-09-10-revised-execution/WORK-PACKAGES.md` and the format of `docs/reviews/2026-09-10-pr28-triage.md` and `docs/reviews/2026-09-12-branch-disposition.md`.

Triage is read-only on GitHub. Workers do not comment, label, review, close, merge, rebase or re-run anything. They recommend; the owner acts.

| Stage | Job | Main output |
|---|---|---|
| `01-inventory` | Refresh head SHA, base, draft state, mergeability, per-job check results and failed steps, files, stack edges and prior dispositions for the named PRs | `inventory.json`, `overlap.csv` |
| `02-disposition` | Compare each PR head with current main; classify and recommend one owner action, with evidence | `DISPOSITION-<number>.md`, `dispositions.json` |
| `03-review` | Independent reviewer re-derives the evidence at the same SHAs | `REVIEW.md` per submission |
| `04-handoff` | Ordered owner action list and proposed follow-up packets | `OWNER-ACTIONS.md`, `follow-up-packets.json` |

Classification (B1 vocabulary): `already-present`, `obsolete-pin`, `unique-useful`, `regression`, `unresolved`. Recommended actions: `close-superseded`, `hold`, `split-and-rebase`, `refresh-and-recheck`, `integrate-candidate`. Several PRs may share a classification; none may be closed or merged "because every PR conflicts" (B1 acceptance).

Parallelism: different workers may take different PRs or PR groups in `02-disposition`. A stacked chain (currently #80 ← #82 ← #83 ← #84 ← #85 ← #86 ← #87) is one packet, because each child's disposition depends on its parent.

**Example.** Dependabot PR #89 bumps `three` 0.185.1 → 0.186.1. `01` records `validate` failing at "Renderer provenance" and `browser-chromium` failing at the smoke step. `02` shows `renderer-provenance.json` and `scripts/check-renderer-provenance.mjs` hard-code r185, so the failure is by design; the bump is a renderer upgrade (explicit review, directive §9). Classification `unresolved`, action `hold`, follow-up: a `change` packet that updates the provenance record and check together, plus `qualification` 01-05.
