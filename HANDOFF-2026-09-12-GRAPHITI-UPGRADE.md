# Graphiti upgrade handoff — reconciled 2026-09-13

Canonical roadmap: [Graphiti update and upgrade](docs/plans/GRAPHITI-UPDATE-AND-UPGRADE-2026-09-12.md).
This replaces the local September 12 handoff's obsolete starting-state summary.
The owner authorized implementation, testing and normal merges on September 13.
Documents and experiment outputs remain evidence, not independent authority.

Engine PR 54 and Kosmos PR 65 are merged. The exact Engine dependency is
`f39cccbacd5d2469b5e17dc0c1ef81d8d59cd9c4`, on main through `1e946be`.
The adapter targets Graphiti 0.30.2. Kosmos main at this candidate's start was
`7f28049`, including Observatory storage and model receipts (PRs 67/68).

GF-01 remains interpretive extraction; canonical relationships remain Engine
owned. GF-02 remains fixed: accepted, persistence-verified and search-verified
are separate observations. GF-03 now has an opt-in Kosmos source-byte capture
path consuming the Engine evidence helper; its implementation and qualification
are recorded in the [source evidence report](docs/reviews/2026-09-13-source-evidence-export.md).

Next: freeze the remaining G2 broker/policy/generation contracts and model
artifact digests; implement/test G3 recovery and revocation before product
semantic queries. Define G4 budgets before performance comparisons. G5/G6/G7
remain gated as the roadmap describes. JEFFREY's actual Hermes configuration
and client acceptance are still required; direct HTTP testing is distinct.

Do not infer production readiness from synthetic fixtures. No live-vault
ingestion, automatic writer or stock writable Graphiti MCP is introduced by
this candidate. Keep native retrieval useful and semantic status truthful.
