# Personal Notes (alpha, 0.9.0)

Personal Notes is an optional mode for people who want their everyday notes, including notes brought in from other apps, to be easy to find and usable by an AI assistant. It needs no GKX formatting and no AI model.

Status: alpha. Tested on desktop Obsidian only.

## What it does

| Step | What you do | What happens |
|---|---|---|
| Bring in | Run **Add notes from another app** | Kosmos-Oden shows short instructions for Google Keep or OneNote and opens the Obsidian Importer community plugin. The Importer extracts your notes into Markdown files and saves their pictures and files beside them. |
| Find | Run **Search my notes** | One search box over the full text of every note. Put a phrase in quotes. |
| Connect | Run **Connect my AI** | You choose which folders an assistant may read and who can connect. Kosmos-Oden turns on its read only connection and gives you a quick connect block for your assistant. |
| Tag (optional) | Use the **Optional: GKX tags** controls | Add time stamps, unique IDs and "this note replaces that note" lineage. Off until you ask. |

## What it never does

- It does not change or delete your notes or your exports unless you ask it to add GKX tags.
- It does not convert notes itself. Conversion is the Importer's job.
- It does not send anything anywhere. Searching happens on your computer. If your assistant runs in the cloud, the notes it reads are sent to that service by the assistant.
- It makes no GKOS conformance or GKX validity claim about your notes.

## How assistant access works in this mode

1. An assistant can read a note only if the note is inside a folder you chose and not inside a folder you listed under Never read.
2. An empty folder choice reads nothing.
3. Notes with no sensitivity label are treated as `internal` while the mode is on, so they are readable inside your chosen folders.
4. A note you have labeled above the agent ceiling (for example `sensitivity: secret`) stays hidden, even inside a chosen folder.
5. The connection guide file `AGENT-API.md` at the top of the vault is never shared in this mode, because it contains the private key.
6. Turning the mode off restores the previous Default sensitivity setting.

Turn the mode off before installing an older Kosmos-Oden version. Older versions do not know the folder rule.

## Who can connect

- **This computer only** is the default and the safe choice.
- **Local network (LAN)** lets an assistant on another device in your home or office connect. The private key is always required on the local network. The traffic is not encrypted, so use this only on a network you trust.
- **Accept older assistants** is on by default. Kosmos-Oden answers assistants that use the newest MCP version (`2026-07-28`) and assistants that open with the older `initialize` handshake (`2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`). No session is created either way.

## Optional GKX tags

Your notes work without tags. Each item below is separate and off until you use it.

| Tag | How | What is written |
|---|---|---|
| Time stamps | Turn on **Time stamps on imported notes** in the Add notes window | `created_at` and `updated_at` are added to a note in your import folder the next time you edit it. Outside the import folder, stamping follows the existing setting under GKOS Note Formatting. |
| Unique ID and time stamps, in bulk | Press **Preview GKX tags** | Runs the existing deterministic GKX formatting tool over your import folder only. It shows every change first, makes a backup, and uses no AI model. |
| Lineage | Open the newer note and run **This note replaces another note** | A `supersedes` property that links to the older note is added to the newer note. The older note is not touched. |

After bulk tagging, run **Connect my AI** and press **Turn on and check** again. If the count of readable notes dropped, the tagging gave notes a sensitivity label above your assistant's limit.

## Importing again later

The Importer asks what to do with notes that already exist.

- **Skip** keeps every note already in your vault exactly as it is. This is the safe choice.
- **Update** replaces a note when the original is newer than your copy. That can overwrite changes you made in Obsidian.

Google Keep exports carry no note ID. If you rename a note in Keep and import again, it arrives as a second note.

## Handwriting and pictures

What can be searched depends on how the notes were imported.

| Route | Handwriting | Words inside pictures |
|---|---|---|
| OneNote, sign in | Saved as a drawing. Not searchable. | Not searchable. |
| OneNote, export files | Saved as a drawing. Text that OneNote had already recognized is brought in and is searchable. | Not searchable. |
| Google Keep | Drawings arrive as image attachments where the export includes them. Not searchable. | Not searchable. |

The **Add notes** window lists notes that hold only pictures, drawings or attachments under Needs attention. They are safe and viewable. Making them searchable is planned for a later release.

## Limits in this alpha

- Desktop only for importing and for connecting an assistant.
- Word search only. Search by meaning is not included.
- Attachments are listed for an assistant but their contents are not read.
- The connection works only while Obsidian is open.
- The older MCP path is new in this release and has been checked by automated tests only.
- The import guides were written against Importer 3.1.17 and its English screens.
