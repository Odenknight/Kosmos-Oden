# Kosmos-Oden ICM router

Status: **proposed**, 2026-10-07, author Fable-FAC (for FAC / Oden). Base commit `175ce29271c688009c93a60e64de4f41abd2828e` on branch `icm/layout-20261007`. Full agent procedure: `_Agents/_work/ICM/Kosmos-Oden/INSTRUCTIONS.md` on the KnightsAI share. Conventions: `_Agents/_work/ICM/_core/CONVENTIONS.md`.

This folder grants no authority. It does not assign work, appoint a coordinator, or authorize a push, merge, PR closure, tag, release, baseline approval or ruleset change. Where it disagrees with a repository rule or an owner instruction, the rule or instruction wins.

## Read first, in this order

1. `CONTRIBUTING.md`: setup, the one-semantics rule, the before-PR list, the browser test table, and the changes that require explicit review.
2. `README.md`: the current 0.8.3 candidate, the exact GKOS-Engine development pin, and the statement that the candidate includes no Rust build.
3. `kosmos-invariants.yml` and `SECURITY.md`: the security and build properties that `npm run check:invariants` enforces.
4. `docs/ARCHITECTURE.md`: since 0.8.0 the shared semantic engine is the pinned `gkos-engine` package, consumed by every surface.
5. `docs/RELEASE-PROCESS.md`: releases are built from the tag in CI; generated files are not committed.
6. `docs/reviews/UPGRADE-PRIORITIES-20260921.md`: the latest owner-requested priority order (reconcile the build baseline first).
7. `docs/plans/2026-09-10-revised-execution/README.md` and `docs/plans/2026-09-10-revised-execution/WORK-PACKAGES.md`: the existing claim protocol, seam reservations and package IDs (R0, L0, R1-R3, Q1, Q2, E1, G1, M1, B1).
8. `docs/reviews/2026-09-12-branch-disposition.md`: prior per-branch and per-PR dispositions.
9. `Kosmos-Oden-Engineering-Review/CI-CD-AND-AGENT-OPERATING-DIRECTIVE.md`: a *proposed* directive (2026-07-12). Use its role split and renderer-upgrade gate where CONTRIBUTING is silent; it does not override CONTRIBUTING.
10. The workflow `README.md` and the one stage `CONTEXT.md` your packet names.

## Which workflow

| If your task is ... | Workflow | Entry stage | First inputs |
|---|---|---|---|
| Decide what to do with one or more open pull requests, including Dependabot PRs and the stacked #80-#87 chain | `pr-triage` | `01-inventory` | `pr-triage/README.md`, `docs/reviews/2026-09-12-branch-disposition.md`, B1 in `docs/plans/2026-09-10-revised-execution/WORK-PACKAGES.md` |
| Fix a defect or add behavior in `src/`, `scripts/` or `test/` | `change` | `01-understand` | `change/README.md`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md` |
| Integrate a PR or stack that `pr-triage` has already dispositioned | `change` | `05-integrate` | The accepted disposition, `change/05-integrate/CONTEXT.md` |
| Edit documentation only | `change` | `01-understand`, then `03-build`, `04-verify`, `06-deliver` (small path, recorded in the packet) | `CONTRIBUTING.md` (README must not claim more than the code proves) |
| Bump or replace a dependency, including `three` or the Engine pin | `pr-triage` for the decision, then `change` | `02-disposition` | `renderer-provenance.json`, `.github/dependabot.yml`, `README.md` |
| Show a candidate works in real browsers, or prepare release evidence | `qualification` | `01-candidate` | `qualification/README.md`, `playwright.config.ts`, `CONTRIBUTING.md` |
| Read-only codebase analysis with no change | Not this folder | Use the repo-analysis protocol at `_Agents/_work/repo-analysis-icm/` | |
| Swap the TypeScript Engine provider for Rust, write to vault notes, or add a network route | Stop | Owner decision first | `README.md`, `kosmos-invariants.yml` |

## Where records live

Run records (packets, handoffs, reviews, `RUN.json`) live on the share under `_Agents/_work/ICM/Kosmos-Oden/runs/`, never in this repository. This repository is public: do not copy private handoffs, mailbox messages, vault content, hostnames or tokens into it.

## Invariants

- One semantic implementation: the pinned `gkos-engine` package. Never fork parsing, resolution, lineage, temporal or graph logic into the plugin, standalone, Agent API, renderer or CLI. (CONTRIBUTING still names `src/core`, which no longer exists at this commit.)
- Generated outputs are never committed: main.js, kosmos-oden-stand-alone.html, dist and release are in `.gitignore`.
- The Agent API and standalone viewer stay read-only; `kosmos-invariants.yml` stays green.
- Exact pins stay exact. Changing the GKOS-Engine commit or the `three` version is a dependency change that needs explicit review and an owner decision. The Rust Engine is not an authorized provider here.
- Browser evidence keeps three tiers apart: the required Chromium gate, the advisory Firefox/WebKit/visual suites, and release-time local GPU runs. One screenshot or one green job never stands for all three.
- A conclusion is valid only for the commit it was measured at. Stacked PRs (#82-#87) are measured against their branch bases, not main.
- Agents do not merge, close or comment on PRs, push tags, dispatch workflows, approve visual baselines or change rulesets unless the packet and an owner instruction both authorize that exact action.
