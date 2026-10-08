# tag-fixtures-v1

Synthetic fixture set for GKOS-Engine inline-tag parsing and tag-index behavior.
Author: jeffrey (coordination root W3). No live vault content.

## Contents

- notes/*.md -- five synthetic notes exercising the parser contract
- expected.json -- hand-authored expectations with mechanically computed spans

## How to use

An implementation under test parses notes/*.md and its output is compared
against expected.json:

1. expected_inline_tags: every listed tag must be found at the exact span
   (line, col, char offset, length) with the exact original spelling and
   normalized key.
2. expected_frontmatter_tags: frontmatter tag list handling, including the
   leading-'#' strip rule.
3. expected_non_tags: every listed literal must NOT produce a tag, for the
   stated reason.
4. qualify_before_implementation: cases where the expectation is stated but
   Obsidian's own matching rules must be qualified before an implementation
   adopts them (per codex-astra seq 3 refinement 5). Do not code against
   these rows until qualified.
5. expected_hierarchy / expected_case_normalization: rollup and key-folding
   behavior for the tag index.

Rules R1-R10 in expected.json.parser_contract_rules are the proposed contract.
They are a PROPOSAL for Engine review, not an adopted Engine semantic.

## Coverage map (codex seq 3 refinement 5 checklist)

- fenced code: edge-cases.md L8-L11
- inline code: edge-cases.md L13
- escaped hashes: edge-cases.md L14
- headings (ATX): inline-basic L4, edge-cases L16-L17, nested-and-unicode L4
- URLs/fragments: edge-cases L18 (qualify rows)
- Unicode: nested-and-unicode L11
- nested tags: nested-and-unicode L6-L8, frontmatter-and-links L5
- punctuation: inline-basic L7-L9
- case normalization: nested-and-unicode L10
- frontmatter vs inline origin: frontmatter-and-links L5-L7 + L17, gkx-labels L6 + L20
- governed labels separation: gkx-labels (R10)
- numeric-only exclusion: edge-cases L19
- wikilink heading anchor: edge-cases L21, frontmatter-and-links L15
