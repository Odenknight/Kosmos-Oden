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

## Verified cold-process startup

On September 13, the CLI `restart` command reported success but process 19956
and its uptime remained unchanged. That attempt is retained as a failed cold-start
verification, even though the subsequent Hermes checks passed.

After confirming no unsaved Markdown editors, a normal window close completed
without forced termination and Obsidian was relaunched. At 10:05:12 UTC, the
renderer process was 31252 with 33.42 seconds uptime. The exact clean `c5b7b7f`
source and `22ababdd…37fa032` artifact remained installed. The API was running,
Notes was registered, and its saved leaf was restored. All six native Hermes
checks then passed against the relaunched application.

This establishes cold-process startup and subsequent native client operation
for this installed artifact. Notes restoration or another caller may have read
the provider before Hermes; the evidence does not establish an uncached first
Hermes query. The reusable Hermes harness still reports its own
`cold_start_exercised: false`, because it does not control application lifecycle.
The outer before/after process receipts supply that separate evidence. Later
source changes require their own final artifact qualification.

Private receipts: `native-cold-before-20260913.json`,
`native-cold-after-20260913.json` (unchanged-process attempt),
`native-verified-cold-after-20260913.json`, and
`hermes-after-verified-process-restart-20260913.log`.

## Latest inspector and renderer candidate

Clean source `6ae4926ea676b914c28d4cdd08c4ae65ca27cf55` subsequently passed 445
tests and all verification checks, then was installed with settings unchanged
and its predecessor backed up. All 11 package files were verified. Its `main.js`
SHA-256 is `2f5a297b83028946977e2a8fa4cbb3f2c7ce2affd38d3aec54dce99d7f838779`.

At 10:20 UTC, eight warm selections of the existing synthetic fixture completed
in a vault reporting 2276 readable notes. Maximum synchronous loading feedback
was 0.9 ms and maximum completed preview was 8.7 ms, below the plan's 100 ms and
300 ms warm targets. The machine was an Intel i7-11800H, 16 logical CPUs, 32 GiB
RAM, Windows, Electron 39.8.3 and Node 22.22.1. Navigation tags and all three link
groups appeared. These are eight repetitions of one fixture under normal desktop
activity, not cold, corpus-wide, tail-latency, or universal hardware claims.

The installed renderer handler was also exercised with synchronous lookup spies:
unsafe legacy/current messages were refused before lookup; a missing safe target
caused one lookup and zero link-resolution calls. The original methods were
restored in `finally`. This establishes native handler behavior without creating
or opening a synthetic missing file; it is not a cross-window transport test.

Receipts: `native-latest-install-20260913.json`,
`native-latest-verify-20260913.log`, `native-notes-latency-20260913.json`, and
`native-renderer-handler-20260913.json`. The earlier cold-process receipt belongs
to `c5b7b7f`; it is not relabeled as a cold-start test of this later artifact.
