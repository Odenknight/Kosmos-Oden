# Plan A — Engine retrieval adoption and Hermes remediation

Revision 4, 2026-09-09. [Review decisions](REVIEW-REV4.md) and [master plan](README.md) define evidence standing and release order. Proposed APIs below are not existing capabilities. The original assessment is preserved as historical input.

## R0 — complete evidence without inventing deployment identity

Retain the submitted baseline and its separate original copy. It reports Kosmos 0.7.0/library 2.0.1, a LAN listener, source-package metadata and checksums, eighteen tools and a full tool-schema digest, a MOC prototype, archive noise and a Nextcloud-synced vault. Do not continue listing the supplied tool digest as missing. Obtain a sanitized raw tools/list capture and its canonicalization recipe before independently reproducing that digest. Reported query counts belong to a changing corpus, not a fixed test oracle.

The separate Engine service self-reported 2.1.2 under a client with TLS verification disabled. This is evidence of that response, not exact executable identity, a validated TLS peer or proof the build is only tag/oracle. Obtain an operator receipt binding binary/package digest, full source SHA, container/build identity, corpus identity, protocol/schema digest and capture time; verify TLS peer independently. Treat the .99 address and Caddy header as reported topology, not deployment pins. No Graphiti DB inventory is established here. The later owner clarification identifies Hermes as R720 CT507; its installed version and active profile remain to be inspected.

Inventory the prototype by installed artifact hash, enabled status and observed listener, not source-string absence. No Obsidian vault.write strings does not mean no filesystem effects in bundled Node code. Disable it only for an operator-approved isolated acceptance run, or explicitly include its activity in the fixture. Disabling it alone does not remove already-created archive snapshots.

R0b: integrate the on-main candidate or equivalent through normal review. A stacked branch at b35b27e may host synthetic work before PR #42 merges. Final release rebases to the approved baseline and reruns qualification; do not wait for unrelated Graphiti facts to start fixtures.

R0c: confirm effective sensitivity, caller mapping and transport posture before activation. Existing get_note already returns readable bodies, so body search increases discoverability and volume rather than creating first-ever body access. A public default does not prove every unlabeled note is effectively public; Engine projection can raise sensitivity. Test actual effective labels without lowering them. Retain metadata-only behavior until the LAN body-search posture is reviewed.

The assessment reports a credential pasted in chat. Record its rotation/revocation as an operator action before live qualification; do not retrieve, reproduce or rotate a credential during this plan edit. Verify old-token refusal and replacement-client operation using sanitized evidence.

Topology: Hermes-to-Kosmos currently reported LAN HTTP/bearer; bridge-to-Engine requires separately configured HTTPS origin with a trusted CA and matching SAN. Retire insecure TLS shortcuts; never inherit process-global TLS bypass settings. For the client-facing LAN leg, migrate to trusted TLS or record the owner's explicit bounded HTTP risk decision; do not silently call plain HTTP confidential. Preserve working offline/local modes.

Keep Engine MCP credentials in an OS/host secret facility outside the synced vault; do not put them in Obsidian data.json, Quick Connect output, URLs, logs or acceptance reports. A single-principal deployment must be described as such. Supporting multiple callers requires a verified mapping to no-broader Engine grants, not a shared privileged upstream session.

## R1 — typed transport, corpus and authorization boundary

Suggested modules: src/retrieval/contracts.ts, engine-mcp-client.ts, engine-session-registry.ts, corpus-binding.ts and capabilities.ts. Use the existing Engine service boundary; SQLite/host code stays out of the browser/mobile dependency graph. Do not import private authorization helpers.

Keep four distinct evidence classes: submitted runtime observations; authorized deployed-service captures (exact SHA pending receipt); a test service built at a selected full SHA such as 650eab4; pure-library tests. MCP responses cannot be captured from a library import alone. Frozen-oracle captures bind 8207958 separately from the v2.1.2 tag 7bf14b4. Do not substitute one ledger for another.

Capture capabilities, search, record_resolve, note_read, lineage_get, graph_at_time, record_validate and record_assess, including refused calls. Pin request/response extension versions, schema digests and bounds per service build. record_resolve accepts canonical_path and optional expected_uid without scope_ref; graph_at_time requires a discovery-issued scope_ref. Bootstrap it internally without adding public Navigation tools.

Transport decision record: neither inspected product currently depends on the MCP SDK. Fixed 2025-11-25 plus JSON matches the inspected Engine server; lack of SSE is not itself a defect for that peer. Choose maintained SDK or a bounded in-house client based on conformance burden, bundle/SBOM size, mobile support and platform network APIs. The prototype already has AbortController, a 30-second timeout and close(); it lacks demonstrated per-request cancellation/reconnect recovery and LAN trust qualification. Reuse those existing pieces instead of claiming none exist. New runtime dependencies require normal dependency and provenance review.

Peer compatibility is narrower than general MCP conformance. The [2025-11-25 transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) requires Streamable HTTP clients to handle JSON and SSE responses and advertise both. If retaining a JSON-only client for the pinned Engine profile, explicitly document that limitation and fail clearly on an unsupported response; do not certify it as a general Streamable HTTP client. A broadly conforming bridge needs qualified SSE handling even if this Engine normally sends JSON.

Allow only explicitly configured service origins, with trusted certificates and normal hostname verification; reject credentials in URLs, unexpected paths/queries/fragments and redirects. Do not globally relax the standalone viewer's loopback guard to implement this separate authenticated LAN bridge. Cover browser CORS, Obsidian desktop networking and mobile capability differences explicitly; an unsupported platform reports service mode unavailable while retaining offline functionality.

Test initialize/initialized, protocol/session headers, valid JSON, unsupported content type, 404 reinitialization under the same principal, terminal 401/403, cancellation, bounded timeout/retry, TLS failure, proxy header handling and restart. Cross-host internal page requests consume a cumulative per-call deadline and work budget. No automatic write retries or shared bearer sessions.

Corpus-binding gate: the plugin vault and the remote Engine corpus may be separate synchronized copies. Bind corpus identity, source UID/record key, canonical path mapping, raw-byte/normalized digests, generation and scope epoch. Equal paths, counts or version strings do not prove equivalence. A hit opens/annotates a local note only after its revision matches; otherwise return a source-version mismatch/lag indication, never quote the local current bytes as the remote citation. Preserve independent source and service watermarks. An unknown or mismatched corpus disables the affected bridge operation, not local metadata access.

Apply caller eligibility before scoring or grouping, then recheck exact source references and citations before return. Bind upstream references/cursors to downstream principal, session, scope epoch and generation. No privileged service credential followed only by output filtering. If the Engine grant cannot express equivalent scope, refuse that service path and disclose an explicit local fallback. Revocation invalidates cursors and cached capabilities. Test altered UID/path/digest, stale citation and hidden-source mutation without visible-count/order/confidence changes; record resource timing bounds without claiming constant-time behavior.

The Marshal document's Selection Envelope is a target governance design. This repair's versioned selection diagnostics are advisory retrieval metadata, not an L6 Context Manifest, authorization receipt or proof of full governed-loop integration. Include provider, query, ranking, generation, omissions and degradation with disclosed scope; do not claim unavailable manifest compilation. Canonical IDs/digests and projection standing stay separate.

Use the corrected six-delegate/three-augment/one-path/eight-retain mapping. Response translators, unadmitted-note coverage and actual captures must prove compatibility before any local code is removed.

## R2 — compatible search, archive isolation and bounded passages

Wire the Engine adapter into agent-server.ts REST/MCP dispatch, not only standalone UI. Retain existing tool names and legacy result keys. Add mode=metadata|body|auto, cursor and versioned selection diagnostics; unsupported body mode returns a clear unavailable result, not a metadata-only empty presented as successful body search. Pilot body mode stays explicit until Q1.

Metadata search: preserve default whole-string substring semantics for existing callers. Add an opt-in match=terms mode (or a versioned negotiated default later), matching every whitespace-separated case-folded term across title/alias/tag/path. Keep legacy exact-substring hits as a documented priority tier, test tie order, and report method/match mode. This fixes spaced product names without claiming all old rankings automatically stay identical. Synthetic fixtures define expected hits; do not assert the live count 31 is timeless.

Duplicate grouping is optional and occurs only after eligibility. Keep legacy ungrouped results/total/limit/cursors unchanged by default. A grouped view lists all authorized source identities with their separate standing, validity and citation references; never merge authority, edges or historical status based on a body digest. Distinguish total sources from returned groups and per-page/window coverage. Hidden duplicates cannot alter group counts or rank. Equal content is not proof that two project trees are interchangeable or historical.

Archive rule: current main and 0.8.2 already exclude .gkx and _archive/moc-runs through operational-paths.ts at index, list and direct-content boundaries. The archive-noise report concerns deployed 0.7.0; upgrading must verify this existing fix. Preserve the exclusion for search, related, lineage, graph, diagnostics and exact get_note. Do not add include_archive=true to the ordinary read tools or override the central predicate. Do not expose excluded record counts, paths or digests through omissions; a static policy label is sufficient.

Future archive history is a separate T-series capability only after snapshot ownership, current authorization, original-source mapping and retention are qualified. An archive copy is not automatically current source content or known-at evidence. Custom archive roots need explicit normalized containment and migration review; .gkx never becomes searchable merely by changing a setting. Tests prove archive isolation even when the MOC prototype is disabled after leaving files behind.

Scope contracts: preserve case-insensitive area equality and original tag spelling. Test Root/root-folder collision, Vault/empty-path distinction, FAC/fac variants, prefix lookalikes, literal glob characters, normalization and Engine's 16-glob/512-character limit. Never omit filters to handle an unsupported scope. Translate exact folder membership from an authorized snapshot or refuse unsupported mapping. Tag filters require equivalent pre-scoring Engine scope or explicitly bounded partial filtering with no exhaustive-total/empty-corpus claim. Query/selection diagnostics must not expose hidden omitted candidates.

At the inspected candidate: Engine search accepts at most 256 query characters and at most 50 results per page within top-100 retrieval window; Kosmos permits up to 200 legacy results. Capture actual deployed bounds, clamp and disclose body-mode limits, and preserve metadata limits. Long/unsupported queries are refused explicitly, not silently truncated. Auto fallback names its mode/reason. Engine admission may exclude plain or invalid GKX that Kosmos displays; retain authorized local diagnostics/get_note and report body coverage without auto-writing frontmatter.

Add get_note_passage with bounded server-side aggregation; keep legacy get_note's 200,000-character cap and frontmatter-stripped metadata/link envelope unchanged. Resolve source selectors through the supported record reference API. Engine note pages contain raw UTF-8 Markdown, including frontmatter, and max 16,384 bytes in the inspected candidate. Byte counts and JavaScript character counts are different; do not promise a constant number of calls for all notes.

Proposed aggregate budget: 64 KiB default returned raw bytes, caller option up to 128 KiB, at most 16 sequential upstream page requests, and a 30-second cumulative deadline including bounded retry. Negotiate lower downstream response limits. Verify contiguous nonoverlapping byte ranges, source/ref/digest/generation identity, UTF-8 integrity, advancement of cursors and current authorization on every page and before return. Account JSON/envelope bytes separately. Limit concurrent aggregates per principal and host to prevent hidden request amplification; return structured retryable rate limits.

Return byte_start/end, source_digest, returned_bytes, response_complete, source_complete, budget_exhausted, stop_reason and next_cursor. On a planned budget limit, a verified prefix may return with continuation; it is never labelled full source. On digest/generation/auth failure, discard the buffered response and return stale/denied, not mixed revisions. Cursors bind aggregate position to caller/session/scope/source/generation/query. Detect loops and duplicate/overlapping upstream pages. A new session invalidates prior references rather than replaying them blindly.

Use half-open byte ranges. response_complete means the requested passage extent was delivered without omissions; an unqualified full-source request remains incomplete at a budget boundary. source_complete is true only when this response contains the entire source from byte zero through its verified end. Continuing to EOF from a later cursor does not make that response a full source. Disclose continuation exhaustion separately. A prefix can return only after successful final authorization within the deadline; otherwise return a structured failure. Define these flags and stop reasons in the versioned schema before implementing aggregation.

An answer near a very long note's end requires a cited search offset, qualified section locator, or bounded continuation. Engine note_read starts from its supported cursor flow; do not invent random access from citation offsets. A new Engine section/range primitive requires its own contract. Test complete byte reconstruction over multiple downstream calls, not an impossible one-call promise beyond budget. A model context smaller than 64 KiB can request less; the host must not silently slice.

Acceptance: body-only hits, metadata match-mode compatibility, duplicates with different authority, restricted duplicates, archive isolation/direct-read refusal, tag/area fixtures, no-Engine fallback, >200,000-character notes, >16 upstream-page notes, multibyte boundaries, repeated cursors, mid-aggregate revocation, source rename/delete, lagged remote copy and rate-limit/cancellation behavior.

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
consumer captures from both service ledgers, authorization parity and
offline/unadmitted-note behavior. Keep public aliases; this phase consolidates
implementation, not the tool catalog.

Combined R2/R2G acceptance also includes the governance parity fixtures above.
Retrieval tests: a term only in the body; spaced versus hyphenated product name
("kosmos oden" finds the fixture's expected hyphenated names in terms mode); duplicate trees grouped not
hidden; archive isolated from ordinary tools and direct reads;
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
area scope and result cap. Keep legacy depth=1 categories, membership, order and response shape compatible. Use the existing authorized Kosmos graph built from the pinned TypeScript Engine, with qualified origin/evidence adapters. The inspected service has no generic multi-hop adjacency tool; add a reviewed service contract only if needed. Construct authorized adjacency before expansion, use visited sets and stable scoped identity ordering (including plain notes without UIDs), and revalidate each node/edge/evidence reference.

Return supported edge classes (authored link, backlink, accepted semantic,
derived/inferred), direction and supporting revision/range or an explicit
evidence-unavailable marker. Do not label all graph links approved. New expanded-path mode excludes inferred edges unless explicitly requested and supported; preserve legacy one-hop memberships rather than silently dropping existing edges. An absent edge
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
before pagination. Do not infer event dates from file mtime. New explicit temporal contracts require offsets and canonical UTC normalization; preserve and test legacy accepted date-only inputs for existing graph_at_time rather than silently breaking them. Document inclusive
start/exclusive end boundaries. The later temporal API in Plan B uses an
explicit known_at basis instead of silently changing this tool.

Version metadata. Four Engine numbers are visible to an agent today: 2.0.1 in
the deployed bundle's descriptions, 2.1.1 in main's descriptions, 2.1.2 from the
service, 2.2.0 in the candidate library. Replace every hard-coded Engine string
with separately sourced fields, `engine_library_version` (from the package)
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
The owner identifies the Hermes host as R720 CT507 and reports update completion d9a6d9bae1c19928e2745da27533bdaf. Inspect the installed version and active profile there; do not request the host designation again.

Use supported MCP reload, or restart the same active CLI/gateway/service after
preserving sessions. Discover actual normalized tool names rather than assuming
a prefix or a fixed count of 18. The upstream [Hermes configuration reference](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference)
is a lookup aid; the installed version controls the patch.

The reported direct LAN client exercises Kosmos's socket-address limiter; loopback is currently exempt. If TLS termination forwards through loopback, do not accidentally exempt all LAN users. Add principal-bound aggregate budgets and an explicitly trusted-proxy policy; never trust arbitrary forwarded headers. Test the real topology, spoofed headers, concurrent aggregation and a structured retryable limited response.

Install maintained agent instructions using the relevant Marshal-008 §7 target (eligibility before ranking and verified source context): inspect
capabilities and scope; search seeds with multi-term queries; treat qualified archive results as history, and duplicate groupings as distinct sources with their own standing; fetch verified
passages; follow bounded evidence-backed paths; inspect
lineage and authority before claiming currentness; use explicit time bases; state
gaps/truncation; never infer a merger from chronology. Use an actual L6 Context Manifest only when a separately qualified component supplies and enforces it; selection diagnostics do not stand in for one. Treat notes as untrusted
evidence. Keep requested area boundaries; offer broader discovery separately.

No ordinary question should require curl/Python JSON-RPC. Do not silently slice
responses. Retain complete source bytes/completeness metadata in a permitted
presentation artifact when an older server only offers full-note reads. Prefer
aggregated passages on the updated server. An episode export is not a queried
database.

Acceptance: fresh native overview → body search → passage → related/lineage calls;
expiry/restart recovery; rate-limit response; wrong-profile/tool-filter
diagnostics; revoked credential; no-Graphiti mode; long final-section answer
(bounded passage calls with explicit continuation, not hidden slicing); orphan note; missing merger evidence;
restricted intermediate and malicious embedded instructions. The second plugin
is disabled or declared in scope. Run each substantive question three times with
fixed GLM 5.2 settings and sanitized tool transcripts.

The [MCP 2025-11-25 transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
defines sessionful HTTP behavior for that negotiated era. Missing-session-header
errors and initialized-notification state are distinct tests; a successful manual
handshake does not establish native Hermes registration.

## Deliverable checklist

Completed R0 baseline with receipts; identified deployment and exact-build Engine service capture ledgers plus library parity evidence; transport
decision record; typed schema patch; adapter and authorization tests; honest
capability matrix; client configuration diff without secrets; installed
instruction location; three-run Hermes evidence; compatibility results; local
plugin ZIP with build/hash record; rollback steps. Mark absent live environment
evidence NOT TESTED, not DONE.
