# v0.9.5 — the Librarian and the deterministic MoC

This note records what was in the prototype folder (`agent.py`, `server.py`,
`webui.py`, `librarian_core.py`, `enrich.py`, `download_model.py`,
`config.example.toml`), what carried into the plugin, what could not, and what
the shipped design does instead. Read it before changing either feature.

## What the prototype was

One Python process per vault, one SQLite file, an MCP server on Streamable HTTP
and a small web page on the same port:

| Piece | Prototype | Hook |
| --- | --- | --- |
| Keyword search | SQLite FTS5, `porter unicode61`, BM25 | `chunks_fts` |
| Semantic search | `BAAI/bge-small-en-v1.5` (67 MB, CPU) via a local embedder | `chunks.embedding` |
| Name search | fuzzy ratio over titles, aliases and file names, cutoff 75 | `_name_matches` |
| Fusion | reciprocal rank, `1 / (K + rank + 1)` over keyword, semantic and name | `Library.search` |
| Version collapse | superseded documents resolve to their current version | `is_current` |
| Answer shaping | per-document card: score, matched-by, page/section, snippet | `Library.card` |
| Enrichment | Claude Haiku writes a summary, aliases and the questions a document answers, cached by file hash | `enrich.py` |
| Ask box | Claude Code headless (`claude -p`), stream-json, job per question | `agent.py` |
| Web | htmx page with search, preview and Ask | `webui.py` |
| Coverage | notes, PDFs (per page), OCR of images | `Indexer` |

Two properties of that design are worth naming. First, retrieval itself was
already **hybrid without a model at query time**: keyword, name and vector
lists fused by rank, so a weak list could not sink a strong one. Second, the
"agentic" part (enrichment, Ask) was **outside retrieval**: it spent tokens
before indexing or after ranking, never to decide what matches.

## What a plugin cannot take over

- **SQLite FTS5 and Python.** Obsidian runs JavaScript in an app sandbox; there
  is no SQLite runtime, no `fts5`, no Python. A bundled SQLite WASM build would
  add megabytes and a second index that has to be kept in step with the vault.
- **A downloaded embedding model.** `bge-small` is ~67 MB plus tokenizer and a
  runtime ONNX/WASM stack. Downloading it on first run turns a 700 KB plugin
  into a multi-megabyte one with a network dependency and a licence surface. It
  is a reasonable *optional* extension, not a default.
- **Claude Code headless as the Ask box.** Every question would be an account
  sign-in, a subprocess and tokens, on a tool whose value is that it costs
  nothing and answers deterministically.
- **Enrichment by a model at index time.** Same objection, and it would make the
  index depend on which model ran and when.

## What v0.9.5 does instead

The Librarian keeps the prototype's **shape** (three ranked lists, RRF, cards
with the answering text) and replaces each model-dependent part with a
deterministic equivalent:

| Prototype | v0.9.5 |
| --- | --- |
| FTS5 `porter` over chunks | Light suffix stemmer over the whole note, BM25 (`k1` 1.2, `b` 0.75), title/alias/tag/file-name/headings weighted 1.5× extra |
| Semantic list (embeddings) | Pseudo-relevance expansion: words shared by the best lexical matches, weighted 0.35, fused as a separate list |
| Name ratio (difflib) | Character-trigram Dice + coverage over normalized titles, aliases and file names |
| Typos (rapidfuzz) | Edit distance 1–2 on the same first letter, restricted to vocabulary words that occur in scope; reported as `corrections` |
| PDF pages, OCR | Out of scope: the personal corpus is Markdown (attachments stay references) |
| `Ask` (Claude headless) | Not needed: the brief is rendered from the same deterministic result |
| htmx page | One self-contained page at `/ui`, no external assets |

Everything runs in the existing search worker, beside the lexical index, over
text already in memory. There is no new index file, no download and no model.
Adding a semantic list later is a fourth `fuse(...)` call and an async
embedding source; the response shape does not change.

## The contract

Tool `ask_librarian`, REST `GET /librarian`, page `GET /ui` — one response:

- `intent` (`locate`, `howto`, `history`, `troubleshoot`, `lookup`) picks how
  names are weighted, nothing else.
- `terms`, `corrections`, `expanded`, `phrases`, `confidence`, `total`,
  `coverage`, `corpus_revision`.
- per hit: `path`, `title`, `score`, `ranks`, `matched_terms`, `term_coverage`,
  `passages` (best two blocks with the heading above them and a raw offset),
  `links` (web and mailto, `kind: form` when the URL or its wording is a form /
  request / application), `steps` (numbered or checkbox items, `done` for a
  checked box), `note_links`, `fingerprint` (equal text after properties ⇒
  duplicates can be collapsed by the caller).
- `brief`: markdown for an agent to read or quote — forms first, then steps,
  then links, capped at 6 notes.

Agents are told (tool description, `AGENT-API.md`) to use `ask_librarian` for a
sentence and `search_notes` for exact words or a tag. The brief exists because
"perform a hybrid search and present the information usefully" is a rendering
problem, and a deterministic renderer is reproducible and costs nothing.

## Scope and safety

The allowed-path set is built exactly as for `search_notes` (folder selection,
exclusions, operational paths, sensitivity ceiling) and passed to the worker,
which filters **before** matching, counting or extraction. Vocabulary,
document frequencies, corrections and expansion words are computed from the
requester's own pool only; one corpus-wide document frequency is used to rank
expansion words already found inside that pool. A reply carrying a path outside
the allowed set is refused, and a reply from an older policy generation is
discarded. Nothing is written by the Librarian.

## The MoC generator

`planMoc` turns one folder's notes into the exact text of its index note, and
`applyMocPlan` writes it through a narrow host. The generator is pure: no
Obsidian, Node, clock, randomness or locale. Contract `kosmos-moc/1`:

- Order is the display title NFC-normalized and lower-cased, compared by UTF-16
  code units, ties broken by path; subfolder groups order segment by segment.
- Links fall back `[[Base name]]` → `[[folder/note|Title]]` → Markdown link only
  when a wikilink would be ambiguous or unsafe.
- Only the block between `<!-- kosmos-moc:begin v1 -->` and
  `<!-- kosmos-moc:end -->` is replaced. Text outside it, the BOM and the
  dominant line ending survive. A file without a block is refused
  (`unmanaged_file`), never adopted.
- An update re-reads the target, requires it to still equal the text the plan
  was computed from, saves an exact backup first and compare-and-writes; a
  concurrent edit is skipped, not overwritten. A create never overwrites.
- `runFolderMoc` is the one sequence the command, the tests and any future
  surface use: list, read, plan, apply when the plan says create or update.

Command: **Update this folder's map of content (deterministic)** (active note's
folder). The block is stable, so re-running it is a no-op (`unchanged`).

## Known limits

- No stemming for irregular forms (`ran` / `run`), no cross-language folding, no
  synonyms beyond what the notes themselves share.
- The expansion list helps recall but can add a weak list to an already good
  one; it is ranked below the caller's own words and never shown as terms.
- Passage extraction scans the first 200 000 characters of a note.
- `form` detection is heuristic: known form hosts plus wording; an unusual
  form service is reported as `link`.
- The MoC generator lists Markdown only, one folder per run, and refuses the
  vault root and files without the managed block.
- The web page keeps the token in `sessionStorage`; it is the same bearer token
  the agents use, so serve it over loopback or a trusted network only.