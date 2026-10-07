# 02-plan — write the change plan and split it into packets

## Goal

Turn the accepted `scope.json` into a change plan that a coordinator can dispatch: scope, non-goals, files expected to change, invariants at risk, tests to add, browser tiers needed, rollback, and one proposed packet per worker with disjoint `write_scope`. Done means every file the change will touch is owned by exactly one packet or by the integrator.

## Governing instructions

- `CONTRIBUTING.md` — tests for new behavior, regression tests for fixed defects, explicit-review list, docs updated when behavior or claims change.
- `Kosmos-Oden-Engineering-Review/CI-CD-AND-AGENT-OPERATING-DIRECTIVE.md` — proposed directive: §5 Step 2 change-plan format; §9 a renderer upgrade is never combined with module conversion, shader-language change, WebGPU, layout or semantic changes in one PR.
- `.github/pull_request_template.md` — the checklist and review-required flags the eventual PR must answer.
- `docs/RELEASE-PROCESS.md` — a version change touches `src/kosmos-version.ts` first; `CHANGELOG.md` moves `[Unreleased]` items only at release.
- `docs/plans/2026-09-10-revised-execution/README.md` — one integrator owns each shared file at a time; agree on new module interfaces before dependent implementation.

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | Full packet | SHA-256 in `RUN.json` |
| Predecessor | `<run>/output/<task-id>/<attempt>/scope.json` from `01-understand` | Full file | Digest in its HANDOFF.json |
| Scripts | `package.json` | `scripts` block (test, verify, browser suites) | Packet `base_commit` |
| Tests | `test/` and `test/browser/` | Existing tests near the change | Packet `base_commit` |

## Dependencies

- `01-understand` accepted (not just submitted).

## Allowed writes

- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.
- No source changes. Proposed packets are drafts for the coordinator; they are not published packets.

## Procedure

1. Confirm the packet generation and that `01-understand` is accepted.
2. Read the governing instructions, then `scope.json`.
3. Write `PLAN.md` with these headings from the directive: Scope; Non-goals; Files expected to change; Invariants at risk; Tests to add; Browser/platform matrix; Rollback.
4. Tests: name each new `test/<name>.test.mjs` (run by `node --test "test/*.test.mjs"` via `npm test`, from `package.json`) or browser spec under `test/browser/`.
5. Browser tiers: if `src/renderer/`, `src/standalone/`, `scripts/build.mjs`, `playwright.config.ts` or `test/browser/` change, require `qualification` stages 01-03; add stage 04 only for a release candidate.
6. Split into packets. Give each a branch name using an existing prefix (`fix/<slug>-<YYYYMMDD>`, `docs/<slug>-<YYYYMMDD>`, `renderer/<slug>-<YYYYMMDD>`, `agent/<agent-id>/<slug>`, or `codex/<slug>-<YYYYMMDD>` when Codex creates the branch) and a `write_scope` of exact paths. Assign every shared file to the integrator packet.
7. Decide whether the small path (01 → 03 → 04 → 06) applies; record the reason.
8. Write `proposed-tasks.json`, then `HANDOFF.json` last.

## Verification

Objective:

- `write_scope` arrays are pairwise disjoint and none contains an integrator-owned shared file unless that packet is the integrator's: a set-intersection script over `proposed-tasks.json` exits 0 (proposed check).
- Every path in "Files expected to change" either exists at `base_commit` or is marked `new`.

Interpretation:

- Does any packet mix a renderer upgrade with semantic, layout or protocol changes (directive §9)?
- Is each explicit-review trigger carried into the plan as "requires maintainer review"?

## Outputs

| Artifact | Location | Format |
|---|---|---|
| `PLAN.md` | `output_ref` | Directive §5 Step 2 headings |
| `proposed-tasks.json` | `output_ref` | Array of kit TASK.json drafts with `write_scope`, `branch`, `depends_on`, `required_checks` |
| Handoff | `output_ref/HANDOFF.json` | Kit template, status `submitted`, `blocked` or `uncertain` |

## Failure behavior

- Two packets need the same non-shared file → merge them into one packet or sequence them; never plan co-editing.
- The plan needs an explicit-review item → keep planning, mark it, and stop the run before `03-build` until the owner or appointed reviewer responds.
- The plan needs an Engine pin change or a `three` upgrade → split it into its own packet and route it through `pr-triage/02-disposition` for an owner decision first.
