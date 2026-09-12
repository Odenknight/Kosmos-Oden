# Roadmap and mailbox execution ledger

Scope confirmed by the owner: the entire repository roadmap plus agent mailbox.
Baseline: main `222c1daab9088e9ee800b00b4c27f1f7c5b7ac34` (PR 60).
This is an execution ledger, not a release or conformance claim. Historical
plans and peer suggestions are evidence, not independent authorization.

| Item | Current disposition / remaining work |
| --- | --- |
| Startup, provider deadlines, HTTP accounting, modern MCP, timeout invariant | Implemented on main; retain regression coverage |
| All Links visibility, orbit preservation, ship names, trails, idle fade, galaxy spacing | Implemented and installed through PR 60; native Hermes receipt outstanding |
| Ambiguous UID/title/alias selection | Fixed on main; exact paths disambiguate without rewriting notes |
| Mailbox A1 / PR 51 disposition | Merged; superseded tracking must reference current installed package |
| Mailbox A3 / body search | Implementing opt-in bounded committed-snapshot search; metadata default preserved, partial coverage disclosed |
| M1 / mailbox reader | New read-only audit and synthetic role/hash/fork tests; live audit retains historical defects |
| R0-client / R3 | Requires actual Hermes client/SDK identity and executed client receipt; direct HTTP cannot substitute |
| E1 / gkos_search and NAV_STABLE_ID_AMBIGUOUS | Separate Engine service; deployed endpoint/build mapping remains missing; no authorization widening or source UID rewrite |
| G1 / generated Graphiti readiness | Locate generator ownership and preserve unverified status until authorized readback |
| B1 / PR 23,27,28,38,41 | Refresh exact-head feature disposition; preserve unique useful changes before closure |
| Roadmap / Engine consumption and compatibility fixtures | Audit remaining duplication and exact dependency; shared semantic changes belong upstream |
| Roadmap / proposal review and Lite migration | Audit reachable UI, source purity, compatibility and migration documentation |
| Roadmap / browser, GPU, live identity gates | Run available lanes; distinguish unavailable hardware/client evidence |
| Issue 40 / K0–K4 managed MOCs and bounded agent writes | Inventory current seams against checklist before extending; no automatic live-vault write activation |
| Future N/W/T tracks | Contract, synthetic fixtures, retrieval/workspace/history implementation inventory outstanding |
| Graphiti G2–G5 | Optional backend/provider qualification requires exact available service and model inputs; no live ingestion implied |
| Mailbox Physics publishing/outreach/SSH | Separate projects and publication decisions; not Kosmos product work. SSH reported fixed; do not alter unrelated repositories or publish private research |

Graphiti has not been used for the current investigation. GitHub, local source,
raw mailbox files and synthetic tests provide the evidence. No note contents,
credentials or raw private mailbox payloads belong in this public report.

## First completed implementation batch

- Opt-in cached body-prefix search, sensitivity filtering before body access,
  snapshot identity checks, explicit partial coverage and query bounds.
- Read-only recipient-specific mailbox audit. The current local audit examined
  117 messages and six recipient ACKs; it reported two fork entries, four parent
  hash mismatches, five filename disagreements and two reused ACK ordinals.
  Original bytes are preserved. This is not full protocol certification.
- Generated Graphiti sample now reports ingestion-returned/search-unverified;
  it performs no readback and no longer claims searchability.
- Standalone scan results are fenced across stop/restart/pause/resume. Export
  follows the displayed graph; Graphiti content export appears only for local
  content. Folder labels stay text and short-screen connection/error UI remains
  reachable. These preserve useful changes from PR 38/41 while retaining current
  branding, renderer and MCP reliability fixes.
- Browser tests use a dedicated server rather than silently reusing another
  checkout. `KOSMOS_TEST_PORT` selects an available port.
- Added Lite migration guide, refreshed Effects inventory and Engine notice,
  and exposed the existing pinned Engine MOC planning/assistance seam.

Validation: `npm run verify` passed **380 tests**, typecheck, build, version,
lockfile, artifact, invariant and renderer provenance checks. Targeted standalone
flows and identity/timing checks passed **36 cases** across desktop Chromium,
mobile Chromium, Firefox and WebKit. Hardware GPU and native Hermes qualification
remain separate. No live Graphiti service was contacted or ingested.

## Backlog disposition at inspected heads

| PR | Head | Disposition |
| --- | --- | --- |
| 23 | `096b92ad896268ef41cafda2542e4c2280ff70fe` | Root version/dependency guards already exist and cover devDependencies too. The old Engine 1.1.3 pin is obsolete. Do not downgrade |
| 27 | `a326f7e9b72e278d996ab8276284ff7e10c1f666` | GKX naming is already adopted. Historical provenance wording differs; retain for explicit provenance review rather than silently overwrite notices |
| 28 | `eb8486aa4c7c51b0c63869a4139c748c69b63745` | Current branding/exact pin supersede the old 1.1.2 claims; existing detailed triage remains applicable |
| 38 | `fbec1f9daeb4c3cc258ddec0d046adc2dac3483d` | Standalone repair subset preserved here. Unique proposal decisions, coordination and desktop packaging still require integration; do not close as wholly redundant |
| 41 | `65e9354f220b19a16c67504ff228e58caf8128ca` | Broad uplift still contains unique proposal/coordination/desktop work. Whole-tree replacement would remove current reliability and protocol tests; preserve features selectively |
| 56 | `c7d915650337ea22dbcda3edcd30a91c8455ec19` | GF-02 reproduced and fixed here. Remaining document covers optional external Graphiti qualification; no backend qualification claimed |

No backlog PR was batch-closed or merged by this inventory.
