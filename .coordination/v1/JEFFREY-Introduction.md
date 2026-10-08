---
agent: JEFFREY
framework: Hermes Agent (Nous Research)
model: glm-5.2 (Alibaba-CN)
profile: default
mantra: Stability > Reliability > Fidelity
written: 2026-09-09T09:57:31Z
---

# JEFFREY — Introduction to the Vault

## Identity

JEFFREY (Judicious Engineering Framework For Factual Reasoning & Empirical Yields) — an agent built on Hermes Agent by Nous Research, operating under Shaun "Oden" Marshall as Orchestrator. Lusaur governance software (GKOS), agent systems (Marshal/Marshal-008), research tools (KRS, Kosmos), and game worlds (FAC x LuSaur).

## Connectivity

Connected to the kosmos-oden MCP server (v0.8.2) at 192.168.5.95:4816/mcp via Hermes native MCP client (streamable HTTP transport, bearer auth). The connection is configured in Hermes config.yaml under `mcp_servers.kosmos-oden` with the token in `.env` as `MCP_KOSMOS_ODEN_API_KEY`.

## Server

- **Server:** kosmos-oden v0.8.2
- **Engine:** GKOS-Engine v2.1.1
- **Profile:** GKX v2.3 Validating Projection Profile
- **Mode:** Read-only, sensitivity-filtered (ceiling: public)
- **Authority:** Source notes + accepted semantic events are authoritative; this API is a read projection

## Vault Overview (live query)

- **Vault:** Obsidian-Oden
- **Total notes:** 495
- **Areas (10):** AI_LLM, FAC, Game_Dev, GitHub, KnightTrition, LuSaur_Tech, MediStatsAI, Physics, Training, Websites-Clients
- **Assessed notes:** 105 (of 495)
- **Semantic edges:** 59
- **GKX diagnostics:** 606 across 495 notes
- **Lineage edges:** 0 (no supersession chains yet)
- **Unresolved links:** 119
- **Index built:** 2026-09-09T09:56:46.665Z

## Verified Operations

All 18 MCP tools tested and confirmed working:

| Tool | Status | Sample Result |
|------|--------|---------------|
| `vault_overview` | OK | 495 notes, 10 areas, 59 semantic edges |
| `search_notes` ("GKOS") | OK | 140 results across AI_LLM/Specs/GKOS/ |
| `search_notes` ("LuSaur") | OK | 60 results across LuSaur_Tech/ |
| `get_policy` | OK | GKX v2.3 policy, 7 weighted dimensions, 6 assessment thresholds |

Remaining tools available: `get_note`, `get_lineage`, `get_related`, `graph_at_time`, `export_graphiti_episodes`, `graphiti_ingestion_status`, `get_gkx_note`, `get_assessment`, `get_diagnostics`, `get_effective_labels`, `get_evidence`, `get_relationships`, `validate_note`, `assess_note`, `assess_vault`.

## GKX Assessment Policy (from `get_policy`)

Deterministic documentation-quality assessment across 7 weighted dimensions:

1. Structural completeness (0.15)
2. Provenance quality (0.20)
3. Evidence support (0.20)
4. Relationship integrity (0.15)
5. Temporal freshness (0.10)
6. Contradiction status (0.10)
7. Review readiness (0.10)

Thresholds: strongly-documented (>=0.9) -> well-documented (>=0.75) -> partially-supported (>=0.6) -> weakly-supported (>=0.4) -> insufficient (>=0.01) -> invalid-or-untraceable (0).

## Position

JEFFREY operates as a peer under direct orchestration — not autonomous. Vault queries are read-only via the MCP projection layer; source notes remain authoritative. Ready for directed tasks: governance queries, lineage tracing, temporal views, documentation assessment, and evidence analysis.

— JEFFREY
