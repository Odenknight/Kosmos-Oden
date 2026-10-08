# Final plan assessment and revision 4 decisions

Date: 2026-09-09. Disposition: retain the three-stage approach, with the corrections below incorporated into the revision 4 plans. The assessment supplies useful deployment evidence, but several conclusions overstate that evidence or would change existing behavior. The corrected plans are ready for scoped implementation and synthetic fixtures; live qualification and optional history/Graphiti activation retain specific evidence gates.

This is a planning revision. It does not establish that retrieval is fixed, qualify a deployed service, select a release, change a credential or merge PR #42. The supplied revision 3 folder is preserved. The copied [revision 3 assessment](REVIEW-REV3.md) and [original baseline](evidence/retrieval/baseline.rev3-submitted.json) are historical inputs; conflicting implementation directions there are superseded by this document and the four revised plans.

## Owner clarification after revision 4

The owner specifies Kosmos-Oden 0.8.2 with Engine 2.2 through an MCP connector and identifies Hermes as R720 CT507. Hermes update completion was reported as d9a6d9bae1c19928e2745da27533bdaf. Treat Engine 2.2 as the intended service target; the earlier submitted 2.1.2 response is historical evidence, not the desired target. The host designation is now supplied and should not be requested again.

The update identifier records reported completion; no installed Hermes version, source commit or active MCP profile is established by that identifier alone. The inspected 0.8.2 candidate bundles Engine 2.2 code but did not wire the proposed remote retrieval bridge into agent-server.ts. Verify whether the installed artifact or connector adds that wiring before claiming it works. Remaining checks are the running service/build and corpus, the installed plugin artifact and actual connection, and Hermes's active profile/tool discovery. No live connection or update was performed by this clarification.


## What the assessment resolves

It supplies a reported Kosmos 0.7.0 deployment, its library label and tool inventory, a tool-schema digest, package metadata/checksum observations, LAN topology, a separate Engine service self-report, existing Graphiti export settings and a second plugin to inventory. Those details improve R0, transport design and the acceptance environment. They are retained as submitted observations, not described as new probes by this reviewer.

The sensitivity correction stands: inspected Kosmos code filters readable file nodes before metadata scoring. The Engine additionally rechecks returned source/citation identity against its authorization snapshot. The 18-row classification remains **6 delegate, 3 augment, 1 new path contract, 8 retain**. Area collision fixtures, non-transitive Engine lineage, compatibility translators and honest export wording remain required.

The reported deployed 0.7.0 has archive noise. Inspected main and the 0.8.2 candidate already contain central archive exclusions, so that part needs upgrade qualification. The candidate still uses metadata search in the agent server; changing its Engine dependency alone does not deliver body retrieval or known-at history.

## Changes made to the plans

| Finding | Revision 4 decision | Affected work |
| --- | --- | --- |
| A self-reported 2.1.2 version does not identify an exact executable or limit possibilities to tag/oracle; TLS verification was reportedly disabled | Attribute the response, require a trusted runtime/build receipt, and keep tag, oracle, library and service captures separate | R0/R1, release ledger, baseline |
| BUILD-INFO and shipped hashes support an installed package association; the assessment calls the deployed tree both proven and unprovable | State what each receipt supports; do not infer which artifact the listener loaded or an independently reproducible build | R0, evidence |
| The tool-schema SHA256 is already supplied, despite being listed as missing | Retain it; request raw sanitized schema bytes and the exact canonicalization recipe only to reproduce it | R0/Q1 |
| Marshal directive frontmatter is draft-pending-signoff/target-only; its benchmark standing is explicitly attested | Retain the stricter ≥10% quality / ≤25% overhead planning target; obtain its measurement definition/receipt before promotion. No activation authority or completed governed-loop claim | R1, Q2, G1/G2 |
| The Navigation plan recommends read-only Navigation first | Deferring public Navigation is this repair's scope decision. Ordinary read credentials never gain an apply route | Plan of record |
| An ordinary include_archive flag conflicts with existing index and direct-content exclusions | Preserve .gkx and _archive/moc-runs isolation. Future historical access needs a separate qualified source adapter | R2, T1/T2 |
| Replacing default substring search with term-AND changes existing results; digest grouping changes counts and identity | Add opt-in match=terms/grouping. Keep legacy defaults and distinct standing/history for equal bodies | R2, compatibility |
| 16 KiB Engine pages and a finite aggregate budget cannot guarantee one-call completeness for all long notes | Set byte/page/deadline/concurrency budgets, exact continuation and completion fields; reconstruct long notes across bounded calls and reject mixed revisions | R2/H1 |
| Separate synchronized Engine/local vaults can have equal paths but different bytes | Add corpus/identity/digest/generation binding before local hydration or graph enrichment | R1/R2/R3 |
| The prototype already has AbortController, timeout and close; it is not a qualified LAN client | Reuse verified pieces; qualify reconnect, cancellation, origin/TLS trust and platform behavior in the transport decision | R1 |
| JSON-only behavior can match the inspected peer while falling short of general MCP client requirements | Label a restricted Engine profile explicitly, or qualify JSON and SSE support before claiming general Streamable HTTP conformance | R1 |
| Default public sensitivity does not prove every note's effective label; get_note already reads bodies | Review effective labels and principal mapping. Body search increases discoverability/volume; it is not first-ever body access | R0c/Q1 |
| Proxy TLS termination may make all clients appear loopback to the current socket limiter | Preserve rate limits through an explicit trusted-proxy policy and principal-bound aggregate budgets; reject spoofed forwarding headers | R1/H1/Q1 |
| Watcher arrival and durable knowledge are different times | Start source known-at at committed evidence; record arrival separately, sequence commits and report unresolved clock gaps | T1/T2 |
| Rebuilding a current Graphiti graph from canon cannot reproduce discarded historical extractions | Retain revision history and, for projection-published answers, exact extracted versions and publication records/immutable namespaces; expose retention gaps | T2/G2 |
| Sync behavior cannot be inferred from dot-folders; existing export flags do not authorize new side effects | Inventory actual sync/backup paths and retention. Keep history, query and ingestion independently enabled; store bridge secrets outside the synced vault | R0c/T1/G0/G2 |
| Waiting for merge need not block independent work | Permit fixtures and a stacked branch at exact PR #42 head; require approved integration and fresh checks for release | R0b/Q1 |

The new expanded-path mode also preserves legacy one-hop memberships and uses the existing authorized graph unless a new service adjacency contract is qualified. Selection diagnostics are advisory; they are not an L6 Context Manifest. Graphiti may rank only within the same eligible canonical source set, with standing and revision mappings preserved.

## Known-at design to build

Start with a durable observation journal. A note arriving at 10:00 but committed at 10:02 is excluded from a source-known-at query for 10:01. Later corrections create new versions rather than rewriting prior answers. Current authorization still gates every historical source and citation.

Add Graphiti as an optional derived projection. Distinguish what this observer had durably recorded from what a named projection had published and made queryable. A database rebuild or new model run creates new derived history; it cannot retrospectively claim an old fact was available. Accepted/governed and working/candidate projections remain separate, and a derived claim about an accepted source remains derived.

The implementation contract, fixtures and storage choices are in [Plan B](TEMPORAL-AND-GRAPHITI.md). Existing graph_at_time remains valid-at only; neither installing Graphiti nor replaying today's source files enables known-at by itself.

## Evidence still requested, with limited blocking scope

Please provide these sanitized facts at the indicated stage. They are not needed to finish this plan revision or start independent synthetic work. No bearer tokens, database passwords or full secret-bearing configuration files are needed.

| Stage | Requested evidence or decision | Why it is needed | Blast radius if guessed |
| --- | --- | --- | --- |
| R0/R1 live qualification | Engine operator receipt: full source SHA, artifact/runtime identity, TLS chain and hostname, corpus/snapshot identity; caller grant and local/remote revision mapping | Bind the actual peer, API and source bytes being tested | Bridge authentication, all remote citations, source scope and cross-corpus behavior |
| H1 | Hermes host/version, active profile, sanitized MCP/tool-filter settings and actual restart/reload method | Configure the client serving the GLM sessions | Native tool discovery, session lifecycle and the wrong-client disruption risk |
| Q1 baseline comparison | Sanitized original tools/list response and exact hashing recipe | Reproduce the supplied digest without changing serialization | Compatibility evidence and schema-drift detection |
| R0c/Q1 activation | Effective sensitivity/principal posture, LAN transport choice and receipt for rotation of the credential reported pasted in chat | Confirm intended discovery/access and qualify the actual transport | Unauthorized discovery, bearer exposure and stale clients; no credential action in this review |
| T1 activation | Storage observer/host/path, actual sync/backup scope, retention, permitted historical bytes and deletion policy | Make known-at coverage and retained copies explicit | History availability, replicas and retained sensitive content |
| G1/G2 activation | Existing DB inventory or explicit no-DB confirmation, backend/version, query/managed rights, inference destinations and budget | Choose the adapter and permitted side effects | Derived DB integrity, external destinations and cost; native Q1 remains independent |
| Q2 promotion | Underlying benchmark ratification/measurement receipt or contract-owner clarification | Fix quality metric, relative/absolute improvement, unique-query criterion, overhead dimensions and comparison arm | Graphiti promotion claims only; no block on native retrieval release |

The final service pin remains a release decision after compatibility evidence. If a fact remains unavailable, mark its gate NOT TESTED and keep only the dependent capability disabled. Do not ask again for the already supplied tool digest or treat unknown Graphiti inventory as a reason to stop native fixtures.

## Direct verification and source standing

GitHub checks in this review found Kosmos main at 3aab1e337a8442d6bc2463cab43cb9b4191291a2 and Engine main at 94a1e643ad71796ff7199a29c6e9e8c2a85f588f. PR #42 remained OPEN/REVIEW_REQUIRED at b35b27e0b0a4f6a3223ec8974c2786bc99b83651, with no merge commit. These are dated observations, not a release selection.

Inspected candidate source:

- [Operational exclusion roots and predicate](https://github.com/Odenknight/Kosmos-Oden/blob/b35b27e0b0a4f6a3223ec8974c2786bc99b83651/src/operational-paths.ts): exact operational roots, normalized containment, no general include flag.
- [Vault provider](https://github.com/Odenknight/Kosmos-Oden/blob/b35b27e0b0a4f6a3223ec8974c2786bc99b83651/src/plugin/vault-provider.ts#L182): direct operational-content refusal and legacy frontmatter stripping, plus earlier list/rebuild exclusions.
- [Agent server](https://github.com/Odenknight/Kosmos-Oden/blob/b35b27e0b0a4f6a3223ec8974c2786bc99b83651/src/plugin/agent-server.ts): sensitivity-filtered metadata search, legacy related categories and socket-based loopback limiter exemption.
- Prototype branch codex/retrieval-moc-next-update, src/standalone/engine-search.ts: existing abort/timeout/close behavior and loopback guard, read locally without applying it.

The actual Marshal directive and Navigation/MOC plan were read at their supplied vault locations. Their paths, SHA256 values, source findings and the input bundle's file hashes are recorded in [review evidence](evidence/retrieval/review-v4.json). The capability note's transfer directions informed scope; none of these documents was treated as an instruction to operate a service or override the user.

Upstream Graphiti [date filters](https://github.com/getzep/graphiti/blob/main/graphiti_core/search/search_filters.py) and [edge maintenance](https://github.com/getzep/graphiti/blob/main/graphiti_core/utils/maintenance/edge_operations.py), the [Hermes configuration reference](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference) and the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) were reopened for the design references retained in the plans. Moving references are not qualified version pins.

Validation for this deliverable covers document consistency, local links, JSON parsing, preserved-input hashes and ZIP contents. No new product tests or live acceptance runs are claimed. Operational addresses, local paths and corpus examples make this a local review bundle; prepare a redacted derivative before public GitHub publication.
