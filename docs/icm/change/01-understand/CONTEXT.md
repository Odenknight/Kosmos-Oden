# 01-understand — map what the change touches before anyone plans it

## Goal

At the packet's `base_commit`, state which Kosmos-Oden surfaces the requested change touches, which invariants and explicit-review triggers it reaches, which shared or generated files it would affect, and which open PRs already change the same files. Done means `scope.json` lists every item with a path at `base_commit`, and nothing in it is a guess.

## Governing instructions

- `CONTRIBUTING.md` — one graph-semantics implementation consumed by every surface; new behavior needs tests and fixed defects need a regression test; generated artifacts are not committed; the "Changes that require explicit review" list.
- `docs/ARCHITECTURE.md` — since 0.8.0 the shared engine is the exact-pinned external `gkos-engine` package; the renderer consumes a completed graph and never re-derives semantics. Read this together with CONTRIBUTING, whose golden rule still names a `src/core` directory that does not exist at this commit.
- `kosmos-invariants.yml` — Agent API off/localhost/authenticated by default, read-only, no write routes, request cap, sensitivity fail-closed, reproducible executables, no `latest` dependencies.
- `README.md` — the exact Engine development pin and "It includes no Rust build"; the README must not claim more than the code proves.
- `docs/reviews/UPGRADE-PRIORITIES-20260921.md` — reconcile the build baseline and integration inventory before adding implementation.
- `docs/plans/2026-09-10-revised-execution/README.md` — historical seam reservations (server dispatch, provider) need an explicit handoff before their shared files are edited.

## Inputs

| Source | Exact reference | Scope | Revision/digest |
|---|---|---|---|
| Assignment | Task packet `tasks/<task-id>.json` | Full packet | SHA-256 in `RUN.json` |
| Repository source | `src/`, `test/`, `scripts/`, `kosmos-build.mjs`, `kosmos-mcp-stdio.mjs` | Files named by the request and their importers | Packet `base_commit` |
| Build manifest | `package.json` | `scripts`, `dependencies`, `devDependencies` | Packet `base_commit` |
| PR checklist | `.github/pull_request_template.md` | Review-required flags | Packet `base_commit` |
| Open PRs | `gh pr list -R Odenknight/Kosmos-Oden --state open` | Files changed by each open PR | Query time recorded in output |

## Dependencies

- None. This is the entry stage. The packet must be published and its assignment generation current in `RUN.json`.

## Allowed writes

- `output_ref` from the packet: `<run>/output/<task-id>/<attempt>/`.
- No source changes. No GitHub writes.

## Procedure

1. Confirm the packet generation in `RUN.json`. Check out `base_commit` in your own worktree; record `git rev-parse HEAD` and `git status --porcelain`.
2. Read the governing instructions in full, then the inputs.
3. Map surfaces touched: Engine adapter (`src/navigation-effects/`, `src/navigation-integration.ts`), Obsidian plugin (`src/plugin/`), Agent API and MCP (`src/plugin/agent-server.ts`, `kosmos-mcp-stdio.mjs`), standalone (`src/standalone/`), renderer (`src/renderer/`), CLI (`kosmos-build.mjs`), build and release (`scripts/`, `.github/workflows/`).
4. Mark explicit-review triggers from CONTRIBUTING: new network route or write capability; new dependency or notable bundle-size change; authentication, Host/Origin or LAN behavior; iframe sandbox or host-renderer protocol; release-workflow change.
5. List shared files the change would touch (see INSTRUCTIONS "Running a wave"): `package.json`, `package-lock.json`, `CHANGELOG.md`, `THIRD-PARTY-NOTICES.md`, `README.md`, `renderer-provenance.json`, `kosmos-invariants.yml`, `src/kosmos-version.ts` with `manifest.json` and `versions.json`, `scripts/build.mjs`, `.github/workflows/*.yml`, `test/browser/visual.spec.ts-snapshots/`.
6. Find overlapping open PRs, read-only: `gh pr list -R Odenknight/Kosmos-Oden --state open --json number,title,baseRefName,files` (GitHub CLI; executed by Fable-FAC on 2026-10-07 for the inventory in INSTRUCTIONS).
7. Write `understanding.md`, then `scope.json`, then `HANDOFF.json` last.

## Verification

Objective:

- Every path in `scope.json` exists at `base_commit`: `git cat-file -e <base_commit>:<path>` exits 0 (proposed check, not executed here).
- `git status --porcelain` in the worktree is empty at the end of the stage.

Interpretation (reviewer judgment):

- Is the surface list complete for the request? Would the change put semantic logic in a surface instead of the Engine?
- Is any explicit-review trigger or shared file missing?

## Outputs

| Artifact | Location | Format |
|---|---|---|
| `understanding.md` | `output_ref` | What exists, what is asked, open questions |
| `scope.json` | `output_ref` | `base_commit`, `surfaces[]`, `invariants_at_risk[]`, `explicit_review_triggers[]`, `shared_files[]`, `generated_outputs_affected` (bool), `overlapping_prs[]` |
| Handoff | `output_ref/HANDOFF.json` | Kit template, status `submitted`, `blocked` or `uncertain` |

## Failure behavior

- The request names a topic, not a file or behavior, and it cannot be resolved → `BLOCKED`; ask the coordinator. Do not guess.
- The change needs a new Engine commit, a Rust provider, a write route or vault writes → `BLOCKED` pending an owner decision; record the exact need.
- A historical seam reservation covers a needed file → report it; do not plan edits to it without a recorded handoff.
- Changed input digest or moved `base_commit` → stop and report `stale`.
