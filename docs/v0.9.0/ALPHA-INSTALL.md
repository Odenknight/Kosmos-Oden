# Kosmos-Oden 0.9.0 alpha 1 — install and roll back

This is an alpha for one tester. It has passed its automated checks; the
trials listed in [ALPHA-TEST.md](ALPHA-TEST.md) under "Pending owner trials"
have not been run. Use a **copied vault**, not your only copy of your notes.

## What you need

| Item | Version |
| --- | --- |
| Obsidian (desktop) | 1.13.0 or newer. The plugin will not load on older versions. |
| Obsidian Importer (only for OneNote and Google Keep) | 3.1.17 is the version these steps were written for. Install it from Settings, Community plugins. |
| Node.js (only for the optional stdio bridge) | 22 or 24, on the computer that runs the agent. Not needed for searching, importing or a direct HTTP connection. |

No database, Python, shell or model is needed for importing and searching.

## Install

1. In Obsidian, turn the existing Kosmos-Oden plugin **off** (Settings,
   Community plugins). If its connector is running, stop it first. Do not run
   an old and a new copy at the same time.
2. Copy the existing plugin folder somewhere safe. It is
   `<vault>/.obsidian/plugins/kosmos-oden/` and contains `data.json`, your
   saved settings. Older installs may use a folder named after the version;
   back up whichever folder holds the plugin with id `kosmos-oden`.
3. Check the archive:
   `kosmos-oden-0.9.0-alpha.1.zip.sha256` holds the SHA-256 of the zip.
   On Windows: `Get-FileHash kosmos-oden-0.9.0-alpha.1.zip -Algorithm SHA256`.
4. Unzip the archive. Copy the files inside its `kosmos-oden/` folder
   (`main.js`, `manifest.json`, `styles.css`, `kosmos-mcp-stdio.mjs`) into
   `<vault>/.obsidian/plugins/kosmos-oden/`, replacing the old ones. Keep your
   `data.json` in place: 0.9.0 migrates it.
5. Restart Obsidian and turn Kosmos-Oden on.

The archive also contains `docs/`, `LICENSE`, `THIRD-PARTY-NOTICES.md`,
`BUILD-INFO.json` (source commit and build environment) and `SHA256SUMS` for
every file in it. It contains no `node_modules`, settings, tokens or notes.

## What changes when you upgrade

- **Existing settings are kept.** An upgraded install stays on the existing
  profile with the same tools, sensitivity settings and token as before.
- **Personal Notes is a separate profile.** You choose it in Settings,
  Kosmos-Oden, "Active profile". A brand-new install starts there with
  nothing shared and the connection off.
- **Sharing is off until you choose folders.** In the Personal profile an
  agent can read only the folders under "Folders shared with agents".
- **Optional tags are off.** In the Personal profile Kosmos-Oden writes to a
  note only after you turn on "Use optional tags" and then press "Apply
  selected tags" or "Add supersedes", or turn on "Automatic time stamps"
  (which then stamps notes you edit in the folders to tag). The separate GKX
  formatting commands still write only when you run them.
- **The Personal connection has its own token**, stored on this device only.
  It is not in `data.json` and does not sync. The token saved by earlier
  versions keeps working for the existing profile and is not accepted on the
  Personal connection.
- **If you tested the earlier 0.9.0 patch build:** it lowered the saved
  default sensitivity while Personal Notes was on. 0.9.0 restores the value
  that build recorded. If none was recorded, the connection stays stopped and
  Settings shows what to check.

## Roll back

1. In the Connect window press **Disconnect**, then turn the plugin off.
2. Replace the plugin folder with the backup from step 2 above, including its
   `data.json`.
3. Restart Obsidian and turn the plugin on.

Reading and searching never change notes, so they need no content rollback.
Two things are your content and are **not** undone by rolling the plugin back:

- Notes and attachments created by the Importer.
- Tags you applied. Each "Apply selected tags" or "Add supersedes" first
  saves the exact previous text of every note it changes, as
  `.gkx/backup/tagging-<time>-<code>/files/<note path>.bak`, with a
  `manifest.json` listing each backup and its before and after hashes. There
  is no restore command in this release: copy a backup back by hand, or use
  your copied vault, and check first that you have not edited the note since.
  Automatic time stamps make no backup.

After a downgrade the older version does not know the new folder and protocol
settings. Review its connector settings before turning its connector on.
