# tag-fixtures-v2

Synthetic fixture set for GKOS tag/label/sensitivity/area discovery behavior.
Author: jeffrey. Commission: codex-astra seq 9 requirements + claude-fable-gkos
seq 10 item 7 (unlabeled fail-closed note). No live vault content.

Supersedes tag-fixtures-v1. The five v1 notes are carried byte-identical
(verified by hash); v1 remains immutable in its own directory.

## Contents

- notes/ -- fourteen synthetic .md files (five carried from v1, nine new)
- expected.json -- machine-readable expectations with mechanically computed spans
- SHA256SUMS -- digests over every file in this set

## Standing of each expectation group (per codex seq 9 requirement)

CURRENTLY-EXECUTABLE (assertable today against Kosmos 0.8.2 / Engine 2.2.0):
- expected_frontmatter_tags (frontmatter tag parsing + search_notes tag filter)
- sensitivity_and_fail_closed (projection + ceiling visibility semantics)
- area_cases (areaFromFilePath rules + case-insensitive area filter)
- expected_non_tags (parser exclusions that hold in any correct implementation)

FUTURE-BEHAVIOR (do not code against these rows until the named work lands):
- expected_inline_tags -- requires W5 Engine inline-tag parsing (Engine 2.2.0
  parseMarkdownFile reads frontmatter tags only; verified at 94a1e64)
- navigation_tags / effective_labels / combined selectors -- requires W4 design
- tag_index_boundaries (pagination, snapshot scope, hidden-count exclusion,
  hierarchy rollup) -- requires W4 get_tag_index contract

## Coverage against codex seq 9 checklist

- unlabeled fail-closed notes: unlabeled-failclosed.md (GKX 2.3, no sensitivity
  field; expected effective = configured default; GKX-SENSITIVITY-001 present)
- explicit sensitivity tiers: tier-public / tier-internal / tier-confidential /
  tier-invalid (invalid label fails closed to secret, never downgrades)
- frontmatter tags vs effective labels: labels-vs-tags.md (navtag/* and
  navtag-inline vs assessment:well-documented / identity:assigned; selector
  separation assertions in expected.json)
- root/empty-path area cases: root-note.md (top-level -> Root),
  Root/in-root-folder.md (literal Root folder -> Root; union preserved per rev4
  adoption matrix), AreaDemo/area-case.md (case-insensitive filter)
- pagination/snapshot boundaries: tag_index_boundaries in expected.json
- hidden-count exclusion: tag_index_boundaries.hidden_count_exclusion (no
  filtered counts, hidden paths, blocked lists, or hidden neighbors)

## Coverage carried from v1 (parser contract R1-R10)

fenced/inline code, escaped hashes, ATX headings, URL/URI fragments (qualify
rows), Unicode, nested tags, punctuation, case normalization, numeric-only
exclusion, wikilink heading anchors, origin separation. See v1 expected.json
for rules R1-R10 (proposal, unchanged).

## Qualify-before-implementation rows

Five cases in expected.json.qualify_before_implementation where the expectation
is stated but Obsidian's actual matching rules must be qualified before an
implementation adopts them (codex seq 3 refinement 5). Do not code against
those rows until qualified.
