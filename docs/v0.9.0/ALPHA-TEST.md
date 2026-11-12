# Kosmos-Oden 0.9.0 alpha 1 — owner test

Status: **test candidate awaiting the named trials below.** Automated checks
passed on the build machine (see [BUILD-PROGRESS.md](BUILD-PROGRESS.md)), and
the packaged archive passed a scripted trial inside a real Obsidian (see
"Trials run on the build machine"). The trials in "Pending owner trials" need
real source exports or accounts, an older-protocol client application, or a
second machine. None of those has been run, and none is reported as passed.

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
   computer, or type the host name or VPN address the agent will use (only
   the address you save here is accepted; any other host name is refused
   with "forbidden host"), copy the
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

## Trials run on the build machine

`npm run smoke:obsidian -- --zip release/kosmos-oden-0.9.0-alpha.1.zip`
installs the archive into a throwaway vault, starts a separate Obsidian
instance with its own user-data folder and drives it. It does not touch your
own Obsidian, vaults or settings. You can rerun it; add `--hold 180` to keep
the connection open for a client application.

| What | Result |
| --- | --- |
| Obsidian 1.15.0 (Windows 11), unmodified archive | 40 of 40 checks passed |
| Obsidian 1.12.7 with the minimum-version gate lowered in the throwaway copy | 40 of 40; runtime evidence only, not a supported version |
| Covered | plugin loads from the archive; fresh install has nothing shared and the connection off; search worker runs from its Blob URL; a match after 200,000 characters; original-case excerpts; unclosed quote rejected; with tags off, load, index, search, connect and agent reads changed no file; preview writes nothing; apply adds only the selected fields and keeps body, comment and CRLF; a note with broken properties is left untouched; a second apply changes nothing; Connect resolves on a listening server; the built-in connection test; no token in saved settings; 401 without or with a wrong token; unapproved Host refused; exact REST read; the same not-found for unshared and missing notes; no unshared note in search; a `file:` path cannot reach an excluded note; existing-profile routes not served; a long note rebuilt byte for byte over pages; an older-protocol `initialize` and exactly five tools; bind address in both network modes (from this computer only); token rotation; Disconnect; clean unload |
| Client application | Claude Code 2.1.322 against that Obsidian: `search_notes` over direct HTTP using the `.mcp.json` shape (`"type": "http"`) and `get_note` through the bundled stdio bridge both returned the right note. It negotiated `2026-07-28`, so it counts as the modern client only |
| With Importer 3.1.17 installed in the throwaway vault (`--importer-dir`) | 42 of 42: Kosmos-Oden detects the Importer and its version, "Open Importer" opens the Importer's own window through its command, and the destination folder is held back from automatic time stamps |
| Not covered by this trial | any actual conversion by the Importer, a second machine, an older-protocol client application, timings inside Obsidian |

## Pending owner trials

| ID | Trial | Why it was not run on the build machine |
| --- | --- | --- |
| I01 | Google Keep Takeout ZIP becomes Markdown plus linked assets (text, checklist, labels, image, duplicate title, renamed note) | needs a real Takeout export; the Importer's file chooser is a native dialog the scripted trial does not drive |
| I02 | OneNote `.one` / `.onepkg` import (text, subpages, table, attachment, image, ink) | needs real exporter-produced files |
| I03 | OneNote account import | needs a Microsoft account with notebooks |
| I04 | Re-import: identical export, local edit, later source edit, renamed note, with Skip | needs I01 or I02 first |
| I05 | Importer report opens in your language; skipped and failed reasons readable | needs a real import |
| N02 | Another machine connects with the copied configuration | the build machine's firewall has no allow rule for Obsidian and the build does not change firewalls; bind addresses were checked from the same machine only |
| N01 (remote half) | Localhost mode is unreachable from another machine | same |
| C01 (older half) | One real older-protocol client application (one that opens with `initialize`) | Claude Code negotiated the modern revision; older revisions are covered by raw wire fixtures and the official SDK client 2.4.0, which are not product clients |
| B02 (your vault) | The archive installed over your existing plugin and settings in a copied vault | the scripted trial used a fresh throwaway vault, so it did not exercise an upgrade of real saved settings |
| Runtime | Device token storage is per device and does not sync; an edit in an open editor during "Apply selected tags" | needs two devices, or a person at the editor |
| Performance | Indexing and search timings with the 3D view open and closed, inside Obsidian on an idle machine | measured outside Obsidian only; see [PERFORMANCE.md](PERFORMANCE.md) |
| Visual | Review of the 3D view on your GPU; decision on refreshing the `star-focus` reference image | human approval is required for reference images |

## Reporting

Send the archive checksum, the step number, what you expected and what
happened. Do not paste tokens, personal exports or note contents into a
public issue or pull request.
