# Adoption matrix reconciliation — revision 4

Date: 2026-09-09. Planning evidence only. [Review decisions](REVIEW-REV4.md) reconcile source facts with the submitted revision 3 runtime observations. This revision did not probe live services, change credentials, choose an Engine release or modify product code.

## Artifact received and scope of verification

Input: `C:/Users/FAC/Downloads/KOSMOSENGINEADOPTIONMATRIX20260909.md`.
SHA256 of the supplied bytes:
`b52e9ebe02f5f93f5a96979e44c3ea99d0469632e02ad51ae69b63de500a3c82`.

Compared with Kosmos b35b27e (0.8.2) and its pinned Engine 650eab4:
`src/plugin/agent-server.ts`, `src/plugin/vault-provider.ts`, Engine `src/paths.ts`,
`src/retrieval/filters.ts`, `src/service/mcp.ts`. This confirms structural mappings,
not full byte/field parity. Revision 3 reports inspecting the deployed plugin, settings and listener and obtaining live initialize/capabilities responses. These are supplied observations, with TLS verification disabled for the Engine probe. They do not bind the exact running executable or independently establish trusted endpoint identity. Revision 4 directly rechecked candidate archive/content boundaries, prototype lifecycle code, cited vault directives, GitHub main SHAs and PR #42 review state. Release listing/ancestry details retained below are dated evidence from the earlier reviews, not a release choice.

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
6. **Package versus runtime:** revision 3 reports BUILD-INFO pointing to 1bbbc541 and matching shipped checksums for the installed 0.7.0 files. Preserve that source-package association. Bundle version strings and co-shipped checksums do not independently prove which binary the running listener loaded or attest a reproducible build.
7. **Probe standing:** forbidden describes the original session's lack of access. The later supplied authorized probe reports a 2.1.2 response; it does not limit the possible build to tag/oracle, prove a validated TLS peer or establish an exhaustive inventory of deployments.
8. **Archive fix already exists:** current main and candidate 0.8.2 centrally exclude .gkx and _archive/moc-runs at indexing and direct-content boundaries. The reported noise is from deployed 0.7.0. Preserve and qualify this fix; no ordinary include_archive bypass.
9. **Compatibility:** term-AND metadata matching and duplicate grouping are opt-in. Unrequested default changes would alter existing search hits, totals and ordering. Duplicate bodies do not merge historical or canonical standing.



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
limits quoted are from 650eab4 and must be captured separately against the identified service build.

| # | Kosmos name | Target / classification | Required handling |
| --- | --- | --- | --- |
| 1 | search_notes | gkos_search; delegate | Keep legacy metadata substring/totals and tag/area contracts; opt-in match=terms and grouping; verified body hits, disclosed window (candidate 50/page, top-100 versus legacy 200), caller-bound cursor and existing operational exclusions |
| 2 | get_note | record_resolve + note_read; delegate primitive | Preserve legacy Kosmos envelope/frontmatter behavior and 200,000-character cap; introduce get_note_passage with verified 16 KiB Engine pages aggregated within byte/page/deadline limits and explicit continuation |
| 3 | get_lineage | lineage_get; augment | Keep transitive semantics; direct-neighbor pages (≤100) are not full chains |
| 4 | get_related | new bounded-path contract | Preserve one-hop default; add evidence, edge classes, per-hop access, budgets and continuation; preserve operational archive exclusion, including existing direct-read refusal; qualify deployed 0.7.0 upgrade |
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
| 17 | export_graphiti_episodes | keep Kosmos | Correct idempotency prose; add bounded filters for the planned relevant-episode consumer with versioned cursors; reuse graphitiCombinedExtraction/graphitiSagaMapping export options; separate history/query/ingestion switches prevent unintended activation |
| 18 | graphiti_ingestion_status | keep Kosmos | Separate configured, export-ready, accepted, durable and searchable states; unknown DB state is not absent |

Keep gkos_navigation_discover/audit out of the new public Kosmos tool catalog for
this repair. Reference handling, made precise: `gkos_record_resolve` takes a
canonical path plus optional expected_uid and needs no scope; `gkos_graph_at_time`
and `gkos_navigation_audit` require a session-issued `scope_ref`, which only
discovery issues. The inspected implementation uses 29-character prefixed record/scope tokens, but consumers treat them as opaque and validate the negotiated contract rather than hard-coding that observed length as a universal API. Bind them to principal, MCP session, generation and corpus. Deferring public Navigation here is a scope choice; the cited Navigation plan recommends read-only exposure in its own workstream.

The diagnostics pair shares work but does not have identical envelopes. Engine
assessment exposes integer scores_basis_points under profile
gkx-2.3-validating-projection; Kosmos exposes the full assessment. The Obsidian
legacy content provider strips frontmatter, while Engine note_read includes
raw Markdown. Fixtures must capture these differences.

## Release ledger: observed versus reported

| Coordinate | Evidence as of this review | Planning consequence |
| --- | --- | --- |
| Reported deployed Engine service | `https://192.168.5.99/mcp`, serverInfo 2.1.2, protocol 2025-11-25, contract 1.0.0-draft.2, extension observatory.mcp-content.v0, ten capabilities available (revision 3 self-report; TLS verification disabled) | Reported compatibility target; trust, corpus and executable identity pending operator receipt |
| Reported deployed Kosmos plugin | 0.7.0, package metadata 2026-08-06, Engine label 2.0.1, eighteen tools | Submitted baseline; package association and response evidence, not independent loaded-binary attestation |
| v2.1.1 | Latest in the earlier review's 2026-09-09 release listing; published 2026-08-18 | Release status alone does not establish required API compatibility |
| v2.1.2 tag object | 6d766a7b7dfc6fdfc077ab528d46f93e63c46528 | Annotated tag identity, not its executable commit |
| v2.1.2 peeled commit | 7bf14b481e78c5ae9d1e14661602be4f24559d0e | Tag captures bind here; hard-codes serverInfo 2.1.2 |
| Reported frozen oracle | 8207958047b3361ae21ac07c5a2abbd26a42a684; 11 ahead of v2.1.2; 53 behind Engine main | Separate coordinate; also hard-codes 2.1.2; frozen-policy standing is reported, not established by Git |
| Engine main | 94a1e643ad71796ff7199a29c6e9e8c2a85f588f, package 2.2.0, no runtime dependencies | Never install moving main without an immutable decision |
| Kosmos 0.8.2 candidate pin | 650eab4a6752227cae336d7556a57826c22a0d5a; on Engine main; descends from v2.1.2; 18 behind main; mcp.ts differs from oracle by 162 lines (observed) | Inspected library coordinate; deployment elsewhere is not inventoried |
| f1a95f8f (PR #41 pin) | On Engine main; descends from v2.1.2; 2 behind 650eab4 (observed) | Acceptable library ancestry; superseded by 650eab4 |
| 41172b9 (Kosmos main pin) | NOT on Engine main; does not descend from v2.1.2; on integration/navigation-effects-reconciliation-20260827 (observed) | Mainline pin is off-main; R0b repairs release base. Stacked R1 fixtures may start at b35b27e |

Read sources: [Engine releases](https://github.com/Odenknight/GKOS-Engine/releases),
[tag versus oracle comparison](https://github.com/Odenknight/GKOS-Engine/compare/v2.1.2...8207958047b3361ae21ac07c5a2abbd26a42a684),
local clones fetched 2026-09-09. PR #42 was directly rechecked OPEN/REVIEW_REQUIRED at head b35b27e; Kosmos main remained 3aab1e337a8442d6bc2463cab43cb9b4191291a2 and Engine main 94a1e643ad71796ff7199a29c6e9e8c2a85f588f. Commit-distance numbers are snapshot facts, not durable standings. These observations do not choose or authorize a release.

## Required future inputs and their blast radius

The following evidence is required only before the indicated gate. If
unavailable, keep the named capability disabled or the gate NOT TESTED; do not
block independent native fixtures or documentation work.

| Input to request at gate | Why required | Blast radius if guessed |
| --- | --- | --- |
| R0/R1: sanitized Engine operator receipt: full source SHA, artifact digest, runtime identity, trusted TLS chain, corpus/snapshot identity and capture time | Self-report cannot identify the executable or bind the separate synced corpus | Wrong API ledger; false citations; credential interception or cross-corpus reads |
| H1: Hermes host, installed version, launch/reload method, active profile and tool filters, with secrets removed | Patch and restart the client actually serving GLM 5.2 | Wrong registration, missing tools or accidental disruption of another client |
| R0/Q1: sanitized tools/list response and exact canonicalization recipe | The digest is already supplied; reproducing it requires source bytes and a deterministic recipe | Schema drift missed or falsely reported; limited to compatibility capture |
| R0c/Q1: effective-sensitivity/principal decision, LAN transport posture and reported credential-rotation receipt | Body search amplifies discovery of already-readable content; labels may be raised above defaults | Excess disclosure, shared-principal ambiguity, bearer interception |
| R1: caller-to-Engine grants and remote/local UID/path/digest/generation mapping | Preserve authorization and revision identity across the bridge | Text, counts, citations and paths from a different scope or source revision |
| Release: qualified Engine service coordinate and compatible library pin | Tags and ancestry alone do not establish compatibility | Every consumer of the released plugin and its rollback path |
| T1: actual sync/backup scope, permitted storage host/path, retention and byte-snapshot policy | Durable known-at evidence creates retained source copies | Unintended replicas or retention; history coverage and deletion behavior |
| G1/G2: Graphiti inventory, version/backend, credential rights, permitted inference destinations and budget | Plugin export status does not establish service-side DB state | Derived DB writes/integrity, data destinations, cost; no block on native repair |
| Q2: benchmark ratification receipt or contract-owner clarification of the attested ≥10% quality / ≤25% overhead target | Define relative/absolute improvement, metric, comparison and unique-query criterion | False Graphiti promotion; no block on Q1 or native fixtures |



No secret values are needed in any report. Request sanitized configuration facts
or operator-produced receipts; do not ask users to paste bearer tokens or DB
passwords. Rust PR status relayed in the source document is outside this scope.
