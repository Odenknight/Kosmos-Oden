# Kosmos-Oden roadmap

**Ecosystem role:** active reference end-user application and Obsidian
integration. Kosmos-Oden consumes
[GKOS-Engine](https://github.com/Odenknight/GKOS-Engine); it does not redefine
GKOS governance or GKX exchange contracts.

## Current line

- Keep shared parsing, validation, projection, graph, and export behavior in the
  upstream engine.
- Maintain the Obsidian host, visualization, governed workflows, Agent API,
  release assurance, and end-user documentation here.
- Preserve offline and read-only defaults; require explicit, reviewable
  workflows for writes and authoritative dispositions.
- Publish engine-version compatibility and reproducible release evidence.

### Current visual identity and qualification

The modern MCP endpoint is stateless. Server-issued visual identifiers are keyed
by the cleaned client/display name; `agent_name` can supply the designated label.
They are separate from authentication and write authority. Old per-session
`Mcp-Session-Id` descriptions are historical and must not guide new clients.

Startup/indexing, link visibility, trail timing, idle fade and galaxy spacing
fixes are on main. Proposal and human-decision sidecars require explicit review;
automatic MOC writes remain disabled. Bounded cached body search, a mailbox audit
and a Lite migration guide are available. Consumer coordinator fixtures cover
rename/overflow, denied recovery, concurrent intent and corrupt intent rejection.

Local Windows Obsidian and direct MCP evidence exists. Browser tests cover
Chromium, mobile Chromium, Firefox and WebKit. Native Hermes acceptance,
independent hardware GPU evidence and complete profile qualification remain
separate gates. See [branch and data dispositions](docs/reviews/2026-09-12-branch-disposition.md).

## Next

- Replace any remaining vendored or duplicated active-core behavior with
  versioned GKOS-Engine consumption where technically feasible.
- Add cross-repository compatibility fixtures for GKX contracts and engine
  releases.
- Expose proposal/review workflows without permitting automatic authoritative
  writes or sensitivity lowering.
- Keep product claims distinct from GKOS conformance and certification claims.
- Maintain a documented migration path from Kosmos-Oden Lite without requiring changes
  to the substance of compatible notes.
- Close the stable visual-identity successor's hosted browser, GPU, and live
  request-to-render gates without treating renderer identity as authentication
  or effect authority.

## Coordination gates

1. GKX contract changes originate in `gkos-standard`.
2. Shared deterministic changes originate in `GKOS-Engine`.
3. Kosmos-Oden adopts a released engine and records compatibility evidence.
4. Product-only UX and Obsidian changes remain here.
5. Kosmos-Oden Lite is not kept at feature parity; only its permitted maintenance
   backports are coordinated separately.

## Out of scope

- Redefining the standard or exchange contract.
- A second copy of the canonical active engine.
- Treating product release status as GKOS certification.
- New feature work in the frozen Kosmos-Oden Lite line.
