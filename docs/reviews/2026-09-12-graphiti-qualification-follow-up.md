# Graphiti qualification follow-up: verified findings and agent handoff

Date: 2026-09-12
Standing: Source-level assessment and proposed qualification work; not runtime qualification.
Disposition: Accept Graphiti as an optional qualification target with the amendments below.

## Purpose and scope

Preserve the findings from the follow-up review for future Kosmos-Oden and GKOS-Engine agents. This document supplements the [September 10 assessment at its reviewed commit](https://github.com/Odenknight/Kosmos-Oden/blob/3146fb53377b3a5f079b77c7b31e705bf2cfe262/docs/reviews/2026-09-10-graphiti-assessment.md).

No Graphiti deployment, real-vault ingestion, isolation benchmark, recovery test, or live retrieval qualification was performed. Findings about source behavior are distinct from demonstrated runtime outcomes. Reconcile these observations against the exact implementation candidate before changing code.

This documentation addition does not activate ingestion, authorize a dependency upgrade, qualify a backend, or grant agents Graphiti mutation authority.

## Evidence inventory

The earlier review's source-access limitation accurately described that review. Subsequent successful GitHub retrieval supersedes that limitation; another reviewer's assertion alone would not establish independent verification.

| Source | Reviewed reference | Evidence |
| --- | --- | --- |
| Kosmos assessment | Commit `3146fb53377b3a5f079b77c7b31e705bf2cfe262` | Export-oriented integration, separate 0.30.2 qualification, no live tests performed |
| Kosmos sample in `src/plugin/main.ts` | Same commit; blob `203339c723af243c7dc72ddd7f897d9b1a42f5c8` | Completion incorrectly reported as searchability |
| Engine `src/graphiti.ts` | Retrieved from main; blob `b674c65babba76399689dccd897d31a777423c6e` | 0.29.0 target, 2.3.0 adapter schema, non-authoritative projection, read-check requirement |
| Engine `src/paths.ts` | Retrieved from main; blob `9ed8868e40ed9d343394476a4d4051cc7e9dad61` | Non-cryptographic change-detection hash |
| Graphiti core `graphiti_core/graphiti.py` | Tag v0.30.2; blob `237ee07a418b5ad4d66fbc43c62b65d2fef57f9a` | Direct-triplet resolution, identity rewriting, invalidation and persistence |
| Graphiti MCP wrapper | Tag v0.30.2 | Direct-triplet input limitations |

Engine main was read as a moving ref; the recorded blob IDs identify the inspected file contents, not a release qualification or an assertion about every later main revision.

Sources:
- [Graphiti 0.30.2 release](https://github.com/getzep/graphiti/releases/tag/v0.30.2)
- [Tagged core implementation](https://github.com/getzep/graphiti/blob/v0.30.2/graphiti_core/graphiti.py)
- [Tagged MCP wrapper](https://github.com/getzep/graphiti/blob/v0.30.2/mcp_server/src/graphiti_mcp_server.py)
- [Pinned Kosmos sample](https://github.com/Odenknight/Kosmos-Oden/blob/3146fb53377b3a5f079b77c7b31e705bf2cfe262/src/plugin/main.ts)
- [Engine projection implementation, moving ref](https://github.com/Odenknight/GKOS-Engine/blob/main/src/graphiti.ts)
- [Engine hash implementation, moving ref](https://github.com/Odenknight/GKOS-Engine/blob/main/src/paths.ts)

The release page identified 0.30.2 as latest during review and lists routing, concurrent multi-group isolation, Saga cleanup, and FalkorDB search fixes. These establish upstream progress, not GKOS compatibility or production readiness.

## Verified findings

### GF-01 — Direct triplet ingestion is interpretive

In tagged Graphiti core, `add_triplet` generates missing embeddings, resolves endpoint entities when supplied UUIDs are not found, merges supplied properties into resolved entities, and rewrites edge endpoints. It can replace an edge UUID when endpoint identities conflict. It invokes relationship resolution with the LLM client and persists both the resolved relationship and invalidated edges.

The stock MCP wrapper accepts names, a fact, a group ID and optional endpoint UUIDs. It exposes no explicit edge UUID, event-validity timestamp, or episode-provenance parameter.

Consequently, bypassing extraction does not establish deterministic persistence, identity preservation, temporal preservation, idempotency, or complete provenance. The stock MCP surface is insufficient for the proposed deterministic ingestion contract. A core-API adapter remains an experiment requiring evidence.

Acceptance criteria:
- Canonical identity and relationship meaning remain owned by GKOS.
- No cross-scope entity merge.
- Graphiti invalidation cannot redefine canonical relationships.
- Account for model calls and every affected node/edge.
- Verify retries, identity readback, event times and provenance.
- Preserve canonical typed edges in GKOS if Graphiti cannot meet the contract.

### GF-02 — Sample readiness reporting exceeds its measurement

The pinned Kosmos sample awaits `add_episode`, prints a message claiming searchability, and sets `accepted_is_searchable: True` without a retrieval readback. Engine's inspected profile instead sets `acceptedIsSearchable: false` and requires a status/read check.

This is a reporting defect, not proof that retrieval fails. Recheck the current candidate and correct the sample independently of the larger integration. Distinguish accepted, completed, persistence-verified, and search-verified outcomes; leave unmeasured outcomes explicitly untested.

### GF-03 — Change-detection hashes are not evidence digests

Engine's `contentHash()` is explicitly non-cryptographic and unsuitable for authorization. Projection fields include a hashed namespace and source path; the schema hash is explicitly FNV-based. These can be appropriate change-detection identifiers but do not verify source bytes.

Define a separate cryptographic digest over retained source bytes, with encoding and revision semantics. Do not present a path hash or schema identifier as content-integrity evidence. This finding does not assert that every Engine hash or evidence mechanism uses the same algorithm.

## Required architectural amendments

1. **Preauthorize ingestion and retrieval.** Choose permitted corpus/partitions before Graphiti processing and reauthorize before response construction. Cover extraction/reranking prompts, summaries, traversal, caches, logs and telemetry as well as final rows.
2. **Track derived dependencies.** Entity summaries, communities and resolved relationships can combine multiple episodes. A single valid citation does not establish freedom from restricted-source influence. Require sufficient dependency records or scope-homogeneous projections with rebuild/quarantine after scope changes. Do not serve an object into a narrower context if its dependencies cannot be established.
3. **Handle policy races.** Bind requests and caches to policy revision and projection generation. Recheck before returning results. Deny access to revoked/obsolete generations immediately while physical cleanup proceeds.
4. **Separate semantic dimensions.** Origin, governance status, applicability, evidence, dispute state and confidence are independent. Confidence needs evaluator/method context; an uncalibrated score is not assurance.
5. **Use independent evidence checks.** Source identity, byte integrity, supporting passage, semantic support and governance interpretation should not collapse into one “verified” badge or ascending assurance level.
6. **Keep identity mappings explicit.** A document UID is not automatically the identity of every real-world entity mentioned in it. Version mappings between records, canonical entities and projection entities. Suggested equivalence remains derived until governed disposition.
7. **Define historical queries.** Separate effective-at, known-by, and reconstruction using current evidence. Retain source revisions and observations. Historical retrieval obeys current authorization.
8. **Distinguish rebuild from replay.** Pin source manifest, policy, adapter, ontology, backend, extractor, embedder and reranker configuration. Record projection generation and ingestion time. Retain extraction outputs when exact replay is required.
9. **Bound validation claims.** Require zero observed forbidden disclosures across defined fixtures and instrumented paths. Finite tests do not establish universal isolation.
10. **Avoid unsupported rankings.** Remove decimal correctness scores without a rubric. Qualify one backend first; evaluate another to resolve a specific selection risk or limitation.

## Qualification gates and ownership

| Gate | Required exit evidence | Primary ownership |
| --- | --- | --- |
| 1 — Shared contract | Versioned IDs, source digests, scope rules, time semantics, dependency mapping, readiness states, deletion/revocation behavior | GKOS-Engine contracts with Kosmos consumer fixtures |
| 2 — Ingestion | Scoped extraction, persistence/provenance readback, duplicate and changed-content handling, interruption recovery, characterized triplet behavior | Optional adapter/service |
| 3 — Retrieval | Scope and revocation fixtures, citation resolution, labeled unsupported inferences, predefined quality/latency/cost targets | GKOS-controlled broker |
| 4 — Kosmos | Broker-backed discovery and provenance inspection; deterministic operation during backend absence/outage | Kosmos-Oden |

Security begins in Gate 1 and ingestion tests, not only Gate 3. UI development can proceed with fixtures once the shared contract is stable; real-data exposure depends on qualification.

Compare deterministic lexical/typed retrieval against hybrid retrieval. Measure recall, edge precision, citation correctness, forbidden disclosures, latency and ingestion cost. Include mixed-sensitivity summaries, overlapping entity names, concurrent requests, mid-query revocation, deletion, stale generations and unsupported inference.

## Product capability modes

| Mode | Honest capability claim |
| --- | --- |
| No graph backend | Deterministic GKOS navigation/retrieval plus projection export/validation |
| Qualified frozen projection | Read-only semantic retrieval with explicit generation and freshness |
| Qualified writable service | Continuously updated semantic memory, subject to ingestion and retrieval evidence |

A writable backend is needed for ongoing ingestion, not necessarily for querying an already qualified frozen projection. Backend availability alone does not establish qualification.

## Future-agent checklist

- [ ] Read the earlier pinned assessment and this follow-up; reconcile against current source and open work.
- [ ] Recheck GF-02 and correct sample readiness reporting with a focused regression check.
- [ ] Freeze shared contracts and fixtures before independent implementations diverge.
- [ ] Preserve the dependency-free deterministic core and ordinary-agent read-only interface.
- [ ] Qualify structured episodes first; keep direct triplets a separate bounded experiment.
- [ ] Implement dependency-aware revocation and generation-based stale-result denial.
- [ ] Qualify one exact Graphiti/backend/model configuration and preserve its evidence.
- [ ] Implement Kosmos evidence inspection and degraded operation.
- [ ] Record each finding's disposition with candidate commit and evidence; do not mark this source review as a runtime pass.

Recommended next work: correct readiness reporting, then create executable contracts and fixtures. Further agreement among assessments is less useful than demonstrating identity preservation, restricted-data removal, verified readback and retrieval value.
