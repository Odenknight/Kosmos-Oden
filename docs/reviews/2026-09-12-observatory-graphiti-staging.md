# Observatory synthetic Graphiti staging

Owner authorized an isolated synthetic-only service on Observatory on September
12, 2026. This staging work is separate from the adapter qualification in
[the runtime report](2026-09-12-graphiti-runtime-upgrade.md).

## Installed and observed

- Dedicated `kosmos-graphiti` service account, runtime at `/opt/kosmos-graphiti`,
  data at `/mnt/data/kosmos-graphiti`; no source-vault mounts.
- Python 3.13.5, Graphiti 0.30.2, FalkorDB Python 1.4.0, FalkorDBLite 0.10.0,
  OpenAI SDK 2.32.0, HTTPX 0.28.1 and Redis Python 7.1.0. Runtime constraints
  come from Graphiti's [v0.30.2 lockfile](https://github.com/getzep/graphiti/blob/eaa4128681bc53487138a4bbc22d58336ebe70d2/uv.lock).
- `kosmos-graphiti-db.service` runs the packaged database with append-only
  persistence, a 512 MiB no-eviction database limit, 768 MiB service memory limit
  and one CPU quota. A mode-0700 Unix socket grants only the dedicated account
  access; no new TCP listener or writable Graphiti MCP endpoint was opened.
- A generated JSON episode passed Graphiti `EpisodicNode.save` and exact
  content/group readback, then passed readback after the database service was
  restarted. Existing Engine, Observatory and Caddy services remained active.

## Compatibility findings retained

A fresh unconstrained install selected OpenAI SDK 3.13.0 and Graphiti imports
failed because `httpx` was missing. Mixing newer FalkorDB Python with upstream's
Redis pin also failed. Applying the upstream runtime constraints resolved those
import failures; `pip check` passed.

The embedded asynchronous client's cleanup emitted an unawaited-shutdown warning.
The managed database service avoids that lifecycle path. FalkorDB Python 1.4.0's
Unix-socket cluster detector forwarded an unsupported `path` constructor argument.
The persistence fixture instead supplied its public `AsyncGraph` API with an
explicit Redis Unix-socket connection. No third-party package source was patched.
This fixture adapter is not a qualified general-purpose ingestion connection.

The privileged LXC rejects systemd mount namespaces (exit 226/NAMESPACE).
The service uses the host's documented dedicated-account compatibility pattern,
retaining no-new-privileges, an empty capability set and Unix-only address family;
host confinement was not changed.

## Remaining boundary and rollback

### Model selection and fixture qualification — 23:00 UTC follow-up

The owner selected the local text-model endpoint for extraction. It serves `util4`
and passed chat/structured JSON checks, but `/v1/embeddings` returns HTTP 501.
The owner authorized selection of an existing infrastructure embedding service.
We reused the KnightsAI hive's configured Nomic service at
the existing local embedding endpoint, model
`nomic-embed-text-v1.5` (Q8_0), with 768 dimensions.
Both endpoints were reachable from Observatory; neither model server was changed.

The existing Engine synthetic qualification was adapted only for this instance's
model factory and Unix-socket connection/cleanup. Graphiti 0.30.2 extracted three
nodes and two edges in 12,646.64 ms. Exact episode content/group readback passed;
five scoped searches returned the expected fact with source-episode provenance
in 18.84–19.44 ms. A different empty group returned no results. Exact temporary
database cleanup passed. The fixture uses the same deterministic rank-preserving
reranker as the hive; it does not claim model-based reranking.

[Raw receipt](evidence/observatory-model-qualification/receipt.json),
[model factory](evidence/observatory-model-qualification/observatory_graphiti.py),
and [fixture](evidence/observatory-model-qualification/qualify-observatory-graphiti.py)
are retained with [SHA-256 hashes](evidence/observatory-model-qualification/SHA256SUMS).
Connection details and the installed factory location remain in the private operating record.
Endpoint aliases and model names are observed identities, not frozen model-file
digests; changing either model requires another qualification run.

This qualifies the **bounded synthetic ingestion/search path**, not a running
semantic retrieval broker or a comparative performance benchmark. Full
authorization/revocation, recovery, real-vault ingestion and corpus benchmarks
remain unqualified. The plugin keeps native retrieval and correctly reports
export-ready/searchable=false because no semantic broker is wired into it.

Stop staging with `sudo systemctl disable --now kosmos-graphiti-db.service`.
Preserve the runtime, synthetic data and receipts for review; no deletion or
shared-service rollback is needed. Re-enable only for the authorized synthetic
qualification work.
