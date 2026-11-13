# v0.9.5 — semantic search

Semantic search finds notes by meaning, not only by the words in them. A
question such as "my computer will not start" finds a note titled "Recovery
runbook" that says "when the machine will not boot".

It is **off until you turn it on**, it runs **inside Obsidian**, and it needs
**nothing else installed**: no Python, no Ollama, no server, no database
program, no account.

## Turn it on

Settings → Kosmos-Oden → **Semantic search** (directly below Personal Notes).

1. Switch **Search by meaning** on.
2. Choose an **Embedding model** from the list and press **Download**. The
   button shows the size. The file is checked against a recorded SHA-256 before
   it is used.
3. That is all. The index builds in the background; the **Index** line shows
   progress. Search works while it builds and uses what is embedded so far.

Buttons you will see: **Download** / **Cancel download**, **Delete model**,
**Pause** / **Resume**, **Rebuild index** (asks once more before it starts).

Turning the switch off stops the model and frees its memory. The index file
stays, so turning it on again does not embed everything a second time.

## The models in the list

Every model in the list is published under the MIT or Apache-2.0 licence. Each
is pinned to one commit of its repository, with the size and SHA-256 of every
file recorded in the plugin.

| Model | Licence | Download | Vector | Languages |
| --- | --- | --- | --- | --- |
| Snowflake Arctic Embed S (recommended, the default) | Apache-2.0 | 35 MB | 384 | English |
| all-MiniLM-L6-v2 (smallest and fastest) | Apache-2.0 | 24 MB | 384 | English |
| BGE Small EN v1.5 (full precision) | MIT | 134 MB | 384 | English |
| BGE Base EN v1.5 (higher quality, slower) | MIT | 111 MB | 768 | English |
| Multilingual E5 Small | MIT | 135 MB | 384 | 100+ languages |

The download comes from `huggingface.co` and is the only network request this
feature ever makes. It carries no note text, no note path and no token. A model
that is missing on this device is never fetched by itself; you press Download.

## Use your own model

Choose **Use my own model files…** at the end of the same list. Under **Your
model files**, select together:

- the model as an ONNX file (any name ending `.onnx`; one file, up to 1 GB), and
- its `tokenizer.json` (and `tokenizer_config.json` if it has one).

The files are copied into the plugin's folder; nothing is downloaded. Then set
four things from the model's card: a **Name**, the **Pooling** (mean or CLS),
the **Longest input** in tokens, and the **Question prefix** / **Passage
prefix** if the model expects them.

It must be a BERT-style text-embedding model exported to ONNX (the usual
"feature extraction" export, as published for sentence-transformers, BGE, E5,
GTE and Arctic models). The licence of a model you bring is yours to check.

## What is stored, and where

Everything is under the plugin's own folder,
`.obsidian/plugins/kosmos-oden/semantic/`:

- `models/<model>/` — the model files.
- `index-<model>.sqlite` — the index, one per model.

The index is a real SQLite database, created and written by the plugin itself
(SQLite compiled to WebAssembly, bundled in `main.js`). You can open it with
any SQLite tool. It holds, per note: the path, a change key, and for each
passage its position in the note, its length and its vector. **It holds no note
text** — no passage, no heading, no title. A passage is always read back from
the note itself.

A note is split into passages of about 1 000 characters at headings and
paragraphs. Only notes that changed are embedded again. Choosing another model
builds another index, because vectors of different models cannot be compared.

## What your AI gets (MCP and REST)

Nothing new to configure: the same connection, the same six tools.

- `vault_overview` reports `capabilities.semantic_search` (`state`, `model`).
- `ask_librarian` fuses up to **four** ranked lists: words (BM25), expansion,
  names — and meaning. Each result carries `found_by`, the rank it had in each
  list (for example `{ "words": 1, "meaning": 2 }`), and `semantic_score` when
  it was found by meaning. The response says how the search ran in
  `semantic.state`: `ready`, `partial` (the index is still building), `off`,
  `loading` or `error`.
- The answer also carries `related`: notes the answering notes link to and
  notes close to them in meaning. The brief lists them under **Related
  processes — read next if the answer above is only part of the task**, and the
  server instructions tell the assistant to follow them and say which step
  comes next.
- `get_related` adds the reason `similar_meaning` next to links and tags.

Three rules hold in every case:

1. **Semantic search never shows an assistant more.** Every semantic request
   names the notes the requester may read, and anything else is dropped twice:
   in the index and again in the Librarian.
2. **Semantic search only adds.** If it is off, loading, slow or failing, the
   answer is the word-based answer of before, and `semantic.state` says so.
3. **Closest is not the same as matching.** A question about something your
   notes do not cover still has a closest note. A note found by meaning alone is
   labelled "found by meaning only", and when no note contains the question's
   words the brief says so before listing the closest ones.

## Measured on the build machine

Real models in headless Chromium (Playwright build 1243; Obsidian is built on
the same browser engine), one CPU thread, on the build host, an Intel Core
i7-11800H (`scripts/semantic-smoke.mjs`, 2026-11-13):

| Model | Load | One question | First index: passages per second |
| --- | --- | --- | --- |
| all-MiniLM-L6-v2 | 0.5 s | 6 ms | 14.0 |
| Snowflake Arctic Embed S | 0.5 s | 17 ms | 6.2 |
| Multilingual E5 Small | 1.1 s | 14 ms | 5.9 |
| BGE Small EN v1.5 | 0.8 s | 28 ms | 3.6 |
| BGE Base EN v1.5 | 0.8 s | 60 ms | 2.0 |

The indexing column is 25 real Markdown documents (270 000 characters, 486
passages). **The first index is the slow part.** At these rates 10 000
passages — a few thousand ordinary notes — take about 12 minutes with
all-MiniLM-L6-v2, 27 minutes with Arctic Embed S and well over an hour with
BGE Base. It runs in the background, is saved about once a minute, and
continues where it stopped if Obsidian is closed; after that only changed
notes are embedded. Your machine will differ.

The index file is about 1.6 KB per passage for a 384-number model (16 MB per
10 000 passages) and 3.3 KB for a 768-number one. Comparing a question with
50 000 stored passages took 46 ms (measured in Node on the same host).

## Limits to know

- **Not tried inside Obsidian yet.** The whole path is tested in Node (real
  SQLite, the real controller, a stand-in model) and in headless Chromium (real
  models). Download, file choosing and the settings section inside a running
  Obsidian are not yet tried on a real vault.
- **Meant for a desktop computer.** A loaded model keeps its whole file in
  memory plus working space, and memory use was not measured. It was not tried
  on a phone or tablet; leave it off there.
- **One CPU thread, no GPU.** Chosen for stability inside Obsidian.
- **The first index of a large vault takes a long time** (table above): one
  CPU thread does all the embedding. Pick all-MiniLM-L6-v2 if that matters
  more than quality. Embedding in several workers at once is not built.
- **Search compares the question with every passage.** Exact and simple;
  measured up to 50 000 passages (46 ms), growing linearly beyond that. The
  whole index is held in memory while semantic search is on.
- **Markdown text only.** No PDFs, images or OCR.
- **The first 400 000 characters of a note are embedded**, in at most 120
  passages.
- **Four of the five listed models are English.** For other languages choose
  Multilingual E5 Small or your own model.
- **The index is device-local** but lives in the vault's plugin folder. If you
  sync `.obsidian/plugins`, exclude `kosmos-oden/semantic/` or expect the model
  and index to be synced too.
