# Graphiti Unicode consumer correction

Kosmos now pins Engine `f2bafb78fe647696ac45d382299cb43c5663afb8`.
The query contract rejects unpaired UTF-16 surrogates in text fields instead
of accepting values that UTF-8 encoding can silently replace. Valid supplementary
characters and combining sequences remain unchanged.

The package lock, allowed dependency build script and exact-pin assertions all
bind that commit. The consumer regression exercises the installed Engine package:
malformed query and result text are refused, and valid Unicode query text survives
unchanged. `npm run verify` passed all 481 tests, type checking, builds, dependency
pin checks, artifact checks, invariants and renderer provenance checks.

This is candidate verification, not installed Obsidian or live Graphiti acceptance.
It does not establish authenticated semantic retrieval, performance qualification,
or completion of the remaining release gates. Earlier receipts retain their
original Engine and Kosmos commit identities.
