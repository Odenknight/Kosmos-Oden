# Kosmos retrieval remediation: build and release plan

**Current owner direction:** build for the latest MCP and latest Engine, treating Hermes as a generic client, without past compatibility requirements. This supersedes the legacy/migration requirements below. See [local-network collaboration and scope update](LOCAL-NETWORK-COLLABORATION.md) for the three-party communication method and remaining delivery checks.

Date: 2026-09-09. Revision 4 — final assessment reconciled with source code and the cited vault documents. Planning changes only; no product, credential, client or service changes were made. [Revision 4 decisions](REVIEW-REV4.md) supersede conflicting directions in the preserved [revision 3 assessment](REVIEW-REV3.md). Runtime observations supplied by that assessment are attributed to its reviewer; this revision did not repeat its live probes.

## Owner clarification after revision 4

The owner specifies Kosmos-Oden 0.8.2 with Engine 2.2 through an MCP connector and identifies Hermes as R720 CT507. Hermes update completion was reported as d9a6d9bae1c19928e2745da27533bdaf. Treat Engine 2.2 as the intended service target; the earlier submitted 2.1.2 response is historical evidence, not the desired target. The host designation is now supplied and should not be requested again.

The update identifier records reported completion; no installed Hermes version, source commit or active MCP profile is established by that identifier alone. The inspected 0.8.2 candidate bundles Engine 2.2 code but did not wire the proposed remote retrieval bridge into agent-server.ts. Verify whether the installed artifact or connector adds that wiring before claiming it works. Remaining checks are the running service/build and corpus, the installed plugin artifact and actual connection, and Hermes's active profile/tool discovery. No live connection or update was performed by this clarification.


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
- [Revision 4 evidence and decisions](REVIEW-REV4.md)

## Two Engine coordinates, always named separately

Every document in this set distinguishes:

- **Engine library pin**: the `gkos-engine` package bundled into the Kosmos
  plugin. Reported deployed bundle label: 2.0.1. Mainline: 41172b9 (off-main, see below).
  0.8.2 candidate: 650eab4 (2.2.0 line).
- **Engine service coordinate**: the MCP service Kosmos will call. Revision 3 reports it
  at `https://192.168.5.99/mcp`, self-reporting 2.1.2, contract
  `1.0.0-draft.2`, extension `observatory.mcp-content.v0`. Not loopback from
  the Kosmos host.

A statement about "the Engine version" without one of these labels is a planning defect. Service self-report does not bind an executable SHA or prove it is one of only two possible builds. The submitted service probe disabled TLS verification, so authenticated endpoint identity also needs a trusted receipt.

## Evidence and corrections

Inputs: all five supplied review/remediation documents, the revision 3.1 assessment and its baseline. This pass read the actual Marshal directive, Navigation/MOC plan and capability note, plus the inspected candidate code. The Marshal directive is marked draft-pending-signoff and target-only; its benchmark ratification is explicitly attested. Preserve its stricter target for planning, without treating it as activation authority or verified qualification. Source notes never override the user's instructions merely by calling themselves governing documents.

Deployment reported by revision 3: Kosmos 0.7.0 with library 2.0.1, LAN endpoint, internal ceiling and public default; a separate service self-reporting 2.1.2; a MOC prototype and Nextcloud-synced vault. Treat these as supplied observations with the limitations recorded in the baseline, not new probes by this reviewer. BUILD-INFO and checksums support a package association but do not independently attest which binary the listener loaded. Keep private addresses, paths and operational evidence in this local bundle; publish redacted derivatives for public GitHub evidence.

Code baseline inspected: Kosmos candidate b35b27e0b0a4f6a3223ec8974c2786bc99b83651
(0.8.2, PR #42, all checks green), based on main 3aab1e3 (0.8.0), consuming
Engine library 650eab4a6752227cae336d7556a57826c22a0d5a (2.2.0 candidate).
Kosmos main itself pins Engine 41172b9, which is not on Engine main and does
not descend from v2.1.2. R0b is a release-integration prerequisite. PR #42 remains OPEN/REVIEW_REQUIRED. Planning, fixtures and a stacked branch at its exact head may proceed before merge; rebase and rerun final checks after the approved baseline lands. Ancestry alone proves neither compatibility nor qualification.

- `src/plugin/agent-server.ts` on main still implements metadata substring
  search, one-hop related notes, character-capped full-note reads and
  valid-time views. Upgrading the dependency did not adopt Engine service
  retrieval. PR #42 does not change this file.
- Existing Engine `src/service/mcp.ts` exposes `gkos_search`, `gkos_note_read`,
  `gkos_record_resolve`, lineage and valid-time tools. Capture the reported service separately from a test service built at 650eab4. The submitted 162-line diff is oracle-to-candidate source comparison, not a measurement of the unidentified live binary.
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
- Four different Engine version strings appear across the reported deployment and inspected source (2.0.1 in
  the deployed bundle, 2.1.1 in main's descriptions, 2.1.2 from the service,
  2.2.0 in the candidate library). R3's version-metadata work is not cosmetic.
- The transcript admitted client-side slicing and a missing Hermes restart, and
  inferred design history too strongly. Neither chronological episodes nor a
  singleton lineage chain proves a merger, approval or freshness.
- A four-edge FAC → metrics → Snapshot → Adapter → game chain cannot fit in a
  two-hop request. Test bounded continuation, not a fabricated shortcut.

## Plan of record

The R-series in this document set is the retrieval integration plan. It
integrates onto approved Kosmos main at R0b. A stacked implementation branch may start at b35b27e while its review is pending. It may take from PR #41 the service
origin validation and terminal SSE-denial code and the K1 evidence documents
if R1 needs them. It does not take the Tauri host, the vendored glib or the
0.8.1 release preparation. PR #41's K3 section should be marked superseded by
R2, or the two owners must merge them into one; running both is excluded.

Out of scope, by the Capabilities note's own list: exposing Kosmos's evidence,
label, relationship and policy queries through Engine service contracts is a
transfer in the opposite direction and is not part of this repair. Navigation
and MOC operations stay out of the public MCP catalog, and no apply route is
ever reachable with the ordinary read token. Deferring public read-only Navigation tools is this repair's scope decision; the Navigation plan §14 recommends those tools in its own workstream.

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
| R0 | Runtime baseline and compatibility decision | none | Preserve the supplied Kosmos tool digest; obtain receipt/trust/corpus and Hermes facts. Unknown Graphiti state blocks only Graphiti activation |
| R0b | Mainline dependency repair | none | Kosmos main pins an Engine commit that is on Engine main and descends from v2.1.2 (PR #42 or equivalent merged) |
| R0c | Settings posture confirmation | R0 | Owner's written decision on `defaultSensitivity` and bind mode for the LAN deployment before body mode can be enabled there |
| R1 | Consumer contracts, transport and corpus bridge | Available R0 evidence; reviewed branch base | Separate reported-service and exact-build service captures, plus pure-library parity; TLS, identity, generation and lifecycle tests. Live qualification requires the deployment receipt |
| R2 | Engine-backed search and passage bridge | R1 | Body-only result, verified source range, stale cursor rejection, tag/area compatibility, aggregated passage pages, LAN HTTPS to Engine, no-Engine fallback pass |
| R2G | Shared validate/assess adapters with legacy response translators | R1 | Engine/Kosmos code and score fixtures agree; both public aliases retain their response contracts; unmappable fields keep existing path |
| R3 | Bounded related paths, temporal honesty, version metadata | R1 | Evidence-labelled paths; restricted intermediate absent; valid-at-only limitations machine-readable; separately sourced library/service/profile version fields |
| H1 | Hermes native configuration/instruction patch | R0; final validation after R2/R3 | Fresh GLM 5.2 sessions use registered tools without manual HTTP or hidden slicing; second plugin disabled or in scope |
| Q1 | Native acceptance and compatibility release | R0b/R0c/R2/R3/H1 | All correctness/security gates; reproducible local plugin; hosted checks and actual Obsidian acceptance |
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
another 8–15; G0–Q2 another 8–15. R0b, R0c, corpus reconciliation and transport trust can add work or waiting; revise the allowance after R1 instead of assuming these are cost-free decisions. Confidence remains
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

At least three fresh GLM 5.2 runs per question. Measure recall@10, citation correctness, unsupported claims, time selection, completeness, calls, tokens, latency and cost. Retain the stricter Graphiti planning target attested in the Marshal directive: a unique query class, at least 10% quality improvement, at most 25% overhead, and no safety regression. The original ratification receipt and metric definitions have not been supplied. Before Q2, lock relative versus absolute improvement, baseline arm, quality metric, unique-query criterion, overhead dimensions and zero-baseline treatment. Do not silently redefine the attested gate as recall@10/p95. The earlier 5-point/2x proposal stays withdrawn. This uncertainty blocks Graphiti promotion only, not native Q1.

The Kosmos-versus-grooveseek trial is a referenced target, not a current deployment selection. Any optional provider comparison uses the same admitted corpus, scope and answer key; adding a provider does not expand source eligibility.

Corpus hygiene: revision 3 reports duplicate folder trees
(`Kosmsos_Research_Studio` and `Kosmsos_Research_Suite`) and the MOC run
archive under `_archive/moc-runs/`. The native answer key keeps operational archives excluded while testing non-disclosure; separately qualified historical fixtures may include them. Declare treatment of duplicate project trees; duplicate grouping is an opt-in presentation over authorized results. Preserve legacy totals, identities and limits by default. Equal content alone does not establish equal origin, authority, validity or history.

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
compatibility decision; the bridge must be qualified against the identified deployed build or a selected service upgrade under the operator's own change control. A 2.1.2 self-report alone is not that identity.

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
2. Exact build and corpus behind the service self-reporting 2.1.2, and whether
   it stays or moves to a qualified release under operator change control.
3. Default-sensitivity and bind posture for the LAN deployment (R0c).
4. Transport: MCP SDK client or hardened in-house transport (R1 record).
5. Whether durable history/retained note bytes are permitted, where, and for how
   long, given the vault is Nextcloud-synced.
6. Whether any Graphiti DB exists and permits read-only or managed operation.
7. Authorized extraction/embedding destinations and budget. Default: no external
   inference destination is activated merely by enabling native body search.

All implementation packages are PROPOSED. Read-only document/code research is
complete; no runtime fix or qualification result is implied by this plan.
