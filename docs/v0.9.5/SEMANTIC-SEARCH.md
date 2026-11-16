# v0.9.5 — semantic search

Semantic search finds notes by meaning, not only by the words in them. A
question such as "my computer will not start" finds a note titled "Recovery
runbook" that says "when the machine will not boot".

It is **off until you turn it on**, it runs **inside Obsidian**, and it needs
**nothing else installed**: no Python, no Ollama, no server, no database
program, no account. If you already run an embedding server (llama.cpp,
Ollama, LM Studio and others), you can use it instead — see
[Use an embedding server](#use-an-embedding-server).

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

The download comes from `huggingface.co` and, with the built-in model, is the
only network request this feature ever makes. It carries no note text, no note
path and no token. A model
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

## Use an embedding server

Instead of the model inside the plugin, embeddings can be made by an embedding
server you run yourself: llama.cpp's `llama-server`, Ollama, LM Studio, vLLM,
text-embeddings-inference, LocalAI or anything else that speaks the
OpenAI-compatible `/v1/embeddings` route or Ollama's `/api/embed`. Everything
else — the index, the hybrid ranking, related notes, what an assistant may
read — is the same.

Prefer a server when you want:

- a **bigger or multilingual model** than the ones in the list (BGE-M3,
  Qwen3-Embedding, Nomic, E5 Large …);
- a **GPU**, so the first index of a large vault takes minutes, not hours;
- **one server for a household or small office**, shared by several vaults;
- **nothing loaded inside Obsidian**: with a server, no model and no ONNX
  runtime are loaded in Obsidian's memory.

### Set it up

Settings → Kosmos-Oden → Semantic search → **Where embeddings are made** →
**Embedding server**. Then:

1. **Address** — where the server listens. The two buttons fill in the usual
   ones: **llama.cpp on this computer** (`http://127.0.0.1:8080`) and **Ollama
   on this computer** (`http://127.0.0.1:11434`). An address ending in `/v1` or
   `/v1/embeddings` works too.
2. **Server type** — *Detect automatically* (OpenAI-compatible first, then
   Ollama), *OpenAI-compatible — llama.cpp, LM Studio, vLLM*, or *Ollama*.
3. **Model name** — optional for OpenAI-compatible servers, required for
   Ollama (for example `bge-m3`).
4. **API key** — only if your server asks for one. It is kept on this device
   (Obsidian's local storage), not in the plugin's settings file, so it does
   not sync, and it is sent only as an `Authorization: Bearer` header.
5. Press **Test connection**. It sends the word "probe" and shows, for
   example, *Connected: bge-m3, 1024-number vectors, 35 ms*. With *Detect
   automatically*, the type that answered is saved.
6. Switch **Search by meaning** on. Starting is one probe call; then the
   index builds as with the built-in model.

Under **Advanced**: **Question prefix**, **Passage prefix** and **Passages per
request** (1 to 64, default 16; lower it if the server runs out of memory).

**Which addresses are allowed.** `http://` or `https://`, and the host must be
this computer (`localhost`, `127.x.x.x`, `::1`) or a numeric address on your
private network (`10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`, `169.254.x.x`,
IPv6 `fc00::/7` or `fe80::/10`). Public addresses and names other than
`localhost` are refused, so note text cannot leave your network by mistake.
No user name or password, `#` part or key in the address: use the API key
field.

**The index follows the model, not the address.** It is named after the model
name (the one you typed, else the one the server reports), the vector length
and the two prefixes. Moving the same model from `127.0.0.1` to another
computer keeps the index; changing the model name or a prefix builds a new one.
Type the model name when your server does not report a meaningful one:
an index is reused whenever name, vector length and prefixes match.

### llama.cpp

On this computer:

```sh
llama-server -m <model>.gguf --embeddings --pooling <cls|mean|last> --host 127.0.0.1 --port 8080 -c 2048
```

Then use the address `http://127.0.0.1:8080`. (Recent `llama-server` versions
listen on port 9931 when no `--port` is given; the command above sets 8080.)

On another computer of your network, start it with `--host 0.0.0.0`, allow the
port only from your local network in that computer's firewall, and type
`http://<that computer's address>:8080`, for example
`http://192.168.1.20:8080`.

### Ollama

```sh
ollama pull bge-m3
```

Address `http://127.0.0.1:11434`, server type *Ollama* (or *Detect
automatically*), model name `bge-m3`. To serve other computers on your
network, set the environment variable `OLLAMA_HOST=0.0.0.0:11434` for Ollama
(Ollama's FAQ shows how on macOS, Linux and Windows), restart it, allow the
port only from your local network in that computer's firewall, and type
`http://<that computer's address>:11434`.

### Pooling and prefixes

The server must pool the way the model was trained, and the prefixes must be
the ones the model card asks for. A wrong choice still works, but ranks worse.

| Model family | Pooling (`--pooling`) | Prefixes |
| --- | --- | --- |
| BGE | `cls` | The English BGE v1.5 models take the question prefix `Represent this sentence for searching relevant passages: ` (the built-in list uses it too). |
| all-MiniLM, E5, Nomic | `mean` | E5: question prefix `query: `, passage prefix `passage: `. For others, see the model card. |
| Qwen3-Embedding | `last` | Question prefix `Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery: ` |

The prefix boxes hold one line, so type a line break as the two characters
`\n`, exactly as written above; Kosmos-Oden sends a real line break in their
place. Ollama decides the pooling for the models it serves; there is no flag
to set.

### Privacy

- With the built-in model, no note text leaves the device.
- With an embedding server, **note passages and your questions are sent to
  the address you typed**, and nowhere else. The settings page says so, says
  when the address is another computer on your network, and says when the text
  travels unencrypted (`http://` to another computer).
- Use a server you run. The index stays in the plugin's folder and still holds
  no note text. What an assistant may read is unchanged.
- `vault_overview` tells your AI where embeddings are made
  (`capabilities.semantic_search.runs`).

### When the server does not answer

Search keeps working by words; the **Index** line shows the reason and a
**Retry** button. A question asks the server again at most every 30 seconds;
**Retry** and **Test connection** ask at once. If the server stops while the
index is being built, indexing pauses (nothing is marked as failed) and
continues on **Retry** or when a note changes.

| The settings page says | What to do |
| --- | --- |
| No embedding server answered at *address*. Start it, or check the address. | Start the server; check the address and port; on another computer, check its firewall and that it listens on the network (`--host 0.0.0.0`, `OLLAMA_HOST=0.0.0.0:11434`). |
| This server has no embedding route. Start llama-server with --embeddings, or choose Ollama. | llama.cpp: restart it with `--embeddings`. Ollama: choose *Ollama* and type a model name. |
| The server asked for an API key. / The server did not accept the API key. | Enter (or correct) the key under **API key**. |
| Ollama needs a model name. Type it under Model name, for example bge-m3. | Type the model name (`ollama list` shows them). |
| The embedding server at *address* did not answer within 60 seconds. | The server is busy or stuck; check it, lower **Passages per request**, press Retry. |
| The embedding server at *address* is not ready (HTTP 503) … | The server is still loading its model; wait, then press Retry. |
| The server now returns *N*-number vectors but the index was built with *M*. … | The model on the server changed. Check the model name, then press Retry: a new index is built for the new model. |
| The text was too long for the server (HTTP 413) / … (HTTP 500). It said: … | Kosmos-Oden sends such a passage alone and then cut in half, up to three times; a note that still fails is counted as "could not be embedded". For llama.cpp, a larger context (`-c`) and physical batch size (`-ub`, 512 by default) may help. |
| *address* is not allowed. Use this computer … | Use `127.0.0.1`/`localhost`, or the numeric private address of the server, not its name. |
| The server's answer was not JSON. … | The address points at something other than an embedding server (a web page, a proxy). |

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

- `vault_overview` reports `capabilities.semantic_search` (`state`, `model`,
  and `runs`: inside Obsidian, or on the user's embedding server).
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
- **One CPU thread, no GPU** for the built-in model. Chosen for stability
  inside Obsidian. Use an embedding server for a GPU.
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
- **The embedding server route was tried against real servers, but not inside
  Obsidian.** Run from Node with the plugin's own client: an OpenAI-compatible
  gateway (LiteLLM, model `Embed`) at a private-network address returned
  768-number vectors, with the address typed bare and with `/v1`; a
  `llama-server` without `--embeddings` answered HTTP 501 and a gateway asked
  without a model name answered HTTP 400, and both now get a plain sentence.
  Not run: Ollama's `/api/embed` against a real Ollama (tested against a
  stand-in only), a server on the same computer, an API key, a whole-vault
  index through a server, and the request inside Obsidian (`requestUrl`).
- **The index is device-local** but lives in the vault's plugin folder. If you
  sync `.obsidian/plugins`, exclude `kosmos-oden/semantic/` or expect the model
  and index to be synced too.
