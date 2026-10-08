---
title: Edge Cases Fixture
---
# Edge Cases

Fenced code block tags must not parse:

```md
#not-a-tag-in-fence
also #fenced-no
```

Inline code `#not-a-tag-in-code` must not parse.
Escaped hash \#escaped is not a tag.
Markdown heading:
# Heading One Is Not A Tag
## Also Not A Tag
URLs: see https://example.com/page#fragment and obsidian://open?vault=x#y - no tags.
Purely numeric #123 and #456 are not tags (issue-ref collision rule).
Tag then numeric-ish: #v2release IS a tag (starts with a letter).
Hashtag inside a wikilink target [[Some Note#section]] is a heading anchor, not a tag.
Empty hash # alone and # followed by space # is never a tag.
