# Native Notes reader probe — 2026-09-13

At 09:29:33 UTC, candidate `e13c8be` was bundled into a temporary in-process
probe in Windows Obsidian. It used the candidate Agent API and Notes host/view
with the installed plugin's actual vault provider and configured read policy.
No HTTP listener was started, installed plugin replaced, or vault note edited.

The existing synthetic `gkx-labels` fixture was found as one readable result.
Its Markdown preview rendered, all five provenance sections appeared, no active
resource elements were created, and continuation reported the end of the note.
The source action opened the exact canonical fixture file in Obsidian. The probe
then closed its source tab and temporary pane and verified empty DOM cleanup.

The first attempt used the installed API, which predates the candidate's paged
read contract. Search worked but preview failed closed with an unavailable-read
message. The successful attempt paired the matching candidate API and reader;
it did not weaken the read contract or modify the installed service to pass.

This proves the candidate reader/UI path works with a real native provider and
editor action. The temporary harness did not register `KosmosNotesView` through
plugin startup, so it does **not** qualify plugin registration/reload, the default
workspace transition, cold startup, final Hermes acceptance, or release promotion.
The private receipt is `_Claude-Code/notes-native-receipt-20260913.json` in the
operator workspace. It explicitly records `releaseGateComplete: false`.

The probe also exposed stale match-count text during debounced refresh. The
follow-up clears that text immediately with the results and preview, and the
browser fixture checks this synchronously.
