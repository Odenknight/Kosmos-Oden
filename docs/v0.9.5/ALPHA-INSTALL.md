# Install v0.9.5 (alpha)

1. Close Obsidian.
2. Download and unzip [the alpha.5 plugin ZIP](https://github.com/Odenknight/Kosmos-Oden/releases/download/kosmos-oden-0.9.5-alpha.5/kosmos-oden-0.9.5-alpha.5.zip). It contains a `kosmos-oden/` folder
   (`manifest.json`, `main.js`, `styles.css`, `kosmos-mcp-stdio.mjs`) plus
   `docs/`, `LICENSE`, `THIRD-PARTY-NOTICES.md`, `BUILD-INFO.json` and
   `SHA256SUMS`.
3. Copy the files **inside** the extracted `kosmos-oden/` folder into
   `<vault>/.obsidian/plugins/kosmos-oden/`. On upgrade, overwrite the supplied
   files individually and keep the existing plugin folder and its `data.json` settings file.
4. Start Obsidian and enable **Kosmos-Oden** under **Settings → Community
   plugins**. The manifest asks for Obsidian 1.13.0 or newer.
5. **Settings → Kosmos-Oden → Personal Notes**: choose the folders shared with
   agents, set **Agent sensitivity ceiling**, then **Connect my AI** to create
   the device token and start the listener (default port 4816).
6. In an MCP client, use the configuration from **Connect my AI → Copy
   configuration**: `POST /mcp`, `Authorization: Bearer <token>`.
7. The optional browser page at `http://127.0.0.1:4816/ui` requires an
   authorization header on the initial navigation. With an ordinary browser
   address bar, use the MCP client from step 6 to ask the same question.

## Upgrading from 0.9.0

Settings, tokens and notes are unchanged. `vault_overview` now reports six
tools, and clients that cached the five-tool list should refresh it
(`tools/list`). Nothing in the vault is written by the upgrade.

## What to check first

- `GET /ui` answers, and a question returns a brief with at least one note.
- `tools/list` shows `ask_librarian` beside the five 0.9.0 tools.
- Semantic search (optional): Settings → Kosmos-Oden → **Semantic search** →
  on → **Download**. When the Index line says the notes are embedded,
  `vault_overview` reports `semantic_search.state: "ready"` and a question in
  words your notes do not use still finds the right note. See
  [SEMANTIC-SEARCH.md](SEMANTIC-SEARCH.md).
- The **Update this folder's map of content (deterministic)** command, run
  twice on the same folder, reports "already up to date" the second time.
- Nothing in `.gkx/backup/` grows unless a MoC file actually changed (updates
  save one exact backup first).