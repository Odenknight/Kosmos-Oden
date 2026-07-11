# Vault Kosmos

**Version 0.5.1 — Written by OdenKnight — a fork and improvement of [H4R7W16/vault-kosmos](https://github.com/H4R7W16/vault-kosmos).**

## What is this?

Vault Kosmos turns your Obsidian notes into a night sky you can fly through.

Every note you write becomes a glowing body in a 3D universe: your most important, most-connected notes shine as **stars**, the notes linked to them orbit as **planets** and **moons**, stray notes drift by as **asteroids**, and each of your top-level folders becomes its own **galaxy**. Images, PDFs and other attached files float in a faint outer shell (the "Oort cloud"), just like the icy debris at the edge of a real solar system.

Nothing is changed or moved — Kosmos only *looks* at your notes. Close the view and your vault is exactly as you left it.

## Why would I want it?

A folder list shows you your notes one at a time. A cosmos shows you **the shape of everything you know, all at once**:

- **See what matters.** Big, bright bodies are your hub notes — the ideas everything else connects to. If something you care about is a lonely asteroid, that tells you it needs linking up.
- **Spot the clusters.** Related notes physically gather together, so themes and projects become visible neighborhoods instead of scattered filenames.
- **Travel through time.** Press one button and watch your vault grow note by note, or scrub a timeline to see exactly what you knew — and what you'd already revised — on any past date.
- **Find things by flying.** Tap any body to light up everything connected to it, then hop from neighbor to neighbor. It's search for people who think visually.
- **Watch your AI assistant think.** If you let an AI agent read your vault (entirely optional, off by default), you can watch it hop from note to note as a glowing emerald trail across your universe.

It works on desktop **and** on your phone or tablet, updates live as you edit, and needs no internet connection at all.

## How your vault becomes a cosmos

| You have… | You see… |
|---|---|
| A home/index note in your vault root | The **cluster core** — the bright heart of the whole universe |
| A top-level folder | A **galaxy**, with its main note as the galactic center |
| A well-connected note | A **star** with its own solar system |
| Notes linked from that note | **Planets**, **moons** and **moonlets**, orbiting by how closely they're related |
| Loose or barely-linked notes | **Asteroids** tumbling near their home galaxy |
| Images, PDFs, other attachments | The **Oort cloud** — a faint outer shell around the system that uses them |

Notes with more than three linked "moons" even get Saturn-style rings. Everything is laid out so no two bodies ever overlap.

## Getting started

1. Copy this folder into `<your-vault>/.obsidian/plugins/vault-kosmos/` (it must contain `manifest.json`, `main.js`, and `styles.css` at its top level).
2. In Obsidian go to **Settings → Community plugins**, turn off Restricted mode if it's on, and enable **Vault Kosmos**.
3. Click the orbit icon in the left ribbon (or run **Open Vault Kosmos** from the command palette). That's it — your universe builds itself.

## Flying around

- **Drag** to orbit · **scroll or pinch** to zoom · **right-drag / two fingers** to pan.
- **Tap a body** to focus it — everything connected to it lights up.
- **Right-click** (long-press on iPhone/iPad) a body → **Go to Note** opens that note in a new tab. Right-clicking a *galaxy that is a folder* now offers **Expand folder** instead — it flies you there and unfolds that folder in Obsidian's file list. It will never create a stray note.
- Keyboard shortcuts: **R** labels · **C** all connections · **O** all objects · **G** grow animation · **T** timeline · **H** time-travel slider · **A/S/D/F** camera modes (F is free flight with WASD) · **Q** clear.
- Zoom out as far as you like — the view gently re-centers itself when the whole cluster gets small.

## What's new in 0.5.1

- **Folders behave like folders.** Right-clicking a folder galaxy no longer opens (or accidentally creates) a note — it expands the folder in Obsidian's file list instead, or does nothing if it can't.
- **Prettier worlds, same speed.** Rocky planets now show land/sea tones and polar ice caps; moons show dark maria patches; asteroids are irregular tumbling rocks with varied coloring; planetary rings gained fine grooves. All of it runs inside the existing shader passes, so nothing got slower — and mobile keeps its dedicated lightweight path.
- **Big battery/CPU savings.** The 3D view now fully stops rendering the moment its tab is hidden or Obsidian is minimized, and resumes instantly when you come back. Idle bookkeeping (highlight halos, GPU uploads, label scans) was also trimmed, so the same scenes render with less work.
- **Watch AI agents traverse your vault.** When the local Agent API answers a query, the visited notes pulse and connect into a fading emerald breadcrumb trail in the Kosmos view — you can see exactly which notes your agent walked through, live.
- **Safer local server.** The (optional, off-by-default) Agent API now rejects requests whose `Host`/`Origin` don't point at your own machine (DNS-rebinding protection) and compares tokens in constant time.
- **Graphiti re-verified.** The episode export was re-checked against the current [getzep/graphiti](https://github.com/getzep/graphiti) (graphiti-core 0.29.x): the format still matches, and exports now include a per-vault `group_id` so several vaults can share one knowledge graph without mixing.

## Private by design

Everything runs locally inside Obsidian. The 3D view makes **no network calls, collects nothing, and never writes to your notes**. It works fully offline. The optional Agent API below is off by default, reachable only from your own computer unless you explicitly say otherwise, and is read-only — there are no endpoints that can modify your vault.

## Live refresh

Updates are incremental and scale with vault size: editing one note re-reads just that note; a full rebuild happens only on large structural changes (mass create/delete/rename). Refresh is debounced and pauses while the view is hidden, so big vaults stay smooth.

---

## For power users & AI agents

### Agent API — let agents query this vault (HTTP + MCP) — OdenKnight

Settings → **Vault Kosmos** → toggle **Enable local Agent API**. A read-only, token-protected server starts on `127.0.0.1` (opt into **Local network (LAN/VLAN)** in the same settings to let agents on other devices on your subnet reach it), exposing the OKF+ temporal knowledge graph to agents: MCP tools (`get_lineage`, `graph_at_time`, `search_notes`, `get_note`, `get_related`, `vault_overview`, `export_graphiti_episodes`) at `/mcp`, plus plain REST mirrors. Hardened with constant-time token auth, Host/Origin validation against DNS rebinding, and a 4 MB request cap. One-click **Copy** buttons generate the exact Claude Code command / Claude Desktop config, and a command writes **AGENT-API.md** into your vault with your address and token pre-filled. Every query an agent makes is mirrored live in the Kosmos view as a traversal trail. Full guide: [AGENT-API.md](AGENT-API.md). Desktop only; the server never modifies notes.

### Graphiti + OKF+ (temporal knowledge graph) — OdenKnight

Notes written in **OKF+** (Open Knowledge Format Plus) light up Graphiti-style temporal features natively:

- **Knowledge chains** — `supersedes` / `superseded_by` frontmatter builds bi-directional lineage edges (violet links). Superseded notes render as **ghosts**; the newest version of a chain is flagged **HEAD**.
- **Bi-temporal validity** — each note is *valid* from its OKF+ `timestamp` until a successor supersedes it (exactly Graphiti's valid/invalid interval model).
- **Chrono time-travel** — the **Chrono** button (`H`) reconstructs the cosmos at any point in time.
- **Semantic links** — the OKF+ footer `**Related:** [[A]], [[B]]` links are tracked as their own `semantic` edge kind.
- The viewer is read-only: it never patches your notes (OKF+ §3.3 non-destructive rule).

**Feeding real Graphiti** ([getzep/graphiti](https://github.com/getzep/graphiti) — Python, LLM + Neo4j/FalkorDB/Kuzu): export your vault as ingest-ready episodes — every note becomes an `EpisodeType.json` episode carrying its OKF+ structure, `reference_time` = OKF+ timestamp, a per-vault `group_id`, sorted chronologically so lineage lands in order. Format verified against graphiti-core 0.29.x (install `>=0.28.2`).

- **Plugin:** command palette → *"Export Graphiti episodes (OKF+)"* → writes `graphiti-episodes.json` + `graphiti-ingest-sample.py` into the vault root.
- **Standalone:** `node kosmos-build.mjs /path/to/notes graph.json --episodes graphiti-episodes.json`
- Then: `pip install "graphiti-core>=0.28.2"`, set `OPENAI_API_KEY` + Neo4j env vars, `python graphiti-ingest-sample.py`.

### Build from source

```bash
npm install
npx tsc --noEmit          # type-check
node esbuild.config.mjs --production   # bundle -> main.js
```

The 3D viewer (Three.js + the parser/layout/renderer) is bundled and embedded in `main.js`, so the plugin is self-contained and offline.
