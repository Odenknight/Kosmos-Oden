# Kosmos-Oden 0.9.0 alpha 1 — known limitations

## Not in this release

- OCR, and new handwriting transcription. Text that OneNote had already
  recognized is kept by the Importer and can be searched. A preserved ink
  drawing or image link is not a transcription.
- Embeddings, semantic or vector search. Search is exact text matching.
- Automatic or two-way synchronization with OneNote or Google Keep. An import
  is a copy made at one moment.
- Apple Notes and Evernote. The Importer can read them; this release did not
  qualify those routes.
- The deprecated MCP HTTP+SSE transport (`/sse` and `/messages`). A client
  that supports only that transport cannot connect. A client that supports
  stdio can use the bridge.
- Reading attachment contents through the agent tools. `get_note` lists which
  attachments exist; it does not return their bytes.

## Search

- Search holds note text in memory and rebuilds it each time Obsidian starts.
  Time grows with the size of the vault. Measured numbers are in
  [PERFORMANCE.md](PERFORMANCE.md); nothing here is promised beyond them.
- A Markdown file larger than 5 MiB is skipped whole, and indexing stops
  adding files after 128 MiB of text. The search view then says "partial" and
  how many files were left out. Those notes still open normally in Obsidian.
- No fuzzy matching and no regular expressions. A quoted phrase matches text
  on one line; it does not match across a line break.
- Matching ignores case by plain lowercasing. A capital dotted İ does not
  match a typed `i` (so `istanbul` does not find `İSTANBUL`); type the word
  as written.
- Text whose lowercase or composed form changes length (a capital İ, or
  accents typed as separate combining marks) needs an offset map so excerpts
  keep the original spelling. A long run of one such character costs almost
  nothing; an irregular mix costs up to about 4.4 bytes per changed character
  in the search worker, on top of the two copies of the text. See
  [PERFORMANCE.md](PERFORMANCE.md#offset-map-memory).
- A renamed note can be missing from results for up to about two seconds.
- "Search my notes" is your own search over the whole vault. Agents see only
  the folders you share.

## Import

- Conversion is done by the Obsidian Importer plugin, not by Kosmos-Oden.
  Kosmos-Oden opens it, then indexes what it produced.
- Use **Skip existing notes** when importing the same source again. Update
  can replace a note you edited here. To compare a newer export, import it
  into a separate folder.
- A Keep note renamed in Keep arrives as a second note on the next import.
  There is no deduplication across renames.
- Keep checklist indentation, reminders and assignments are not fully
  preserved. OneNote password-protected sections are skipped.
- "Files present" counts files in the folder. It is not proof that the last
  import created them. Open the Importer's own report for skipped and failed
  items; counts Kosmos-Oden cannot know are shown as unknown.
- Kosmos-Oden cannot see when an import has finished. A folder becomes
  pending when you add it as an import folder (**Add notes**), and again each
  time you use **Open Importer** for it; automatic time stamps stay off there
  until you press **Import finished — review tags**. This also holds back an
  import run in the Importer directly into that folder. An import into a
  folder that is not an import folder, or into one you already marked
  finished, is not detected: turn automatic time stamps off before such an
  import into a tagged folder. Import folders saved before 0.9.0 are not
  marked pending on upgrade.

## Optional tags

- A note with a broken or duplicate-key properties block is skipped, never
  repaired.
- A new unique ID is random. It is never derived from the title, path or
  text, so a copied note keeps the original's ID until you repair the
  duplicate yourself.
- A supersedes link is written on the newer note only. The older note is not
  edited; the reverse direction is computed when shown.
- Backups cover explicit applies (**Apply selected tags** and **Add
  supersedes**). Automatic time stamps do not create a backup for each edit.
- There is no restore command. A backup is the exact earlier text under
  `.gkx/backup/tagging-*/files/`; copy it back by hand.

## Connection

- Obsidian must be open on the computer that holds the vault.
- Plain HTTP is not encrypted. Use local network mode only on a network you
  trust; for anything else use a VPN or an HTTPS reverse proxy.
- Kosmos-Oden does not open firewall or router ports.
- The DNS-rebinding check answers only requests addressed to this computer
  (`127.0.0.1`, `localhost`, `::1`), to one of its own network addresses, or,
  in the Personal profile's local network mode, to the host of the address
  for other computers saved in **Connect my AI**. Any other host name, for
  example a second name for the same machine or a reverse proxy that forwards
  its own host name, is refused with "forbidden host".
- A connection test run from this computer cannot prove that another computer
  can reach it.
- An assistant that runs in the cloud processes the text it retrieves in its
  provider's cloud.
- Scope selects files. A shared note may itself mention another note's name.
- On the older MCP revisions, a cancellation notice sent on a separate
  connection is acknowledged but cannot stop a request; closing the
  connection or the 25-second limit does. A large batch of slow calls shares
  that one limit.

## Viewer

- Adding one note can move other bodies in the 3D view, because positions in
  a galaxy depend on rank. Positions are identical across reloads of the same
  vault. See [RENDERER-STABILITY.md](RENDERER-STABILITY.md).
- The viewer no longer renders above the display's own pixel ratio. On a
  standard-density screen, close-ups are slightly less smooth than in 0.8.4.
- The `star-focus` visual reference image was already out of date before this
  release and has not been refreshed.

## Platform

- The connector, physical-path checks and the stdio bridge are desktop only.
  The 3D viewer still loads on mobile.
- Symbolic links and junctions inside the vault are not followed for agents.
