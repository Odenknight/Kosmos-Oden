# Kosmos retrieval remediation: build and release plan

Date: 2026-09-09. Revision 3.1 — deployment baseline observed, dependency and
topology corrections applied, live-vault probe and vault governing documents
reconciled. Status: proposed build plan; no implementation,
deployment, client reconfiguration, database provisioning or release is
performed by this plan. What changed from revision 2 and why is in
[the review](REVIEW-REV3.md).

## Decision

Repair the agent-facing Kosmos MCP integration first by consuming the existing
TypeScript Engine retrieval service. Keep the current plugin, visual graph, MCP
names and default read behavior compatible. Graphiti is an optional derived
retrieval and temporal projection service. Rust is outside the critical path.
The Tauri standalone host (PR #41/#38) is also outside the critical path.

Deliver three independently reviewable increments:

1. Native MCP search/passages plus Hermes registration and temporal limitations.
2. Durable source-observation history and a precisely scoped known-at API.
3. Optional Graphiti ingestion/query projections and measured retrieval uplift.

Detailed plans:

- [Native retrieval and Hermes](NATIVE-AND-HERMES.md)
- [Known-at history and Graphiti](TEMPORAL-AND-GRAPHITI.md)
- [Verified adoption matrix, corrections and remaining evidence](ADOPTION-MATRIX-RECONCILIATION.md)
- [Draft R0 baseline](evidence/retrieval/baseline.json)

## Two Engine coordinates, always named separately

Every document in this set distinguishes:

- **Engine library pin**: the `gkos-engine` package bundled into the Kosmos
  plugin. Deployed bundle: 2.0.1. Mainline: 41172b9 (off-main, see below).
  0.8.2 candidate: 650eab4 (2.2.0 line).
- **Engine service coordinate**: the MCP service Kosmos will call. Observed
  today at `https://192.168.5.99/mcp`, self-reporting 2.1.2, contract
  `1.0.0-draft.2`, extension `observatory.mcp-content.v0`. Not loopback from
  the Kosmos host.

A statement about "the Engine version" without one of these labels is a
planning defect.

## Evidence and corrections

Inputs reviewed: HERMESRETRIEVALREVIEWFABLE20260909.md,
2026-09-08_Kosmos-Oden_Test_Hermes-Agent_GLM5.2.md,
KOSMOS_PRODUCT_MCP_GRAPHITI_UPGRADE.md, HERMES_KOSMOS_AGENT_REMEDIATION.md,
KOSMOSENGINEADOPTIONMATRIX20260909.md, all supplied in Downloads, plus today's
direct observation of the deployed host and three governing notes read from
the live vault: `Kosmos-Oden_Capabilities_2026-09-05`, the `Marshal-008 GKOS
Stack Operating Loop Directive v0.2`, and the `Kosmos-Oden Navigation and MOC
Lifecycle Integration Plan` (2026-08-15). Where this plan and those notes
disagree, the notes win and the disagreement is recorded here. Their directives are planning inputs,
not permission to change Hermes, launch ingestion, access the live vault or
modify the Rust oracle.

Observed deployment (2026-09-09, host 192.168.5.95): Kosmos plugin 0.7.0,
built 2026-08-06, Engine library 2.0.1, eighteen tools, LAN bind on 4816 with
bearer auth, ceiling `internal`, default sensitivity `public`. Separate Engine
service on 192.168.5.99 self-reports 2.1.2 behind Caddy TLS. A second plugin,
`kosmos-moc-prototype` 0.1.1 with Engine library 2.2.0, is also installed.
The full record with unknowns is the draft baseline.

Code baseline inspected: Kosmos candidate b35b27e0b0a4f6a3223ec8974c2786bc99b83651
(0.8.2, PR #42, all checks green), based on main 3aab1e3 (0.8.0), consuming
Engine library 650eab4a6752227cae336d7556a57826c22a0d5a (2.2.0 candidate).
Kosmos main itself pins Engine 41172b9, which is not on Engine main and does
not descend from v2.1.2. Landing #42 or an equivalent is therefore a
prerequisite (R0b) rather than an optional upgrade.

- `src/plugin/agent-server.ts` on main still implements metadata substring
  search, one-hop related notes, character-capped full-note reads and
  valid-time views. Upgrading the dependency did not adopt Engine service
  retrieval. PR #42 does not change this file.
- Existing Engine `src/service/mcp.ts` exposes `gkos_search`, `gkos_note_read`,
  `gkos_record_resolve`, lineage and valid-time tools. The 2.1.2 service and the
  650eab4 library differ in that file by 162 lines; capture both.
- Kosmos filters `fileNodes` by sensitivity before scoring. Preserve this; the
  review's retrieve-then-filter claim was withdrawn by its author and is wrong.
- Engine additionally checks each returned retrieval hit against its authorized
  content snapshot, including source identity, path, digest and citation flags.
  Preserve this narrower distinction rather than implying equivalent policies.
- Engine lineage is direct-neighbor and paginated; Kosmos lineage is transitive.
  Adoption must preserve the latter contract or introduce an explicit versioned
  replacement.
- The `codex/retrieval-moc-next-update` engine-search client is a useful
  prototype. Its loopback-only guard rejects the actual Engine location, and it
  has no pull request. It sits on PR #41's head.
- PR #41 contains its own retrieval integration plan (K3). One plan of record
  is chosen below.
- Four different Engine version strings are visible to an agent today (2.0.1 in
  the deployed bundle, 2.1.1 in main's descriptions, 2.1.2 from the service,
  2.2.0 in the candidate library). R3's version-metadata work is not cosmetic.
- The transcript admitted client-side slicing and a missing Hermes restart, and
  inferred design history too strongly. Neither chronological episodes nor a
  singleton lineage chain proves a merger, approval or freshness.
- A four-edge FAC → metrics → Snapshot → Adapter → game chain cannot fit in a
  two-hop request. Test bounded continuation, not a fabricated shortcut.

## Plan of record

The R-series in this document set is the retrieval integration plan. It
branches from Kosmos main after R0b. It may take from PR #41 the service
origin validation and terminal SSE-denial code and the K1 evidence documents
if R1 needs them. It does not take the Tauri host, the vendored glib or the
0.8.1 release preparation. PR #41's K3 section should be marked superseded by
R2, or the two owners must merge them into one; running both is excluded.

Out of scope, by the Capabilities note's own list: exposing Kosmos's evidence,
label, relationship and policy queries through Engine service contracts is a
transfer in the opposite direction and is not part of this repair. Navigation
and MOC operations stay out of the public MCP catalog, and no apply route is
ever reachable with the ordinary read token, per the Navigation plan §14.

## Ownership

| Owner | Responsibility |
| --- | --- |
| TypeScript Engine | Authorized chunk retrieval, source references, passage cursors, citation verification, existing lineage/valid-time semantics; reusable temporal contract extensions after review |
| Engine service operator (192.168.5.99) | Runtime receipt of the deployed commit, TLS certificate trust chain, grant/identity mapping for Kosmos principals |
| Kosmos | MCP compatibility, principal mapping, typed service adapter, capability reporting, review/UI controls, bounded graph presentation, observation-host integration |
| Hermes | Installed-profile registration, lifecycle, native tool use, evidence-oriented response policy and presentation completeness |
| History store | Durable observation/claim versions, retained revision references, retention and replay; a record of system observations, not canonical approval |
| Graphiti worker | Derived ingestion ledger, extraction/query adapter, source mappings, temporal projection generations and recovery |
| Standard/contract owner | Review the new known-at vocabulary and evidence semantics; no claim of existing Standard conformance |
| Rust | Later parity fixtures against approved TS behavior; no changes to the frozen oracle or Rust implementation in this repair |

## Dependency order and work packages

| ID | Build output | Depends on | Acceptance / exit |
| --- | --- | --- | --- |
| R0 | Runtime baseline and immutable dependency decision | none | Draft baseline completed with operator receipts: Engine service commit, Hermes host/version, Kosmos tools/list digest, Graphiti DB state; unsupported fields explicitly unknown |
| R0b | Mainline dependency repair | none | Kosmos main pins an Engine commit that is on Engine main and descends from v2.1.2 (PR #42 or equivalent merged) |
| R0c | Settings posture confirmation | R0 | Owner's written decision on `defaultSensitivity` and bind mode for the LAN deployment before body mode can be enabled there |
| R1 | Versioned consumer contracts, transport decision, lifecycle harness | R0, R0b | Two capture ledgers (deployed 2.1.2 service, 650eab4 library); transport decision record; principal isolation, expiry, TLS trust and JSON handling pass |
| R2 | Engine-backed search and passage bridge | R1 | Body-only result, verified source range, stale cursor rejection, tag/area compatibility, aggregated passage pages, LAN HTTPS to Engine, no-Engine fallback pass |
| R2G | Shared validate/assess adapters with legacy response translators | R1 | Engine/Kosmos code and score fixtures agree; both public aliases retain their response contracts; unmappable fields keep existing path |
| R3 | Bounded related paths, temporal honesty, version metadata | R1 | Evidence-labelled paths; restricted intermediate absent; valid-at-only limitations machine-readable; one dependency-derived version source |
| H1 | Hermes native configuration/instruction patch | R0; final validation after R2/R3 | Fresh GLM 5.2 sessions use registered tools without manual HTTP or hidden slicing; second plugin disabled or in scope |
| Q1 | Native acceptance and compatibility release | R0c/R2/R3/H1 | All correctness/security gates; reproducible local plugin; hosted checks and actual Obsidian acceptance |
| T1 | Known-at contract and observation journal | R1 | Late-arrival, correction, monotonic ordering, crash/restart and no-history cases pass; storage outside the synced vault or explicitly in sync scope |
| T2 | Versioned temporal projection and retained passages | T1 | Historical queries remain unchanged by later corrections; current authorization still applies |
| G0 | Filtered, revision-bound episode export | R2/R3 | Relevant bounded source pages, schema round trip; no DB/search claim |
| G1 | Graphiti modes and read adapter | Q1/G0; T2 for known-at | Query-only startup attempts zero writes; unavailable backend retains useful native response |
| G2 | Managed worker, mappings, ledger, published generations | G1 | Re-ingest, ambiguous commit, revocation, retention, restore and model-version changes tested |
| Q2 | Temporal/Graphiti comparison and optional activation | T2/G1/G2 | Fixed corpus/answer key, temporal tests, reproducible results and explicit supported mode |

These are implementation dependencies, not authorization to spawn agents or
create separate tasks. Use normal reviewable changes in the existing
repositories. R2G can ship separately after the native repair. A mapping is
not permission to delete working local behavior before parity is demonstrated.

R0 and R1 must precede an effort estimate with commitments. Planning
allowance unchanged from revision 2: R0–Q1 about 10–18 engineering days; T1–T2
another 8–15; G0–Q2 another 8–15. R0b, R0c and the transport decision add
decisions, not weeks, if made before R1 starts. Confidence remains
low-to-medium until the Engine service commit, the grant model and the
Graphiti backend are confirmed by receipts.

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
tokens, p50/p95 latency and ingestion/query cost. The Graphiti activation gate
is the one already ratified in the Marshal-008 directive §7: a unique query
class it alone answers, at least 10% quality improvement, at most 25% overhead,
with no regression on temporal/citation safety. Revision 2's proposed 5-point
recall@10 and 2x p95 thresholds are withdrawn as weaker than the ratified gate.
Define "quality" and "overhead" operationally (recall@10 on the designated
relationship questions; p95 latency and tokens) before running, lock the
definitions, and never tune the answer key after seeing results. The same
directive keeps an open two-candidate retrieval-provider trial (Kosmos-Oden
versus grooveseek); arm B is Kosmos-Oden's entry in that trial, not a foregone
selection.

Corpus hygiene: the live vault contains duplicate folder trees
(`Kosmsos_Research_Studio` and `Kosmsos_Research_Suite`) and the MOC run
archive under `_archive/moc-runs/`. The frozen corpus includes or excludes each
deliberately and the answer key says which; duplicates are grouped by content
digest in results, never silently dropped.

Native mandatory fixtures: every seeded body-only answer retrieved within the
documented bounded result window; 100% byte-verified citations; complete passage
round trip; zero restricted IDs/counts/explanations or secret leakage; all stale
cursor, temporal and failure-state cases return the specified result. Do not use
an average score to waive any of these gates.

Retain existing tests for renderer, Chrono, mobile/desktop embed, source-read-only
behavior, GKX 2.2/2.3 Properties, aliases/tags, enrichment/apply safeguards,
Nextcloud, Graphiti export, REST/MCP, stdio bridge and stable agent trails. Run
existing verify, browser, reproducibility and provenance/SBOM checks; a new
runtime dependency must pass dependency review. Add real Obsidian install,
upgrade with existing settings and uninstall/rollback checks. No note rewriting
is necessary to activate retrieval.

## Delivery and rollout

Prefer successive minor releases for new tool/capability contracts; choose
actual version numbers after R0b lands. Do not overwrite 0.8.2 artifacts.
Resolve Engine service coordinate versus library pin in a written
compatibility decision; the bridge must work against the deployed 2.1.2
service or the service must be upgraded under the operator's own change control.

Ship body search, graph expansion, history capture, Graphiti query and ingestion
as separate settings. During the pilot, preserve metadata behavior unless the
caller opts into body mode; switch the documented auto mode only after Q1.
Body mode on a LAN bind is gated on R0c. Keep a tested offline/no-Engine mode
and separate browser/mobile capability flags. An unavailable body backend must
not silently return metadata-only empty results as if a body search succeeded.

For each release deliver an exact-commit plugin ZIP, hashes/build manifest,
capability matrix, changelog/README, rollback instructions, sanitized Hermes
transcript and test report. Use normal PR checks and required review to merge.
Native repair is releasable before Graphiti or known-at work completes.

## Decisions to resolve during R0/T1, not guessed here

1. Actual deployed principal model and how it maps to Engine grants.
2. Which 2.1.2 commit runs on 192.168.5.99, and whether it stays or moves to a
   released 2.2.x under the operator's change control.
3. Default-sensitivity and bind posture for the LAN deployment (R0c).
4. Transport: MCP SDK client or hardened in-house transport (R1 record).
5. Whether durable history/retained note bytes are permitted, where, and for how
   long, given the vault is Nextcloud-synced.
6. Whether any Graphiti DB exists and permits read-only or managed operation.
7. Authorized extraction/embedding destinations and budget. Default: no external
   inference destination is activated merely by enabling native body search.

All implementation packages are PROPOSED. Read-only document/code research is
complete; no runtime fix or qualification result is implied by this plan.
