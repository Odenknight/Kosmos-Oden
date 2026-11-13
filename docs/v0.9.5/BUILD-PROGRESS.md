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
- **Optional semantic list.** A fourth `fuse(...)` over an embedding source
  would raise paraphrase recall without changing the response shape. Needs a
  model file (~67 MB) or a local embedding endpoint, and a decision about the
  plugin's size and offline guarantees.
- **Obsidian runtime checks** and a real MCP client, per `ALPHA-TEST.md`.
- **Blocks with hand edits** in real vaults, and CRLF/BOM folders for the MoC.
- **Returning note links as clickable paths** in `/ui` (needs a tiny note view).

## Not in scope for 0.9.5

Embeddings in the plugin, PDF/OCR indexing, a model-backed Ask box, enrichment
by a model at index time, and any write path from the MCP tools.