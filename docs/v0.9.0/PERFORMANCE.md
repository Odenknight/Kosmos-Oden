# Personal Notes search: performance record (0.9.0)

Measured with `npm run bench:personal-search` (`benchmarks/personal-search-bench.mjs`) on 2026-11-12.
These are measurements on one machine. They do not promise results on other hardware or for other corpus sizes.
Search is a lexical scan, so latency grows roughly linearly with the text it scans.

## Setup

- **Machine:** Intel Core i7-10610U (4 cores / 8 threads, 1.80 GHz laptop part), 24 GiB RAM, Windows 11 (NT 10.0.26300) x64, Node v24.18.0, Playwright Chromium 156.0.8078.4.
- **Load:** the machine was shared with other parallel builds during these runs. Its idle CPU load measured 37–84% with no benchmark running. Treat the slow runs below as results under contention.
- **Corpus:** 10,000 synthetic notes, 51 MiB UTF-8 (53,363,063 bytes), fixed seed `0x5eed`, from `benchmarks/personal-search-corpus.mjs`. It is mostly ASCII prose from a skewed vocabulary. One note in three has frontmatter. Ten notes are about 315 KB each, with a marker at the end. NFD/NFC, İ, ß, CJK, Cyrillic, Greek and emoji snippets are mixed in.
- **Node runs:** the real built worker text (`dist/kosmos-personal-search-worker.txt`, production-minified) runs on `worker_threads` through `test/helpers/node-search-worker.mjs`. Files are read from disk with `fs.readFile`, 4 at a time. The OS file cache was warm in both runs, because the fixture had just been written (run 1) or read (run 2).
- **Chromium runs:** `test/browser/personal-search-harness.html` starts the same worker text from a Blob URL. The corpus lives in page memory. Each vault read resolves in its own `setTimeout` task to emulate asynchronous I/O. Timer clamping makes that emulation slow (at least 4 ms per read per lane), which accounts for most of the Chromium "searchable after" time.
- **Queries:** 50 fixed queries (`benchmarkQueries`): 10 common single terms, 8 mid-frequency, 6 rare, 11 multi-term AND, 6 phrases, 7 Unicode, 2 misses. Each query runs once as a warm-up, then 5 timed rounds (250 samples). Timings are full client round trips, including `postMessage` both ways.

## Results

| Measurement | Run 1 | Run 2 | Target |
| --- | --- | --- | --- |
| First build in a fresh process: corpus read | 16.3 s | 5.3 s | |
| First build: searchable in the worker | **17.9 s** | **6.0 s** | ≤ 120 s ✅ |
| Rebuild after restart (fresh corpus and worker) | 12.5 s | 5.1 s | ≤ 120 s ✅ |
| Warm search p50 / p95 / max | 87 / **238** / 389 ms | 56 / **141** / 347 ms | p95 ≤ 300 ms ✅ |
| Scoped search (half the vault) p50 / p95 | 35 / 90 ms | 40 / 109 ms | |
| Edit to visible, p50 / max of 10 edits (real 250 ms debounce) | 290 / **297** ms | 309 / **371** ms | ≤ 3 s ✅ |
| Peak process RSS: before / indexed / searching / restart | 109 / 366 / 417 / 446 MiB | 53 / 420 / 422 / 449 MiB | |
| Chromium: search p50 / p95 | 93 / 225 ms | 58 / 201 ms | |
| Chromium: main-thread long tasks during search | **0** | **0** | none > 50 ms ✅ |
| Chromium: main-thread long tasks during edits | 0 | 0 | |
| Chromium: edit to visible, max | 319 ms | 304 ms | ≤ 3 s ✅ |

The worst single query (max 347–389 ms) is a common term. Its p50 was 121–293 ms across the two runs. The p95 target holds and the max does not. Run 1 was the more loaded run.

Peak RSS covers the whole Node process: the main-thread corpus (raw text) plus the worker (raw text plus its NFC/lowercase copy, and the offset map only for text whose length changed). That is roughly 3× the raw corpus size plus the runtime.

### Main-thread long tasks while indexing (Chromium)

Searching caused no long task in any run. Indexing is a different matter: whether it produced any depended on machine load.

| Run | Searchable after | Long tasks while indexing |
| --- | --- | --- |
| Run 1 (full bench) | 15.3 s | 1 × 330 ms, caused by the harness (see below) |
| Run 2 (full bench) | 43.9 s | 35, longest 276 ms |
| Chromium-only repeat A | 32.6 s | 20, 51–134 ms |
| Chromium-only repeat B | 13.1 s | 0 |
| Chromium-only repeat C | 15.0 s | 0 |
| Chromium-only, after the harness fix | 14.3 s | 0 |

- **Run 1's 330 ms task:** the harness's own `stat()` computed UTF-8 sizes for 50 MiB inside `listMarkdown()`. Obsidian's file list already carries sizes, so the harness now computes them during setup. With that fixed, uncontended runs show no indexing long tasks.
- **The contended runs:** long tasks of 51–276 ms appear only when the whole run is 2–3× slower. They are spread across the read phase and do not cluster on one operation. My hypothesis, not yet verified with a trace, is major GC of the 50 MiB page heap, stretched by CPU contention. The page's per-read work is a few microseconds of UTF-8 counting and metadata per 5 KB note. Snapshot transfer is chunked at 1 Mi characters per message, with a yield between chunks.
- **Not yet qualified:** "No indexing long tasks over 50 ms on a loaded machine" is not established. Re-measure in Obsidian on an idle machine, and take a performance trace if long tasks appear.

## Before and after: main-thread comparison on the same corpus

Both indexes ran synchronously on the Node main thread over the same 10,000 raw bodies, with the same 50 queries × 5 rounds. Result totals were identical for all 50 queries.

| Index | Build | Search p50 / p95 (run 1) | Search p50 / p95 (run 2) |
| --- | --- | --- | --- |
| Starter patch `FullTextIndex` (commit `cebe8d95d14d`), main thread | 289 / 132 ms | 134 / 423 ms | 79 / 228 ms |
| 0.9.0 matcher, synchronous | 529 / 203 ms | 93 / 261 ms | 50 / 145 ms |
| 0.9.0 worker client (round trip, off the UI thread) | (see above) | 87 / 238 ms | 56 / 141 ms |

- **Search:** the reworked matcher is about 30–37% faster at p50 and 36–38% faster at p95 than the starter on the same thread.
  - Terms are tested longest first, so a missing rare term rejects a note sooner.
  - A bounded top-k replaces sorting every match.
  - Excerpts are built only for the returned hits.
  - Field bitmasks replace per-note `Set` allocations.
- **Worker overhead:** batched yielding (8 ms / 64 records) and the message round trip cost little compared with the scan. More importantly, the UI thread no longer blocks for the whole scan.
- **Build:** building the searchable copies takes longer than the starter's (203–529 ms versus 132–289 ms), because the offset map and full raw-text indexing are new work. It happens once per content change, inside the worker.

## Decisions taken from these numbers

- **No inverted index.** Every target is met with the linear scan, as section 4 of the build instructions prefers. Add one only if a larger owner corpus misses the 300 ms p95.
- **Yield cadence:** kept at the specified ~8 ms or 64 records.
- **Snapshot chunks:** 1 Mi characters per `postMessage`. Searching and edits showed no long tasks with this size.

## Reproducing

```bash
npm run bench:personal-search                  # 10,000 notes, ~50 MiB, includes Chromium
node --expose-gc benchmarks/personal-search-bench.mjs --notes 2000 --mib 10 --no-browser
npx playwright test --project=chromium test/browser/personal-search-worker.spec.ts
```

Fixtures and `results.json` are written under `benchmarks/fixtures/personal-search/` (gitignored). Set `KOSMOS_BENCH_BASELINE_REF` to pick a different starter commit for the before column. Graph-open versus graph-closed measurements (P11) need the integrated plugin and are not covered here.
