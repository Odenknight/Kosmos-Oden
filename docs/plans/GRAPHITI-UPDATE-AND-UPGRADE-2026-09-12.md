# Graphiti update and upgrade: Kosmos-Oden and GKOS-Engine

Date: 2026-09-12; reconciled 2026-09-13
Status: active roadmap with bounded adapter/fixture work implemented; full semantic service remains unqualified.
Handoff: [HANDOFF-2026-09-12-GRAPHITI-UPGRADE.md](../../HANDOFF-2026-09-12-GRAPHITI-UPGRADE.md)

## Reconciled implementation and experiment status

The owner authorized continued implementation and normal tested merges on
September 13. This table supersedes the original starting-state descriptions
below; future requirements remain requirements, not completed capabilities.
Engine owns contracts and semantic behavior; Kosmos consumes its pinned API.

| Item | Current disposition | Evidence / remaining gate |
|---|---|---|
| Graphiti dependency/API repair | Merged, target 0.30.2 | Engine PR 54; fixes new-UUID lookup failure, maps returned IDs, verifies persistence and refuses ambiguous retries |
| Source-byte evidence | Engine helper and opt-in Kosmos capture merged (PR 70) | Full UTF-8 revision match, SHA-256, bounded page reads and policy checks; see source-evidence report |
| Hive synthetic experiment | Passed bounded fixture | Exact readback, five provenance-bearing searches, empty-group negative query and cleanup; no real vault ingestion |
| Actual generated runner | Passed bounded fixture | Persistence and duplicate/changed-input refusal, cleanup; this run did not search |
| Observatory storage/model experiment | Passed bounded fixture, published in PRs 67/68 | Storage restart readback; local util4 extraction plus Nomic 768-dimensional embeddings; five scoped searches and cleanup |
| Agent display identity | Implemented and direct native MCP verified; declared tool names take precedence in PR 71 | JEFFREY's actual Hermes header configuration verified; native Hermes traversal acceptance remains open |
| G2 compatibility/contracts | Partial; Engine PR 55 supplies query draft-1 binding/validation | Cross-repository consumer adoption and actual model artifact digests remain; no deployed broker |
| G3 ingestion/safety | Partial | Managed queue, crash reconciliation, generation publication, revocation/purge and concurrent-scope fixtures remain |
| G4 value/performance | Open | Freeze numeric budgets and native baseline before scale/quality/cost comparison |
| G5 broker | Open | No governed semantic broker in the product; keep native fallback and searchable=false |
| G6 consumer | Partial | Export/status/identity exist; semantic result/evidence UI and Hermes acceptance remain |
| G7 promotion | Open | Operational ownership, complete gates, rollback rehearsal and explicit version/release decision |

Latest [query-contract and identity checkpoint](../reviews/2026-09-13-query-contract-reconciliation.md)
records the Engine contract fixture, current native build evidence and the
distinction between Hermes configuration verification and end-to-end acceptance.

The text model's embeddings endpoint returned HTTP 501; the successful
Observatory experiment used the existing separate Nomic endpoint instead.
Unconstrained SDK/backend combinations failed imports; upstream runtime
constraints resolved those failures. Preserve the qualified model factory and
constraints. Endpoint/model names are not immutable model-file digests.

| Experiment | Ingestion | Search observation | Interpretation |
|---|---|---|---|
| Hive core fixture | 22,967.46 ms | Five queries, 20.98–23.36 ms | Synthetic smoke success |
| Engine generated runner | 68,167.69 ms | Not performed | Persistence/retry fixture success |
| Observatory local-model fixture | 12,646.64 ms | Five queries, 18.84–19.44 ms | Synthetic smoke success |

These runs are not a controlled comparison and establish no speedup, quality
gain, universal isolation or production readiness. Raw receipts and failure
boundaries: [Engine adapter](https://github.com/Odenknight/GKOS-Engine/blob/f39cccbacd5d2469b5e17dc0c1ef81d8d59cd9c4/docs/GRAPHITI-030-ADAPTER.md),
[Observatory experiment](../reviews/2026-09-12-observatory-graphiti-staging.md),
[Kosmos evidence export](../reviews/2026-09-13-source-evidence-export.md).

Local item disposition: the previously untracked roadmap/handoff are published
here with reconciliation. Recent implementation is already on main; generated
fixtures, private operating records, logs and native backups remain local.
Old dirty Engine/Kosmos roots and patch sets are preserved. Their broad uplift
trees are not merged wholesale: recover only unique behavior against current
main and retain the published [branch dispositions](../reviews/2026-09-12-branch-disposition.md).
Broader Notes/history/renderer/service work remains separate from G2–G7.

## Outcome

Extend today's authorized Graphiti episode export into an optional, governed
semantic retrieval service. GKOS-Engine owns the contract, ingestion ledger,
authorization and retrieval broker. Kosmos-Oden provides discovery, source
navigation, provenance inspection and honest status. Native deterministic
retrieval remains usable without Python, a database, a model or network access.

This plan consolidates the existing assessment and qualification findings. It
does not claim a deployed Graphiti service or an observed speed improvement.

## Evidence and baseline

- [September 10 assessment, pinned source](https://github.com/Odenknight/Kosmos-Oden/blob/3146fb53377b3a5f079b77c7b31e705bf2cfe262/docs/reviews/2026-09-10-graphiti-assessment.md).
- [Qualification findings and GF-02 disposition, consolidated source](https://github.com/Odenknight/Kosmos-Oden/blob/48f77ae55a92f3d7b4952ee534b611157245d432/docs/reviews/2026-09-12-graphiti-qualification-follow-up.md).
- [Existing future tracks](https://github.com/Odenknight/Kosmos-Oden/blob/48f77ae55a92f3d7b4952ee534b611157245d432/docs/plans/2026-09-10-revised-execution/FUTURE-TRACKS.md).

The reviewed export profile targets `graphiti-core==0.29.0`; this is not an
installed-service inventory. The dated assessment selected 0.30.2 for separate
qualification. Recheck its tag, immutable commit, package digest, advisories,
public API and migration requirements before choosing an upgrade. Do not change
a version constant alone and call the integration upgraded.

GF-02's erroneous searchability claim was fixed in Kosmos PR #61. Preserve its
regression test. Awaited ingestion, persistence readback and searchable retrieval
are separate observations. Direct triplets remain interpretive (GF-01), and
existing non-cryptographic change hashes are not source integrity evidence (GF-03).

## Functionality by product

| Area | GKOS-Engine upgrade | Kosmos-Oden upgrade |
| --- | --- | --- |
| Contract | Versioned request, episode, status, result and receipt schemas | Negotiate supported contract and show explicit unsupported state |
| Ingestion | Optional external adapter, durable ledger, bounded queue, retry/reconciliation and generation publication | Authorized export/operation status; no ingestion on ordinary note traversal |
| Search | Preauthorized hybrid retrieval with native fallback and citation validation | Opt-in semantic search beside native search; label result origin and freshness |
| Evidence | Map derived facts to canonical sources, immutable revisions and supporting passages | Inspect citations, source revision, inference status and separate evidence checks |
| Temporal queries | Distinguish source validity, retained observation and projection publication | State which time interpretation was queried; do not imply missing history exists |
| Changes | Incremental updates, tombstones, revocation and dependency-aware rebuild | Display lag, failed updates and stale projection status without blocking startup |
| Agent access | Read-only broker/status interface; separately scoped mutation capability | Human and agent requests use the same policy semantics; preserve designated names/traversal behavior |
| Availability | Explicit native-only, query-only, managed and unavailable modes | Useful native operation during outage, cancellation or incomplete ingestion |

A qualified frozen projection may support query-only mode. Prove that this mode
does not perform lazy writes using read-only database access and instrumentation.
Graphiti's stock writable MCP server must not become the ordinary agent interface.

## Shared contract and correctness requirements

Proposed fields below require versioned schema review; they are not existing API
promises. Each request/result binds `corpus_id`, authorized scope, policy revision,
source manifest and projection generation. Retain source UID, source revision,
origin, adapter version and canonical-to-projection identity mappings.

Use a separate SHA-256 digest over exact source bytes, recording encoding and
revision semantics. Retain existing lightweight change keys for their original
purpose. A digest establishes byte integrity, not semantic support or authority.
Keep source identity, supporting passage, semantic support and governance standing
as separate evidence fields.

Ledger identity includes corpus, source UID/revision, event, origin and adapter
version. Record attempts and outcomes durably. After a timeout or crash, reconcile
ambiguous backend effects before retrying; do not promise exactly-once model
execution. Changed content with the same UID is distinct from duplicate delivery.

Expose measured milestones: export-ready, accepted, ingestion-returned,
persistence-verified and search-verified, with explicit failed/unknown/stale
outcomes. Search verification records query, authorized scope, expected source
identity, observed result, generation and timestamp. It proves that check, not
universal search readiness. Empty extraction has its own outcome.

Preauthorize all processing, including extraction, summaries, communities,
traversal, reranking, caches and telemetry. Group IDs alone are not authorization.
Recheck policy before returning a response. A policy change immediately denies
stale generations even while physical deletion is pending. Derived records need
dependency tracking or scope-homogeneous projections; quarantine/rebuild objects
whose restricted-source influence cannot be ruled out.

Canonical typed relationships remain GKOS-owned. Structured episode ingestion is
the first qualification path. Triplets are a separate experiment: measure entity
resolution, identity rewriting, invalidation, model calls and provenance readback.
Inferences may become reviewed proposals, never silently authored/approved GKX.

Historical retrieval obeys current authorization. Do not derive `known_at` from
file modification or ingestion time. Retain authoritative observations before
offering known-by queries. A rebuild may invoke nondeterministic models again;
exact replay requires retained extraction outputs and pinned configuration.

## Performance implementation

Keep ingestion and database/model work off Obsidian startup and rendering paths.
Use incremental source revisions, bounded batches, backpressure, request deadlines
and cancellation. Limit concurrency by measured backend/model capacity rather
than unbounded parallel calls. Interactive retrieval must not wait behind a full
reindex; apply separate bounded admission budgets.

Cache only within corpus, scope, policy revision, generation and query/model
configuration. Revoke access immediately on policy change. Bound cache memory and
queue depth; make rejected or deferred work observable. Reuse unchanged extraction
only when its full semantic configuration and authorized inputs match.

Benchmark supported public ingestion APIs before considering internal bulk APIs.
The reviewed 0.30.2 assessment did not establish combined extraction through the
public bulk API. Keep low-level experiments isolated from the supported adapter.
Choose one backend first; compare alternatives only for a documented limitation.

## Qualification and benchmark matrix

Use generated, authorized synthetic corpora with fixed manifests and labeled
queries. Run native lexical/typed retrieval as the baseline, then the selected
Graphiti configuration on the same eligible corpus. Distinguish cold/warm runs,
initial ingestion, steady-state updates and concurrent query/update workloads.

| Test lane | Required measurements or assertions |
| --- | --- |
| Scale: 1k, 10k, 50k notes | Wall time, throughput, peak process/container RSS, database size, queue depth; report resource-limited lanes as incomplete |
| Quality | Recall@10 and nDCG@10 on fixed relevance labels; entity recall, typed-edge precision, citation correctness and unsupported inference rate |
| Latency | End-to-end and backend p50/p95/p99, cold/warm, concurrency 1/4/16, timeout/error counts; include failed requests |
| Updates | Single note and 1% changed corpus; publication lag, duplicate effects, extracted/model calls and token/currency cost |
| Recovery | Process stop during ingest, ambiguous timeout, rate limit, database outage and restart; lost/duplicate work and recovery duration |
| Isolation | Overlapping names across corpora, mixed-sensitivity summaries, concurrent scopes, mid-query revocation, stale caches and generations |
| Deletion | Immediate retrieval denial, descendant/summary invalidation, eventual physical purge and rebuild verification |
| Kosmos | Startup responsiveness and frame timing during ingest, cancellation, stale selection responses, offline fallback and native Hermes acceptance |

Record hardware, OS/runtime, exact package/backend/model/embedding/reranker
versions, settings, source manifest, policy, random seeds, warm-up, repetitions
and instrumentation. Use at least five measured runs per applicable workload and
report distributions; never hide failed runs in latency summaries.

Before candidate runs, freeze a benchmark manifest with numeric memory, latency,
ingestion-lag and cost budgets appropriate to the selected machine. Existing
suggested targets of 10% quality gain and 25% overhead are hypotheses until their
denominators are defined. A proposed comparison is relative Recall@10 improvement
over nonzero native Recall@10 and relative p95 interactive latency overhead on
the same workload. Report absolute recall too. If the baseline is zero, use an
explicit absolute target instead. No threshold is a measured result yet.

Promotion requires zero observed forbidden disclosures in the defined instrumented
fixtures, resolvable citations for results claiming source support, passing
revocation/recovery tests, and the predeclared performance/quality budgets.
Finite fixture success is not universal isolation or complete GKOS/GKX conformance.
If semantic retrieval adds insufficient value or exceeds budgets, retain native
mode and document the failed candidate rather than weakening correctness gates.

## Work packages and sequence

| Package | Owner boundary | Deliverable and completion evidence |
| --- | --- | --- |
| G2: compatibility and contract | Engine contract maintainer with Kosmos consumer review | Exact dependency/configuration manifest; public API/migration review; schemas and cross-repository fixtures |
| G3: ingestion and safety | Optional Engine adapter/service | Ledger, scoped ingestion, readback, crash recovery, dependency revocation and passing adversarial fixtures |
| G4: performance and value | Qualification runner | Frozen benchmark manifest, native baseline, raw runs, quality/cost report and explicit pass/fail per budget |
| G5: Engine integration | Engine integrator | Broker, modes, cancellation, bounded resources, release package tests and outage fallback |
| G6: Kosmos integration | Kosmos maintainer | Opt-in search/status/evidence UI, consumer compatibility, browser tests and native Obsidian/Hermes receipt |
| G7: promotion | Release owner | Exact artifact hashes, migration/rollback rehearsal, operational ownership and scoped release notes |

G2 comes first. Synthetic fixtures and benchmark definitions can be prepared
without a live service. G3/G4 evidence feeds G5; G6 can use fixtures before live
qualification but cannot claim production readiness. Actual staffing is not
assigned by this document. Keep an eventual Rust Engine adapter outside the
deterministic core and require the same contract fixtures rather than assuming
parity with TypeScript.

The Observatory lab can carry synthetic contract and benchmark receipts; its
existing catalog is not a complete Graphiti or GKOS/GKX qualification suite.
Windows 11 Obsidian remains the official Kosmos plugin test. JEFFREY's native
Hermes result must identify build, client, commands, scope and observed behavior.

## Migration, rollout and rollback

Inventory the actual service first. If none exists, this is a new optional
installation, not a migration of an existing database. For an existing service,
retain a tested snapshot and review database routing, schema/index and model
compatibility against the selected exact release.

Build a candidate projection in a separate generation, verify identity/scope and
readback, then switch publication only after gates pass. Keep rollback to native
mode available immediately. A previous generation is reusable only if it still
satisfies current authorization; rollback must not resurrect revoked content.
Retain failed-run evidence and document purge/rebuild behavior.

No live vault ingestion, dependency installation, deployment or runtime change is
performed by creating these documents. Reassess versions when implementation is
complete: a compatible opt-in capability may warrant a minor product release;
breaking contracts require an explicit compatibility decision. This plan does
not advance Kosmos beyond its current 0.8.3 candidate or invent an Engine version.

## Completion report

Publish commit and artifact identities, selected configuration, contract version,
GF-01/GF-02/GF-03 dispositions, tests passed/failed/untested, raw benchmark receipts,
migration/rollback results and remaining limitations. State explicitly whether
Graphiti was actually utilized and which operations were exercised. Performance
claims must link measured evidence; source inspection and export success alone
cannot qualify ingestion, retrieval or operational performance.
