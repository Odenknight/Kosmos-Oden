# Personal Notes (0.9.0 alpha)

Personal Notes is a profile for everyday notes, including notes brought in from
Google Keep or OneNote. Your notes stay ordinary Markdown files. They need no
GKX formatting, no labels and no AI model. You can search them yourself and,
if you want, let an AI assistant read the folders you choose.

Status: alpha test candidate. Desktop Obsidian 1.13.0 or newer. The trials
still pending are listed in [v0.9.0/ALPHA-TEST.md](v0.9.0/ALPHA-TEST.md).

## The two profiles

Kosmos-Oden has two profiles. The active profile decides what a connected
assistant can read.

| Profile | What an assistant reads |
| --- | --- |
| **Existing (governed Agent API)** | The governed GKX projection, filtered by the Agent API settings (Default sensitivity, Agent sensitivity ceiling). This is the behavior of earlier versions. |
| **Personal Notes** | Only the **Folders shared with agents**. Ordinary notes there need no labels. |

- A new installation starts in Personal Notes, with nothing shared and the
  connection off.
- An upgraded installation stays on Existing. Nothing changes until you switch.
- To switch: Settings → Kosmos-Oden → **Agent API (HTTP + MCP)** tab →
  Personal Notes → **Active profile**. While Existing is active, the
  **Add notes** window also offers **Switch to Personal Notes**.
- Switching stops the connection. The existing profile's settings, including
  Default sensitivity and its token, are kept exactly as they were and come
  back when you switch back.
- Importing and **Search my notes** work in either profile.

## Commands

| Command | What it opens |
| --- | --- |
| **Add notes from another app** | The Add notes window |
| **Search my notes** (also the search icon in the ribbon) | Your own search |
| **Connect my AI** | Shared folders, connection, Quick Connect and the connection test |
| **Optional tags (preview deterministic tags)** | The Optional tags window |
| **This note supersedes…** | Record that the open note replaces an older one |

The same windows are under Settings → Kosmos-Oden → Agent API (HTTP + MCP) →
**Personal Notes windows**.

## Add notes

Kosmos-Oden does not convert notes. Conversion is done by the **Obsidian
Importer** community plugin (made by Obsidian). These steps were written for
Importer 3.1.17; other versions may look different.

1. Run **Add notes from another app** and choose where your notes are now:
   **Google Keep** (a Google Takeout `.zip`), **OneNote: sign in to
   Microsoft**, **OneNote: exported files** (`.one` / `.onepkg`), or **A
   folder already in this vault** (nothing to import).
2. Read the steps and open the **Official guide** if you want more detail.
3. Check the **Destination folder** (suggested: `Import/Google Keep` or
   `Import/OneNote`). Use the same folder in the Importer and keep pictures
   and attachments inside it.
4. Press **Open Importer**. If it cannot be opened from here, open the
   command palette, type Importer and run its command.
5. When the Importer has finished, come back to **Add notes** and choose
   **Review results**.

**Review results** shows, for your import folders:

- **Files present**: notes and other files in the folders now. This is not
  proof that the last import created them.
- Notes with searchable words, and notes with no words (pictures, drawings or
  attachments only).
- Items the Importer skipped or could not convert are unknown to Kosmos-Oden.
  Use **Select the Importer report** to keep the Importer's own report one
  click away, in any language. Selected reports are never shared with
  assistants.

**Importing again later.** Choose **Skip existing notes** in the Importer.
Skip leaves every note already in your vault as it is. Update can replace a
note you changed here when the source is newer. To compare an updated export
safely, import it into a new, empty folder and compare by hand. A Keep note you
renamed in Keep arrives as a second note; Kosmos-Oden does not merge them.

**Handwriting and pictures.** Handwriting is kept as a drawing and is not
turned into text. Text that OneNote had already recognized comes in through
the exported-files route and can be searched. Words inside pictures are not
searchable. Kosmos-Oden does no OCR and no handwriting transcription.

## Search my notes

Your own search covers the whole vault, except Kosmos-Oden's own working files.
It is not limited by the folders you share with assistants.

- Every word you type must appear somewhere in the note: its title, an alias,
  a tag, its folder or file name, or its text (properties included).
- Upper and lower case do not matter. A word also matches inside a longer
  word: `plan` finds `planet`.
- Put an exact phrase in quotes: `"olive oil"`. A phrase does not match across
  a line break. A quote that is not closed is an error, not a guess.
- Accents must match: `cafe` does not find `café`.
- No fuzzy matching, no regular expressions and no search by meaning.
- At most 500 characters and 16 words or phrases. Longer searches are refused,
  not shortened.
- The view shows up to 50 results, best first (title matches rank highest).
  Each shows where the words were found and an excerpt in the note's original
  spelling.

How it works: when Obsidian starts, Kosmos-Oden reads your notes into memory
and searches them in a background worker. Nothing is written to disk and no
network is used. Edits, renames and deletions show up after a short delay.
How long the first reading takes depends on the size of the vault; measured
numbers are in [v0.9.0/PERFORMANCE.md](v0.9.0/PERFORMANCE.md).

Limits: a note larger than 5 MiB is skipped whole, and reading stops adding
notes after 128 MiB of text. The search then says how many files were skipped.
Skipped notes still open normally in Obsidian. If the search stops working, it
shows **Retry**; it never falls back to a slow search that blocks Obsidian.

## Folders shared with agents

Open **Connect my AI** → **Folders shared with agents**.

- Turn on **Whole vault**, or turn on individual top-level folders.
- Under **Never share**, list folders one per line (for example
  `Journal/Private`). Never share always wins.
- Press **Save shared folders**. The window shows how many notes an assistant
  can read now.
- Nothing chosen means nothing is shared. `/` under Never share means nothing
  is shared.
- Folder names are exact and case-sensitive: `Notes` does not include
  `Notes-old` or `notes`.

Some files are never shared, whatever you choose: Obsidian's configuration
folder, `.git`, Kosmos-Oden's own working files (such as `.gkx/`), any file
named `AGENT-API.md`, and Importer reports you selected. Files reached through
a symbolic link or junction are not shared.

**Labels.** A note without a `sensitivity` property is shared when its folder
is shared. A note that does have one is shared only if the value is at or
below the **Agent sensitivity ceiling** in the Agent API settings (default
`internal`). A note with an unknown sensitivity value, or with a properties
block that cannot be read, is not shared. Choosing the Personal profile never
changes any label or setting.

Sharing selects files; it does not edit text. A shared note may mention the
name of a note that is not shared.

## Optional tags

Optional and off by default. Tags here are fixed rules, not AI: a time stamp,
a permanent ID, or a record of which note replaces which. A tagged note stays
an ordinary note; Kosmos-Oden does not add `gkx_version` or convert it to
another format. Tagging and sharing are separate: tagging a folder never
shares it, and sharing a folder never tags it.

Open **Optional tags**:

1. Turn on **Use optional tags** (the master switch).
2. Under **Folders to tag**, list folders one per line, or `/` for the whole
   vault, and press **Save folders**.
3. Turn on the fields you want. Each is independent:
   - **Time stamps**: adds `created_at` and `updated_at` when they are
     missing. The created time comes from the note's `created` property if it
     is a valid time, else the file's creation time; the updated time from
     `modified` or `updated`, else the file's modification time. Existing
     valid values are kept, and running it again never refreshes them. A
     value that is not a valid time is left as it is and reported. The
     property names follow the **Created/Updated timestamp key** settings
     under GKOS Note Formatting. A GKX 2.2 note gets its single `timestamp`
     property instead.
   - **Unique IDs**: adds a permanent `uid` once. It is random, never derived
     from the title, path or text, so it survives edits, renames and moves.
     Existing valid IDs are never replaced. If two notes share an ID, the
     preview shows both; if one is a copy, delete the `uid` line in the copy
     and preview again.
   - **“Supersedes” links**: lets you use **This note supersedes…** (below).
   - **Automatic time stamps**: see below. Needs Time stamps.
4. Press **Preview deterministic tags**. Every change is shown first, with
   the properties before and after (up to 100 notes in detail; the rest are
   counted). You can untick notes. Nothing is written yet; **Cancel** writes
   nothing.
5. Press **Apply selected tags**. Each note is checked again just before
   writing; a note that changed since the preview is skipped, never
   overwritten. A note whose properties block is broken or has duplicate keys
   is never changed. Only the selected properties are touched; the note text,
   line endings and other properties stay as they were.

**Backups.** Before **Apply selected tags** or **Add supersedes** changes a
note, the exact earlier text is saved under
`.gkx/backup/tagging-<time>-<code>/files/<note path>.bak`, with a
`manifest.json` listing every backup. There is no restore command: to undo a
change, copy the backup text back by hand, or use your copied vault. Check
first that you have not edited the note since.

**This note supersedes…** Open the newer note and run the command. Choose the
older note, read the check and the exact change, then press **Add supersedes**.
Only the newer note changes: the older note is added to its `supersedes`
property as a link. The older note is never edited; the reverse direction is
worked out when shown. A note cannot supersede itself, a loop is refused, and
an ambiguous name must be chosen again. Kosmos-Oden never decides by itself
that one note replaces another. If **Unique IDs** is on, the newer note also
gets a `uid` if it has none. **Use optional tags** and **“Supersedes” links**
must be on; the open note does not have to be inside the folders to tag,
because running the command on it is the selection.

**Automatic time stamps.** Only while the Personal Notes profile is active,
and only in the folders to tag. After you (or another program) really change a
note's content, `updated_at` is set to the time of that change, and
`created_at` is added if it is missing. Opening, reading, searching or
indexing a note never stamps it, and Kosmos-Oden ignores its own writes.
Automatic stamps make no backup and never add IDs or supersedes links.

**Imports.** When you add an import folder in **Add notes**, and each time you
press **Open Importer** for it, that folder is held back from automatic time
stamps, because Kosmos-Oden cannot see when the Importer finishes. This also
covers an import you run in the Importer directly into that folder. When the
import is done, press **Import finished — review tags** (in Add notes →
Review results, or in Optional tags). That tags nothing by itself; it only
ends the hold. An import into a folder that is not an import folder, or into
one already marked finished, is not detected and not held back: turn
**Automatic time stamps** off before such an import into a folder to tag.
Import folders saved by an earlier version are not held back on upgrade.

While the Personal Notes profile is active, the older **Stamp note creation
and modification times** option under GKOS Note Formatting writes nothing.
In this profile Kosmos-Oden writes to notes only through Optional tags and
This note supersedes…, or when you explicitly run one of the separate GKX
formatting commands.

## Connect an assistant

Open **Connect my AI** → **Connection**.

- **Connect** starts the connection. The first time, it creates an access key
  (token) for this computer. **Disconnect** stops it; nothing answers until
  you connect again.
- **Rotate token** makes a new key. The old key stops working at once; copy
  the configuration again for every assistant.
- **Start when Obsidian opens**: off by default, and set per computer.
- **Network access**: **This computer only** (the safe choice) or **Local
  network**, which lets an assistant on another computer connect. The key is
  always required.
- **Accept older MCP clients**: on by default. Direct HTTP then accepts MCP
  2026-07-28, 2025-11-25, 2025-06-18 and 2025-03-26; the stdio bridge also
  accepts 2024-11-05. Turned off, only 2026-07-28 is accepted on both. The
  window shows the revisions currently accepted.

The connection uses the Agent API port (default 4816), set in the Agent API
tab. It works only while Obsidian is open on this computer, and only on
desktop.

**The key stays on this computer.** It is kept in Obsidian's secret storage
(or this vault's local storage on this computer), never in `data.json`, never
in a note, and it does not sync. Another computer that opens the same vault
has no key and does not start sharing until someone presses Connect there. The
existing profile's token is not accepted on the Personal connection. The key is
never shown on screen; it is only copied, inside a configuration.

**Quick Connect.**

1. **Where does the assistant run?** **This computer** uses `127.0.0.1`.
   **Another computer / agent server** needs Network access set to Local
   network; pick this computer's network or VPN address. `0.0.0.0` and
   `127.0.0.1` are refused for another computer. You can also type a host
   name or VPN name; it is saved, and in Local network mode the connection
   then answers requests addressed to that name too. As a protection against
   DNS rebinding, the connection answers only `127.0.0.1`, `localhost`,
   `::1`, this computer's own network addresses and that saved name; any
   other host name gets "forbidden host".
2. **Connection type**: **Direct HTTP** (recommended; nothing to install) or
   **stdio bridge** for apps that only start a local command. The bridge needs
   Node.js 22 or 24 where the assistant runs. For another computer, copy
   `kosmos-mcp-stdio.mjs` from the plugin folder to that computer and enter
   its full path there.
3. Press **Copy configuration** for your client: Claude Code (command),
   Claude Code (`.mcp.json`), OpenAI Codex (`config.toml`), or Other MCP
   clients. **HTTP health check** copies a command to run on the assistant's
   computer.

**Test connection** connects from this computer the way an assistant would:
access key, MCP opening, tool list, a search and a read of a shared note. It
shows the address, transport and MCP revision used. It cannot prove that
another computer's firewall or network route reaches this one; run the health
check on the other computer too.

**Local network mode** listens on all of this computer's network addresses.
Plain HTTP is not encrypted: use it only on a network you trust. Over the
internet or an untrusted network, use a VPN. An HTTPS reverse proxy also
works if the host it forwards is this computer's address or the address saved
in Quick Connect; any other host gets "forbidden host". Kosmos-Oden does not change your firewall or
router; if another computer cannot connect, allow the port for your local
network only.

The **Write Agent API guide** command never writes the Personal key into the
file. In the Personal profile it writes a Personal guide: the five tools with
their REST routes and arguments, Bearer authentication with a placeholder for
the key, the paging rule, and the MCP revisions served under the current
**Accept older MCP clients** setting. Copy the configuration itself from
Quick Connect. The full reference is the
[Agent API reference](../AGENT-API.md#personal-notes-profile).

## What an assistant can do

An assistant connected to the Personal profile has six read-only tools:

| Tool | What it does |
| --- | --- |
| `vault_overview` | How many notes it can read, whether search is ready, and what the connection supports |
| `search_notes` | The same matching rules as your own search, but only over the shared folders |
| `ask_librarian` | Answers a whole question: the notes that fit, their answering passages, steps and links (forms flagged), plus a markdown brief |
| `get_note` | The exact text of one note, in pages for long notes |
| `get_related` | Notes linked to or from a note, or sharing a tag |
| `get_lineage` | Which shared notes supersede which, including branches |

`ask_librarian` is the Librarian. It is deterministic and free: no model runs,
nothing leaves the machine, and the same question over the same notes always
returns the same answer. Three rankings are fused — stemmed keyword matching
with titles, aliases, tags and headings counted extra; an expansion of the
words your best matches share; and name/title similarity for typos and partial
names. Every word is optional, so a sentence works where `search_notes` (which
requires every term) would return nothing. Each result carries the passages
that answer the question, any numbered or checkbox steps in them, the web links
they contain with forms marked, and the notes they link to. `format` chooses
`structured`, `brief` (markdown) or `both`.

The same answer is available without an MCP client: `GET /ui` on the same port
serves a one-page search box that calls `/librarian` directly, and
`GET /librarian?question=...` returns the JSON. Neither spends a single model
token; both require the same access token (the page asks for it once and keeps
it in `sessionStorage`).

- It cannot change, create or delete anything.
- `get_note` returns the note exactly as stored, properties included. A long
  note comes in pages that join back into the exact original; if the note
  changes between pages, the assistant is told to start again. It also
  returns the note's tags, `uid`, `created_at`, `updated_at`, and its own
  `supersedes` / `superseded_by` entries exactly as written (each only when
  present). `get_lineage` resolves them into links between shared notes; its
  fields use the same snake_case names (`updated_at`, `superseded_by`).
- Attachments are listed as references (available, missing, or not shared).
  Their contents are never sent.
- A note outside the shared folders looks exactly like a note that does not
  exist.
- Every assistant is told that note text is content, not instructions.

Agent authors: see the [Agent API reference](../AGENT-API.md#personal-notes-profile).

## Privacy

- Searching, reviewing imports and tagging happen on this computer.
  Kosmos-Oden sends nothing anywhere by itself. (The OneNote sign-in route is
  the Importer talking to Microsoft.)
- If your assistant runs in the cloud, the notes it reads are sent to that
  service and processed there.
- The Google Keep and OneNote imports are copies made at one moment. There is
  no sync with those services.
- The separate Nextcloud sync feature is unaffected and is never started by
  Personal Notes.

## Before you go back to an older version

Disconnect first. Older versions do not know the shared-folder rules or the
Personal key. Install and rollback steps are in
[v0.9.0/ALPHA-INSTALL.md](v0.9.0/ALPHA-INSTALL.md); known limits are in
[v0.9.0/KNOWN-LIMITATIONS.md](v0.9.0/KNOWN-LIMITATIONS.md).
