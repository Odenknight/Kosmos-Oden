# Installed Notes candidate acceptance — 2026-09-13

Clean source `c5b7b7f25c43dd2e86f54d670213d2e37db2c086` passed 443 tests and all
verification checks in a separate clean worktree. Its packaged `main.js` SHA-256
is `22ababdd718b9f8b12e7ffd3c55edc1bed93a8844c666019b8d5df0f137fa032`.

At 09:39 UTC, the preceding installed artifacts were backed up, all 11 package
files were copied and verified, and the settings file remained byte-identical.
Obsidian reloaded the plugin in process 19956. Before reload, `activateNotes` was
absent; afterward the Notes view registered, opened and the Agent API ran.
The receipt at 09:43:17 UTC rechecked the exact clean source and installed hash.

The actual installed `KosmosNotesView` passed:

- first-page search and next-page display, showing ranges 1–100 and 101–200
  against the readable total of 2275;
- the existing synthetic fixture's Markdown preview, five origin sections and
  end-of-note marker;
- opening the correct canonical file in Obsidian;
- closing with empty DOM cleanup, reopening, and successful search afterward.

JEFFREY's existing native Hermes profile also passed its six read-only acceptance
checks against this installation: 18-tool listing, search, permitted UID read,
policy-consistent confidential read, related traversal and warm UID read.
No credentials or persistent client configuration were changed for that run.

This supersedes the earlier temporary-harness limitation for native Notes
registration and close/reopen behavior. It is a **plugin reload**, not a cold
process start. The configured policy permits the confidential fixture, so that
read does not establish restricted-read denial. Those gates and final overall
release qualification remain open. The default workspace has not changed.

Private operator receipts: `native-notes-install-20260913.json`,
`native-notes-installed-acceptance-20260913.json`,
`native-notes-clean-verify-20260913.log` and
`hermes-native-c5b7b7f-20260913.log` under `_Claude-Code/`.

## Negative-policy native code check

At 09:46:09 UTC the installed Agent API class was exercised in-process with a
separate public-only settings object and the real vault provider. The public UID
read succeeded; the confidential fixture returned only `note not found`, and its
search returned zero matches. No listener was created and the live regulated
ceiling was unchanged. Receipt: `native-inprocess-denial-20260913.json`.

This qualifies the installed code's native policy path, not Hermes transport
under a restrictive policy. Automatic approval review rejected the proposed
five-minute authenticated LAN test listener on port 4916 because that additional
network exposure needs explicit authorization. It was not started. The native
Hermes negative-authorization gate remains open pending that permission or an
authorized equivalent test endpoint.
