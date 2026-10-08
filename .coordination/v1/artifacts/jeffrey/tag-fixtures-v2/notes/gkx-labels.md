---
gkx_version: "2.2"
uid: gkx-fixture-0001
type: semantic
tags:
  - governed-fixture
labels:
  - assessment:insufficient
  - provenance:declared
sensitivity: public
description: Fixture demonstrating navigation tags vs governed labels separation.
related_to: "[[Inline Basic Fixture]]"
---
# GKX Labels Fixture

This note has frontmatter tags (navigation vocabulary, Tier A authored)
AND GKX governed labels (Tier C). A search for navigation tag governed-fixture
matches Tier A; the label assessment:insufficient must ONLY surface through
an effective_labels selector, never through navigation_tags.
Body inline tag #tier-a-inline coexists with governed labels.
