---
title: Nested And Unicode Fixture
---
# Nested And Unicode

Nested tags: #project/kosmos and #project/kosmos/tags are both captured, hierarchy intact.
Trailing slash #project/ is invalid per Obsidian rules (segment must be non-empty).
Leading slash #/bad is invalid. Double slash #a//b is invalid.
Underscore and hyphen inside segments: #gkos_engine, #gkos-engine, #mixed_case-tag are valid.
Case: #KosmosTag and #kosmostag normalize to one key; original spellings preserved.
Unicode: #日本語 and #café and #naïve-tag are valid tags.
Very long tag #a-very-long-tag-that-exceeds-reasonable-length-but-is-still-syntactically-valid is captured whole.
