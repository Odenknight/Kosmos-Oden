# Plan A — Engine retrieval adoption and Hermes remediation

Revision 2, 2026-09-09: supplied adoption matrix reconciled; see
[verified mapping and corrections](ADOPTION-MATRIX-RECONCILIATION.md).

Companion: [build order and release gates](README.md). All new filenames and API
extensions here are proposed; existing Engine responses are captured before coding.

## R0 — establish what is actually running

Produce `evidence/retrieval/baseline.json` with schema version, capture time,
Kosmos build/version/commit, Engine version and resolved SHA, package integrity,
pin standing, Hermes commit/version and active profile, SDK versions, negotiated
protocol, normalized tool names and tool-schema SHA256, corpus identity and
generation. Mark unavailable values unknown with a reason. Do not derive the
Engine coordinate from MCP prose. Build-time metadata must bind to executable
artifacts; compare it with the live service's self-report.

The reported Observatory probe returned forbidden. Record `probe_status=forbidden`,
evidence source and time if supplied; leave deployed version and Graphiti mode
unknown/inferred. Do not translate this into backend absent, offline, obsolete or
healthy. Obtain an authorized operator-produced runtime receipt or a separately
authorized probe; do not retry with broader credentials merely to fill the manifest.
Offline package/tag/ancestry evidence establishes candidate standing, not deployment.
Maintain a candidate ledger with SHA, tag target, release publication, main/oracle
ancestry and compatibility results. Selecting a candidate or cutting an Engine
release is a separate owner decision after reviewing those facts.

Read the active configuration locally with secrets omitted. Do not copy the
transcript's endpoint or credentials into test configuration. Determine whether
Hermes reaches Kosmos over LAN while the trusted Kosmos host reaches Engine on
loopback. The standalone loopback guard must not accidentally disable supported
Hermes-to-Kosmos LAN deployments.

Resolve identity before bridge implementation. Current token/ceiling deployments
may be single-principal. Either enforce one documented principal per instance,
or add an explicit credential-to-principal map. A successful test with two sessions
sharing one token is not proof of two-user isolation.

## R1 — typed consumer boundary

Suggested files: `src/retrieval/contracts.ts`, `engine-mcp-client.ts`,
`engine-session-registry.ts`, `capabilities.ts`; fixtures in
`test/fixtures/engine-retrieval/`; SDK harness in
`scripts/smoke-engine-retrieval.mjs`.

Start with an Engine service bridge. The public retrieval library exists, but its
coordinator is host-backed and SQLite-dependent. Do not import private Engine
authorization helpers or assume Obsidian's Electron/mobile runtime supplies the
same Node SQLite features. A future embedded adapter needs its own platform proof.

Capture successful and refused calls to `gkos_capabilities`, `gkos_search`,
`gkos_record_resolve`, `gkos_note_read`, `gkos_lineage_get` and
`gkos_graph_at_time`, `gkos_record_validate` and `gkos_record_assess` at the selected Engine SHA. Pin schema digests and response
extension versions. Preserve real citation ranges and cursor semantics; do not
invent incompatible lookalike fields. Capture frozen-oracle parity fixtures
separately if available; they are not a substitute for current consumer tests.

Use the reconciled eighteen-row matrix: six candidate delegations, three augmented
contracts, one bounded-path extension, eight retained Kosmos tools. The supplied
artifact's arithmetic summary is incorrect. Request/result translators and actual
consumer captures must still prove parity before replacing any implementation.
Preserve duplicate public entry points while sharing underlying work. The exact
ten-tool Engine catalog is a pinned baseline, not a permanent expected count.
Keep oracle captures bound to 8207958047b3361ae21ac07c5a2abbd26a42a684
separate from v2.1.2-tag captures (7bf14b481e78c5ae9d1e14661602be4f24559d0e)
and consumer captures. The oracle commit is 11 commits ahead of that tag.

Use the maintained compatible MCP SDK for negotiation, JSON/SSE and session
lifecycle. Audit the standalone engine-search prototype for reusable validation,
but replace its fixed-protocol/JSON-only transport before treating it as general
client code. Test initialize/initialized, protocol and session headers, 404
reinitialization, 401/403 terminal denial, explicit cancellation, timeouts,
response bounds, origin/redirect handling and server restart. Do not add SDK
server migration to this fix unless existing server conformance fails.

Security contract:

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
  must refuse results. This supplements pre-scoring visibility; it does not
  repair a nonexistent retrieve-then-filter defect in Kosmos metadata search.
- Keep viewer, Engine MCP and Graphiti worker credentials separate. Retrieved
  text cannot choose destinations, switch modes or authorize tool operations.

## R2 — search and passages that Hermes actually calls

Wire the boundary into `src/plugin/agent-server.ts` tool dispatch and REST parity,
not only the standalone search dialog. Keep existing tool names and response keys
working; announce additive arguments through tools/list and capability versioning.

Proposed `search_notes` extension: `mode=metadata|body|auto`, `cursor`, existing
`query/tag/area/limit`. Retain legacy `results`, and add per-result passage/citation
evidence plus `retrieval_mode`, `backend_status`, `index_generation`,
`coverage`, `truncated` and `next_cursor`. Avoid a second overlapping search catalog.
Respect existing result-size contracts: Engine's page maximum/top-window may be
smaller; clamp and disclose it rather than claiming all requested results returned.
For the inspected candidate this includes a bounded top-100 search window.

Metadata mode continues the current implementation. Body mode calls gkos_search.
Auto mode uses the negotiated body service when available and exposes the selected
mode. An explicitly requested body search fails clearly if unsupported. For an
auto fallback, return its reason and `body_search_available=false` without leaking
operational details to callers lacking diagnostic privileges.

Tag/area filters are hard constraints. Preserve original tags, normalize only
matching keys, and convert exact area scopes to validated portable path filters
where that mapping is correct. Engine currently lacks the full Kosmos tag schema:
filter support must be added through an authorized candidate scope/public Engine
contract, or use bounded verified overfetch with truthful partial coverage and no
exhaustive-total claim. Do not filter one top-100 window then claim no tag matches
exist in the corpus. For unsupported filters on body mode, return a specific
unsupported-filter result. No silent broadening or source-tag rewriting.

Pin area mapping fixtures before implementing glob translation. The inspected
Engine `paths.ts` uses the normalized first segment for nested file paths,
`Root` for root-level files and `Vault` for empty/dot paths. Kosmos compares area
case-insensitively; the inspected Engine glob matcher compares literal characters.
Preserve these actual semantics, not just a convenient `area/**` approximation.

| Fixture | Required behavior |
| --- | --- |
| `FAC/note.md`, `FAC/deep/note.md`, `FAC-extra/note.md` | FAC includes first two, excludes prefix lookalike |
| `note.md` and `Root/note.md` | Existing area=Root can match both; preserve the union, or version a disambiguating selector |
| Empty/dot path versus `Vault/note.md` | Distinguish synthetic area from a real folder; empty paths are not automatically readable notes or whole-vault scope |
| `FAC`, `fac` and mixed-case caller area | Match current case-insensitive area behavior across real folder spellings |
| Folder names containing glob metacharacters | Literal folder membership only; prove safe encoding or explicitly refuse unsupported translation |
| Repeated slashes/backslashes, Unicode, root note with folder-like name | Follow canonical path normalization and file/folder distinctions |
| More matching folders than Engine filter limit | Do not silently drop paths; use an equivalent supported scope or explicit unsupported/partial result |

For ordinary folders, an exact directory-boundary glob is viable after these
tests. Resolve case variants from the authorized snapshot, not hidden corpus
inventory. Neither an empty filter nor an unsupported synthetic area may silently
become all-vault search. The case and reserved-label collision fixtures qualify
the follow-up's claim of lossless mapping for real folders.

Admission gap: Engine may reject plain/invalid GKX notes that Kosmos can display.
Record this in fixtures. Preserve metadata/get_note access under existing policy,
report partial body-search coverage, and obtain an Engine contract extension if
full plain-Markdown coverage is required. Do not auto-stamp notes or relax grants
to get the service query to pass.

Add `get_note_passage` as the one new retrieval primitive. Resolve an allowed
path/UID with gkos_record_resolve, then call gkos_note_read; preserve caller-bound
references, raw UTF-8 byte ranges, source digest and next cursor. Keep `get_note`
and its existing content cap unchanged for older clients. Add section listing
as optional versioned metadata derived from the exact retained revision; section
selection delegates to the same passage service rather than introducing another
unbounded content loader. Reject stale revisions/generations with a restart hint.

Do not directly substitute raw gkos_note_read output for get_note. The Obsidian
provider strips frontmatter for legacy get_note and returns a Kosmos metadata/link
envelope; Engine passages include raw Markdown frontmatter and use byte limits.
Keep those formats distinct, resolve title ambiguity using the existing policy,
and verify UID/path selectors against each actual public schema. A paginated
Engine read is an additional primitive, not a compatible replacement envelope.

## R2G — governance delegation with response compatibility

Share Engine assessment across get_assessment and assess_note only after verifying
projection/profile parity. The inspected Engine reports scores_basis_points;
Kosmos returns the full assessment with fractional scores. Define tested unit
conversion, rounding, missing/null behavior and field coverage. A matching numeric
score is not enough if exclusions or policy-bound evidence disappear.

Share Engine validation across get_diagnostics and validate_note through distinct
response translators: the latter currently adds valid and sourceUnchanged, while
the former returns path/count/diagnostics. Compare code, severity and available
locations/messages. Engine authorized/admitted records may not include invalid
notes that Kosmos diagnostics can inspect. Retain the current authorized local
path when a service-only replacement would lose diagnostics or other fields.
Do not use gkos_navigation_audit as a substitute for assess_vault.

Gate removal of any local implementation on legacy response fixtures, Engine
consumer captures, authorization parity and offline/unadmitted-note behavior.
Keep public aliases; this phase consolidates implementation, not the tool catalog.

Combined R2/R2G acceptance also includes the governance parity fixtures above.
Retrieval tests: a term only in the body; punctuation/case/aliases/tags; an answer after
200,000 characters; multibyte splits; rename/delete during paging; stale generation;
forged cursor; two principals with identical query text; valid metadata result
excluded by Engine admission; backend outage and no service installed.

## R3 — useful paths and honest time responses

Suggested `src/retrieval/related-paths.ts`, `temporal-capabilities.ts`.

Lineage compatibility is a separate adapter obligation. Existing Kosmos get_lineage
walks predecessors and successors transitively, whereas Engine gkos_lineage_get
returns the root and direct neighbors, with pagination. Initially retain the
existing authorized Kosmos graph traversal, enriching from Engine truth only when
the same snapshot/scope can be proven. A service-backed replacement must paginate
each frontier's direct neighbors, resolve session-bound references, track visited
identities, recheck access at every hop and enforce total budgets. At a budget or
generation boundary, expose continuation/partial coverage instead of calling it
a full chain or retaining a misleading total chainLength. Keep the legacy path
until that result contract is compatible. Add A→B→C→D, branched, cyclic, restricted
intermediate and multi-page fixtures; a singleton/head flag is not proof of approval.

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
Add area filtering before pagination. Do not infer event dates from file mtime.
Timestamps need explicit offsets and canonical UTC normalization; document
inclusive start/exclusive end boundaries. The later temporal API in Plan B uses
an explicit known_at basis instead of silently changing this tool.

Replace all hard-coded Engine prose with dependency-derived version metadata;
retain independently versioned GKX/profile/Navigation contracts. Publish search
modes, body coverage, generation, limits, path depth and Graphiti readiness in
vault_overview. Full deployment coordinates belong in role-limited diagnostics.
Correct the export description: stable IDs assist deduplication but do not prove
idempotent database ingestion.
Use the sibling graphiti_ingestion_status posture (accepted is not necessarily
searchable) consistently. Export readiness, accepted ingestion, verified durable
state and query readiness are different fields, each backed by its own evidence.

## H1 — Hermes native workflow

Prepare, then apply under deployment authorization, a minimal patch to the actual
installed Hermes profile. Follow its supported HTTP/auth/TLS keys and tool filters;
never assume an empty include list exposes everything. Verify resolved secret
presence without printing values. Preserve existing network/auth constraints.

Use supported MCP reload, or restart the same active CLI/gateway/service after
preserving sessions. Discover actual normalized tool names rather than assuming
a prefix or a fixed count of 18. The upstream [Hermes configuration reference](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference)
is a lookup aid; the installed version controls the patch.

Install maintained agent instructions: inspect capabilities and scope; search
seeds; fetch verified passages; follow bounded evidence-backed paths; inspect
lineage and authority before claiming currentness; use explicit time bases; state
gaps/truncation; never infer a merger from chronology. Treat notes as untrusted
evidence. Keep requested area boundaries; offer broader discovery separately.

No ordinary question should require curl/Python JSON-RPC. Do not silently slice
responses. Retain complete source bytes/completeness metadata in a permitted
presentation artifact when an older server only offers full-note reads. Prefer
passages on the updated server. An episode export is not a queried database.

Acceptance: fresh native overview → body search → passage → related/lineage calls;
expiry/restart recovery; wrong-profile/tool-filter diagnostics; revoked credential;
no-Graphiti mode; long final-section answer; orphan note; missing merger evidence;
restricted intermediate and malicious embedded instructions. Run each substantive
question three times with fixed GLM 5.2 settings and sanitized tool transcripts.

The [MCP 2025-11-25 transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
defines sessionful HTTP behavior for that negotiated era. Missing-session-header
errors and initialized-notification state are distinct tests; a successful manual
handshake does not establish native Hermes registration.

## Deliverable checklist

R0 baseline; exact Engine consumer captures; typed schema patch; adapter and
authorization tests; honest capability matrix; client configuration diff without
secrets; installed instruction location; three-run Hermes evidence; compatibility
results; local plugin ZIP with build/hash record; rollback steps. Mark absent
live environment evidence NOT TESTED, not DONE.
