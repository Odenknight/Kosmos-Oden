# Existing-profile Agent API retrieval: measured speed-up (0.9.0)

The owner asked that 0.9.0 retrieve faster than 0.8.4. This covers the existing
(governed) profile's hot query methods behind REST and every MCP era:
`qSearch`, `qNote`, `qRelated`, `qLineage`, `qOverview`. The Personal profile
uses its own query service and is not measured here.

## What was slow

Every query recomputed work that does not change between calls on the same
graph snapshot, and some of it once per returned note:

- `brief()` (the per-note summary in search, lineage and related results)
  rebuilt the full readable-node list, its id set and an id map of every graph
  node for **each** returned note when the caller did not pass them in. A
  20-result search on 15,000 notes did that 20 times. `qAtTime` did it for every
  valid note before slicing.
- `qNote` and `qRelated` scanned all graph links three times to find one note's
  neighbours, and `qNote` looked names up with `graph.nodes.find`.
- `qSearch` lower-cased every label, alias, tag and path on every query and
  re-parsed `validAt` dates inside the sort comparator.
- `qOverview` re-parsed every note's `validAt` and computed the readable set
  twice (once more inside `safeDiagnostics`).

## What changed (results byte-identical)

- **Per query:** the readable files and their id set are computed once and
  passed to `findNode`, `brief`, `visibleTemporal`, `safeDiagnostics` and
  `projectables`. Visibility is deliberately *not* cached across queries: it
  depends on settings (ceiling, default sensitivity) and on node metadata, and
  recomputing it costs under 1 ms at 15,000 notes.
- **Per graph snapshot (`WeakMap` keyed by the graph):** the id map and
  outgoing/incoming link adjacency, in `graph.links` order so filtered results
  keep their order. The entry is rebuilt if the graph's `nodes` or `links`
  array is replaced, and is dropped with the graph; no explicit invalidation.
- **Per node (`WeakMap` keyed by the node, guarded by the source values):**
  lower-cased search fields and the parsed `validAt` time.

No query output changed. `benchmarks/agent-query-bench.mjs --check <baseline
bundle>` compares the JSON of 166 sampled calls per vault size (search incl.
empty query, note, related, lineage, at-time, graph, diagnostics, overview)
against the pre-change build before timing; both sizes were byte-identical
(1.46 MB and 6.66 MB of output). The full test suite (560 tests) passes
unchanged.

## Measurements

Command, run back to back on the same machine and Node build:

```text
node benchmarks/agent-query-bench.mjs --module <saved pre-change dist/kosmos-agent-server.mjs>   # before
node benchmarks/agent-query-bench.mjs                                                           # after
```

Machine: Intel Core i7-10610U (4 cores, 1.8 GHz base), 24 GB RAM, Windows 11,
Node v24.18.0. Other builds were running on the machine, so absolute numbers
are noisy; compare the two columns, not single cells. Synthetic vaults as in
`benchmarks/bench.mjs` (one note in seven is GKX with a timestamp, one in 21
declares `supersedes`, one in 49 is labelled secret), one unchanged graph per
size, 200 iterations at 3,000 notes and 50 at 15,000, after 10 warm-up calls.

| Notes | Query | Before p50 | Before p95 | After p50 | After p95 |
| ---: | --- | ---: | ---: | ---: | ---: |
| 3,000 | qSearch | 2.11 ms | 11.04 ms | 1.15 ms | 1.77 ms |
| 3,000 | qNote | 1.55 ms | 2.15 ms | 0.50 ms | 0.57 ms |
| 3,000 | qRelated | 4.07 ms | 7.12 ms | 0.80 ms | 1.02 ms |
| 3,000 | qLineage | 2.64 ms | 4.09 ms | 1.12 ms | 2.20 ms |
| 3,000 | qOverview | 5.02 ms | 6.11 ms | 2.88 ms | 3.77 ms |
| 15,000 | qSearch | 14.39 ms | 86.66 ms | 8.67 ms | 9.68 ms |
| 15,000 | qNote | 12.28 ms | 14.37 ms | 5.78 ms | 7.04 ms |
| 15,000 | qRelated | 34.79 ms | 54.90 ms | 8.01 ms | 12.90 ms |
| 15,000 | qLineage | 20.93 ms | 25.38 ms | 8.64 ms | 14.99 ms |
| 15,000 | qOverview | 37.04 ms | 40.84 ms | 23.36 ms | 25.40 ms |

"Before" is the existing-profile code path as restored to its 0.8.4 behavior
on this branch (the build just before this change). These are in-process
query timings with an in-memory graph; they exclude HTTP, JSON serialization
and the provider's graph build, and say nothing about Personal search.

## Not done

- `qOverview` still scans all readable notes and links per call (counts and
  time span). Caching those would need a visibility cache keyed by settings and
  node metadata; not worth the invalidation risk at ~23 ms for 15,000 notes.
- `findNode` still searches the readable list linearly by path; it is under
  1 ms at 15,000 notes.
