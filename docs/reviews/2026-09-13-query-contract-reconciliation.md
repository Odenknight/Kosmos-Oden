# Graphiti query contract and identity reconciliation

Date: 2026-09-13. This is an implementation checkpoint, not production semantic
service qualification.

## Engine contract

[Engine PR 55](https://github.com/Odenknight/GKOS-Engine/pull/55) supplies the
additive `gkos-graphiti-query/1.0.0-draft.1` contract. Its
[source and portable fixture](https://github.com/Odenknight/GKOS-Engine/tree/e956e6e39a232013ad0e7c77a52cc5e146fefef6/contracts/graphiti/query-draft1)
define bounded requests, status and results. The pure helpers reject unavailable
or unapproved host contexts, changed corpus/scope/policy/source snapshot/
generation/configuration bindings, and citations absent from the freshly
authorized episode ledger. An invalid hit rejects the complete response.

The helpers neither authorize nor execute a query. Existing policy authority
must supply the current decision and complete dependency scope. A provider's
selected citations cannot establish that every dependency is authorized.
Accepted generated facts retain `semantic_support: "unverified"`; episode or
digest equality does not prove entailment or citation accuracy.

Engine-local checks passed: typecheck/build, 21 focused contract/export/
compatibility tests, 13 source-inventory qualification tests, seven external
ingestion-runner tests, package contents, license and nomenclature. The PR's
hosted checks are the authoritative merge-gate record. The deterministic
concurrent-scope/revocation fixtures do not establish live backend isolation.

Kosmos still pins Engine `f39cccbacd5d2469b5e17dc0c1ef81d8d59cd9c4`.
This checkpoint does not pin or route queries through the new contract. No
broker, managed ingestion, source history or semantic search UI is deployed.

## Native build and identity

[Kosmos PR 71](https://github.com/Odenknight/Kosmos-Oden/pull/71) merged declared
tool-name precedence: `arguments.agent_name` overrides connection defaults,
and omitted names retain the configured connection identity. This supersedes
the earlier header-first description. These labels remain display identities,
not authorization capabilities.

A fresh native MCP probe passed seven calls: two `vault_overview` calls with
different client metadata, `graphiti_ingestion_status`, `search_notes`,
`get_note`, `get_lineage` and `get_related`. All observed traversal events used
one Codex visual identity. The temporary observation callback was restored.
The receipt's internal traversal event named `ping` is not an MCP ping request;
the probe used only stateless `tools/call` with protocol `2026-07-28`.

Observed plugin version: 0.8.3; source commit
`0c76f9c779a1bb17bf11ec93c4018f3e9383e80e`; `sourceTreeDirty=true`; build time
`2026-09-13T04:48:09.003Z`; main.js SHA-256
`c4714378d46cac8ae870fd21e479b003a4892af00a9c6b8f4339c1f5bfd443fe`.
This concurrently installed local artifact was preserved. Its dirty marker
prevents equating the binary to the clean commit merely from its build label.
The probe reports `export-ready`, target Graphiti 0.30.2 and `searchable=false`.
Sanitized observations: [native receipt](evidence/query-contract/native.json).

The updated shared-access record identifies the actual JEFFREY runtime on
R720 CT507. Read-only checks verified that container running and its Hermes
Kosmos configuration carrying `X-Kosmos-Agent-Name: JEFFREY`, alongside protocol
and authentication headers. Credentials were not displayed. This resolves the
previously unknown configuration location; it is not a recorded traversal from
the native Hermes harness. No runtime restart or configuration change was made
in this checkpoint, and no message was sent as another agent.

## Reconciled remaining work

Current model-file digests were recorded after verifying the serving endpoint's
reported path and the serving host's network mapping. SHA-256 reads were streamed;
file size/modification metadata remained stable during each read. No model
execution, download, replacement or service restart was performed.

| Role / current file | Bytes | SHA-256 |
|---|---:|---|
| Extraction: `Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf` (`util4`) | 5,335,285,728 | `d0027dd3a9128d9323e9f282c8bf010a8526c46477584535991dc1a869b56e96` |
| Embedding: `nomic-embed-text-v1.5.Q8_0.gguf` | 146,146,432 | `3e24342164b3d94991ba9692fdc0dd08e3fd7362e0aacc396a9a5c54a544c3b7` |

[Artifact observations](evidence/query-contract/model-artifacts.json) identify
current on-disk bytes. They do not attest already loaded process memory or
retroactively pin the earlier synthetic experiments. A fresh qualification must
bind these artifacts and the exact backend/adapter/settings configuration.

| Gate | Remaining work |
|---|---|
| G2 | Cross-repository consumer adoption/fixtures and fresh qualification bound to the recorded model artifacts plus complete backend/adapter configuration; the query contract is now implemented as an optional Engine surface |
| G3 | Managed queue/ledger, ambiguous-write and crash reconciliation, immutable generation publication, complete dependency revocation/purge and live concurrent-scope qualification |
| G4 | Freeze numeric budgets and native baseline, then 1k/10k/50k quality, citation, latency, memory and cost measurements |
| G5 | Governed broker with transport/admission limits, deadlines, cancellation, modes and native fallback |
| G6 | Opt-in semantic consumer/evidence UI and recorded native Hermes acceptance |
| G7 | Operational ownership, complete gates, rollback rehearsal and release/version decision |

Successful synthetic ingestion/search experiments remain exactly those in the
[reconciled roadmap](../plans/GRAPHITI-UPDATE-AND-UPGRADE-2026-09-12.md).
No additional model extraction or scale benchmark was run here.

Published implementation and experiment records are in the linked PRs and
repository documents. Native backups, raw operating logs, temporary fixtures
and the private local task ledger remain local. The old dirty Engine/Kosmos
roots and untracked patch sets are preserved; they are not silently merged as
part of this bounded contract increment. The current installed dirty artifact
is additional local state, not proof of an unmerged source feature.
