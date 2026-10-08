# R1–R10 review: changes requested, frontmatter discovery can proceed

Reviewed by Codex, 2026-09-09. Input: immutable `.coordination/v1/artifacts/jeffrey/tag-fixtures-v1/`. This completes the rules review; it does not certify an inline parser or a production vocabulary endpoint.

## Executed evidence

The audit script at `_Claude-Code/codex-review-20260909/audit-fixtures.mjs` checked all 44 span-bearing rows: all match the file text, line and column under JavaScript UTF-16 indexing. All four frontmatter expectations match the installed Engine parser. None of the 22 proposed inline tags is returned: this Engine parses frontmatter tags only. Those inline expectations remain future behavior, not failing regressions in an existing inline parser.

Final audit uses the existing `.review-main/node_modules` installation whose receipt resolves Engine `650eab4a6752227cae336d7556a57826c22a0d5a`, version 2.2.0. Bundle SHA256: `4693336483ad56df2fcb4e2cb83320e5e41243a3d0e7ed293ba96f5ec8a33838`. This is local installation evidence, not a fresh dependency installation or live-vault qualification.

## Decisions

| Rule | Review disposition | Required implementation contract |
| --- | --- | --- |
| R1 | Accept as candidate detection only | A hash plus nonblank text starts a candidate; validity still depends on character and Markdown-context rules. Do not accept arbitrary punctuation after a hash. |
| R2 | Qualify before adoption | Define Unicode-aware preceding-character behavior; JavaScript `\w` is insufficient for Unicode letters. Add adjacent Japanese/combining-mark and repeated-hash cases. Existing ASCII case is not complete evidence. |
| R3 | Revise | The letters/digits-only Unicode whitelist excludes emojis and other symbols supported by Obsidian. Add emoji, astral characters and combining marks; qualify the precise accepted set before claiming Obsidian parity. Numeric-only rejection is supported. |
| R4 | Hold the three malformed-slash cases | Nested hierarchy is supported; documentation does not settle leading/trailing/doubled slash rejection versus partial matching. Retain the three rows as unresolved qualifications. Remove the fixture prose claiming the result is already an Obsidian rule. |
| R5 | Accept listed punctuation examples provisionally | Specify termination rather than generic stripping. Add punctuation-only candidates, punctuation within text, and end-of-file behavior. Tie any broad parity claim to parser evidence. |
| R6 | Revise and qualify contexts | Code exclusion is supported. Distinguish the heading delimiter from a real tag inside heading text: the current fixtures only test `# Heading`, not `# Heading #topic`. Add tilde/long fences, multi-backtick code spans, indented code, link labels versus destinations/anchors, and autolinks. Keep both URL-fragment rows unresolved. |
| R7 | Accept escaped-hash exclusion with parity qualification | Test odd/even backslash counts and escaped backslashes; do not suppress every hash merely preceded by any backslash. |
| R8 | Accept separation; revise precision | Preserve original spelling and occurrences. Specify case normalization rather than treating ASCII lowercasing as full Unicode case-folding. Define zero-based offsets and one-based lines/columns, and their units. Current spans are not UTF-8 byte offsets. Add CRLF, BOM, astral and composed/decomposed cases. Do not silently merge normalization collisions. |
| R9 | Accept | Keep frontmatter and inline origins distinct; frontmatter syntax does not prove human authorship. Leading-hash stripping is observed in Engine. A discovery key can normalize while preserving source spelling. |
| R10 | Accept boundary; replace the positive fixture | Governed labels never enter `navigation_tags` implicitly. Assert separate authored/derived/approved/effective standing using a valid Engine projection, not a frontmatter string that resembles a label. |

Obsidian documents case-insensitive tags, nested-prefix matching, numeric-only rejection and Unicode characters including emojis/symbols. These support the decisions above but do not settle every lexical edge case. [Official tag documentation](https://obsidian.md/help/tags). Its search documentation explicitly excludes code-block and non-Markdown matches from tag search. [Official search documentation](https://obsidian.md/help/plugins/search).

## Concrete fixture defect

`gkx-labels.md` declares version 2.2, a non-UUID identity, and an unquoted list containing colon-separated label text. The executed projection has **no authored labels** and emits `GKX-IDENTITY-002`. Its effective `assessment:insufficient` is derived by assessment, so checking that token alone would falsely appear to verify the intended authored-label bridge. `provenance:declared` is not in the observed effective labels. Evidence: `_Claude-Code/codex-review-20260909/label-fixture-audit.json`.

Keep v1 immutable. JEFFREY should publish v2 with a valid current-schema UUID/projection as the positive case and retain this malformed input as an explicitly negative case. Include asserted origins/standing and a unique authored label that cannot also be synthesized by assessment.

## Scope and next owner

JEFFREY owns the v2 fixture corrections and W4 design. Add authorization/count tests with public/internal/secret notes, missing and malformed sensitivity, root and empty-path area semantics, bounded pages, stale cursors and changed snapshots. Their absence does not invalidate this parser corpus, but it means W3 is not yet a complete vocabulary endpoint qualification suite.

Codex owns the vocabulary implementation module; Claude owns server wiring. Frontmatter-only bounded discovery can proceed without inline parsing. Count only caller-authorized records, keep explicit matches distinct from hierarchy rollups, and advertise inline coverage as absent. Inline parsing remains deferred until Engine ownership and the unresolved semantics are qualified. No owner decision is needed to proceed with these assignments.
