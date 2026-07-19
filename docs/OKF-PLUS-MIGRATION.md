# OKF+ 2.3 Conversion Behavior

The formatting workflow now proposes canonical nested OKF+ 2.3 for valid flat
2.2 compatibility notes and other mechanically recoverable notes. Conversion
remains an explicit, previewed, hash-bound, backup-protected action; scanning
alone never rewrites a note.

**Scan for OKF+ 2.3** leaves valid native 2.3 and Google OKF notes unchanged but
proposes safe 2.3 conversions for 2.2 and ordinary recoverable notes. **Convert
all to OKF+ 2.3** also includes recoverable Google and reserved notes.

The converter preserves Markdown body bytes, unknown parseable fields, source
tags, and human comments; it prohibits automatic epistemic promotion or
sensitivity reduction and rechecks source hashes before applying. Consequential
semantic changes still require separate governed authority.

Modes are:

- `strict-v2.3`: canonical nested 2.3 source;
- `compatible`: versioned legacy source projected without rewrite;
- `legacy`: unversioned recognizable metadata projected conservatively.
