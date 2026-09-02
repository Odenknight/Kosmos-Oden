# Kosmos Research Studio roadmap

**Ecosystem role:** active reference end-user application and Obsidian
integration. KRS consumes
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

### Stable visual-identity successor

The bounded successor on `codex/complete-identity-protocol-20260901` has
implementation evidence at `caac0248529bcea94d7d37d582a9e45b3cc6df94`;
later documentation commits require their own exact-SHA checks. It separates
the renderer's stable agent identity from its display label across live,
buffered, replay, and embedded paths. The Agent API server mints a distinct
random visual identifier for each MCP session and does not expose the
`Mcp-Session-Id` to the renderer.
Clients cannot choose or retrieve the visual identifier; REST remains
label-only. This changes visualization fidelity only and grants no authority.

Local unit and Chromium evidence makes this a reviewable candidate, not a
release or qualification claim. Promotion remains gated on:

1. hosted Chromium and mobile browser execution at the exact accepted SHA;
2. the applicable Firefox/WebKit and cross-GPU renderer lanes;
3. a live, authenticated Engine-to-Kosmos request-to-render chain rather than
   synthetic traversal input; and
4. repository-owned review, compatibility evidence, and release checks.

## Next

- Replace any remaining vendored or duplicated active-core behavior with
  versioned GKOS-Engine consumption where technically feasible.
- Add cross-repository compatibility fixtures for GKX contracts and engine
  releases.
- Expose proposal/review workflows without permitting automatic authoritative
  writes or sensitivity lowering.
- Keep product claims distinct from GKOS conformance and certification claims.
- Maintain a documented migration path from KRS-Lite without requiring changes
  to the substance of compatible notes.
- Close the stable visual-identity successor's hosted browser, GPU, and live
  request-to-render gates without treating renderer identity as authentication
  or effect authority.

## Coordination gates

1. GKX contract changes originate in `gkos-standard`.
2. Shared deterministic changes originate in `GKOS-Engine`.
3. KRS adopts a released engine and records compatibility evidence.
4. Product-only UX and Obsidian changes remain here.
5. KRS-Lite is not kept at feature parity; only its permitted maintenance
   backports are coordinated separately.

## Out of scope

- Redefining the standard or exchange contract.
- A second copy of the canonical active engine.
- Treating product release status as GKOS certification.
- New feature work in the frozen KRS-Lite line.
