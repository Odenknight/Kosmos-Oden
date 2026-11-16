# Build plan: port the Kosmos-Oden 0.9.5 Librarian and embedding server route to GKOS-Engine 2.x (TypeScript / Python)

> **Revised 2026-11-16. Read this box first; the plan below it is kept as
> written on 2026-11-14 and its starting premise is out of date.**
>
> Checked against GKOS-Engine `d0f3b409` (`main` and the tag `v2.5.0`) and
> Kosmos-Oden `56a6b8bf`, after Astra's review of 2026-11-16 and a check of
> its findings in the code.
>
> **Already done** (Engine 2.5.0, by copying the plug-in's files):
>
> | Planned here | Where it is now |
> | --- | --- |
> | Phase 1, the Librarian core in TypeScript | `src/notes/librarian.ts` in the Engine, byte-for-byte the plug-in's file. Do not port it again. |
> | The Personal question route | `ask_librarian` over MCP and `GET /librarian`, through `src/notes/query-service.ts` |
> | Phase 4 for Personal Notes: meaning as a fourth list, related notes | In the core and the query service |
> | Phase 3, the private-network embedding client | `src/semantic/endpoint.ts`, `remote.ts` in the Engine, a second provider family beside `src/retrieval/providers.ts` |
>
> **Still missing:** a governed tool (`gkos_ask_librarian_v1`), citations bound
> to source bytes, a public `gkos-engine/librarian` export, frozen test
> vectors, and one shared copy of the core (Phase 6). Phase 5 (Python) is
> deferred; a client comes before a second ranking implementation. Rust is not
> considered until this work is finished (owner, 2026-11-16).
>
> **New finding, fixed in build 0.9.5 alpha.3:** the core let notes outside the
> requester's scope change the answer in two ways (typo correction and the
> words added to a question). Both are described in `CHANGELOG.md`.
>
> **Order from here** (Astra's, accepted by the owner):
>
> 1. Correct this plan and record the exact baseline. This box.
> 2. Scope the vocabulary decisions, the statistics and the revision an
>    assistant sees. Done in both repositories; in review.
> 3. A separate, guarded, word-only governed tool, `gkos_ask_librarian_v1`,
>    contract `gkos-librarian-1.0.0-draft.1`. In the Engine; it reuses the
>    admission of `gkos_search_lexical_v1` and stays hidden until a host
>    supplies the content validator.
> 4. Candidates by meaning from the authorized vector lane, then REST through
>    the same adapter.
> 5. Kosmos-Oden imports the core from the Engine (Phase 6 below). Last,
>    together with release and publication.
>
> The Engine side of this is in `docs/GOVERNED-LIBRARIAN-INTEGRATION.md` in
> the GKOS-Engine repository.

Status: **plan, nothing built**. Written 2026-11-14 against Kosmos-Oden build
`0.9.5-alpha.2` and GKOS-Engine `main` as published on GitHub that day
(`package.json` version 2.2.0).

What was read to write it: all of the Kosmos-Oden source named below, and in
GKOS-Engine the file tree, `package.json`, `src/retrieval/providers.ts`,
`config.ts`, `lexical.ts`, `fusion.ts`, `confidence.ts`, `chunker.ts`
(exports only), `src/gkx-network.ts`, `docs/CURRENT_CAPABILITIES.md`,
`docs/AUTHORIZED-LEXICAL-DISCOVERY-V1.md`, the retrieval draft.2 contract
README and the `services/gkos-intelligence` README. **Not read:**
`src/retrieval/coordinator.ts` in full, `sqlite-store.ts`, `src/service/*`,
the Engine's tests and CI workflows. Steps that depend on those are marked
*confirm first*.

## 1. What is being ported

| Kosmos-Oden 0.9.5 | Lines | What it does | Depends on |
| --- | --- | --- | --- |
| `src/personal-notes/librarian.ts` | 1,253 | Question in, ranked notes with passages, steps, links, related words, confidence and a markdown brief out. No model, no network, same input gives same output. | `fulltext.ts` (`toSearchable`, `PreparedDoc`), `types.ts` (error type) |
| `src/semantic/endpoint.ts` | 270 | Address rule (this computer or private network only), the two wire formats (OpenAI-compatible, Ollama), error classification. Pure: no I/O. | `isGkxLoopbackHost`, `isGkxPrivateLanIpLiteral` from `gkos-engine` |
| `src/semantic/remote.ts` | 228 | Embedding client: batching, route detection, one-text retry and shortening for over-long text, vector-length check. Takes a transport function. | `endpoint.ts` |
| `src/plugin/embedding-endpoint.ts` | 75 | The one function that makes the HTTP request in Obsidian. | Obsidian `requestUrl` — **not ported** |
| `benchmarks/librarian-bench.mjs`, `test/personal-librarian.test.mjs`, `test/semantic-endpoint.test.mjs` | — | Bench and tests. | — |

Not in scope: the Obsidian settings page, the in-plugin ONNX worker and its
sql.js index (the Engine has its own `local_onnx` provider and SQLite store),
and the Map of Content generator (the Engine already has managed MoC under
`navigation-effects`).

## 2. What the Engine already has, and the gap

| Need | Engine 2.2 today | Gap |
| --- | --- | --- |
| Lexical retrieval | `src/retrieval/lexical.ts`: field-weighted signal over chunks, unqualified AND, quoted clauses, SQLite FTS5 with a scan fallback | No stemming, no typo correction, no related-word expansion, no name matching, no "which words matched nothing" |
| Fusion | `fusion.ts`: `reciprocalRankFusion`, MMR | Usable as is; the Librarian's weighted four-list fusion must be shown equal to it or kept separate |
| Confidence | `confidence.ts`: `high` / `medium` / `low` / `insufficient` with reason codes | The Librarian's rules (coverage, missing phrase, rival note, ungrounded expansion) are not there |
| Answer shaping | Verified citations per chunk | No passages-with-heading, numbered steps, form links, or brief |
| Embedding over HTTP | `providers.ts`: `openai_compatible` provider, endpoint from `gkos.toml`, token from an environment variable | No Ollama `/api/embed` route; endpoint check is "http(s) with a host" only — **a public address is accepted**; no retry/shorten for over-long text; a 404/405/501 is not turned into advice |
| Address helpers | `gkx-network.ts` exports `isGkxLoopbackHost`, `isGkxPrivateLanIpLiteral` | Present, but `providers.ts` and `config.ts` do not call them |
| Python | `services/gkos-intelligence` (DSPy proposals), `services/gkos-graphiti` | No Python reader of retrieval results, no Python Librarian |

So the port is three additions, not a rewrite: a **Librarian module** on top of
the Engine's authorized view, a **stricter and wider embedding provider**, and
a **Python package** checked against the same vectors.

## 3. Decisions to take before building (owner: Oden)

1. **Where the Librarian ranks.** Option A (recommended): a new, separate
   route — `src/librarian/`, tool `gkos_ask_librarian_v1` — that reads the
   admitted authorized snapshot the way `gkos_search_lexical_v1` does and
   never changes `gkos_search` results. Option B: fold stemming, expansion
   and name matching into `src/retrieval/lexical.ts`. B changes frozen
   retrieval draft.1/draft.2 behaviour and every golden fixture; A does not.
2. **Note-level or chunk-level.** The Librarian ranks whole notes and then
   picks passages; Engine retrieval ranks chunks. Recommended: keep note-level
   ranking inside the Librarian and emit Engine chunk identities for the
   passages it picks, so citations stay verifiable.
3. **Private-network rule for `openai_compatible`.** Recommended: refuse
   public addresses and host names by default, with an explicit
   `allow_public_endpoint = true` in `gkos.toml` for the operators who run a
   hosted provider today. This is a behaviour change for existing configs and
   needs a COMPAT entry.
4. **Python: second implementation or client.** Recommended: a second
   implementation of the *pure* parts only (word scanner, stemmer, question
   parser, BM25, fusion, confidence rules), bound to the TypeScript reference
   by shared vectors, exactly as GKOS-Engine-Lite is bound to the Engine.
   TypeScript stays the reference; Python never becomes a second authority.
5. **Contract name.** Proposed `gkos-librarian-1.0.0-draft.1` under
   `contracts/librarian/`, derived from `kosmos-librarian/1`.

## 4. Phases

Each phase ends in something that runs and is checked. A phase is one branch
and one pull request under the Engine's change gates. Sizes are rough:
S = under a day, M = one to three days, L = about a week.

### Phase 0 — freeze the reference (S, in Kosmos-Oden)

- Export golden vectors from Kosmos-Oden `0.9.5-alpha.2`:
  `scanWords` (text → words), `stem` (word → stem), `parseQuestion`
  (question → words, stems, phrases, intent), and whole answers
  (`runLibrarian` over a small fixed corpus → full response JSON).
  Sources: `test/personal-librarian.test.mjs` cases, the 40 bench questions
  and a public-text fixture corpus (no private notes).
- Record the SHA-256 of each vector file and the commit that produced it.
- **Done when:** `contracts/librarian/…/vectors/*.json` exist with a manifest,
  and a script in Kosmos-Oden regenerates them byte for byte.

### Phase 1 — Librarian core in TypeScript (L)

- Add `src/librarian/` to GKOS-Engine: `words.ts` (scanner, stemmer, stop
  words), `index.ts` (`Vocabulary`, `DocVector`, `LibrarianIndex`),
  `question.ts`, `rank.ts`, `extract.ts`, `brief.ts`, `types.ts`. Split from
  the single Kosmos file along its existing section comments; no logic change.
- Replace the two Kosmos imports: `toSearchable`/`PreparedDoc` become a small
  `prepare.ts` in the module; `PersonalError` becomes the Engine's error
  convention (reason-coded `Error` messages such as
  `LIBRARIAN_QUESTION_INVALID:too_long`).
- Add the subpath export `gkos-engine/librarian` in `package.json` and the
  build script.
- Keep the performance work: hand word scanner, per-batch written-word cache
  with `release()`, typed counting arrays, one pass over each note's word
  list, heap selection, hashed name trigrams. These are in the reference
  already; the port must not replace them with regular expressions.
- **Done when:** every Phase 0 vector passes in the Engine; the Kosmos
  Librarian tests, ported to the Engine's test runner, pass; `npm run
  typecheck` and the Engine's current test script pass; a bench script reports
  indexing and question time for 10,000 notes within 15% of the Kosmos
  figures on the same machine (1.19 s and 10.5 ms for the ranking index alone on the build host).

### Phase 2 — authorization and the service route (M, *confirm first*)

- Feed the Librarian from the admitted authorized snapshot (the same source
  set `gkos_search_lexical_v1` scans): build the pool from authorized sources
  only, so vocabulary, document frequencies, corrections, `unmatched` and
  `phrases_missing` are computed inside the caller's scope. This is the
  property Kosmos tests as "a phrase outside the requester's scope counts as
  missing"; port that test.
- Add MCP tool `gkos_ask_librarian_v1` and the REST route beside the existing
  ten read-only tools; advertise it only when the host supplies the guarded
  validator, like lexical v1. Bind the response to snapshot digest, policy
  digest and question digest.
- Map confidence: `strong` → `high`, `weak` → `low`, `none` →
  `insufficient`, and add reason codes `QUESTION_WORD_UNMATCHED`,
  `PHRASE_MISSING`, `RIVAL_NOTE`, `EXPANSION_UNGROUNDED`. Keep the Librarian's
  own three-level value in the response as well.
- Decide the index lifetime: built per generation and cached by snapshot
  digest (recommended), or built per request for small vaults.
- **Done when:** a request with a restricted credential cannot learn a word,
  a phrase or a count from a source outside its scope (test with a planted
  unique word); the tool list and capability report show the tool only when
  enabled; the Engine's runtime qualification script passes.
- *Confirm first:* how `coordinator.ts` and `src/service/mcp.ts` build the
  authorized view and register tools.

### Phase 3 — embedding provider (M)

- `providers.ts`: add provider kind `ollama` (`POST /api/embed`,
  `{model, input}`), or a `wire = "openai" | "ollama" | "auto"` key on
  `openai_compatible`. Port `readEmbeddingAnswer` and the error classifier
  from `endpoint.ts`, including HTTP 501 as "no embedding route" and a
  400/422 about the model, sent without a model name, as "needs a model name".
- `providers.ts` and `config.ts`: call `isGkxLoopbackHost` /
  `isGkxPrivateLanIpLiteral` in `validateHttpEndpoint` (Decision 3). Accept an
  address ending in `/v1` or `/v1/embeddings`. Refuse credentials, query and
  fragment in the address.
- Port from `remote.ts`: batch size setting, send an over-long text alone and
  then shortened, check every answer's vector length against the configured
  `dimensions`, and stop the run on a server-wide failure instead of retrying
  text by text.
- Add question and passage prefix keys to `[vectors]` in `gkos.toml`, with
  `\n` expansion, and include them in the projection configuration digest so
  a prefix change cannot reuse old vectors.
- **Done when:** the Kosmos endpoint tests, ported, pass against the stand-in
  HTTP server; **and** one run against a real `llama-server --embeddings` and
  one against a real Ollama on a private address return vectors of the
  configured length. Kosmos-Oden got real vectors only through an
  OpenAI-compatible gateway (LiteLLM); neither direct server was run. Do not
  close this phase without both.

### Phase 4 — hybrid (S–M)

- Give the Librarian the Engine's vector stage as its fourth list: the top
  semantic sources for the question, already filtered by the authorized view.
- Show that the Librarian's weighted fusion equals `reciprocalRankFusion`
  with the same constants, or keep its own and document why.
- Semantic off, degraded or failing must yield exactly the word-based answer;
  port that test.
- **Done when:** the hybrid vectors from Phase 0 pass and the degraded-vector
  test passes.

### Phase 5 — Python (M–L)

- New package `services/gkos-librarian/` (`pyproject.toml`, `src/gkos_librarian/`,
  `tests/`), Python 3.11+, standard library only for the core.
- `words.py`, `question.py`, `rank.py`, `brief.py`: the pure functions.
  `client.py`: a small typed client for the Engine's REST route, for callers
  that only need answers. `embed.py`: the address rule and both wire formats,
  using `urllib` (no new dependency), for Python hosts that embed directly.
- Three points need care, because Python and JavaScript differ:
  1. **Strings.** The reference indexes by UTF-16 code unit; Python by code
     point. Offsets in passages must be converted, and limits written in code
     points (question length) or code units (title length) kept as written.
  2. **Unicode tables.** `\p{L}` / `\p{N}` membership depends on the runtime's
     Unicode version. Pin the vectors to characters stable across versions and
     record both runtimes' Unicode versions in the manifest.
  3. **Numbers.** Scores are IEEE doubles in both; keep the order of
     additions identical, and compare scores after the same six-decimal
     rounding the response already applies. Sorting must use the same
     explicit tie-break (score, then path by code unit).
- **Done when:** every Phase 0 vector passes in Python in CI on Python 3.11
  and 3.12; the whole-answer vectors match byte for byte after canonical JSON
  serialization; `python -m unittest discover` passes in the package.

### Phase 6 — Kosmos-Oden consumes the Engine (M, in Kosmos-Oden)

- Replace `src/personal-notes/librarian.ts` with an import from
  `gkos-engine/librarian` at a pinned Engine commit; keep the worker, the
  scope handling and the settings page.
- Replace the wire-format half of `src/semantic/endpoint.ts` with the Engine's;
  keep `src/plugin/embedding-endpoint.ts` (Obsidian's `requestUrl`).
- **Done when:** `npm run verify` passes in Kosmos-Oden with no Librarian
  logic left in it, the saved answers for the bench and real-folder questions
  are byte for byte the same as before the swap, and `main.js` did not grow.

## 5. Order and what can run side by side

Phase 0 first. Phases 1 and 3 are independent and can run in parallel.
Phase 2 needs 1. Phase 4 needs 2 and 3. Phase 5 needs 0 and can start as soon
as Phase 1's file split is settled. Phase 6 is last.

## 6. Risks

| Risk | What to do |
| --- | --- |
| The Librarian leaks scope through vocabulary or counts once it shares an index across credentials | Build document frequencies and vocabulary per authorized pool, as Kosmos does; the planted-word test in Phase 2 is the gate |
| Tightening the endpoint rule breaks an operator's hosted provider | Decision 3: explicit opt-out key, COMPAT entry, clear refusal message |
| TypeScript and Python drift | Shared vectors with hashes, run in both CIs; TypeScript is the reference and Python is pinned to an Engine commit |
| The per-generation index costs memory on large vaults | Measured in Kosmos: 43.7 MiB for 10,000 notes (51 MiB of text). Report it in the capability status and add a size limit |
| Answer quality is only measured on one folder | Kosmos figures: 39 of 44 right first, one wrong answer still called strong. Use the Engine's retrieval-evaluation contract to score the Librarian before calling it qualified |
| Two "confidence" vocabularies confuse callers | Phase 2 mapping table in the contract; keep both fields |

## 7. Evidence each pull request must carry

The exact command, commit, platform, failures and documented skips, as the
Engine's change gates require: typecheck, the current test script, pack check,
licence check, the phase's vectors, and for Phase 3 the transcript of the
real-server run with the server version and model named.
