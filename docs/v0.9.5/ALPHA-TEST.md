# v0.9.5 alpha — what was and was not tested

**Status: alpha test candidate, not a qualified release.**

## Verified on the build machine (2026-11-13)

- `npm run verify`: typecheck, build, **721 tests**, and the version, lockfile,
  artifact, invariant and renderer-provenance checks all pass.
- New for 0.9.5: `test/personal-librarian.test.mjs` (13), `test/personal-moc.test.mjs`
  (62), `test/personal-moc-run.test.mjs` (6). The server test asserts
  `GET /librarian`, the six-tool list on every MCP era, and that `GET /ui`
  serves the static page.
- Real vault, read-only: 3,913 notes (41.3 M characters, 42 skipped by
  sensitivity), vectors built in 64 s on the Toughbook, questions answered in
  52–106 ms each. `pydantc` was corrected to `pydantic`; a question the vault
  does not answer came back `weak` rather than `strong`.

## Not tested — do these before calling it qualified

| Area | What is missing |
| --- | --- |
| Obsidian runtime | The page and command inside a real Obsidian 1.13.0 on Windows and macOS: `/ui` rendered in the app's browser, the MoC command writing into a real vault, the ribbon and settings copy |
| MCP clients | A real Claude Desktop / Claude Code / Codex session using `ask_librarian` end to end, including a legacy client that caches `tools/list` |
| Relevance | A judgement set: no one has scored the Librarian's top-5 answers on real questions. Lexical relevance is known to be uneven (see KNOWN-LIMITATIONS) |
| Scale | A vault above 128 MiB of Markdown, and a corpus with 10k+ notes: vectors and document frequencies grow with the corpus, `maxVocabulary` is 2 M words |
| MoC | Real folders with hand-edited blocks, CRLF files, BOMs, and a concurrent edit during the write |
| LAN/web | `/ui` over the LAN with "Local network" on, behind another machine's browser |
| Sensitivity | A vault where shared folders contain `confidential` or `secret` notes, to confirm they never reach `ask_librarian` |

## How to report a problem

Capture: the tool call or URL, the JSON response, `vault_overview`, and the
`corpus_revision`. Retrieval questions need the question text and the paths
that should have won.