# Future Kosmos-Oden and GKOS-Engine tracks

These tracks preserve the useful parts of retrieval rev4 and the governed Notes workspace proposal. Contract research and synthetic fixtures can proceed alongside release repair. Product implementation and promotion follow R3 and release sign-off. Until then, Notes/governance and Graphiti work is limited to interface design, research and isolated fixtures; it must not alter the provider or the release candidate. Sequence larger work as native governed retrieval → authoritative temporal history → optional Graphiti qualification/promotion. None is evidence that the current release blocker has passed.

## Native retrieval first

Retain existing native behavior while qualifying any Engine service bridge. Bind corpus identity, source revision/digest, authorized scope and generation before accepting results or citations. A vault name or note count alone is not a sufficient identity proof. Keep compatibility between Kosmos's transitive lineage walk and Engine's direct-neighbor paginated lineage explicit; do not silently replace one with the other.

Separate **N1 contract design**, **N2 synthetic scope/pagination fixtures**, and **N3 adapter implementation** into claimable packages. N1 and N2 run concurrently and reconcile before N3. Assign new adapter modules to one writer; have a separate reviewer verify mismatched corpus/generation, revocation, Unicode/page boundaries and partial-content continuation. Preserve legacy substring search defaults when adding opt-in term matching. Long reads need explicit continuation and budget exhaustion, not a falsely complete truncated answer. Runtime library version and negotiated service version must be separate provenance fields.

## Governed Notes workspace and tags

The existing local governed-workspace proposal remains the design input: Notes as the intended default workspace, opt-in Kosmos visualization, canonical host editing, safe rendered Markdown, explicit origin separation and shared human/agent query semantics. Agree on the final contract before changing the default UI. Renderer projection must not become a second authority or independently infer approval. Prevent stale asynchronous responses from replacing the active selection.

Claim **W1 host/renderer contract**, **W2 fixture revision**, **W3 host query/transport implementation**, and **W4 Notes UI implementation** separately. W1 and W2 can proceed now. W3/W4 start after R3/release sign-off and the accepted interface and fixture matrix, with separate files and one integration owner. Renderer packages must preserve existing Kosmos behavior and provenance constraints and run applicable browser/visual checks.

Use Jeffrey's immutable tag-fixtures-v2 and the existing Codex audits as inputs, not an unqualified acceptance oracle. The v2 bundle explicitly separates currently executable behavior, future behavior and Obsidian cases requiring qualification. A v3 bundle should reconcile contradictory expectations and extend coverage for unlabeled/invalid sensitivity, hidden-count exclusion, origin collisions, missing provenance and proposed versus effective relationships. Do not turn proposals into failing product tests until their contract is approved.

Keep navigation tags distinct from assessment/effective labels. Inline-tag parsing belongs to the Engine parsing contract and must be qualified against actual Obsidian behavior before adoption. Any new tag-index query must bind snapshot/scope, paginate deterministically and avoid hidden paths, totals or neighbors. Engine parsing work and Kosmos selectors can be separate agent packages once their input/output contract is settled.

## Authoritative temporal history before retrospective claims

Claim **T1 observation/history contract**, **T2 retention and authorization fixtures**, then **T3 persistence implementation**. T1/T2 can run in parallel; T3 waits for R3/release sign-off, the native retrieval boundary, their accepted contract and explicit retention controls.

Keep `valid_at` (source validity) distinct from `known_at` (durably retained observation). File modification times, sync timestamps and Graphiti ingestion times cannot recreate missing observation history. Record source versions, authority and projection publication separately. Revocation must affect retrieval immediately, before asynchronous derived-data purge. Define retention, deletion, replay and migration semantics before enabling storage, with no automatic history retention merely because exports exist.

## Optional Graphiti qualification

Use the [Graphiti assessment](https://github.com/Odenknight/Kosmos-Oden/blob/3146fb53377b3a5f079b77c7b31e705bf2cfe262/docs/reviews/2026-09-10-graphiti-assessment.md) as the versioned input: stable 0.30.2 verified on September 10, current profile target 0.29.0. Recheck upstream when this package is actually claimed. Graphiti supplies incremental entity/relationship extraction, temporal facts, provenance and hybrid retrieval. It is an optional downstream projection; GKOS remains the authority for accepted source semantics and authorization.

Claim **G2 API/backend compatibility**, **G3 isolation/readiness fixtures**, and **G4 quality/cost benchmark** independently. They can prepare in parallel using synthetic corpora. A single **G5 adapter integrator** consumes accepted outputs and proposes deployment only after qualification. No agent should launch a writable MCP service or ingest the live vault merely to complete research.

- Pin Python package, model configuration and backend version. Review routing/migration changes, supported providers and the exact public ingestion APIs. Do not assume public `episode_metadata` support or combined bulk extraction from an internal utility name.
- Keep explicit `native_only`, `query_only`, `managed` and unavailable states. Prove query-only behavior has no lazy writes using read-only database access and instrumentation. Keep managed candidate/working projections distinct from accepted/governed standing and from origin.
- Maintain a durable ingestion ledger keyed by corpus, source identity/revision, event, origin and adapter version. Reconcile ambiguous commits and retries. Prove idempotency, deletion, delayed visibility, recovery and authorized read-after-ingest evidence before publishing searchability.
- Authorize the eligible corpus first → query/rank only that authorized projection → verify provenance/citations afterward. Enforce the boundary for graph traversal, communities, reranking and inferred relationships as well as returned records. Post-filtering cannot undo unauthorized influence on those operations. If the backend cannot enforce the requested scope, Graphiti must not participate in that request; use GKOS native retrieval within the same authorization. Test revocation, cross-corpus isolation and inference/provenance boundaries.
- Use immutable source versions or a generation publication boundary so partial updates cannot masquerade as an atomic authorized snapshot. Preserve source watermark separately from derived publication time and retain the extraction outputs needed to explain a published projection.
- Define quality, latency and cost metrics on a representative authorized synthetic dataset before evaluating the existing proposed 10% quality/25% overhead promotion targets. An undefined denominator cannot yield a promotion pass.

For the TypeScript Engine, keep a versioned adapter contract and explicit optional dependency boundary. For future GKOS-Engine Rust, keep Graphiti outside the deterministic core as an external adapter/service with replayable versioned inputs and outputs. Coordinate Rust work through its own repository and mailbox. Neither integration may promote inferred relationships into authored/approved fields or manufacture historical knowledge dates.

**Promotion gate:** reviewed compatibility evidence, scope enforcement, durable ingestion/recovery, verified readiness, accepted metrics and operational ownership. The present plan authorizes planning and isolated qualification work within existing access; it records no live Graphiti installation or promotion approval.
