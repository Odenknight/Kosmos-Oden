# Graphiti recovery consumer checkpoint

Kosmos pins Engine `25208e014e001f95b7660165618cc337af960dbe` from
[Engine PR 56](https://github.com/Odenknight/GKOS-Engine/pull/56). This includes
the query contract from PR 55 and the generated runner's explicit recovery
observation mode. The existing export command writes this Engine-owned script;
no second ingestion implementation is introduced in Kosmos.

After independently reauthorizing the export and confirming its original writer
has stopped, operators may run:

```sh
python graphiti-ingest-sample.py --reconcile graphiti-episodes.json
```

FalkorDB reconciliation checks recorded mappings through `GRAPH.RO_QUERY` and
writes a separate `graphiti-reconciliation-<id>.json`. It preserves the original
ingestion receipt and never invokes extraction, creates indexes, retries writes,
publishes a generation or declares searchability. Missing mappings remain
ambiguous; missing/mismatched nodes, unavailable transport and changed inputs
require operator reconciliation. Neo4j reconciliation is not supported.

This is an operator observation tool, not a managed ledger, quiescence lease,
authorization authority, revocation engine or semantic broker. POSIX receipt
writes fsync the parent directory; Windows power-loss durability is not claimed.
Exact behavior and the live synthetic qualification receipt are documented in
the [pinned Engine adapter](https://github.com/Odenknight/GKOS-Engine/blob/25208e014e001f95b7660165618cc337af960dbe/docs/GRAPHITI-030-ADAPTER.md).

Consumer tests load the query fixture directly from the installed Engine package,
check the draft-1 exchange, preserve unverified semantic support, and reject
unavailable status, stale scope and revoked episode mappings. This advances
cross-repository contract qualification without adding a live query endpoint.
Native `graphiti_ingestion_status` remains `export-ready` and `searchable=false`.

The original installed plugin main.js matched a clean build of Kosmos main
`0dabaab` byte for byte before this update (SHA-256
`06e0d7e29b59c7ad3fe2cf2d048655dfd54a20597f682e4afd6724bf27941fe7`).
Thus its earlier dirty marker did not indicate an unrepresented executable
change in that comparison. A later installation must recheck the current
artifact before replacing it and preserve settings and a rollback copy.

Remaining: managed queue/ledger and crash recovery, immutable publication,
complete dependency revocation/purge, fresh qualification bound to model/backend
configuration, numerical budgets/native baseline/scale comparison, a governed
broker, consumer semantic UI, native Hermes acceptance and release gates.
Version remains 0.8.3; this is not a new tagged release or a production semantic
service promotion. The historical experiment/model observations remain bounded
as described in the prior checkpoint.
