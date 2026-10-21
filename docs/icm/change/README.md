# `change` workflow

Status: proposed (Fable-FAC, 2026-10-07). Use it for any source, test, script, workflow or documentation change to Kosmos-Oden, alone or as a wave of parallel workers. It follows CONTRIBUTING.md and the step order in the proposed CI/CD directive (issue/plan, implement on a branch, verify, independent review, owner merge).

| Stage | Job | Main output |
|---|---|---|
| `01-understand` | Map surfaces, invariants, explicit-review triggers, shared files and overlapping open PRs at the base commit | `scope.json`, `understanding.md` |
| `02-plan` | Change plan in the directive's format; split into packets with disjoint `write_scope`; name the integrator's shared files | `PLAN.md`, `proposed-tasks.json` |
| `03-build` | Implement one packet on its own branch with tests | Commits, `changed-files.txt` |
| `04-verify` | Run the repository checks on the exact candidate, independently of the author | `results.json` |
| `05-integrate` | Integrator combines accepted candidates on a fresh base from `origin/main`, applies shared-file edits once, reruns checks | Integration commit, `INTEGRATION.md` |
| `06-deliver` | Owner-facing summary and PR body; push and PR only if authorized | `DELIVERY.md`, `PR-BODY.md` |

Dependencies are linear (see `dependencies.json`). Renderer, standalone or build-script changes also need the `qualification` workflow before `06-deliver`.

**Small path.** A documentation-only change or a one-file fix may run `01 → 03 → 04 → 06` in a single packet. The packet records the skipped stages and why. Never skip `04-verify`.

**Example.** A fix to the Agent API body cap in `src/plugin/agent-server.ts`: `01` finds it touches the Agent API surface and `kosmos-invariants.yml` (`max_request_bytes`), so it is security-relevant; `02` plans a regression test in `test/reliability-regressions.test.mjs` and no shared-file edits; `03` builds on `fix/<slug>-<YYYYMMDD>`; `04` runs `npm run verify`; `05` is skipped (one worker, no shared files); `06` drafts the PR body with no review-required flag ticked unless authentication, Host/Origin or LAN behavior changed.
