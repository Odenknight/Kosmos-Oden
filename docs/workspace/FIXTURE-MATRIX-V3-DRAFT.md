# Workspace fixture matrix v3 — review draft

This W2 inventory separates existing executable checks from acceptance work.
It is not an accepted contract, a new test receipt, or authorization to enable
future workspace features. The sequencing in
[FUTURE-TRACKS](../plans/2026-09-10-revised-execution/FUTURE-TRACKS.md) still applies.
Historical tag-fixtures-v2 and prior audit bytes remain unchanged.

## Existing executable behavior

Paths below are relative to the repository. A test's existence establishes
coverage to inspect; only an exact-candidate execution establishes a passing run.

| Case | Required distinction | Existing check | Evidence limit |
| --- | --- | --- | --- |
| Unlabeled sensitivity | Apply configured default; do not treat missing as public | `test/workspace-host.test.mjs`: unlabeled defaults and invalid sensitivity | Host fixture, not native UI |
| Invalid sensitivity | Exclude from readable results and deny direct read | Same host test | Does not prove every malformed metadata shape |
| Hidden counts | Count only readable matches across all pages | Same file: native search pages traverse all readable matches once | In-process host; includes hidden-note exclusion and exact total |
| Missing projection | Return unavailable projection, preserving readable source | Same file: missing projection remains unavailable | No fabricated origin or provenance |
| Origin collisions | Keep authored/proposed/effective values separate | `test/browser/workspace.spec.ts`: evidence declarations preserve origin, zero, missing and invalid values | Renderer fixture; does not resolve referenced targets |
| Effective header | Select effective origin and preserve explicit false conformance | Same browser file: governance header uses effective origin | A conformance claim is not validation or authority |
| Proposed relationships | Proposed declarations do not appear as effective declarations | Same browser evidence test; `test/gkx23.test.mjs`: UID-first typed relationships | Engine semantics and rendered declarations are separate assertions |
| Unresolved lineage | Distinguish unavailable, empty and scoped unresolved | Browser: lineage declaration inspection | No hidden-target existence disclosure |
| Revocation | Refuse publication and source opening after scope changes | Browser: revoked scope refuses publication; host continuation revocation tests | Does not prove actual Obsidian integration |
| Stable identity | Follow UID after path movement/reuse | Browser: saved stable UID; search selection follows its captured stable identity | Fixture supplies resolution; live host must also prove it |
| Resource bounds | Virtual rows remain bounded and keyboard reachable | Browser: virtual rows stay bounded | Not end-to-end latency, memory or frame-time qualification |
| Lifecycle | Discard late results after selection, refresh or close | Browser: late searches; keyboard selection and closing during pending read | Synthetic asynchronous host |

## Required acceptance extensions

1. Reconcile the immutable tag-fixtures-v2 inputs and their contradictory
   expectations with this matrix before calling it accepted. Preserve the old
   byte-coordinate claims as history. Specify UTF-8 bytes versus JavaScript
   UTF-16 code units explicitly for every span field; do not relabel offsets.
2. Cross-origin collision coverage now exists in `test/browser/workspace.spec.ts`:
   `identical evidence labels preserve distinct source provenance across origins`.
   Identical labels retain authored/derived source UIDs, missing proposed provenance
   displays “Not recorded,” and the label does not appear as effective evidence.
   The focused case and all 28 Chromium workspace cases passed on September 13.
   This fixture does not establish evidence validity or native host acceptance.
3. Record actual Obsidian view, edit, return, rename, deletion, scope change and
   layout transitions against final installed bytes. A hidden-window probe or
   browser fixture cannot substitute for visible native acceptance.
4. Bind the performance fixture to document counts, hardware, runtime, exact
   candidate, repetitions and accepted numeric budgets. Bounded DOM rows alone
   do not establish startup, responsiveness or memory targets.
5. Require a receipt per execution containing candidate SHA, command, platform,
   actual assertions, failures/skips and artifact hashes. Retain missing and
   failed evidence explicitly; do not promote future behavior into a product
   expectation before the interface decision is accepted.

W2 remains open until the fixture revision and expected semantics are reviewed.
W3/W4 and native release acceptance are not closed by this document.
