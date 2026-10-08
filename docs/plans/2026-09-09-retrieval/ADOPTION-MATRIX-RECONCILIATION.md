# Adoption matrix reconciliation — revision 2

Date: 2026-09-09. Planning evidence only. Product source, installed services,
credentials, release tags and the frozen oracle were not changed.

## Artifact received and scope of verification

Input: `C:/Users/FAC/Downloads/KOSMOSENGINEADOPTIONMATRIX20260909.md`.
SHA256 of the supplied bytes:
`b52e9ebe02f5f93f5a96979e44c3ea99d0469632e02ad51ae69b63de500a3c82`.

This identifies the file reviewed here; no independent mailbox digest/signature
was provided for chain-of-custody verification. That is not needed to review the
document's claims against code. Its row mappings, area semantics, fixture list
and candidate ledger are present, so no additional document is needed to revise
the build plans.

Compared with Kosmos b35b27e (0.8.2) and its installed Engine 650eab4 candidate:
`src/plugin/agent-server.ts`, `src/plugin/vault-provider.ts`, Engine `src/paths.ts`,
`src/retrieval/filters.ts`, `src/service/mcp.ts`. This confirms structural mappings,
not live deployed behavior or full byte/field parity. Ran a synthetic in-process
Kosmos area-query check; no network listener or real vault was used. GitHub refs,
release listing and tag-to-oracle comparison were read on 2026-09-09.

## Material corrections

1. **Arithmetic:** the table contains six PROXY rows (1, 2, 8, 9, 10, 11), three
   AUGMENT (3, 5, 6), one CONTRACT (4), eight KEEP (7, 12–18). Its summary's
   eight PROXY/six KEEP is incorrect.
2. **Vault scope:** area=Vault is a literal case-insensitive area equality filter,
   not an all-vault request. Empty/dot paths produce the synthetic area Vault;
   an actual folder named Vault also has that area. Omitting path_include would
   broaden scope and change results. Do not implement that row as written.
3. **Root scope:** a root-level file and a file inside a literal Root folder both
   match area=Root today. Top-level-only translation loses the latter. Preserve
   this union or introduce an explicitly versioned disambiguating selector.
4. **Release/oracle identity:** the v2.1.2 tag and the reported frozen oracle are
   different commits. Do not label a tag capture as an oracle capture.
5. **PROXY is not wire equivalence:** full-note, assessment and validation envelopes
   differ. Retain compatibility translators and unadmitted/offline-note behavior;
   do not delete local paths merely because an Engine operation has a similar name.

Synthetic observed results for an authorized test graph:

```text
Input files: note.md, Root/note.md, Vault/note.md, FAC/note.md, fac/note.md
area=Root  -> Root/note.md, note.md
area=Vault -> Vault/note.md
area=FAC   -> FAC/note.md, fac/note.md
```

Case-insensitive folder equality and case-sensitive Engine glob matching require
translation tests. Literal wildcard-bearing names and filter-count limits also
prevent claiming unconditional lossless translation by simply appending /**.

## Corrected eighteen-tool implementation map

"Delegate" means a candidate Engine implementation behind a compatible Kosmos
adapter after qualification, not immediate removal of working code.

| # | Kosmos name | Target / classification | Required handling |
| --- | --- | --- | --- |
| 1 | search_notes | gkos_search; delegate | Keep metadata mode and tag/area contracts; add verified body hits, bounded window and caller-bound cursor |
| 2 | get_note | record_resolve + note_read; delegate primitive | Preserve legacy Kosmos envelope/frontmatter behavior and cap; introduce get_note_passage for raw byte pagination |
| 3 | get_lineage | lineage_get; augment | Keep transitive semantics; direct-neighbor pages are not full chains |
| 4 | get_related | new bounded-path contract | Preserve one-hop default; add evidence, edge classes, per-hop access, budgets and continuation |
| 5 | graph_at_time | graph_at_time; augment | Map scope/state/pagination; preserve old shape, declare valid-at-only; do not infer known-at |
| 6 | vault_overview | capabilities; augment | Keep local filtered counts; disclose service/corpus differences and actual negotiated capability state |
| 7 | get_gkx_note | keep Kosmos | Full origin-separated projection is not supplied by validate/assess |
| 8 | get_assessment | record_assess; delegate | Basis-point conversion, exclusions/profile and full-field parity; existing local fallback |
| 9 | get_diagnostics | record_validate; delegate | Preserve path/count/diagnostic fields and handling of invalid/unadmitted notes |
| 10 | validate_note | record_validate; delegate | Share validation work, retain valid/sourceUnchanged additions and public alias |
| 11 | assess_note | record_assess; delegate | Share assessment work, retain public alias and legacy result shape |
| 12 | assess_vault | keep Kosmos | Navigation audit is not equivalent; preserve authorized bounded summary |
| 13 | get_effective_labels | keep Kosmos | Preserve all origin layers |
| 14 | get_evidence | keep Kosmos | Keep supporting and contradicting evidence distinct |
| 15 | get_relationships | keep Kosmos | Supply consistent typed-origin evidence to path results without promoting inferred edges |
| 16 | get_policy | keep Kosmos | Preserve bundled policy/trust fields; do not claim a digest field exists unless implemented/verified |
| 17 | export_graphiti_episodes | keep Kosmos | Correct idempotency prose; add bounded filters for the planned relevant-episode consumer with versioned cursors |
| 18 | graphiti_ingestion_status | keep Kosmos | Separate configured, export-ready, accepted, durable and searchable states; unknown DB state is not absent |

Keep gkos_navigation_discover/audit out of the new public Kosmos tool catalog for
this repair. gkos_record_resolve may require an existing scope/session reference;
use only the selected Engine's supported bootstrap flow internally. Do not add
public Navigation tools solely to inflate adoption coverage.

The diagnostics pair shares work but does not currently have identical envelopes.
Engine assessment exposes rounded integer scores_basis_points; Kosmos exposes
the full assessment. The Obsidian legacy content provider strips frontmatter,
while Engine note_read includes raw Markdown. Fixtures must capture these differences.

## Release ledger: observed versus reported

| Coordinate | Evidence as of this review | Planning consequence |
| --- | --- | --- |
| v2.1.1 | Latest published GitHub release returned by gh release list; published 2026-08-18 | Release status alone does not establish required API compatibility |
| v2.1.2 tag object | 6d766a7b7dfc6fdfc077ab528d46f93e63c46528 | Annotated tag identity, not its executable commit |
| v2.1.2 peeled commit | 7bf14b481e78c5ae9d1e14661602be4f24559d0e | Tag captures bind here; no corresponding release in the returned latest-release list |
| Reported frozen oracle | 8207958047b3361ae21ac07c5a2abbd26a42a684; GitHub comparison is 11 ahead, 0 behind v2.1.2 | Separate oracle coordinate; frozen-policy standing is reported, not established by the Git comparison |
| Engine main | 94a1e643ad71796ff7199a29c6e9e8c2a85f588f at lookup | Matrix's dee4a53 main is historical; never install moving main without an immutable decision |
| Kosmos 0.8.2 candidate pin | 650eab4a6752227cae336d7556a57826c22a0d5a | Inspected consumer coordinate, not proof it is deployed or released |
| f1a95f8f / 41172b9 ancestry claims | Reported in supplied matrix; not re-proven in this pass | Recompute before relying on those candidates; no pin change proposed here |

Read sources: [Engine releases](https://github.com/Odenknight/GKOS-Engine/releases),
[tag versus oracle comparison](https://github.com/Odenknight/GKOS-Engine/compare/v2.1.2...8207958047b3361ae21ac07c5a2abbd26a42a684).
These observations cannot identify the live deployed instance. They do not choose
a release or authorize cutting one.

## Required future inputs and their blast radius

No further input is required for these revised plans. The following evidence is
required only before the indicated implementation/activation gate. If unavailable,
keep the named capability disabled or the gate NOT TESTED; do not block independent
native fixtures or documentation work.

| Input to request at gate | Why required | Blast radius if guessed |
| --- | --- | --- |
| R0: sanitized authorized runtime receipt with Kosmos build, Engine coordinate, protocol/tools digest and corpus generation | Bind tests to the real deployment; the forbidden probe cannot do this | Wrong compatibility target across all deployed MCP callers; broken sessions/cursors or false readiness claims |
| R1: caller-to-Engine grant/identity mapping | Preserve existing access restrictions during delegation | Cross-principal disclosure of source text, paths, citations, counts and relationships |
| Release: owner choice of a qualified published Engine or explicitly accepted candidate, after compatibility evidence | An available tag is not automatically the correct API target | All consumers of the new plugin package; rollback/support and reproducibility |
| T1: permitted history location, retention and byte-snapshot policy | Known-at and historical passages need durable evidence | Additional sensitive copies on disk/backups, disk growth and deletion obligations |
| G1/G2: actual Graphiti mode/backend/version, credential rights, destination policy and budget | Select a safe read-only/managed adapter and meaningful freshness tests | Derived DB integrity, unauthorized ingestion/writes, external data exposure and model cost |

No secret values are needed in any report. Request sanitized configuration facts
or operator-produced receipts; do not ask users to paste bearer tokens or DB passwords.
Rust PR status relayed in the source document is outside this Kosmos planning scope.
