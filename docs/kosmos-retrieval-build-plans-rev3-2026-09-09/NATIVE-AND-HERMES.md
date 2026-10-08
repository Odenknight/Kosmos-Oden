# Plan A — Engine retrieval adoption and Hermes remediation

Revision 3.1, 2026-09-09: deployment baseline observed; topology, dependency and
transport corrections applied; live-vault probe and the vault's governing notes
(Marshal-008 directive §7, Navigation/MOC plan §13–14, Capabilities 2026-09-05)
reconciled. See [the review](REVIEW-REV3.md) and
[the reconciliation](ADOPTION-MATRIX-RECONCILIATION.md).

Companion: [build order and release gates](README.md). All new filenames and API
extensions here are proposed; existing Engine responses are captured before coding.

## R0 — establish what is actually running

A draft `evidence/retrieval/baseline.json` is in this folder, populated from
direct observation on 2026-09-09. Complete it, do not restart it. Observed:

- Kosmos plugin 0.7.0 in the Nextcloud-synced vault, built 2026-08-06, Engine
  library 2.0.1, eighteen tools, protocols 2025-11-25 through 2024-11-05,
  `agentBindMode=lan` on 0.0.0.0:4816 (listening, owned by Obsidian), ceiling
  `internal`, `defaultSensitivity=public`, bearer required (401 unauthenticated).
- Source commit 1bbbc541 (BUILD-INFO.json; bundle hashes match SHA256SUMS).
  Live probe: serverInfo 0.7.0, tool-schema digest 3b245b36…, 2,222 notes,
  5,296 semantic edges, "fighter metrics" returns zero (body-only gap reproduced).
- A second plugin, `kosmos-moc-prototype` 0.1.1 (Engine library 2.2.0, port
  4815 referenced, desktop-only). Inventory it; disable it or declare it in
  scope for every acceptance run. Its archived runs under `_archive/moc-runs/`
  are indexed as notes and appear as duplicate backlinks in `get_related`;
  exclude that folder from the agent projection before any acceptance run.
- Engine service at `https://192.168.5.99/mcp` behind Caddy: serverInfo 2.1.2,
  protocol 2025-11-25, contract 1.0.0-draft.2, extension
  observatory.mcp-content.v0, ten capabilities available. Reached under an
  authorized identity that already exists on the Obsidian host.
- Kosmos main pins Engine library 41172b9, which is off Engine main. PR #42
  moves it to 650eab4 (on main). This is R0b, a prerequisite for R1.

Still unknown, and only an operator receipt can supply them: the Engine
service commit (tag 7bf14b4 and oracle 8207958 both self-report 2.1.2), the
Hermes host/version/profile, the authenticated Kosmos tools/list digest, and
whether a Graphiti database exists. Mark them unknown with that reason. Do not
retry with broader credentials to fill the manifest. Do not derive any Engine
coordinate from MCP prose; the deployed bundle's "2.0.1" strings and the
service's "2.1.2" are two different coordinates and both belong in the record.

Maintain a candidate ledger with SHA, tag target, release publication,
main/oracle ancestry and compatibility results (started in the reconciliation).
Selecting a candidate or cutting an Engine release is a separate owner decision.

Topology, now observed rather than asked: Hermes reaches Kosmos over LAN HTTP
with a bearer at 192.168.5.95:4816. Kosmos will reach the Engine service over
LAN HTTPS at 192.168.5.99, not loopback. The prototype's loopback-only guard
therefore rejects the real deployment and must be replaced by an allowlisted
origin plus a trusted CA. Never disable TLS verification in the bridge; the
current desktop client does, and that is a defect to retire, not a pattern.

R0c: before body mode can be enabled on a LAN bind, the owner records a
decision on `defaultSensitivity=public`. Metadata search under that setting
exposes titles and paths of unlabeled notes; body search exposes their text.
The plan changes no setting.

Resolve identity before bridge implementation. Current token/ceiling deployments
appear single-principal. Either enforce one documented principal per instance,
or add an explicit credential-to-principal map. A successful test with two
sessions sharing one token is not proof of two-user isolation.

## R1 — typed consumer boundary

Suggested files: `src/retrieval/contracts.ts`, `engine-mcp-client.ts`,
`engine-session-registry.ts`, `capabilities.ts`; fixtures in
`test/fixtures/engine-retrieval/{service-2.1.2,library-650eab4}/`; harness in
`scripts/smoke-engine-retrieval.mjs`.

Start with an Engine service bridge. The public retrieval library exists, but its
coordinator is host-backed and SQLite-dependent. Do not import private Engine
authorization helpers or assume Obsidian's Electron/mobile runtime supplies the
same Node SQLite features. A future embedded adapter needs its own platform proof.

Capture successful and refused calls to `gkos_capabilities`, `gkos_search`,
`gkos_record_resolve`, `gkos_note_read`, `gkos_lineage_get`,
`gkos_graph_at_time`, `gkos_record_validate` and `gkos_record_assess` in two
ledgers: the deployed 2.1.2 service (the first compatibility target) and the
650eab4 library (the upgrade path). They differ in `mcp.ts` by 162 lines; do
not assume either ledger describes the other. Pin schema digests and response
extension versions per ledger. Preserve real citation ranges and cursor
semantics; do not invent lookalike fields. Frozen-oracle parity fixtures, if
available, are a third ledger and not a substitute for consumer tests.

Use the reconciled eighteen-row matrix: six candidate delegations, three augmented
contracts, one bounded-path extension, eight retained Kosmos tools. Translators
and actual captures must prove parity before replacing any implementation.
Preserve duplicate public entry points while sharing underlying work. The exact
ten-tool Engine catalog is a pinned baseline, not a permanent expected count.

Transport decision record (new, required before R1 code). Facts: neither Kosmos
nor the Engine depends on `@modelcontextprotocol/sdk`; Kosmos's runtime
dependencies are `gkos-engine` and `three`; the Engine server is fixed to
protocol 2025-11-25 and answers `application/json` only; the prototype client
already handles the session header, protocol pin, 401/403/404 termination,
`redirect: "error"`, a 1 MiB response bound and fatal UTF-8 decoding, but has no
SSE, cancellation or reconnection path. Decide between:

- SDK client: maintained negotiation and SSE; a new runtime dependency in the
  Obsidian bundle requiring dependency review, SBOM/provenance update,
  bundle-size and mobile qualification.
- Hardened in-house transport: extend the prototype with explicit cancellation,
  timeout classes, origin allowlist, CA trust, and a conformance test suite
  against both ledgers; no new dependency; must be re-verified if the Engine
  ever adds SSE or a second protocol.

Either is acceptable. Record the choice, the criteria and the re-evaluation
trigger. Do not add SDK server migration to Kosmos's own MCP server unless its
conformance fails.

Test in either case: initialize/initialized, protocol and session headers, 404
reinitialization, 401/403 terminal denial, explicit cancellation, timeouts,
response bounds, origin/redirect handling, certificate validation failure, and
server restart.

Security contract. This restates the governed retrieval order already ratified
in the vault's Marshal-008 directive §7: the eligible canonical set is computed
before any approximate ranking or disclosure; a retrieval provider returns
snapshot-bound candidates; Graphiti ranks only inside the eligible set and
never expands it; exact objects are hydrated and digests verified before
delivery; hidden records are noninterfering (they may not alter visible bytes,
counts, order, confidence, diagnostics or timing beyond declared bounds).

- Engine identity must be no broader than the caller's source scope. Never use
  one privileged Engine search session for all callers and filter afterward.
- Bind upstream session/reference/cursor ownership to downstream principal,
  session and scope epoch. No cross-client pooling of bearer sessions.
- If Engine cannot express an equivalent grant, return backend unavailable for
  that principal and retain the explicit metadata fallback. A new Engine public
  host contract is preferable to bypassing its admission/authorization path.
- Revalidate access on each search, passage, edge and export. Scope revocation
  invalidates cursors and cached capabilities; hidden counts stay hidden.
- Validate source mappings/digests and Engine extensions before delivering results.
  Invalid citations are refused, not repaired by guessing.
- Add a regression for the Engine's final hit-to-authorized-snapshot check:
  mismatched UID/path/digest, stale or unverified citation, and source revocation
  must refuse results. This supplements Kosmos's pre-scoring visibility filter.
- Keep viewer, Engine MCP and Graphiti worker credentials separate. Retrieved
  text cannot choose destinations, switch modes or authorize tool operations.
- The Engine bearer used by Kosmos is a service credential held by the plugin
  host, never forwarded from or to Hermes, and never shown in Quick Connect
  output or diagnostics.

## R2 — search and passages that Hermes actually calls

Wire the boundary into `src/plugin/agent-server.ts` tool dispatch and REST parity,
not only the standalone search dialog. Keep existing tool names and response keys
working; announce additive arguments through tools/list and capability versioning.

Proposed `search_notes` extension: `mode=metadata|body|auto`, `cursor`,
`include_archive` (default false), existing `query/tag/area/limit`. Retain
legacy `results`, and add per-result passage/citation evidence plus a
`selection` object modelled on the Marshal-008 Selection Envelope:
`retrieval_mode`, `provider`, `backend_status`, `index_generation`, `query_as_run`,
`ranking`, `coverage`, `omissions` (with reason classes: clamped, unsupported
filter, admission gap, archive excluded, duplicate grouped), `degradation`,
`truncated` and `next_cursor`. Avoid a second overlapping search catalog.

Metadata mode, immediate additive fix independent of the bridge: match every
whitespace-separated query term case-insensitively against title, aliases,
tags and path (AND semantics), mirroring the Engine's own `name_query`
behavior. Today "kosmos oden" returns zero while "kosmos-oden" returns 31.
Disclose the change through the existing `method` field and keep the old
whole-string substring as a scored tier so existing callers' top results do
not reorder. Group results whose content digest is identical under one entry
with a `duplicates` list; the vault has parallel folder trees with identical
files. Do not hide duplicates.

Archive handling: `_archive/moc-runs/**` is the Navigation plan's designed run
archive (§13), not stray data. Today it is indexed as ordinary notes, so
`get_related` returns before/after snapshot copies as backlinks and edge counts
are inflated. Proposed: the agent projection excludes that path (and any path
the archive setting names) from search, related, lineage and graph results by
default, reports the excluded count in `omissions`, and includes it only when
`include_archive=true`. Archive notes remain readable by exact path through
`get_note` under existing policy. This is a projection rule; no file moves.
Result-size contracts, with numbers: Kosmos accepts `limit` up to 200; the Engine
returns at most 50 per page from a top-100 window and accepts a query of at
most 256 characters. Clamp and disclose; never claim all requested results
returned. A caller query longer than 256 characters in body mode returns a
specific unsupported-query result, not a silent truncation.

Metadata mode continues the current implementation. Body mode calls gkos_search.
Auto mode uses the negotiated body service when available and exposes the selected
mode. An explicitly requested body search fails clearly if unsupported. For an
auto fallback, return its reason and `body_search_available=false` without leaking
operational details to callers lacking diagnostic privileges.

Tag/area filters are hard constraints. Preserve original tags, normalize only
matching keys, and convert exact area scopes to validated portable path filters
where that mapping is correct. Engine currently lacks the full Kosmos tag schema:
filter support must be added through an authorized Engine contract, or use
bounded verified overfetch with truthful partial coverage and no exhaustive-total
claim. Do not filter one top-100 window then claim no tag matches exist. For
unsupported filters on body mode, return a specific unsupported-filter result.
No silent broadening or source-tag rewriting. `path_include` accepts at most 16
globs of 512 characters; more matching folders than that is the "filter limit"
fixture below.

Pin area mapping fixtures before implementing glob translation. Engine `paths.ts`
uses the normalized first segment for nested file paths, `Root` for root-level
files and `Vault` for empty/dot paths. Kosmos compares area case-insensitively;
the Engine glob matcher compares literal characters.

| Fixture | Required behavior |
| --- | --- |
| `FAC/note.md`, `FAC/deep/note.md`, `FAC-extra/note.md` | FAC includes first two, excludes prefix lookalike |
| `note.md` and `Root/note.md` | Existing area=Root can match both; preserve the union, or version a disambiguating selector |
| Empty/dot path versus `Vault/note.md` | Distinguish synthetic area from a real folder; empty paths are not automatically readable notes or whole-vault scope |
| `FAC`, `fac` and mixed-case caller area | Match current case-insensitive area behavior across real folder spellings |
| Folder names containing glob metacharacters | Literal folder membership only; prove safe encoding or explicitly refuse unsupported translation |
| Repeated slashes/backslashes, Unicode, root note with folder-like name | Follow canonical path normalization and file/folder distinctions |
| More than 16 matching folders | Do not silently drop paths; use an equivalent supported scope or explicit unsupported/partial result |

For ordinary folders, an exact directory-boundary glob is viable after these
tests. Resolve case variants from the authorized snapshot, not hidden corpus
inventory. Neither an empty filter nor an unsupported synthetic area may silently
become all-vault search.

Admission gap: Engine may reject plain/invalid GKX notes that Kosmos can display.
Record this in fixtures. Preserve metadata/get_note access under existing policy,
report partial body-search coverage, and obtain an Engine contract extension if
full plain-Markdown coverage is required. Do not auto-stamp notes or relax grants
to get the service query to pass.

Add `get_note_passage` as the one new retrieval primitive, with aggregation.
Engine pages are at most 16,384 bytes; a Kosmos full note is up to 200,000
characters, so a one-to-one wrapper would cost Hermes thirteen or more calls per
long note, which is the failure the transcript shows. Kosmos therefore resolves
the allowed path/UID with gkos_record_resolve, then pulls consecutive
gkos_note_read pages server-side up to a disclosed per-call byte budget
(proposed default 128 KiB, policy-bounded, at most 16 Engine pages), verifying
each page's source digest against the first, and returns one caller-bound
reference, the raw UTF-8 byte range actually delivered, the source digest,
`complete`, and a next cursor. A digest change mid-aggregation aborts with a
stale-revision result and restart hint; partial bytes are not delivered as if
whole. Keep `get_note` and its existing content cap unchanged for older
clients. Section listing is optional versioned metadata derived from the exact
retained revision; section selection delegates to the same passage service.

Do not directly substitute raw gkos_note_read output for get_note. The Obsidian
provider strips frontmatter for legacy get_note and returns a Kosmos metadata/link
envelope; Engine passages include raw Markdown frontmatter and use byte limits.
Keep those formats distinct, resolve title ambiguity using the existing policy,
and verify UID/path selectors against each actual public schema.

## R2G — governance delegation with response compatibility

Share Engine assessment across get_assessment and assess_note only after verifying
projection/profile parity. The Engine reports integer scores_basis_points under
profile gkx-2.3-validating-projection; Kosmos returns the full assessment with
fractional scores. Define tested unit conversion, rounding, missing/null behavior
and field coverage. A matching numeric score is not enough if exclusions or
policy-bound evidence disappear.

Share Engine validation across get_diagnostics and validate_note through distinct
response translators: the latter adds valid and sourceUnchanged, the former
returns path/count/diagnostics. Compare code, severity and available
locations/messages. Engine admitted records may not include invalid notes that
Kosmos diagnostics can inspect. Retain the current authorized local path when a
service-only replacement would lose diagnostics or other fields. Do not use
gkos_navigation_audit as a substitute for assess_vault.

Gate removal of any local implementation on legacy response fixtures, Engine
consumer captures from both ledgers, authorization parity and
offline/unadmitted-note behavior. Keep public aliases; this phase consolidates
implementation, not the tool catalog.

Combined R2/R2G acceptance also includes the governance parity fixtures above.
Retrieval tests: a term only in the body; spaced versus hyphenated product name
("kosmos oden" finds the 31 "kosmos-oden" notes); duplicate trees grouped not
hidden; archive excluded by default and included on request;
punctuation/case/aliases/tags; an answer after 200,000 characters; a note spanning more than 16 Engine pages; multibyte
splits at a page boundary; rename/delete during paging; stale generation; forged
cursor; two principals with identical query text; valid metadata result excluded
by Engine admission; backend outage; certificate failure; no service installed.

## R3 — useful paths, honest time responses, one version source

Suggested `src/retrieval/related-paths.ts`, `temporal-capabilities.ts`,
`version-metadata.ts`.

Lineage compatibility is a separate adapter obligation. Existing Kosmos get_lineage
walks predecessors and successors transitively, whereas Engine gkos_lineage_get
returns the root and direct neighbors, paginated at up to 100. Initially retain
the existing authorized Kosmos graph traversal, enriching from Engine truth only
when the same snapshot/scope can be proven. A service-backed replacement must
paginate each frontier's direct neighbors, resolve session-bound references,
track visited identities, recheck access at every hop and enforce total budgets.
At a budget or generation boundary, expose continuation/partial coverage instead
of calling it a full chain. Keep the legacy path until that result contract is
compatible. Add A→B→C→D, branched, cyclic, restricted intermediate and
multi-page fixtures; a singleton/head flag is not proof of approval.

Extend `get_related` additively with depth (1–2), typed edge filter, direction,
area scope and result cap. Keep depth=1 output compatible. Operate on Engine graph
primitives, with authorized adjacency constructed before expansion, visited sets,
stable UID ordering and per-node/per-edge/per-evidence revalidation.

Return supported edge classes (authored link, backlink, accepted semantic,
derived/inferred), direction and supporting revision/range or an explicit
evidence-unavailable marker. Do not label all graph links approved. Default
traversal excludes inferred edges unless requested and supported. An absent edge
means no supported path, not proof that two concepts are unrelated.

Bound each request to two hops and, initially, 100 returned nodes / 200 examined
authorized edges, configurable only within server policy. Continuation binds
visited/frontier state to principal, scope, graph generation and total budget.
The Hermes policy can take a second two-hop step to establish a four-edge chain;
it must cite each edge and stop on cycle, scope, cap or missing evidence.

Preserve `graph_at_time(time)` as valid-at behavior. Add explicit
`time_axes:["valid_at"]`, `known_at_supported:false`, history coverage,
unknown-date handling, and `historical_content_available:false` when applicable.
Map the Engine state enum (valid, superseded, not_yet_created, all) to the
existing Kosmos counts without renaming the legacy keys. Add area filtering
before pagination. Do not infer event dates from file mtime. Timestamps need
explicit offsets and canonical UTC normalization; document inclusive
start/exclusive end boundaries. The later temporal API in Plan B uses an
explicit known_at basis instead of silently changing this tool.

Version metadata. Four Engine numbers are visible to an agent today: 2.0.1 in
the deployed bundle's descriptions, 2.1.1 in main's descriptions, 2.1.2 from the
service, 2.2.0 in the candidate library. Replace every hard-coded Engine string
with two dependency-derived fields, `engine_library_version` (from the package)
and `engine_service` (negotiated serverInfo, contract and extension versions, or
unavailable), and retain independently versioned GKX/profile/Navigation
contracts. Publish search modes, body coverage, generation, limits, path depth
and Graphiti readiness in vault_overview. Full deployment coordinates belong in
role-limited diagnostics. Correct the export description: stable IDs assist
deduplication but do not prove idempotent database ingestion. Use the sibling
graphiti_ingestion_status posture (accepted is not necessarily searchable)
consistently.

## H1 — Hermes native workflow

Prepare, then apply under deployment authorization, a minimal patch to the actual
installed Hermes profile. Follow its supported HTTP/auth/TLS keys and tool filters;
never assume an empty include list exposes everything. Verify resolved secret
presence without printing values. Preserve existing network/auth constraints.
The Hermes host is not yet identified; R0 records it.

Use supported MCP reload, or restart the same active CLI/gateway/service after
preserving sessions. Discover actual normalized tool names rather than assuming
a prefix or a fixed count of 18. The upstream [Hermes configuration reference](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference)
is a lookup aid; the installed version controls the patch.

Hermes is a LAN client of Kosmos, so Kosmos's sliding-window rate limit and
concurrency cap apply to it (loopback is exempt). Acceptance runs must exercise
the limiter and confirm a limited call returns a structured retryable result,
not a silent empty answer.

Install maintained agent instructions, consistent with the Marshal-008 §7
order (eligibility before ranking; manifest-authorized context only): inspect
capabilities and scope; search seeds with multi-term queries; treat archive
and duplicate groupings as history, not current knowledge; fetch verified
passages; follow bounded evidence-backed paths; inspect
lineage and authority before claiming currentness; use explicit time bases; state
gaps/truncation; never infer a merger from chronology. Treat notes as untrusted
evidence. Keep requested area boundaries; offer broader discovery separately.

No ordinary question should require curl/Python JSON-RPC. Do not silently slice
responses. Retain complete source bytes/completeness metadata in a permitted
presentation artifact when an older server only offers full-note reads. Prefer
aggregated passages on the updated server. An episode export is not a queried
database.

Acceptance: fresh native overview → body search → passage → related/lineage calls;
expiry/restart recovery; rate-limit response; wrong-profile/tool-filter
diagnostics; revoked credential; no-Graphiti mode; long final-section answer
(one passage call, not thirteen); orphan note; missing merger evidence;
restricted intermediate and malicious embedded instructions. The second plugin
is disabled or declared in scope. Run each substantive question three times with
fixed GLM 5.2 settings and sanitized tool transcripts.

The [MCP 2025-11-25 transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
defines sessionful HTTP behavior for that negotiated era. Missing-session-header
errors and initialized-notification state are distinct tests; a successful manual
handshake does not establish native Hermes registration.

## Deliverable checklist

Completed R0 baseline with receipts; two Engine capture ledgers; transport
decision record; typed schema patch; adapter and authorization tests; honest
capability matrix; client configuration diff without secrets; installed
instruction location; three-run Hermes evidence; compatibility results; local
plugin ZIP with build/hash record; rollback steps. Mark absent live environment
evidence NOT TESTED, not DONE.
