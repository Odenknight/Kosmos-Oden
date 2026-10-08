# Adoption matrix reconciliation — revision 3.1

Date: 2026-09-09. Planning evidence only. Product source, installed services,
credentials, release tags and the frozen oracle were not changed. Revision 3
adds observed standings to the release ledger and the deployed-service
self-report; the row mappings are unchanged and were re-verified.

## Artifact received and scope of verification

Input: `C:/Users/FAC/Downloads/KOSMOSENGINEADOPTIONMATRIX20260909.md`.
SHA256 of the supplied bytes:
`b52e9ebe02f5f93f5a96979e44c3ea99d0469632e02ad51ae69b63de500a3c82`.

Compared with Kosmos b35b27e (0.8.2) and its pinned Engine 650eab4:
`src/plugin/agent-server.ts`, `src/plugin/vault-provider.ts`, Engine `src/paths.ts`,
`src/retrieval/filters.ts`, `src/service/mcp.ts`. This confirms structural mappings,
not full byte/field parity. Revision 3 additionally read the deployed plugin
bundle and settings, the running listener, and the live Engine service's
`initialize` and `gkos_capabilities` responses under an already-authorized
identity. GitHub refs, release listing and tag-to-oracle comparison were read
on 2026-09-09.

## Material corrections

1. **Arithmetic:** the table contains six PROXY rows (1, 2, 8, 9, 10, 11), three
   AUGMENT (3, 5, 6), one CONTRACT (4), eight KEEP (7, 12–18). Its summary's
   eight PROXY/six KEEP is incorrect. Re-verified.
2. **Vault scope:** area=Vault is a literal case-insensitive area equality filter,
   not an all-vault request. Empty/dot paths produce the synthetic area Vault;
   an actual folder named Vault also has that area. Omitting path_include would
   broaden scope and change results. Do not implement that row as written.
3. **Root scope:** a root-level file and a file inside a literal Root folder both
   match area=Root today. Top-level-only translation loses the latter. Preserve
   this union or introduce an explicitly versioned disambiguating selector.
4. **Release/oracle identity:** the v2.1.2 tag and the reported frozen oracle are
   different commits. Both hard-code serverInfo "2.1.2", so a live self-report
   cannot tell them apart. Do not label a tag capture as an oracle capture.
5. **PROXY is not wire equivalence:** full-note, assessment and validation envelopes
   differ. Retain compatibility translators and unadmitted/offline-note behavior.
6. **Deployed-matching tree:** the matrix's `the_Marshal/Kosmos-Oden` at 1bbbc54
   (0.7.0, Engine pin v2.0.1) is consistent with the installed plugin (manifest
   0.7.0, bundle strings "GKOS-Engine v2.0.1", built 2026-08-06). The commit is
   not provable from the bundle; the version and library are.
7. **Probe standing:** the matrix's forbidden probe reflected its session's
   identity, not the service. An authorized identity on the Obsidian host
   reached the service today. The deployed Engine service self-reports 2.1.2,
   not the 2.2.0 line the 0.8.2 candidate pins.

Synthetic observed results for an authorized test graph (unchanged):

```text
Input files: note.md, Root/note.md, Vault/note.md, FAC/note.md, fac/note.md
area=Root  -> Root/note.md, note.md
area=Vault -> Vault/note.md
area=FAC   -> FAC/note.md, fac/note.md
```

Case-insensitive folder equality and case-sensitive Engine glob matching require
translation tests. Literal wildcard-bearing names and the 16-glob filter limit
prevent claiming unconditional lossless translation by simply appending /**.

## Corrected eighteen-tool implementation map

"Delegate" means a candidate Engine implementation behind a compatible Kosmos
adapter after qualification, not immediate removal of working code. Engine
limits quoted are from 650eab4 and must be re-captured at the deployed 2.1.2.

| # | Kosmos name | Target / classification | Required handling |
| --- | --- | --- | --- |
| 1 | search_notes | gkos_search; delegate | Keep metadata mode and tag/area contracts; add multi-term AND matching to metadata mode; add verified body hits, bounded window (Engine 50/page, top-100 window versus Kosmos limit 200), caller-bound cursor, duplicate grouping and default archive exclusion |
| 2 | get_note | record_resolve + note_read; delegate primitive | Preserve legacy Kosmos envelope/frontmatter behavior and 200,000-character cap; introduce get_note_passage with server-side aggregation of 16 KiB Engine pages |
| 3 | get_lineage | lineage_get; augment | Keep transitive semantics; direct-neighbor pages (≤100) are not full chains |
| 4 | get_related | new bounded-path contract | Preserve one-hop default; add evidence, edge classes, per-hop access, budgets and continuation; exclude `_archive/moc-runs/**` snapshot copies by default (observed as duplicate backlinks today) |
| 5 | graph_at_time | graph_at_time; augment | Map scope_ref/state enum (valid, superseded, not_yet_created, all)/pagination; preserve old shape, declare valid-at-only; do not infer known-at |
| 6 | vault_overview | capabilities; augment | Keep local filtered counts; disclose library pin, service coordinate and negotiated capability state separately |
| 7 | get_gkx_note | keep Kosmos | Full origin-separated projection is not supplied by validate/assess |
| 8 | get_assessment | record_assess; delegate | scores_basis_points conversion, exclusions/profile and full-field parity; existing local fallback |
| 9 | get_diagnostics | record_validate; delegate | Preserve path/count/diagnostic fields and handling of invalid/unadmitted notes |
| 10 | validate_note | record_validate; delegate | Share validation work, retain valid/sourceUnchanged additions and public alias |
| 11 | assess_note | record_assess; delegate | Share assessment work, retain public alias and legacy result shape |
| 12 | assess_vault | keep Kosmos | Navigation audit is not equivalent; preserve authorized bounded summary |
| 13 | get_effective_labels | keep Kosmos | Preserve all origin layers |
| 14 | get_evidence | keep Kosmos | Keep supporting and contradicting evidence distinct |
| 15 | get_relationships | keep Kosmos | Supply consistent typed-origin evidence to path results without promoting inferred edges |
| 16 | get_policy | keep Kosmos | Preserve bundled policy/trust fields; do not claim a digest field exists unless implemented/verified |
| 17 | export_graphiti_episodes | keep Kosmos | Correct idempotency prose; add bounded filters for the planned relevant-episode consumer with versioned cursors; extend the existing graphitiCombinedExtraction/graphitiSagaMapping settings rather than adding parallel ones |
| 18 | graphiti_ingestion_status | keep Kosmos | Separate configured, export-ready, accepted, durable and searchable states; unknown DB state is not absent |

Keep gkos_navigation_discover/audit out of the new public Kosmos tool catalog for
this repair. Reference handling, made precise: `gkos_record_resolve` takes a
canonical path plus optional expected_uid and needs no scope; `gkos_graph_at_time`
and `gkos_navigation_audit` require a session-issued `scope_ref`, which only
discovery issues. Record and scope references are 29-character opaque tokens
bound to the MCP session and generation. Do not add public Navigation tools
solely to inflate adoption coverage.

The diagnostics pair shares work but does not have identical envelopes. Engine
assessment exposes integer scores_basis_points under profile
gkx-2.3-validating-projection; Kosmos exposes the full assessment. The Obsidian
legacy content provider strips frontmatter, while Engine note_read includes
raw Markdown. Fixtures must capture these differences.

## Release ledger: observed versus reported

| Coordinate | Evidence as of this review | Planning consequence |
| --- | --- | --- |
| Deployed Engine service | `https://192.168.5.99/mcp`, serverInfo 2.1.2, protocol 2025-11-25, contract 1.0.0-draft.2, extension observatory.mcp-content.v0, ten capabilities available (self-reported today) | The bridge's first compatibility target. Commit unknown until operator receipt |
| Deployed Kosmos plugin | 0.7.0, bundle built 2026-08-06, Engine library 2.0.1, eighteen tools (observed) | The baseline Hermes actually talked to |
| v2.1.1 | Latest published GitHub release; published 2026-08-18 | Release status alone does not establish required API compatibility |
| v2.1.2 tag object | 6d766a7b7dfc6fdfc077ab528d46f93e63c46528 | Annotated tag identity, not its executable commit |
| v2.1.2 peeled commit | 7bf14b481e78c5ae9d1e14661602be4f24559d0e | Tag captures bind here; hard-codes serverInfo 2.1.2 |
| Reported frozen oracle | 8207958047b3361ae21ac07c5a2abbd26a42a684; 11 ahead of v2.1.2; 53 behind Engine main | Separate coordinate; also hard-codes 2.1.2; frozen-policy standing is reported, not established by Git |
| Engine main | 94a1e643ad71796ff7199a29c6e9e8c2a85f588f, package 2.2.0, no runtime dependencies | Never install moving main without an immutable decision |
| Kosmos 0.8.2 candidate pin | 650eab4a6752227cae336d7556a57826c22a0d5a; on Engine main; descends from v2.1.2; 18 behind main; mcp.ts differs from oracle by 162 lines (observed) | Inspected library coordinate; not deployed anywhere |
| f1a95f8f (PR #41 pin) | On Engine main; descends from v2.1.2; 2 behind 650eab4 (observed) | Acceptable library ancestry; superseded by 650eab4 |
| 41172b9 (Kosmos main pin) | NOT on Engine main; does not descend from v2.1.2; on integration/navigation-effects-reconciliation-20260827 (observed) | Current mainline dependency is off-main; R0b repairs it before any R1 branch |

Read sources: [Engine releases](https://github.com/Odenknight/GKOS-Engine/releases),
[tag versus oracle comparison](https://github.com/Odenknight/GKOS-Engine/compare/v2.1.2...8207958047b3361ae21ac07c5a2abbd26a42a684),
local clones fetched 2026-09-09. These observations do not choose a release or
authorize cutting one.

## Required future inputs and their blast radius

The following evidence is required only before the indicated gate. If
unavailable, keep the named capability disabled or the gate NOT TESTED; do not
block independent native fixtures or documentation work.

| Input to request at gate | Why required | Blast radius if guessed |
| --- | --- | --- |
| R0: operator receipt from 192.168.5.99 with Engine commit, TLS certificate chain, and whether a Graphiti DB exists | Self-report cannot separate tag from oracle; the bridge needs a CA to trust | Wrong capture ledger; TLS verification disabled in production as it is in the current desktop client |
| R0: Hermes host, installed version and active profile (sanitized) | Patch the real client | Wrong config keys; another restart-less "fix" |
| R0: authenticated Kosmos tools/list digest | Bind the eighteen-tool baseline | Undetected schema drift between 0.7.0 and the repaired release |
| R0c: owner decision on defaultSensitivity=public and LAN bind | Body search returns text, not just metadata | Unlabeled notes readable in full by any LAN token holder |
| R1: caller-to-Engine grant/identity mapping | Preserve existing access restrictions during delegation | Cross-principal disclosure of source text, paths, citations, counts and relationships |
| Release: owner choice of a qualified Engine service coordinate after compatibility evidence | An available tag is not automatically the correct API target | All consumers of the new plugin package; rollback and reproducibility |
| T1: permitted history location outside the Nextcloud-synced vault, retention and byte-snapshot policy | Known-at needs durable evidence that does not replicate uncontrolled | Sensitive copies on every synced device and backup |
| G1/G2: actual Graphiti mode/backend/version, credential rights, destination policy and budget | Select a safe adapter and meaningful freshness tests | Derived DB integrity, unauthorized writes, external data exposure and model cost |

No secret values are needed in any report. Request sanitized configuration facts
or operator-produced receipts; do not ask users to paste bearer tokens or DB
passwords. Rust PR status relayed in the source document is outside this scope.
