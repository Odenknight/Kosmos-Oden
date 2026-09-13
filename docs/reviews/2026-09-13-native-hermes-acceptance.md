# Native Hermes read and identity receipt

Observed 2026-09-13T08:56Z against installed Kosmos source
`043f682b12b0769dac9384479a2cc3012503f883` (clean build), main.js SHA-256
`2521d8b5c1444826d452aa4bb0b84944922c9772765a7ca2c4d2c50f66131e1e`.
The existing JEFFREY Hermes profile and its native MCP SDK 2.0.0 were used.
No credential, chat, service configuration or vault note was changed.

Passed native connection/tool listing (18 tools), fixture search, permitted UID
read, policy-consistent confidential fixture read, related traversal and warm
UID read. Five observed traversal events all carried JEFFREY and the same visual
identifier, despite the tool argument containing the generic `mcp` placeholder.
The temporary observer was restored. These labels do not establish authorization.

The successful warm-run measurements were search 69.39 ms, UID read 17.18 ms,
confidential fixture read 14.22 ms, related traversal 15.60 ms and warm UID read
15.03 ms. This is one functional probe, not a performance qualification.

The configured ceiling permits the confidential fixture, so restricted-read
denial was not exercised on this endpoint. Cold-start was not exercised either.
The probe explicitly reports `release_gate_complete: false`. The first two probe
failures were retained locally: one incorrectly expected stripped frontmatter
in the body; the other assumed the default sensitivity ceiling. No product or
policy change was made to make those assumptions pass.

This receipt does not qualify the subsequent long-note continuation commit or
complete R0/R3. Final-candidate identity, cold-start, negative authorization and
other release gates must still be completed against their intended scope.

## Current installed candidate recheck

At 2026-09-13T13:43:26Z–13:43:31Z the same hash-verified probe ran through
JEFFREY's existing Hermes profile against installed Kosmos
`78abe886e5ae88a2a25eee356b8fa37c8f2e954e`, main SHA-256
`648b93ace90e685214db25767bbbb253c71d67c2eeb57546fb1e4438c5520a25`.
The native process ID and artifact hash were unchanged across the calls;
Obsidian's runtime was Node 22.22.1. No profile, credential or vault content changed.

Discovery returned 18 tools. Search, permitted UID read, policy-consistent
confidential read, related traversal and warm UID read passed, respectively at
46.74, 16.09, 12.51, 15.49 and 13.45 ms. Five live traversal events carried
JEFFREY and one consistent visual identity despite generic `mcp` tool arguments.
The temporary observer was restored. These are functional observations, not a
performance distribution or identity authorization grant.

Restricted denial and cold-start remain unexercised. The report continues to
set `release_gate_complete: false`. Private evidence:
`hermes-current-acceptance-20260913.log` and
`native-hermes-current-observer-20260913.json` under `_Claude-Code`.
