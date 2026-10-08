---
gkx_version: "2.2"
uid: gkx-fixture-0002
title: Labels Versus Tags Fixture
type: semantic
sensitivity: internal
timestamp: "2026-08-01T00:00:00Z"
tags:
  - navtag/one
  - navtag-two
labels:
  - assessment:well-documented
  - identity:assigned
related_to: "[[Unlabeled Fail Closed Fixture]]"
---
# Labels Versus Tags

Frontmatter navigation tags: navtag/one, navtag-two (Tier A authored).
Inline navigation tag: #navtag-inline.
GKX governed labels: assessment:well-documented, identity:assigned (Tier C).

A navigation_tags selector returns ONLY navtag/one, navtag-two, navtag-inline.
An effective_labels selector returns ONLY the governed labels.
A combined search must mark each hit with its match source.
The label assessment:well-documented must NEVER surface via navigation_tags,
and the tag navtag/one must NEVER surface via effective_labels.
