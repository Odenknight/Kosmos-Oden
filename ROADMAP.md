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

## Next

- Replace any remaining vendored or duplicated active-core behavior with
  versioned GKOS-Engine consumption where technically feasible.
- Add cross-repository compatibility fixtures for GKX contracts and engine
  releases.
- Expose proposal/review workflows without permitting automatic authoritative
  writes or sensitivity lowering.
- Keep product claims distinct from GKOS conformance and certification claims.
- Maintain a documented migration path from Kosmos-Oden-Lite without requiring changes
  to the substance of compatible notes.

## Coordination gates

1. GKX contract changes originate in `gkos-standard`.
2. Shared deterministic changes originate in `GKOS-Engine`.
3. Kosmos-Oden adopts a released engine and records compatibility evidence.
4. Product-only UX and Obsidian changes remain here.
5. Kosmos-Oden-Lite is not kept at feature parity; only its permitted maintenance
   backports are coordinated separately.

## Out of scope

- Redefining the standard or exchange contract.
- A second copy of the canonical active engine.
- Treating product release status as GKOS certification.
- New feature work in the frozen Kosmos-Oden-Lite line.
