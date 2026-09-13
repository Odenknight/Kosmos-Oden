# Exact source-byte export and roadmap reconciliation

Base: Kosmos `7f28049`; Engine dependency unchanged at
`f39cccbacd5d2469b5e17dc0c1ef81d8d59cd9c4`. Versions remain 0.8.3/2.2.0
candidates, Graphiti target 0.30.2. No new dependency or release tag.

## Behavior

The MCP `export_graphiti_episodes` tool accepts `include_source_evidence: true`.
For each distinct authorized note on that page, the native provider reads bytes,
requires valid UTF-8 identical to the full indexed text, checks file identity,
size/mtime, provider revision and graph, and supplies the bytes to Engine's
existing `attachGraphitiSourceEvidence` helper. SHA-256 covers frontmatter,
line endings and content beyond the exported body truncation. The evidence
schema remains `gkos-source-bytes/1`; semantic support remains unverified.

The server accepts at most 4 MiB of distinct source bytes per page, rechecks
graph/provider/read policy after hashing, and rejects a page whose metadata
and episodes were computed under different graph/policy states. Binary and
cached-text reads share the existing 16-operation physical pool; timed-out
physical work retains its permit until settlement. Missing, stale, normalized
or over-budget evidence rejects the operation rather than claiming completeness.

The host's binary API reads a whole file; metadata is checked before I/O and
actual byte length afterward. Concurrent growth may temporarily allocate more
than the accepted byte budget. This is not a strict peak-memory or atomic
multi-file filesystem snapshot claim. Separate page requests may observe newer
generations. Immutable revision retention and the semantic broker remain open.

Default exports, REST, native export command and startup perform no new binary
reads. Providers without the snapshot/byte capabilities reject the opt-in.
No note writes, Graphiti ingestion, new service or semantic search are added.

## Reconciliation

The formerly local roadmap and handoff are now versioned, with merged work,
experiment successes/failures, local-material dispositions and open G2–G7 gates
separated. Current README Engine pins and the combined-extraction settings
description were stale and are corrected; historical receipts remain unchanged.
Observatory's measured run is documented as a separate synthetic fixture,
not a performance comparison with the hive or a production qualification.

## Qualification and rollback

Tests cover default/no-I/O behavior, full-byte digest accuracy with CRLF and
Unicode beyond truncation, denied-note exclusion, unsupported/malformed options,
unannounced edits, revision changes, revocation, invalid UTF-8, replacement,
metadata changes, metadata/actual/page budgets, stale graphs and retained I/O
ownership after timeout. All 419 tests and all verification checks passed.
All 40 desktop/mobile Chromium tests passed with two workers in 40.1 seconds.

The native Windows Obsidian candidate `595834c` passed schema discovery,
ordinary export without evidence, and explicit evidence export. One source's
SHA-256 and byte length matched an independent filesystem check; no source
path, contents or source digest are published. Graphiti remained 0.30.2,
searchable=false. The [sanitized receipt](evidence/source-byte-export/native.json)
has a [hash manifest](evidence/source-byte-export/SHA256SUMS).
The pre-test package was a separate comet-renderer candidate (PR 69), so it
was backed up and restored after this test pending combined integration.
Final combined-build and hosted outcomes are recorded in the PR description.

Rollback is the prior plugin package or removal of the optional argument.
No schema migration, database mutation or source-data rewrite is required.
