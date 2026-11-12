# Kosmos-Oden 0.9.0 alpha 1 — owner test

Status: **test candidate awaiting the named trials below.** Automated checks
passed on the build machine (see [BUILD-PROGRESS.md](BUILD-PROGRESS.md)). The
trials in "Pending owner trials" need Obsidian 1.13.0 or newer, real source
exports or accounts, real MCP client applications, or a second machine. None
of them has been run, and none is reported as passed.

Install first: [ALPHA-INSTALL.md](ALPHA-INSTALL.md). Use a copied vault and
keep your original exports unchanged. Keep other plugins that write to notes,
and sync, out of the no-write measurement in step 2.

## Where things are

| You want to | Open |
| --- | --- |
| Choose the profile | Settings, Kosmos-Oden, "Agent API (HTTP + MCP)" tab, "Active profile" |
| Bring notes in | command "Add notes from another app" |
| Find notes | command "Search my notes" (also the search ribbon icon) |
| Add optional tags | command "Optional tags (preview deterministic tags)" |
| Record a replacement | open the newer note, command "This note supersedes…" |
| Connect an agent | command "Connect my AI" |

## Steps

1. **Choose Personal Notes.** Settings, Kosmos-Oden, "Active profile",
   Personal Notes. Nothing is shared and the connection is off.
2. **No-write check, tags off.** Record a checksum of every file in the
   copied vault. Open "Search my notes", search, open results, open the 3D
   view. Compare checksums: no note or attachment may have changed.
   On Windows: `Get-ChildItem -Recurse -File | Get-FileHash | Export-Csv before.csv`.
3. **Import a small sample.** "Add notes from another app". Do one Google
   Keep Takeout ZIP and one OneNote sample (account, or a `.one` / `.onepkg`
   file). Follow the official guide link in the window, press "Open
   Importer", preview, choose **Skip existing notes**. Then "Review results":
   open the notes, images and attachments; use "Select the Importer report"
   and read its skipped and failed items before importing more.
4. **Search.** Find a sentence you know is there, and one at the very end of
   a long note. Search a word with an accent and a quoted phrase. Confirm an
   ordinary note with no properties block is found. Check the excerpt shows
   your original capitalization.
5. **Share folders.** "Connect my AI", "Folders shared with agents": pick one
   folder, put another under "Never share", "Save shared folders". The
   count of notes an agent can read should match what you expect.
6. **Optional tags, on disposable copies.** "Optional tags": turn on "Use
   optional tags", pick a folder under "Folders to tag". Then, one at a
   time: "Time stamps" and "Unique IDs": "Preview deterministic tags", read
   the diff, "Apply selected tags". "“Supersedes” links": open the newer
   note, run "This note supersedes…", choose the older note, "Add
   supersedes". Check the note body is unchanged, previewing again shows
   nothing to do, an ID survives an edit and a rename, and a deliberate chain
   of "This note supersedes…" shows the right order. Test "Automatic time stamps"
   separately: edit a note in the folder and confirm only its updated time
   changes; reopening a note must not change it.
7. **Import boundary.** With automatic time stamps on, start another import
   into a tagged folder through "Add notes from another app", "Open
   Importer". Notes must not be stamped until you press "Import finished —
   review tags". (An import started in the Importer directly is not detected;
   see KNOWN-LIMITATIONS.md.)
8. **Connect on this computer.** "Connect my AI", "Connect", then "Test
   connection". "Quick Connect", "This computer", "Copy configuration" for
   your client. Ask the agent to search for a word in a shared note, read a
   long note to the end, and try to read a note from the "Never share"
   folder (it must report not found).
9. **Connect from another computer.** "Network access": local network.
   "Another computer / agent server": choose the IP address shown for this
   computer (a typed host name is refused with "forbidden host"), copy the
   configuration, use it on the agent machine (for
   example the agent LXC). Repeat step 8's three requests. Check the copied
   configuration contains a reachable address, never `0.0.0.0` or
   `127.0.0.1`. From the other machine in "This computer only" mode the
   connection must fail.
10. **Old and new clients.** Exercise one client that opens with
    `initialize` (older MCP) and one modern client or harness. Record the
    client name, version, transport and the revision it negotiated.
11. **Lifecycle.** Edit and rename a note, search for it. Restart Obsidian.
    Check "Start when Obsidian opens" behaves as set. "Rotate token": the old
    configuration must stop working. "Disconnect": nothing answers.
12. **Existing profile.** Switch "Active profile" back. Your earlier tools,
    sensitivity settings and token must be exactly as before the upgrade.

Only after these, broaden to more of the copied notes. Do not import an
updated export over your only locally edited copy.

## Pending owner trials

| ID | Trial | Why it was not run on the build machine |
| --- | --- | --- |
| I01 | Google Keep Takeout ZIP becomes Markdown plus linked assets (text, checklist, labels, image, duplicate title, renamed note) | needs a real Takeout export and Obsidian 1.13.0+ with Importer 3.1.17 |
| I02 | OneNote `.one` / `.onepkg` import (text, subpages, table, attachment, image, ink) | needs real exporter-produced files |
| I03 | OneNote account import | needs a Microsoft account with notebooks |
| I04 | Re-import: identical export, local edit, later source edit, renamed note, with Skip | needs I01 or I02 first |
| I05 | Importer report opens in your language; skipped and failed reasons readable | needs a real import |
| N02 | Another machine connects with the copied configuration | needs a second machine on the LAN or VPN |
| N01 (remote half) | Localhost mode is unreachable from another machine | same |
| C01 | One real older-protocol client and one real modern client | needs the client applications; automated tests used the official SDK client 2.4.0 and raw wire fixtures, which are not product clients |
| B02 | The archive works installed in a clean vault in Obsidian | the build machine has Obsidian 1.12.7; the plugin requires 1.13.0 |
| Runtime | Search worker starts under Obsidian; `parseYaml` rejects malformed properties; device token storage is per device; "Open Importer" opens the Importer | not observable outside Obsidian; covered in tests by stand-ins only |
| Performance | Indexing and search timings with the 3D view open and closed, inside Obsidian on an idle machine | measured outside Obsidian only; see [PERFORMANCE.md](PERFORMANCE.md) |
| Visual | Review of the 3D view on your GPU; decision on refreshing the `star-focus` reference image | human approval is required for reference images |

## Reporting

Send the archive checksum, the step number, what you expected and what
happened. Do not paste tokens, personal exports or note contents into a
public issue or pull request.
