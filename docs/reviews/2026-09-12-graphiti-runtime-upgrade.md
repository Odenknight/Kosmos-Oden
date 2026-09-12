# Graphiti adapter and agent identity upgrade

## Starting build and connection

The installed Windows plugin was 0.8.3 at
`f8e17afece0d41d0392ccfb6b6f43590a95129a4`, built
`2026-09-12T15:56:41.528Z`. Its main.js SHA-256 was
`a7a6587085e4e1bc6120862373b11ca8fd249c8f3759269736e0055cc77776ec`.
GitHub main was `48f77ae55a92f3d7b4952ee534b611157245d432`; subsequent changes
were documentation/tests. The stale root checkout at 0.8.0 (`04b099a`) was
preserved; implementation uses an isolated current-main worktree.

The owner confirms both ships were JEFFREY. Current MCP identity is supplied
per request, without protocol sessions. Alternating generic `mcp` metadata and
a designated name creates separate display identities. The stdio adapter now
accepts explicit `KOSMOS_AGENT_NAME`, applying it to valid client metadata and
tool-level agent_name, including requests surrounding tool calls. Required
protocol metadata is not silently repaired. Native HTTP callers must send the
same designated name on every request, or configure the display-only
`X-Kosmos-Agent-Name` header once. No token/IP-based alias is inferred.

## Changes and evidence

Kosmos pins Engine `f39cccbacd5d2469b5e17dc0c1ef81d8d59cd9c4` with matching lock
and dependency guard. The optional Graphiti target moves from 0.29.0 to 0.30.2.
The generated runner comes from Engine, replacing the duplicate implementation.
The episode envelope remains `gkx-graphiti/2.3.0`; external receipts use
`gkos-graphiti-run/1`.

Live testing reproduced NodeNotFoundError when the old sample passed a new
canonical UUID to add_episode(uuid=...), which looks up an existing episode in
0.30.2. The corrected runner maps returned projection UUIDs to canonical IDs,
verifies stored content/group, and writes durable progress around ingestion.
Existing receipts refuse duplicate/ambiguous retries, including changed inputs.
Export uses authorized indexed bodies and refuses completion if the graph or
read ceiling changes. Native navigation performs no Graphiti writes.

Engine offers independent exact-source-byte SHA-256 evidence. Kosmos does not
yet capture raw source bytes for exports and does not automatically claim that
stronger evidence. Existing change keys remain distinct.

Observed checks:

- Live installed MCP discovery, 18 tool schemas, status, search, note read,
  lineage and related-note queries succeeded. No note bodies or credentials
  are included in the published report.
- Baseline: 400 Kosmos tests and all verification checks passed.
- Candidate: all 403 tests and all verification checks passed against the final
  Engine dependency pin. Forty desktop/mobile Chromium tests passed on the
  earlier candidate; final-pin browser verification is recorded below when complete.
  An occupied default browser port required an isolated test port.
- Engine: nine Graphiti tests and seven generated-runner regression tests pass.
- The first full Engine run reported 1,105 passed, four failed and one skipped.
  One failure required explicitly declaring the two additive Graphiti APIs
  against the unchanged historical export fixture. Three failures arose from
  CRLF checkout bytes/local files in the byte-exact qualification inventory.
  All 21 targeted compatibility, preimage and inventory tests subsequently passed
  in a clean LF checkout. Final hosted/full results remain separate gates.
- Live Graphiti/FalkorDB/local-model fixture passed persistence, five searches
  with episode provenance, empty-group denial and cleanup. Ingestion took
  22,967.46 ms; queries took 20.98–23.36 ms.
- The actual generated runner passed persistence, duplicate/changed retry
  refusal and cleanup on a synthetic Engine export in 68,167.69 ms. That run
  did not perform search and reported searchability unverified.

Raw receipts, package/container identities and rollback instructions are in the
[Engine report](https://github.com/Odenknight/GKOS-Engine/blob/f39cccbacd5d2469b5e17dc0c1ef81d8d59cd9c4/docs/GRAPHITI-030-ADAPTER.md).
The shared hive already used 0.30.2; it was neither upgraded nor restarted.

## Readiness and rollback

This qualifies the corrected optional path within those fixtures. It does not
qualify a production semantic broker, automatic recovery, complete derived-data
revocation/purge, concurrent mixed-scope retrieval, historical reconstruction,
or 1k/10k/50k performance. Model artifact digests/full budgets are not frozen.
No real-vault ingestion occurred.

GF-01 remains interpretive extraction with canonical relationships Engine-owned.
GF-02 stays fixed: ingestion, persistence and search are distinct. GF-03 now has
an explicit byte-evidence API; end-to-end raw-source capture remains unqualified.
Versions remain 0.8.3/2.2.0 candidates; this work creates no release tag.

Use a fresh authorized projection generation and retain its receipt. Reconcile
failed runs before retrying; never restore revoked generations. Rollback restores
previous plugin artifacts/Engine pin and native retrieval. No shared graph
migration is performed. Final full-suite/native/hosted results follow their
completed checks.
