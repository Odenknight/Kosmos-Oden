# Observation history contract (T1 draft)

Status: proposed interface and acceptance requirements. This document does not
approve retention, enable storage, or claim T1/T2/T3 qualification. The existing
release and native-retrieval prerequisites remain applicable.

## Ownership and time

The product host owns the observation ledger. Engine validation, source parsing,
and authorization remain authoritative; the renderer cannot submit observations
or supply authority. Reuse Engine source digests and parsing receipts. A derived
Graphiti ledger or an export manifest is not the source observation ledger.

`valid_at` is the source's declared validity, possibly absent. `known_at` is the
host's durable observation commit time. Neither source mtime, synchronization time,
model ingestion time nor rebuild time supplies missing historical knowledge.
A known-by query can only select a version actually retained at that time.

Each corpus has monotonically increasing committed sequence numbers. The host
clock must not regress across commits; refuse a regressing timestamp rather than
invent a later observation time. Equal timestamps are ordered by sequence.
Commit time and sequence become observable only after transaction durability.

## Records and bindings

A versioned observation envelope contains:

| Field | Meaning |
| --- | --- |
| corpus identity | Host-established identity, never a display name |
| sequence / observation ID | Unique committed order and retry identity |
| source identity | Validated stable identity; ambiguous identities are refused |
| canonical path | Location at observation time, not identity across path reuse |
| kind | `source_version`, `source_deleted`, or `projection_published` |
| source digest | Engine-compatible digest of exact source bytes; absent for deletion |
| known_at | Host-generated durable commit timestamp |
| valid_at | Authored validity, explicitly absent when unknown |
| authority / policy binding | Observation-time context for provenance only |
| parser / schema version | Exact interpretation used for retained receipts |
| payload reference | Local content-addressed retained bytes or explicit no-payload state |
| parent observation | Exact prior version when one was retained; otherwise absent |

Projection publication is a separate event referencing committed source
observations, projection generation and configuration. It must not alter their
known_at values or claim that publication proves extraction correctness.
An observation-time authorization grant is never sufficient for a later read.

## Append and retry

Validate source identity, digest, current host authority and retention configuration
before preparing a write. At the final synchronous transaction boundary, recheck
all captured generations and host liveness. Commit the envelope, payload reference
and sequence atomically. An acknowledged append must survive restart.

The same operation ID with identical canonical input returns the original receipt.
The same ID with different input is a conflict. A crash before commit leaves no
readable observation; a crash after commit but before acknowledgement is resolved
by the same operation ID. No retry creates a second observation or changes its time.

Missing payloads, digest mismatches, corrupt chains or unsupported schema versions
make affected history unavailable. Do not repair corruption by inventing bytes,
silently creating an empty ledger or falling back to a newer source version.

## Query and authorization

Every query binds corpus, known-by cutoff, requested valid-at interpretation,
authorization generation and a committed ledger watermark. A cursor binds these
same coordinates and deterministic order. A changed scope or generation refuses
the cursor; it does not silently restart a page with a different corpus.

Check current authorization before selecting candidates, before loading retained
payloads and immediately before publication. Hidden and absent versions have the
same public outcome; omit hidden paths, totals, digests and neighbor influence.
A historical path never authorizes reading a new record now occupying that path.

For each currently readable source identity, select the last retained observation
at or before the cutoff. A deletion observation prevents an older version from
being returned as current at a later cutoff. Explicit historical reads still obey
current policy and configured retention. Gaps are reported as unavailable coverage,
not as proof that a source did not exist. Unknown valid_at stays unknown.

## Retention and deletion

Storage defaults to disabled and creates no history merely because a source is
read, exported or indexed. Enabling it requires an explicit corpus selection,
positive age, byte and observation-count limits, and an authenticated owner action.
There is no implicit unlimited setting. Capacity exhaustion refuses new retention
and reports unavailable coverage; it must not silently delete existing history.

Revocation blocks query publication immediately. Physical payload/derived-data
purge may follow asynchronously, but no purge delay permits continued retrieval.
An explicit deletion request commits a durable deny/tombstone first. Purge payloads,
references and derived outputs under the same identity; retain only the minimum
non-content deletion receipt allowed by policy. Recovery and import must honor the
receipt and must not resurrect purged observations. Retention holds must be checked
before destructive purge, with a visible blocked outcome when they conflict.

## Replay and migration

Replay uses retained bytes, parser/configuration receipts and the original sequence
and times. Re-extraction is a new derived run, never historical replay evidence.
An import is not evidence that the importing host knew a source at the export time;
foreign observation provenance remains distinct from local known_at.

Migration is explicit, versioned and transactional with a verified backup and
rollback path. Preserve original observations and refusal/tombstone semantics.
A restored backup must be reconciled against the current deletion watermark and
current authority before activation. If that independent current state is missing,
refuse activation; a backup cannot certify that no later deletion occurred.
Unknown versions stay closed. Do not activate a migrated store until integrity,
authorization and deletion-resurrection fixtures pass.

## T2 / T3 acceptance matrix

Required isolated fixtures precede product activation:

- Edit between observations: pre-observation bytes cannot be fabricated; known-by
  selection returns only committed versions and preserves unknown coverage.
- Clock regression, equal timestamps, duplicate operations and changed retry input.
- Crash before commit, after commit before acknowledgement, and during purge.
- Current revocation during preparation and immediately before publication;
  hidden-version, path-reuse and ambiguous-identity cases.
- Pagination across source edits, corpus changes and authorization changes.
- Disabled storage, explicit limits, exhaustion and retention-hold conflicts.
- Deleted payloads, corrupt digests, broken parent chains and unsupported schemas.
- Replay without changing times; migration rollback and import without invented
  local knowledge; deleted records cannot reappear after backup restoration.

T3 must additionally demonstrate native-host transaction durability and bounded
startup/rendering costs. Passing isolated fixtures is not product authorization or
qualification. Owner retention choices and the final accepted contract remain open.
