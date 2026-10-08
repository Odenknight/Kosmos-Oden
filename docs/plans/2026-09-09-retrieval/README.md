# Kosmos retrieval remediation: build and release plan

Date: 2026-09-09. Revision 2 — adoption matrix reconciled. Status: proposed build plan; no implementation, deployment,
client reconfiguration, database provisioning or release is performed by this plan.

## Decision

Repair the agent-facing Kosmos MCP integration first by consuming the existing
TypeScript Engine retrieval service. Keep the current plugin, visual graph, MCP
names and default read behavior compatible. Graphiti is an optional derived
retrieval and temporal projection service. Rust is outside the critical path.

Deliver three independently reviewable increments:

1. Native MCP search/passages plus Hermes registration and temporal limitations.
2. Durable source-observation history and a precisely scoped known-at API.
3. Optional Graphiti ingestion/query projections and measured retrieval uplift.

Detailed plans:

- [Native retrieval and Hermes](NATIVE-AND-HERMES.md)
- [Known-at history and Graphiti](TEMPORAL-AND-GRAPHITI.md)
- [Verified adoption matrix, corrections and remaining evidence](ADOPTION-MATRIX-RECONCILIATION.md)

## Evidence and corrections

Inputs reviewed: HERMESRETRIEVALREVIEWFABLE20260909.md,
2026-09-08_Kosmos-Oden_Test_Hermes-Agent_GLM5.2.md,
KOSMOS_PRODUCT_MCP_GRAPHITI_UPGRADE.md, HERMES_KOSMOS_AGENT_REMEDIATION.md,
and KOSMOSENGINEADOPTIONMATRIX20260909.md,
all supplied in Downloads. Their directives are planning inputs, not permission
to change Hermes, launch ingestion, access the live vault or modify the Rust oracle.

Code baseline inspected: Kosmos candidate b35b27e0b0a4f6a3223ec8974c2786bc99b83651
(0.8.2), based on main 3aab1e3, consuming TypeScript Engine
650eab4a6752227cae336d7556a57826c22a0d5a (2.2.0 candidate).
These are inspected coordinates, not a claim about today's deployed service.
Re-fetch main, check existing PRs and record the installed build in work package R0.

The adoption artifact is now supplied and inspected. Its actual rows total
6 PROXY / 3 AUGMENT / 1 CONTRACT / 8 KEEP, contradicting its 8/3/1/6 summary.
Its Vault-to-whole-corpus mapping and v2.1.2-to-oracle equivalence also require
correction. See the reconciliation for the artifact SHA256, verified coordinates,
all eighteen mappings and compatibility caveats. The reported forbidden probe
still provides no deployed version or Graphiti readiness evidence.

- `src/plugin/agent-server.ts` still implements metadata substring search,
  one-hop related notes, character-capped full-note reads and valid-time views.
  Upgrading the dependency did not adopt Engine service retrieval.
- Existing Engine `src/service/mcp.ts` exposes `gkos_search`, `gkos_note_read`,
  `gkos_record_resolve`, lineage and valid-time tools. Capture their actual schemas.
- Kosmos already filters `fileNodes` by sensitivity before scoring. Preserve this;
  do not repeat the review's incorrect claim that current qSearch scores hidden notes.
- Engine additionally checks each returned retrieval hit against its authorized
  content snapshot, including source identity, path, digest and citation flags.
  Preserve this narrower distinction rather than implying equivalent full policies.
- Engine lineage is direct-neighbor and paginated; Kosmos lineage is transitive.
  Adoption must preserve the latter contract or introduce an explicit versioned
  replacement. Exhausting one Engine page sequence is not a complete ancestry walk.
- The inspected `codex/retrieval-moc-next-update` engine-search client is a useful
  prototype, but is standalone-only, fixed to one protocol and JSON responses.
  Merging it alone does not repair Hermes calls to Kosmos port 4816.
- Older Engine strings remain hard-coded in MCP descriptions/instructions.
- The transcript admitted client-side slicing and missing Hermes restart. It
  also inferred design history and currentness too strongly: neither chronological
  episodes nor a singleton lineage chain proves a merger, approval or freshness.
- A four-edge FAC → metrics → Snapshot → Adapter → game chain cannot fit in a
  two-hop request. Test bounded continuation, not a fabricated shortcut.

## Ownership

| Owner | Responsibility |
| --- | --- |
| TypeScript Engine | Authorized chunk retrieval, source references, passage cursors, citation verification, existing lineage/valid-time semantics; reusable temporal contract extensions after review |
| Kosmos | MCP compatibility, principal mapping, typed service adapter, capability reporting, review/UI controls, bounded graph presentation, observation-host integration |
| Hermes | Installed-profile registration, lifecycle, native tool use, evidence-oriented response policy and presentation completeness |
| History store | Durable observation/claim versions, retained revision references, retention and replay; a record of system observations, not canonical approval |
| Graphiti worker | Derived ingestion ledger, extraction/query adapter, source mappings, temporal projection generations and recovery |
| Standard/contract owner | Review the new known-at vocabulary and evidence semantics; no claim of existing Standard conformance |
| Rust | Later parity fixtures against approved TS behavior; no changes to the frozen oracle or Rust implementation in this repair |

## Dependency order and work packages

| ID | Build output | Depends on | Acceptance / exit |
| --- | --- | --- | --- |
| R0 | Runtime baseline and immutable dependency decision | none | Installed Kosmos/Engine/client/protocol/corpus coordinates and schema digest captured; unsupported fields explicitly unknown |
| R1 | Versioned consumer contracts and SDK lifecycle harness | R0 | Real Engine fixtures, not invented response shapes; principal isolation, expiry and JSON/SSE pass |
| R2 | Engine-backed search and passage bridge | R1 | Body-only result, verified source range, stale cursor rejection, tag/area compatibility and no-Engine fallback pass |
| R2G | Shared validate/assess adapters with legacy response translators | R1 | Engine/Kosmos code and score fixtures agree; both public aliases retain their response contracts; unmappable fields keep existing path |
| R3 | Bounded related paths and temporal honesty | R1 | Evidence-labelled paths; restricted intermediate absent; valid-at-only limitations machine-readable |
| H1 | Hermes native configuration/instruction patch | R0; final validation after R2/R3 | Fresh GLM 5.2 sessions use registered tools without manual HTTP or hidden slicing |
| Q1 | Native acceptance and compatibility release | R2/R3/H1 | All correctness/security gates; reproducible local plugin; hosted checks and actual Obsidian acceptance |
| T1 | Known-at contract and observation journal | R1 | Late-arrival, correction, monotonic ordering, crash/restart and no-history cases pass |
| T2 | Versioned temporal projection and retained passages | T1 | Historical queries remain unchanged by later corrections; current authorization still applies |
| G0 | Filtered, revision-bound episode export | R2/R3 | Relevant bounded source pages, schema round trip; no DB/search claim |
| G1 | Graphiti modes and read adapter | Q1/G0; T2 for known-at | Query-only startup attempts zero writes; unavailable backend retains useful native response |
| G2 | Managed worker, mappings, ledger, published generations | G1 | Re-ingest, ambiguous commit, revocation, retention, restore and model-version changes tested |
| Q2 | Temporal/Graphiti comparison and optional activation | T2/G1/G2 | Fixed corpus/answer key, temporal tests, reproducible results and explicit supported mode |

These are implementation dependencies, not authorization to spawn agents or
create separate tasks. Use normal reviewable changes in the existing repositories.
R2G can ship separately after the native repair; it is required in Q1 only if that
release changes the governance tool adapters. A mapping is not permission to delete
working local behavior before parity is demonstrated.

R0 and R1 must precede an effort estimate with commitments. Planning allowance:
R0–Q1 about 10–18 engineering days; T1–T2 another 8–15; G0–Q2 another 8–15,
with overlap in client/fixture work possible. Confidence is low-to-medium until
the deployed identity model, Engine admission compatibility and available backend
are inspected. Infrastructure, review waiting and real-device qualification are
excluded. An Engine public-host API change can add work; no promise of a quick
drop-in SQLite library inside Obsidian/mobile is made.

## Release gates and evaluation

Freeze a synthetic shareable corpus plus an authorized representative corpus.
Create reviewed expected sources/passages and temporal answers before measuring.
Use the same corpus bytes, question set, access scopes and model settings in:

- A: unchanged metadata search.
- B: Engine body search plus bounded native graph paths.
- C: B plus an existing read-only Graphiti snapshot.
- D: B plus managed ingestion and temporal projections.

At least three fresh GLM 5.2 runs per question. Record recall@10, citation byte
accuracy, unsupported claims, supersession/time selection, completeness, calls,
tokens, p50/p95 latency and ingestion/query cost. Graphiti earns default-off pilot
status only if it adds at least 5 percentage points recall@10 over B on designated
relationship questions with no regression on temporal/citation safety and no more
than 2x B's p95 latency. These are proposed predeclared thresholds; ratify and lock
them before running, never tune the answer key after seeing results.

Native mandatory fixtures: every seeded body-only answer retrieved within the
documented bounded result window; 100% byte-verified citations; complete passage
round trip; zero restricted IDs/counts/explanations or secret leakage; all stale
cursor, temporal and failure-state cases return the specified result. Do not use
an average score to waive any of these gates.

Retain existing tests for renderer, Chrono, mobile/desktop embed, source-read-only
behavior, GKX 2.2/2.3 Properties, aliases/tags, enrichment/apply safeguards,
Nextcloud, Graphiti export, REST/MCP, stdio bridge and stable agent trails. Run
existing verify, browser and release/provenance checks. Add real Obsidian install,
upgrade with existing settings and uninstall/rollback checks. No note rewriting
is necessary to activate retrieval.

## Delivery and rollout

Prefer successive minor releases for new tool/capability contracts; choose actual
version numbers after R0 checks pending branches/releases. Do not overwrite 0.8.2
artifacts. Resolve Engine release versus explicitly approved candidate use in a
written compatibility decision; do not downgrade blindly to obtain a tag that
does not expose the tested API.

Ship body search, graph expansion, history capture, Graphiti query and ingestion
as separate settings. During the pilot, preserve metadata behavior unless the
caller opts into body mode; switch the documented auto mode only after Q1.
Keep a tested offline/no-Engine mode and separate browser/mobile capability flags.
An unavailable body backend must not silently return metadata-only empty results
as if a body search succeeded.

For each release deliver an exact-commit plugin ZIP, hashes/build manifest,
capability matrix, changelog/README, rollback instructions, sanitized Hermes
transcript and test report. Use normal PR checks and required review to merge;
do not assume the earlier PR's review gate is satisfied. Native repair is
releasable before Graphiti or known-at work completes.

## Decisions to resolve during R0/T1, not guessed here

1. Actual deployed principal model and how it maps to Engine grants.
2. Exact supported Engine release/candidate and public retrieval contract.
3. Whether durable history/retained note bytes are permitted, where, and for how long.
4. Whether any Graphiti DB exists and permits read-only or managed operation.
5. Authorized extraction/embedding destinations and budget. Default: no external
   inference destination is activated merely by enabling native body search.

All implementation packages are PROPOSED. Read-only document/code research is
complete; no runtime fix or qualification result is implied by this plan.
