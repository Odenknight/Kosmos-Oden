# Plan B — Known-at history with optional Graphiti projections

Revision 2, 2026-09-09. The supplied matrix confirms that known-at requires a new
contract rather than an existing Engine tool alias. Its tag/oracle and scope
corrections are recorded in [the reconciliation](ADOPTION-MATRIX-RECONCILIATION.md).
No new evidence of a live Graphiti database or retained history was supplied.

Status: proposed product contract and implementation plan. These semantics are
not claimed to exist in GKOS-Engine, the GKOS Standard or Kosmos 0.8.2 today.
Review them with the Engine/Standard contract owners before public API activation.

## The useful distinction

Graphiti can help answer a historical question, but the question must name whose
knowledge and which clock. Define three separate bases:

| Basis | Meaning | Evidence required |
| --- | --- | --- |
| `valid_at=V` | The fact/state asserted to hold at domain time V | Source/accepted-event validity interval and its provenance |
| `known_at=K, knowledge_basis=source_observed` | What this identified Kosmos observation store had durably recorded by K | Append-only source observation/revision history |
| `known_at=K, knowledge_basis=projection_published` | What this identified derived projection had made queryable by K | Published immutable projection generation and retained fact versions |

Neither known-at basis means a person knew something at K. It also does not prove
canonical approval. Capture canonical acceptance as a separately typed event
with its own receipt if present; never use an LLM inference as that receipt.

Example: source revision R1 is observed September 3 and says a design applies
from August 1. On September 9, R2 corrects it effective September 1. A query for
valid-at September 5 **as known September 4** must still return R1's earlier
assertion. The same valid date **as known September 10** returns the corrected
assertion, with R2 as evidence. A later correction cannot silently rewrite the
earlier answer. Graphiti ingest on September 11 is a third event, not either
source-observation time.

## What upstream Graphiti supports, and its limit

Graphiti has edge dates and temporal search filters including `valid_at`,
`invalid_at`, `created_at` and `expired_at`. They make it useful as a derived
temporal index. [Upstream search filters](https://github.com/getzep/graphiti/blob/main/graphiti_core/search/search_filters.py).

However, upstream contradiction handling can modify an existing edge's end date
and expiry. A present-day edge therefore is not by itself an immutable historical
version. Treat this as a design constraint: test the chosen release against
late-correction replay before claiming known-at behavior. [Upstream edge maintenance](https://github.com/getzep/graphiti/blob/main/graphiti_core/utils/maintenance/edge_operations.py).

The inspected Engine adapter declares Graphiti 0.29.0 and exports origin-separated
episodes. That compatibility label does not prove an operating DB, write-free
initialization, retained history or idempotent ingestion. Pin Graphiti/driver to
an exact qualified version, capture its API/schema digest, and test the mapping.
The upstream links above were inspected on 2026-09-09 and are moving references,
not deployment pins. Recheck the chosen release during G1.

Recommendation: maintain a small durable temporal ledger as the reconstruction
source; use Graphiti as a rebuildable projection and candidate finder. Start with
source-observed known-at without requiring Graphiti. Add projection-published
known-at once managed/read-only generations can prove their publication history.

## T1 — durable observation history

Suggested host-side modules: `src/history/observation-contract.ts`,
`observation-writer.ts`, `revision-store.ts`, `history-store.ts`, with an explicit
storage adapter. Durable storage is opt-in and outside source Markdown. Prefer
the Engine host for reusable capture semantics; if its public API is insufficient,
add a reviewed host extension rather than importing private Engine internals.

Store immutable observation records containing:

```text
schema_version, corpus_id, observer_id, event_id, sequence
source_uid_or_record_key, canonical_path_at_observation
revision_digest, raw_content_digest, revision_storage_ref (nullable)
event_kind: baseline | observe | correct | remove | restore | access_change
observed_at, durable_recorded_at, authored_time (nullable), time_provenance
origin_layer, accepted_event_receipt (nullable), parent_event_id (nullable)
authorization_scope_epoch, payload_digest, previous_event_digest
```

Record raw-byte digests separately from Engine normalized content digests. A UID
may not exist in plain Markdown: use a scoped Engine record identity and document
rename/identity limitations; never generate and write a UID into the note merely
to enable history. Same-path replacement is a distinct revision/event.

Use host timestamps plus a monotonically increasing committed sequence. Detect
clock rollback; record the raw clock and ordering evidence rather than backdating
history. Commit records before acknowledging the observation; make event IDs
idempotent, use a single-writer lease/transaction and recover partial commits.
A hash chain detects some corruption but is not trusted time or tamper-proof
proof by itself. Backups/retention and actor integrity remain part of operations.

On initial scan, capture a baseline at the actual observation time. Source YAML
created_at, file timestamps, Graphiti reference_time and import dates must not be
substituted for previous system knowledge. Validated prior logs/snapshots may be
imported under a separately identified observer/provenance basis; an old file or
Git commit timestamp alone does not establish what the deployed service knew.

Capture creates, edits, renames, deletes and access changes with bounded backpressure
and durable checkpoints. Events arriving during a scan require reconciliation.
Polling cannot recover revisions overwritten between observations; publish capture
mode, start, gaps and watermark. A dropped queue or watcher outage makes coverage
partial until reconciled, not magically complete. History before the first retained
observation returns `history_unavailable`.

Retained bytes are independently optional. Without them, return metadata history
and `historical_content_unavailable`; never fetch today's body to support an old
revision citation. Apply sensitivity, encryption/retention policy, disk quotas and
deletion policy to both journal payloads and snapshots. If history writes are not
permitted, known-at remains unsupported; no hidden spool or cache is created.

## T2 — versioned projection and query contract

Suggested `src/history/temporal-projector.ts`, `temporal-query.ts`,
`history-authorization.ts`; versioned schema `kosmos.temporal.v1`.

Separate two operations:

1. Select source observations/claim versions visible at K for the named observer.
2. Evaluate their asserted validity at V, using only those selected versions.

Represent claim versions with immutable payload and intervals:

```text
claim_id, claim_version_id, source_revision_refs[], source_event_refs[]
value_origin, assertion_payload_digest, assertion_payload
valid_from, valid_to, validity_status: known | unknown
recorded_from, recorded_to, knowledge_basis, observer_or_projection_id
derivation_version, acceptance_receipt_ref (nullable)
```

Physical records are append-only; a closing/correcting event creates the logical
recorded_to boundary. Do not mutate an older claim's validity interval in place.
Preserve separate transaction versions for both the old and new effective claims
when a correction partitions an earlier open-ended interval.

For versions with known start times, use half-open intervals:

```text
recorded_from <= K AND (recorded_to is open OR K < recorded_to)
AND valid_from <= V AND (valid_to is open OR V < valid_to)
```

An open upper bound means no end recorded; unknown lower bounds are explicitly
unknown, not negative infinity. Return unknown-time evidence separately when
requested, with no assertion that it was valid at V. Validate offsets, equal
boundary behavior, malformed dates and timestamp/sequence ties with fixtures.

Add one explicit tool, proposed `query_history`, without repurposing existing
graph_at_time. Inputs: query or source selector, optional valid_at, required
known_at and knowledge_basis, bounded area/type filters, page limit and cursor.
Reject ambiguous known-at requests lacking a basis. Return:

```json
{
  "contract": "kosmos.temporal.v1",
  "time_axes": ["valid_at", "known_at"],
  "knowledge_basis": "source_observed",
  "observer_id": "fixture-observer",
  "history_watermark": "fixture-sequence-42",
  "coverage": "partial",
  "history_start": "2026-09-03T00:00:00Z",
  "historical_content_available": false,
  "results": [],
  "next_cursor": null
}
```

The example is illustrative, not observed output. Results include exact claim
version, source revision, origin, selected time bounds and missing-evidence reasons.
Keep cursor binding to caller, current scope epoch, retained history generation,
query/time basis and watermark. Reject stale or pruned cursors explicitly.

Use **current authorization** to gate access to historical evidence. History never
restores a caller's revoked rights. Apply historical sensitivity restrictions too
where the retained policy requires them, with deny winning uncertainty. Counts,
paths, citations and intermediary IDs obey the same rule. Administrative audits
of past access decisions require a separate role/contract, not this read tool.

Distinguish retrospective source knowledge from past derived knowledge. Re-running
today's extractor over sources observed by K may answer "current reconstruction
from then-observed sources" but must not claim those inferred facts were queryable
then. For `projection_published`, retain exact extracted outputs, model/prompt
versions and generation publication records. LLM reruns cannot reconstruct the
same past projection reliably.

## G0 — use projections before a database exists

Extend episode export with source UID/revision selection, area, origin/event type
and explicit time basis. Use an additive versioned filtered endpoint or optional
arguments; preserve legacy numeric-cursor calls. New opaque cursors bind filters,
caller scope and snapshot generation. Enforce access before paging/counts.

Start from native search results and export only relevant source episodes. Provide
schema-validated immutable packages with source hashes, reference_time provenance,
origin fields and a manifest if file writes are permitted; otherwise stream pages.
Do not assign known_at from an episode's reference_time. A model can summarize
these records as episode analysis with source citations. It cannot turn nearby
timestamps into merger/causation/approval evidence.

## G1/G2 — Graphiti query and ingestion modes

Suggested service modules: `graphiti/manifest`, `ingestion-ledger`,
`worker`, `read-adapter`, `source-map`, `temporal-projection`, `readiness`.
Python Graphiti dependencies stay outside the Obsidian/browser bundle.

| Mode | Behavior |
| --- | --- |
| native_only | Native search/history, bounded export/analysis; graphiti_search_available=false |
| query_only | Read an existing identified snapshot; no schema/index/episode/maintenance writes |
| managed | Separate worker writes a dedicated derived namespace and publishes verified generations |
| unavailable | Structured backend failure/lag plus native fallback; never "no knowledge" |

For query_only, run startup and queries with DB credentials that cannot write,
and assert zero write attempts with driver instrumentation. No lazy initialization,
schema creation or hidden embeddings queue. If the API needs writes, select an
appropriate typed read service or report unavailable. Existing DBs without retained
history support current derived retrieval only, not invented past knowledge.

Managed ingestion steps:

1. Pin Graphiti, driver, DB, schema, model, prompt and adapter versions; select a
   supported backend after qualification, not from the transcript. Explicitly
   authorize each inference destination for the source sensitivity.
2. Normalize Engine episodes into an adapter manifest with corpus identity,
   revision/content digests, source events, origin, effective/observation times
   and their provenance. Keep unavailable fields null. Store unsupported metadata
   in a versioned adapter sidecar rather than dropping it.
3. Compute a logical ingestion key over corpus, source identity, revision,
   semantic event, origin and adapter version. Track attempts and all resulting
   episode/entity/edge IDs. Stable episode UUIDs alone do not make add_episode
   exactly-once; extraction can change edges and entity merges.
4. On an ambiguous commit, reconcile ledger mappings and backend state before
   retrying. Quarantine unresolved cases. Verify durable content/source mappings
   before advancing the checkpoint. Bounded batches, leases and backpressure
   prevent overlapping writers or unbounded queues.
5. Retain immutable extracted fact versions and before/after mappings in the
   ledger, or publish immutable per-generation namespaces. In-place Graphiti
   invalidation must not destroy the earlier temporal answer. Require fixtures
   that prove this under the pinned backend.
6. Publish an active-generation pointer only after all acknowledged items and
   mappings verify; otherwise expose item-level partial coverage. Store native
   source watermark separately from derived publication time and freshness lag.
7. Update/removal/reclassification triggers immediate query-time deny against
   current source policy before background purge/rebuild. Unverifiable or unmapped
   facts cannot be returned as citations. Model-inferred entity merges remain
   reversible; similarity alone never unifies canonical source identities.
8. Demonstrate crash recovery, backup/restore and a rebuild that preserves the
   original observation history. A rebuild's Graphiti created_at values are new
   storage timestamps, not newly fabricated source-known times.

Candidate retrieval must use an authorized view/partition before ranking where
the contract requires it, not a broad privileged Graphiti query followed only by
output filtering. If the chosen backend cannot enforce equivalent scope, return
native-only for that principal. Recheck source access and revision mappings before
return as defense in depth. Do not expose raw Cypher/admin tools to read clients.

For combined known-at queries, select eligible immutable temporal versions first,
then retrieve/rank inside that snapshot (or query its immutable namespace).
Searching today's graph and filtering the top results afterward is not sufficient:
future entities, merges or rankings could affect the past answer. If a qualified
historical index is absent, run bounded deterministic retrieval on retained
versions and report its limits instead of claiming historical Graphiti search.

Native accepted events remain the authority. Graphiti contributes labelled
derived leads/relations and source-mapped passages. Use a documented fusion rule
such as rank fusion, not raw-score addition. Surface conflicts, missing evidence
and lag without silently converting derived assertions into effective GKX values.

## Temporal and Graphiti acceptance matrix

| Fixture | Expected result |
| --- | --- |
| Late-arriving note, old authored date | Excluded before actual observation; never backdated |
| Retroactive correction after K | Earlier known-at answer unchanged; later K selects corrected version |
| Claim changes valid September 1, learned September 9 | Separate domain and observation intervals; all boundary queries correct |
| In-place Graphiti invalidation/merge | Prior projection-published answer still reconstructible from retained version/generation |
| New extractor/model/rebuild | New projection ID/publication time; no rewritten observation history |
| Initial import with no journal | No claimed history before baseline; no historical bytes fabricated |
| Watch outage / dropped queue / clock rollback | Explicit gap/ordering status; no complete-history claim |
| UTF-8 passage with changed/pruned revision | Exact old bytes or explicit stale/unavailable; never current replacement bytes |
| Restriction/deletion while DB lags | Zero restricted source IDs, counts, edges or quotations |
| Repeat ingest / commit-before-checkpoint crash | Reconciled logical events with no unaccounted duplicate/lost items |
| No DB / read-only DB / outage | Useful native answer and truthful mode; zero unintended writes |
| Sol/Fable chronology without explicit merger record | Evidence gap, not invented causation |
| FAC four-edge route with two-hop request cap | Bounded continuation with all four supported edges, or honest incomplete path |
| Backup restore after retention pruning | Declared retained coverage; no resurrected forbidden snapshots |

Disable known-at in capabilities until T1/T2 tests pass. Enabling Graphiti alone
must never flip it to supported. Ship source-observed and projection-published
support separately if only one is qualified. The user-facing distinction should
read "Observed by Kosmos by …" versus "Available in the derived graph by …".
