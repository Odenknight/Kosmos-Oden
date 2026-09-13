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
# Native saved-layout and inspector follow-up

## Native readable spatial selection

At 2026-09-13T11:15:00Z, installed source
`28eed3a7265fcc31325fc76bec6a1215ccc7c321` completed the actual Notes
“Locate in Kosmos” action. Its own sandboxed iframe acknowledged generation 4,
selected ID `file:_Kosmos-Qualification-Fixtures/gkx-labels.md`, and no error.
The native graph contained 2,276 readable notes. Installed main.js SHA-256:
`0b9d1fdf3e2f82885b2b92985adc233fa422f793f0ced0922bcb44c3abf082a8`.
All 11 artifact copies were verified with unchanged settings and preserved
rollback. This qualifies the observed button/publication/renderer-focus path;
it does not qualify revocation, all lifecycle cases or the remaining spatial plan.
Receipt: `_Claude-Code/native-spatial-ack-acceptance-20260913.json`.

At 11:16:28Z the same installed build cleared host snapshot/acknowledgement state
immediately on refresh and received a replacement focus acknowledgement. Closing
the view released its frame and snapshot; reopening acknowledged the fixture in
a new view generation. At 11:17:23Z a temporary public-only query instance for
this view removed a previously displayed confidential synthetic fixture. The
renderer acknowledged no selection, the hidden node was absent, and the original
view context was restored. Live API settings did not change and no listener was
started. This is native view restriction evidence, not Hermes denial evidence.
Receipts: `native-spatial-lifecycle-20260913.json` and
`native-spatial-restriction-20260913.json` under `_Claude-Code`.
The restriction test exposed generic success wording after selection loss; the
candidate now preserves the explicit selected-note-unavailable message.

At 11:19:23Z the installed readable-view message handler was exercised with
synthetic MessageEvents and a finally-restored editor-opening spy. It refused
wrong-frame, unsafe-path and absent-target requests, resolved the permitted
fixture to its canonical TFile path, and refused publication after immediate
view invalidation. The snapshot publication wrapper was also restored. This
tests the installed handler and does not claim physical iframe-button or editor
integration coverage. Receipt:
`_Claude-Code/native-spatial-source-handler-20260913.json`.

At 2026-09-13T10:39:32Z, clean source
`efcbcb4d73ebec53d71fe93e943addaaaeb70188` was installed and reloaded after
446 tests and all build checks passed. Installed main.js SHA-256:
`9309933683282a286f0b2c006c415525a8f622ac4ad3bd6d21fe635bd75c7b75`.
All 11 artifact copies were verified and settings were unchanged; the prior
installed package was backed up.

The native probe restored the existing synthetic gkx-labels fixture, captured
search/filter/selection state, switched the leaf to empty, recreated Notes with
that state, and observed the same selected path and controls. Documentation
assessment and diagnostics headings were present. The original pane state was
restored afterward. This qualifies native view recreation with supplied layout
state, not a cold-process restart or disk-layout recovery. The private receipt is
`_Claude-Code/native-layout-acceptance-20260913.json`.

At 2026-09-13T11:44:58Z, installed source `10994b545e7d4a8a951df554eec489b8467038d8`
passed the legacy/Notes command-routing probe with the preference restored.
The native local map had a keyboard-accessible circle with finite coordinates;
this single-node fixture does not qualify crowded-map presentation. Eight warm
alternating selections performed zero graph reads. The original polling probe
reported approximately 60 seconds per sample while the document was hidden;
that receipt is retained and is not an interaction-latency acceptance result.

At 11:46:23Z, a second probe measured the matching, current-generation renderer
acknowledgement event from the owned iframe directly, without polling. All eight
warm synthetic selections completed in 3.9–6.2 ms with zero graph reads, also in
the hidden document. The graph instrumentation was restored in `finally`.
This qualifies that warm selection path, not cold startup, whole-corpus latency,
paint completion, or physical user interaction. Private receipts and harnesses:
`_Claude-Code/native-activation-acceptance-20260913.{js,json}` and
`_Claude-Code/native-selection-events-20260913.{js,json}`.
