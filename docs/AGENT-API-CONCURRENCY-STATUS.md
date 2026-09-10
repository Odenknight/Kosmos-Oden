# Agent API Concurrency Mitigations — updated for 0.8.3

The historical audit below records the original mitigation work. The current
modern-MCP admission and fairness policy is specified in Mitigation 4.

Response to `instructions-4-coders/AGENT-API-CONCURRENCY-MITIGATIONS-v0.5.5.md`.
Records the disposition of all four mitigations, as the doc's Definition of
Done requires (1 confirmed, 2 audited, 3 & 4 scoped in/out — decisions logged,
not left implicit). Verified against the shipped source, not assumed.

| # | Mitigation | Status | Evidence |
|---|---|---|---|
| 1 | Build the graph index once, not per-request | **Present (confirmed)** | `src/plugin/vault-provider.ts` |
| 2 | Eliminate synchronous filesystem calls | **Audited — clean** | grep below |
| 3 | Offload heavy computation to a worker thread | **Scoped OUT** (not needed) | `src/core/temporal.ts` |
| 4 | Per-client execution limits for fairness | **Scoped IN — implemented** | `src/plugin/agent-server.ts`, multi-client HTTP tests |

---

## Mitigation 1 — in-memory index, built once — CONFIRMED PRESENT

`VaultDataProvider` (`src/plugin/vault-provider.ts`) owns a single
`GkxIndex` (`src/core/incremental.ts`). The seven MCP tools and the REST
endpoints all read from `provider.getGraph()`, which returns the **cached**
`index.graph` and only rebuilds when something is dirty:

```
if (this.index.graph && !pending) return this.index.graph;   // no per-request parse
```

Currency is maintained incrementally through Obsidian events wired in
`src/plugin/main.ts` (`metadataCache "changed"`, vault `create`/`delete`/`rename`)
— a single edited note is re-read via `app.vault.cachedRead` (Obsidian's
in-memory cache) and re-parsed alone via `index.applyChanges`; only bulk change
triggers a full rebuild. A `building` promise guard means concurrent
`getGraph()` calls during a rebuild share one build rather than stampeding.

⇒ "Parse the vault per request" does not happen; concurrent agent count does
not translate into concurrent parse passes. No action required.

## Mitigation 2 — no synchronous fs calls — AUDITED, CLEAN

Per the doc's prescribed first pass:

```
$ grep -rn "Sync(" src/ --include=*.ts        # → no matches
$ grep -rn "readFileSync|writeFileSync|existsSync|readdirSync|statSync|mkdirSync" src/ --include=*.ts   # → no matches
```

The Agent API and shared core contain **zero** `*Sync` fs calls. All vault
reads go through Obsidian's async `cachedRead`; there is no `fs` import in the
request path. Nothing to remediate. (Re-run the grep in CI-adjacent review if
new I/O is ever added to the server.)

## Mitigation 3 — worker thread for heavy compute — SCOPED OUT (justified)

The doc flags `graph_at_time` as the candidate for CPU-bound work *if it
replays edge history*. It does not: `graph_at_time` calls the single temporal
projector (`projectAtTime`, `src/core/temporal.ts`) over the already-built
graph's validity intervals — one O(notes) pass computing valid-vs-superseded at
the requested instant, not an O(history) replay. On the cached index this is a
fast synchronous scan bounded by vault size, not by history depth.

⇒ The specific hazard the mitigation targets is absent. Introducing
`worker_threads` (structured-clone serialization of the graph across the thread
boundary, worker lifecycle) would cost more than it saves at realistic vault
sizes. **Deferred**; revisit only if profiling on a very large vault shows the
projection stalling the loop — in which case the preferred fix is materializing
periodic snapshots into the index (as the doc itself suggests) before reaching
for a worker.

## Mitigation 4 — per-agent fairness cap — SCOPED IN, IMPLEMENTED

Already present before this change: a global concurrency cap
(`MAX_CONCURRENT_REQUESTS = 24`), a per-client sliding-window rate limit
(`RATE_MAX_REQUESTS = 240 / 10 s`), and a per-request timeout — but these are
throughput bounds, not fairness between agents, and loopback was exempt (the
local multi-agent case the doc actually cares about: CARSON's bulk
`export_graphiti_episodes` vs another agent's interactive query).

Current policy uses two separate bounds:

- **Admission:** at most 24 in-flight HTTP requests, including body reads,
  across LAN and loopback. Loopback is exempt only from the LAN sliding-window
  request-rate limit. This bounds incomplete requests and clients rotating names.
- **Execution:** at most 12 requests per cleaned MCP `clientInfo.name`, claimed
  after authentication and envelope/metadata validation. Different named clients
  sharing a User-Agent have separate buckets. REST, notifications and unnamed
  MCP clients use the cleaned User-Agent fallback, in a separate namespace.

The modern protocol has no initialization session. `Mcp-Session-Id` is ignored.
Same cleaned names intentionally share a bucket; cleaning uses the leading
product token, safe characters and a 40-character bound. These self-reported
labels provide cooperative fairness, not authenticated principals or authority.
The global cap remains necessary: multiple names can fill it, and no strict
scheduling or reserved interactive priority is promised. Saturation returns
HTTP 429 with Retry-After. Slots are released when dispatch completes or throws.

This repairs the modern-transport regression where all clients of the bundled
SDK/stdio adapter shared one User-Agent bucket. HTTP tests cover a saturated
named client, a second name sharing its User-Agent, unnamed fallback, global
saturation on loopback, slot release and invalid-request admission. The existing
REST fairness test remains. Trail identity uses the same cleaned name, but its
visual-record lifetime does not determine execution-slot lifetime.

---

## Definition of Done — met

- [x] Mitigation 1 confirmed present.
- [x] Mitigation 2 `*Sync` audit completed; findings logged (clean).
- [x] Mitigation 3 explicitly scoped **out**, with rationale.
- [x] Mitigation 4 explicitly scoped **in** and implemented + tested.
