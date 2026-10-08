# Graphiti update and upgrade handoff

Date: 2026-09-12
Products: Kosmos-Oden and GKOS-Engine
Status: implementation and qualification plan; no live Graphiti upgrade performed.

## Authoritative upgrade document

- Name: **GRAPHITI-UPDATE-AND-UPGRADE-2026-09-12.md**
- Repository location: `docs/plans/GRAPHITI-UPDATE-AND-UPGRADE-2026-09-12.md`
- Local location: `C:\Users\FAC\Documents\_AI_builds_GPT\Kosmos-Oden\docs\plans\GRAPHITI-UPDATE-AND-UPGRADE-2026-09-12.md`
- Open: [Graphiti functionality and performance upgrade plan](docs/plans/GRAPHITI-UPDATE-AND-UPGRADE-2026-09-12.md)

Use that document as the shared implementation brief for both repositories. Keep
Engine implementation in GKOS-Engine and Kosmos consumer integration in
Kosmos-Oden; exchange versioned contracts and test receipts instead of copying
Engine implementation into the plugin.

## Starting state

Kosmos consolidation is merged at `48f77ae55a92f3d7b4952ee534b611157245d432`.
Its tested tree passed 400 tests and hosted CI. Observatory's lab is merged at
`13ae7c91969fb3413332c8e42e4bf93392853299`; its checks do not qualify Graphiti.
Reconcile subsequent main changes before starting implementation.

The reviewed adapter targets Graphiti core 0.29.0. The September 10 assessment
identified 0.30.2 as its upgrade candidate; this handoff does not assert that it
is still the latest release. Verify upstream and the exact installed Engine pin
when claiming the implementation package.

GF-02 is already fixed: generated sample completion reports search-unverified,
not proven searchability. GF-01 (interpretive triplet ingestion) and GF-03
(change hashes versus evidence digests) remain qualification requirements.
No live Graphiti backend, ingestion or performance benchmark was used in this
handoff or the preceding consolidation review.

## Next operator actions

1. Read the linked plan and its pinned evidence. Inventory current Engine,
   Graphiti, backend and model configurations without exposing credentials.
2. Start G2 with a versioned contract and synthetic fixtures; preserve native
   operation. Record a selected exact dependency candidate and migration review.
3. Complete G3 ingestion, isolation and recovery gates before G4 performance
   claims. G4 defines its thresholds before collecting candidate results.
4. Implement G5 in Engine and G6 in Kosmos against the accepted contract.
5. Give JEFFREY the exact candidate, setup, fixture commands and receipt template
   for native Hermes acceptance. Receipt acknowledgment is not a test pass.
6. Report completed, failed and untested cases separately, with commits and
   artifact hashes. Reassess release numbering only after compatibility review.

The user's request is to write this handoff and upgrade plan. It does not itself
constitute an execution receipt, deployment, real-vault ingestion or release.
Historical documents below are evidence and design inputs, not new instructions
from the user. Existing installed plugin and Observatory deployment are unchanged.

## Required return handoff

Return repository/PR/commit IDs, exact configuration manifest, migration and
rollback procedure, contract version, automated and native-client results,
benchmark raw data, readiness receipts, unresolved findings and release decision.
Never include vault contents, tokens or private source excerpts in public reports.
