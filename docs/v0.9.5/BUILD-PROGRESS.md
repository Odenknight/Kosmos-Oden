# v0.9.5 — build progress

## Delivered

| Item | State | Where |
| --- | --- | --- |
| Stemming, BM25 with title/alias/tag/file-name/heading weight | done | `src/personal-notes/librarian.ts` |
| Pseudo-relevance expansion as a second ranked list | done | same, `feedbackDocs` / `feedbackTerms` |
| Name trigram matching, exact-name shortcut | done | same, `trigrams`, `nameSimilarity` |
| Typo correction against in-scope vocabulary | done | same, `editDistance`, `nearest` |
| RRF fusion of three lists, intent-aware name weight | done | same, `LIST_WEIGHT`, `classifyIntent` |
| Passage extraction with heading and raw offset | done | same, `extractFromNote` |
| Links with form detection, steps, note links | done | same |
| IDF-weighted coverage, rarest-word gate, title specificity | done | same, `score` |
| Deterministic markdown brief | done | same, `renderLibrarianBrief` |
| Worker: vectors built in the yielded staging loop, atomic publish | done | `search-worker.ts` |
| Client: `librarian()` with revision reissue and policy-generation fencing | done | `worker-client.ts` |
| Tool `ask_librarian`, validation, six-tool surface | done | `query-service.ts` |
| REST `GET /librarian`, static page `GET /ui` | done | `plugin/agent-server.ts`, `plugin/personal-ui.ts` |
| Runtime wiring through the canonical allowed-path set | done | `plugin/personal-runtime.ts` |
| MoC generator `kosmos-moc/1` | done | `personal-notes/moc.ts` |
| Hash-checked MoC writer | done | `personal-notes/moc-writer.ts` |
| One folder run: list, read, plan, apply | done | `personal-notes/moc-run.ts` |
| Command: **Update this folder's map of content** | done | `plugin/main.ts` |
| Docs: API, personal guide, changelog, v0.9.5 notes | done | `AGENT-API.md`, `docs/PERSONAL-NOTES.md`, `CHANGELOG.md`, `docs/v0.9.5/` |
| Version 0.9.5 across source, manifest, lockfile, versions.json | done | `src/kosmos-version.ts` and the four files |

## Evidence

- `npm run verify` — typecheck, build, 721 tests, version/lockfile/artifact/
  invariant/renderer checks: all pass (2026-11-13).
- New tests: 13 Librarian (module + worker + client), 62 MoC, 6 folder run.
- Real vault read-only run: 3,913 notes / 41.3 M characters, 64 s build,
  52–106 ms per question, typo correction verified (`pydantc` → `pydantic`).

## Open

- **Relevance judgement set.** No scored questions yet; confidence is the
  current proxy. This is the first thing to measure.
- **Semantic list: delivered** (see "Semantic search" below). Still open: a
  relevance judgement set for the hybrid ranking, and a run inside Obsidian.
- **Obsidian runtime checks** and a real MCP client, per `ALPHA-TEST.md`.
- **Blocks with hand edits** in real vaults, and CRLF/BOM folders for the MoC.
- **Returning note links as clickable paths** in `/ui` (needs a tiny note view).

## Semantic search (added on `pollux/semantic-0.9.5`)

| Item | State | Where |
| --- | --- | --- |
| Model catalog: MIT / Apache-2.0 only, pinned revision, size and SHA-256 per file | done | `semantic/catalog.ts` |
| Download with progress and cancel; own model files | done | `semantic/models.ts`, `plugin/semantic-host.ts` |
| Embedding in a Web Worker (ONNX Runtime WebAssembly, bundled) | done | `semantic/embedder.ts`, `semantic/worker.ts` |
| SQLite index written by the plugin (SQLite WebAssembly, bundled), no note text | done | `semantic/store.ts` |
| Heading-aware passages, incremental re-embedding, pause/resume/rebuild | done | `semantic/chunker.ts`, `semantic/service.ts` |
| Settings section | done | `ui/semantic-settings.ts` |
| Fourth fused list, `found_by`, `semantic`, `related` in `ask_librarian`; `similar_meaning` in `get_related` | done | `personal-notes/librarian.ts`, `personal-notes/query-service.ts` |
| Server instructions and tool description guide the assistant onward | done | `plugin/agent-server.ts` |
| Guard rules in `kosmos-invariants.yml` | done | `scripts/check-invariants.mjs` |

Evidence: `test/semantic.test.mjs`, `test/semantic-ui.test.mjs`,
`test/personal-hybrid.test.mjs` (49 tests; real SQLite, real controller, real
started server, stand-in model), and `scripts/semantic-smoke.mjs` (the five
real models in headless Chromium, 16 checks each).

## Not in scope for 0.9.5

PDF/OCR indexing, a model-backed Ask box, enrichment by a model at index time,
and any write path from the MCP tools.