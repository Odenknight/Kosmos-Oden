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

## Historical area expectation reconciliation

The preserved v2 bundle has 14 notes and 16 manifest-listed files. All 16
matched their recorded hashes during the September 13 read-only check. The
observed `SHA256SUMS` digest is
`fb8ed729545598649a7589f25ef2e8c9c2d6b223e91172c47b9954603d71f81b`.
This establishes consistency with the retained manifest, not independent
authentication of its original publication.

The `area_cases` row for `area=root` lists `root-note.md` and
`Root/in-root-folder.md`, without an explicit corpus subset. Against all 14
notes, the current consumer's `qSearch('', {area:'root', limit:100})` returns
13 matches at default sensitivity `secret` and ceiling `secret`. All top-level
notes belong to Root; `AreaDemo/area-case.md` is the sole other-area note.
The observed Engine bundle SHA-256 is
`ed5342efb6132059729693471e8163a2506739d7b50322d237c09a209fad4176`.

The v3 expectation must therefore state its input corpus explicitly:

- Area-only case: load exactly `root-note.md`, `Root/in-root-folder.md` and
  `AreaDemo/area-case.md`; expect two Root matches at a secret ceiling.
- Whole-bundle case: load all 14 notes; expect 13 Root matches at that ceiling.
- Lower-ceiling cases: derive the expected set from the separately specified
  sensitivity policy; do not reuse either count.

No historical expectation was edited, and no production area semantics changed.
The five v2 Obsidian qualification rows are reconciled below; adoption remains
a separate interface decision.

## Actual Obsidian parser observation

On September 13, Obsidian 1.12.7's metadata cache was read through its CLI for
the already-installed synthetic fixtures. Their raw SHA-256s matched v2:
`edge-cases.md` = `63b476e6a7090d88a38899738e0a9b8e1cce1f5fe572d18e1b7bc175e65fafa4`;
`nested-and-unicode.md` = `7e4100c8622db4065d60c9afa3f1b07962d80359b86b261b4055b4bac5359c8d`.

| Fixture literal | Historical proposed tag status | Observed cached tag status |
| --- | --- | --- |
| URL `page#fragment` | No | No |
| URI `vault=x#y` | No | No |
| `#project/` | No | Yes, exact literal |
| `#/bad` | No | Yes, exact literal |
| `#a//b` | No | Yes, exact literal |

These observations contradict the three slash-related proposal rows. Preserve
those rows as history; a compatibility fixture must use the observed behavior
for this version rather than silently treating the proposal as Obsidian's rule.
Cache positions were inspected, not rewritten. This is native parser evidence
for these exact files, not universal syntax qualification, rendered-tag interaction
acceptance, or approval to change Engine parsing semantics. The area-only subset
was also executed separately and returned the two expected Root paths.

## Span-coordinate reconciliation

The 58 span-bearing rows in v2's inline, frontmatter, non-tag and qualification
groups were checked against unchanged source text. All 58 match both UTF-16
code-unit slicing and Unicode-code-point slicing; only 54 match UTF-8 byte
slicing. The four byte mismatches are in the Unicode note. The historical
description of those spans as byte coordinates is therefore inaccurate.

This corpus does not distinguish UTF-16 from code points. Do not claim that it
proves either convention uniquely. A v3 coordinate fixture must include, for
example, the exact string `😀 #alpha`: the tag starts at UTF-8 byte offset 5,
UTF-16 code-unit offset 3, and Unicode-code-point offset 2. Its ASCII length is
6 in all three conventions. Use explicitly named fields rather than a bare
`offset`, and state whether line/column coordinates are zero- or one-based.
This discriminating example is a fixture-design requirement, not adoption of
new parser semantics or a rewrite of historical spans.
