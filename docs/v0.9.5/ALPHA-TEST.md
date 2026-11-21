# v0.9.5 alpha — what was and was not tested

**Status: alpha test candidate, not a qualified release.**

## Alpha.6 Engine pairing

The lockfile pins GKOS-Engine 2.5.2 at `44c62208b8a82d350d29bc7fcf44c8a0a13a575b`, the merge that includes the APFS recovery and ingest fixes. The release qualification starts the installed Engine CLI with a temporary vault, compares its served HTML with the Kosmos build, authenticates through the viewer, and verifies the exported graph. The full browser workflow runs the pair on Ubuntu and macOS. [Release and verification notes](https://github.com/Odenknight/Kosmos-Oden/releases/tag/kosmos-oden-0.9.5-alpha.6)

## Alpha.5 renderer and Engine pair (2026-11-21)

Kosmos 0.9.5-alpha.5 (PR 115) and Engine 2.5.2 (PR 119) were tested together on Windows with Node 24.18.0. The rebuilt standalone HTML and the HTML served by the installed Engine package were byte-identical (1,085,586 bytes, SHA-256 `c34a87cd1049cdaf094410cb5705e6406c8982fab72889b8acd9fe98f1eacae6`). The paired test starts `gkos-menu open-kosmos-oden` on loopback, connects the browser to a temporary one-note vault, and checks that its exported graph contains exactly that note.

| Command or check | Result |
| --- | --- |
| `npm run verify` | 832 tests passed, zero skipped. Type, build, lockfile, artifact, invariant and r187 provenance gates passed. |
| `npm run test:browser:chromium -- --workers=1` | 54 desktop and mobile Chromium tests passed. |
| `npm run test:browser:full -- --workers=1` | 40 Firefox and WebKit tests passed on Windows. |
| `npm run test:browser -- --workers=1` | 105 passed across Chromium, Firefox and WebKit. Six declared skips cover Chromium-only context-loss and long-task checks in the other two browsers. The live Engine test passed in all three desktop browsers. |
| `npm run test:visual -- --workers=1` | Three Chromium scenes passed. All nine desktop visual comparisons passed in the broader run. |
| [Ubuntu full-matrix qualification](https://github.com/Odenknight/Kosmos-Oden/actions/runs/44914987982) | 20 Firefox and 20 WebKit tests passed using Mesa llvmpipe and a 24-bit Xvfb display. The Chromium visual and live Engine pair steps passed. |

The old star-focus references showed visible connections and wider galaxy spacing. The new references were compared independently with the shipped behavior from [PR 57](https://github.com/Odenknight/Kosmos-Oden/pull/57) and [PR 59](https://github.com/Odenknight/Kosmos-Oden/pull/59). The same star remains focused in each browser. The overview references and screenshot tolerances remain in force.

## Alpha.4 verification on Windows (2026-11-21)

With Engine 2.5.1, `npm run verify` passed 832 plugin tests along with type, artifact, invariant and renderer checks. `npm run test:browser:chromium -- --workers=1` passed 54 desktop and mobile tests. `npm run test:browser:full -- --workers=1` passed 40 Firefox and WebKit tests. A concurrent local Chromium run timed out on several tests and was interrupted. The serial run completed with the original assertions and deadlines. The earlier review reproduced the advisory `star-focus` screenshot difference on the unmodified upstream viewer. No visual reference was regenerated.

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

## Verified for build alpha.3 (2026-11-15)

- `npm run verify`: **826 tests**, 0 failing, and every guard (Windows 11,
  Node 24.18.0).
- Librarian scope: `test/personal-librarian-noninterference.test.mjs` asks the
  same questions over the readable notes alone, with hidden notes added, with
  those edited and with those deleted, and requires identical answers; a
  reader of the hidden notes gets different ones. Five of its seven tests fail
  on the alpha.2 code. `test/personal-api.test.mjs` checks that
  `corpus_revision` stays when only hidden notes change.
- Nine new tests, one or more per fix: `test/nextcloud-sync.test.mjs` (state
  for another scope, HTTP host rule), `test/personal-plugin.test.mjs`
  (frontmatter fence, token-free guide, containment cache, Map of Content
  through the real plugin, conversion default), `test/personal-moc-run.test.mjs`
  (first index), `test/agent-api.test.mjs` (hidden title in diagnostics),
  `test/semantic-endpoint.test.mjs` (server answering 500 or 429 to
  everything), `test/semantic.test.mjs` (serialised saves, unreadable index).
- The hidden-title leak in diagnostics was reproduced on the alpha.2 code
  before the fix (a readable note superseding a `secret` one with a later
  timestamp).
- Not done: nothing in alpha.3 was run inside a real Obsidian or on a phone.
  Still to try by hand: a Nextcloud sync with **Propagate deletions** on (the
  deleted file should be in the trash), the first Map of Content of a folder,
  and **Write guide to vault**.

## Verified for build alpha.2 (2026-11-14)

- `npm run verify`: **809 tests**, 0 failing, and every guard.
- Librarian, real folder (542 Markdown notes, 8.7 M characters, read-only): 44
  labelled questions and 6 the folder cannot answer. Right note first 39 of
  44, in the first three 43, wrong answers called `strong` 1, unanswerable
  questions called `strong` 0 of 6. alpha.1 on the same questions: 39, 42, 3
  and 2 of 6.
- Librarian speed (10,000 generated notes, 51 MiB, median of three runs):
  first build in the search worker 1.22 s (alpha.1 2.46 s), a question
  13.3 ms on average (17.9 ms), index memory 43.7 MiB (the same), process
  memory at the end of the bench 413–488 MiB (406–474 MiB). The speed-only commit was checked by comparing the saved
  answers to 40 generated-corpus questions and 50 real-folder questions byte
  for byte.
- Embedding server: both wire formats over real HTTP against a stand-in
  server; the address rule. With real servers, from Node with the plugin's
  client: a LiteLLM gateway at a private address returned 768-number vectors
  for two texts (OpenAI-compatible route, address bare and with `/v1`); a
  `llama-server` without `--embeddings` (HTTP 501) was reported as "no
  embedding route"; the gateway asked without a model name (HTTP 400) is
  reported as "needs a model name". Through the same gateway, five questions
  that share no content word with their passage each ranked the right one of
  seven passages first (cosine 0.54–0.68 against 0.37–0.49 for the runner-up).

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
| Semantic search in Obsidian | The settings section, a model download, choosing own model files, and a first index of a real vault inside a running Obsidian on Windows and macOS. Tested so far: Node (real SQLite, stand-in model) and headless Chromium (five real models) |
| Semantic search at scale | Measured on the build host only: 2 to 14 passages per second depending on the model (one CPU thread), 46 ms to compare a question with 50 000 passages. A first index of a real vault of thousands of notes, and memory use while it runs, are not measured |
| Embedding server, real | Ollama's own route against a real Ollama; llama-server and LM Studio directly; a server on this computer (`127.0.0.1`); the request from inside Obsidian (`requestUrl`); an API key; a first index of a real vault through a server with a GPU |
| Semantic relevance | No scored questions for the hybrid ranking on a real vault |

## How to report a problem

Capture: the tool call or URL, the JSON response, `vault_overview`, and the
`corpus_revision`. Retrieval questions need the question text and the paths
that should have won.