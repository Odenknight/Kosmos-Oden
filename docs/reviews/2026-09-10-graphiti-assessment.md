# Graphiti assessment for Kosmos-Oden and GKOS-Engine

Assessed 2026-09-10. Recommendation: retain Graphiti as an optional, rebuildable
semantic-retrieval projection. Qualify a 0.30.2 adapter in a separate integration
effort; do not change the current release's Engine or Graphiti pins as housekeeping.

## Verified upstream version

Latest stable: **graphiti-core 0.30.2**, published **2026-09-08 20:38:41 UTC**,
tag commit `eaa4128681bc53487138a4bbc22d58336ebe70d2`. The live GitHub latest-release
API reports `prerelease: false`. Luna's initial cached listing stopped at 0.29.3;
that version conclusion was rejected and rechecked against the live API.

Sources: [0.30.2 release](https://github.com/getzep/graphiti/releases/tag/v0.30.2),
[latest-release API](https://api.github.com/repos/getzep/graphiti/releases/latest),
[immutable source](https://github.com/getzep/graphiti/tree/eaa4128681bc53487138a4bbc22d58336ebe70d2).

The 0.30 series is relevant to an eventual upgrade: database routing fixes,
request-scoped multi-group driver isolation, Saga cleanup, FalkorDB full-text
performance, and fact-result entity/episode provenance fields. Custom Neo4j
database deployments need an explicit migration review: earlier reads could
target the home database while writes targeted the configured database.
[0.30.0 release](https://github.com/getzep/graphiti/releases/tag/v0.30.0),
[0.30.2 release](https://github.com/getzep/graphiti/releases/tag/v0.30.2).

## Verified capabilities and API limits

Graphiti incrementally extracts entities and relationships from structured or
unstructured episodes, links facts to provenance, tracks temporal validity and
invalidation, supports custom ontology, and combines embeddings, keyword search
and graph traversal. It requires Python and a graph backend: Neo4j, FalkorDB or
Neptune/OpenSearch; Kuzu remains shipped but deprecated. Embedded FalkorDB is
also offered. Extraction and embeddings default to OpenAI; alternative hosted
and compatible local providers can be configured. Structured-output reliability,
model cost and database operation remain deployment responsibilities.
[Tagged README](https://github.com/getzep/graphiti/blob/v0.30.2/README.md).

The experimental MCP server offers ingestion, fact/node search, temporal filters,
provenance, communities and deletion/clear operations over HTTP or stdio. It is
a broader, writable surface than the Kosmos read-only agent interface; protocol
compatibility with the current Hermes setup remains untested.
[Tagged MCP documentation](https://github.com/getzep/graphiti/blob/v0.30.2/mcp_server/README.md).

Two compatibility limits survive in 0.30.2:

- Public `add_episode` does not accept `episode_metadata`. Carrying metadata in
  the serialized body is not proof of indexed, enforceable metadata filtering.
- Public `add_episode_bulk` calls `extract_nodes_and_edges_bulk` without passing
  `use_combined_extraction`; that utility defaults the flag to **False**. Neither
  public ingestion signature exposes the flag. Luna initially inferred combined
  mode from the utility name; direct source inspection disproved that inference.
  Keep the existing low-level-only caveat and benchmark requirement.

Evidence: [tagged ingestion implementation](https://github.com/getzep/graphiti/blob/v0.30.2/graphiti_core/graphiti.py),
[tagged bulk utility](https://github.com/getzep/graphiti/blob/v0.30.2/graphiti_core/utils/bulk_utils.py).
Awaited core ingestion completes its write pipeline; the Kosmos acceptance
contract should still measure persistence and retrieval separately. A reused
episode UUID is not evidence of deterministic LLM reprocessing or correct
changed-content reconciliation.

## What is actually installed in this product

Reviewed Kosmos source: main `b0c7ee2845f24c53586c5bc6feaa9ae28fbff50b`, version
0.8.3 candidate. It pins TypeScript GKOS-Engine 2.2.0 candidate at
`650eab4a6752227cae336d7556a57826c22a0d5a`. The installed Engine source declares
`GRAPHITI_CORE_VERSION = "0.29.0"`; this is the generated Python sample/profile
target, not evidence that a Python Graphiti service is installed or qualified.

- Engine owns deterministic episode construction, origin separation, stable
  identity, chronological serialization and adapter-profile values.
- Kosmos supplies the vault/provider context and sensitivity-filtered export
  through `qEpisodes`; standalone exports use their own local viewer context.
- `graphiti_ingestion_status` reports `export-ready`, `searchable: false` and a
  required upstream read-after-ingest check. Kosmos does not manage a Graphiti
  ingestion queue, run Graphiti search, or provide a completed ingestion receipt.
- The generated Python sample is a separate user-run ingestion path. It supports
  FalkorDB/Neo4j and awaits `add_episode`; its subsequent “searchable” text and
  `accepted_is_searchable: True` exceed the evidence it measures because it does
  no read-back query. Record this as an adapter follow-up, not a proven live
  retrieval failure.

Local evidence: `src/plugin/agent-server.ts` (`qEpisodes`,
`qGraphitiIngestionStatus`); `src/plugin/main.ts` (`SAMPLE_INGEST_PY`);
`src/plugin/vault-provider.ts`; `docs/KOSMOS-GOVERNED-CONTEXT-PROJECTION.md`;
the exact-pin Engine's `src/graphiti.ts`.

## Fit and boundaries

The following is an architectural recommendation, not a claim of implemented
or benchmarked integration.

| Surface | Useful role | Required boundary |
| --- | --- | --- |
| Current Kosmos | Export authorized episodes for optional external experimentation | Preserve ordinary local deterministic operation and accurately report export-only readiness. |
| Future Kosmos search/Notes | Semantic matches, related entities, temporally relevant facts, source-backed exploration | Reauthorize source references before presenting results, summaries, counts or trails. Clearly label inferred results and keep source navigation available. |
| Current TypeScript Engine | Maintain a versioned export contract and fixtures | Keep dependency-free semantic projection separate from network/database/model execution. |
| Future Engine service | Own the optional ingestion/retrieval adapter, checkpoints, receipts, retry policy and provider configuration | Derive each request from an authorized corpus/context; Graphiti results never grant access or semantic authority. |
| Future Rust Engine | Preserve deterministic export parity behind the same contract; connect to an external Python service if selected | Rust plans are future scope, not evidence of an installed port. Do not embed a mandatory Python/graph stack in the pure core. |

Graphiti should remain downstream of accepted source semantics. Proposed or
inferred relationships must return as derived/proposal records with provenance;
they must not overwrite authored or approved GKX fields. Do not create separate
human and agent semantic authorities. Shared contracts can support distinct
authorized contexts without claiming that existing viewer/API snapshots match.

Temporal graph history can support historical retrieval, but it cannot recover
source edits overwritten before ingestion. GKOS `known_at` needs retained,
authoritative observation/transaction history; Graphiti's ingestion timestamps
cannot substitute for it. Keep event validity, source modification, processing
and ingestion times separate.

Namespace/group filtering is useful partitioning, not sufficient authorization.
An entity summary derived from multiple episodes may retain information from a
now-restricted source. Enforce policy before ingestion and retrieval; qualify
reclassification, deletion and derived-data removal. Gate caches by policy and
source revision. Stable UUIDs alone prove neither deduplication nor correct
updates after edits.

## Suggested qualification sequence

1. Keep the current release unchanged. In a synthetic environment pin Graphiti
   0.30.2, backend image, model, embedding model/dimensions and adapter revision.
2. Exercise export -> awaited ingest -> UUID/provenance read-back -> scoped search.
   Distinguish accepted, completed, persisted and searchable states. Test empty
   extraction, failures, retries, duplicate delivery and same-UID changed content.
3. Test overlapping names/UIDs across corpora, concurrent group queries, restricted
   sources, scope changes, source deletion, invalidation and rebuild. Do not use
   a full-vault graph to satisfy a narrower caller by relying only on output text
   filtering.
4. Compare existing lexical/typed retrieval with hybrid retrieval on authored
   fixtures: recall@k, citation correctness, entity recall, edge precision,
   forbidden-result count, p50/p95 latency, ingestion duration and token cost.
   Require zero forbidden results and traceable sources; set quality/latency/cost
   acceptance targets before evaluating.
5. Expose only a GKOS-controlled retrieval/status interface to ordinary agents.
   Keep Graphiti mutation/admin operations in a separately authorized ingestion
   service. Benchmark local model configurations before describing them as an
   equivalent private replacement for hosted extraction/embedding services.

No database deployment, dependency upgrade, real-vault ingestion or live Graphiti
test was performed for this assessment. Current Hermes/specification/conformance
release gates remain open.
