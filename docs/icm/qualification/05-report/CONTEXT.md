# 05-report — one report, three separate tiers

## Goal

Combine the accepted tier results for one candidate into `QUALIFICATION.md` with a separate table per tier (required Chromium, advisory matrix, release-time), counts by result, environments, limitations and the exact candidate identity. Done means a reader cannot mistake an advisory or software-GL result for a required or hardware result, and every row traces to an accepted handoff.

## Governing instructions

- `CONTRIBUTING.md` — the required/advisory split and the pre-release GPU requirement.
- `README.md` — test totals are not permanent documentation; evidence names the exact command, commit, platform, failures and documented skips.
- `docs/navigation-effects/QUALIFICATION-PLAN.md` — status labels (implemented, configured, authorized, runtime-safe, qualified, released) where no label implies a later one.
- `docs/reviews/UPGRADE-PRIORITIES-20260921.md` — distribution and promotion need platform, browser, visual and rollback evidence; deferral is not a pass.

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | Report audience | SHA-256 in `RUN.json` |
| Candidate | `<run>/output/<task-id>/<attempt>/candidate.json` | Identity | Digest in its HANDOFF.json |
| Tier results | `<run>/output/<task-id>/<attempt>/required.json`, `<run>/output/<task-id>/<attempt>/advisory.json`, `<run>/output/<task-id>/<attempt>/release-time.json` (one task each) | Full | Digests in `RUN.json` accepted results |

## Dependencies

- `02-required-chromium`, `03-advisory-matrix` and `04-release-time` accepted. `04` accepted as `NOT_APPLICABLE` is valid for a non-release candidate; `03` accepted as `NOT_RUN` is valid when the reason is recorded.

## Allowed writes

- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.
- No source or GitHub writes.

## Procedure

1. Confirm all tier results name the same candidate commit as `candidate.json`. Any mismatch stops the stage.
2. Write `QUALIFICATION.md`: candidate identity (commit, tree, artifact hashes, Node, Playwright, `three`, Engine commit); then three tables, one per tier, each with suite, source (CI/local), environment (software GL or GPU model), result, and evidence link; then counts by result per tier; then limitations and open gates.
3. Use the result vocabulary only. Do not write "qualified", "release-ready" or "all browsers pass". A required-tier `PASS` with advisory `FAIL` is reported as exactly that.
4. Write `HANDOFF.json` last.

## Verification

Objective:

- Row count per tier equals the entries in the corresponding tier file (scripted; proposed).
- Every row's commit equals `candidate.json.commit`.

Interpretation:

- Could a reader take any advisory or software-GL row as a required or hardware result?

## Outputs

| Artifact | Location | Format |
|---|---|---|
| `QUALIFICATION.md` | `output_ref` | Identity, three tier tables, counts, limitations |
| Handoff | `output_ref/HANDOFF.json` | Kit template |

## Failure behavior

- Commit mismatch between tiers → `BLOCKED`; the coordinator reissues the stale tier.
- A tier is missing without a recorded reason → `BLOCKED`; never fill it in as `PASS`.
