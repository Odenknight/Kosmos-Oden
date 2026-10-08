# Direct Kosmos 0.8.2 MCP exploration

Read-only calls made by Codex using the owner-provided endpoint and credential. No settings, source notes, installations or services were changed. The credential was held in the probe process environment, removed afterward and excluded from evidence. This report concerns the existing installed endpoint, not qualification of the planned latest-protocol/latest-Engine implementation.

## Direct observations

| Probe | Observed result |
| --- | --- |
| Initialize using 2025-11-25 | Accepted; serverInfo identifies kosmos-oden 0.8.2; session issued |
| tools/list | 18 tools advertised; this was a representative exploration, not an exhaustive 18-tool qualification |
| vault_overview | 495 readable notes, public sensitivity ceiling, 10 areas, 105 assessed notes, 59 semantic edges and zero lineage edges |
| Version metadata | Navigation metadata reports Engine 2.2.0; other descriptive metadata still refers to older Engine versions. No executable source SHA is established by these labels |
| Navigation | enabled=false; governance_store_configured=false; gkos_conformance.claimed=false |
| Search query kosmos, limit 5 | total=40, five returned |
| Search query kosmos oden | total=0 |
| Search query gkos, limit 5 | total=140, five returned |
| Search query fighter metrics | total=0; this alone does not establish whether a matching readable body exists |
| get_note on the discovered Kosmos capabilities note | Successful; 7,424 content characters returned; content itself omitted from saved response evidence |
| Body-only control | The returned body contains “without changing runtime security controls”; searching that exact phrase returns total=0 |
| get_note with synthetic uid | -32602, Unexpected argument: uid, although its advertised schema allows a string uid selector |
| search_notes with tag but without query | Refused: requires string query. This probe mistake was corrected rather than counted as a failed tag filter |
| search_notes query="", tag=gkx | total=18 |
| search_notes query="", tag=gkos | total=3 |
| Graphiti status | export-ready, searchable=false; upstream verification required |

The overview's nested diagnostics reports semanticEdges=114 while the top-level field reports 59. The discrepancy is observed; its cause and whether the two fields deliberately count different scopes remain unverified. Investigate before using either as a baseline metric or declaring a disclosure defect.

## Implications

JEFFREY's live 0.8.2 connection is independently corroborated. The 495-note count is this caller's readable view, not proof of the whole indexed corpus or that every vault note is public. Current tag counts differ from some earlier examples and must remain timestamped observations.

Vocabulary-first discovery and body retrieval address directly reproduced limitations. Fix the UID schema/dispatch mismatch against current source; the synthetic UID demonstrates argument rejection, not whether any particular canonical UID resolves.

The successful legacy handshake characterizes today's endpoint only. It neither changes the owner's modern-only build target nor proves a separate remote Engine connection. Graphiti export readiness does not establish a queryable database or known-at history.

## Local evidence

Three sanitized local captures include tool schemas, timestamps, arguments, selected response metadata and errors, but no authorization header or session identifier:

- `_Claude-Code/codex-kosmos-mailbox/live-probe.json`
- `_Claude-Code/codex-kosmos-mailbox/live-probe-focused.json`
- `_Claude-Code/codex-kosmos-mailbox/live-probe-tags.json`

The probe closes its own sessions. Evidence contains local paths and scoped note metadata; keep it within the project collaboration channel rather than publishing it automatically.
