# GKOS-Engine 2.1 compatibility

Kosmos-Oden 0.8.0 pins GKOS-Engine 2.1.1. The resolved dependency commit is
`f4dfda16eac746c667cf042f908a918d9acc6713`; package and lockfile must continue
to agree on that release line.

## Consumer boundary

Kosmos-Oden uses Engine 2.1 for deterministic parsing, projection, graph
construction, incremental `GkxIndex.applyChanges()` updates, and opt-in
Navigation discovery. It does not configure a Governance Store.

The Navigation integration is source-content read-only. Its only product effect
is selecting an existing note as a visual cluster or galaxy center and exposing
local findings/capabilities. It cannot create or modify notes, apply a MOC,
delete archives, write re-entry state, or execute rollback.

## Observable Navigation behavior

Navigation is disabled by default for upgrades. Disabled mode preserves the
former visual heuristic:

`index`, `home`, `readme`, `_index`, `moc`, `map`, `overview`, `dashboard`,
`start`, `contents`, `toc`.

Enabled mode delegates discovery to the Engine Navigation contract and uses
exactly:

`index`, `_index`, `readme`, `moc`, `contents`.

The six removed aliases are flagged as noncanonical. There is no automatic
promotion. `_archive/moc-runs/**` is excluded from Navigation discovery, while
other `_archive/**` material remains eligible.

## Engine 1.x to 2.x source changes

The Engine 2 public namespace is intentionally breaking:

| Engine 1.x | Engine 2.x |
|---|---|
| `KosmosIndex` | `GkxIndex` |
| `KosmosGraph` / `KosmosNode` | `GkxGraph` / `GkxNode` |
| `.okf` graph state | `.gkx` graph state |
| `OKF23_*` | `GKX23_*` |
| `parseOkfPlus()` | `parseGkx()` |
| `okf_version` | `gkx_version` |
| `.okf/` new audit storage | `.gkx/` new audit storage |

Legacy REST/MCP `/okf/*` names remain temporarily as public compatibility
routes. Their payloads are produced from Engine 2.x GKX state.

## Evidence separation

Kosmos-Oden's Navigation tests are consumer integration evidence only. They do
not establish a GKOS profile or certification. The advertised Engine contract
suite standing is `integration-only`, and the product reports GKOS conformance
as unclaimed/not evaluated by that suite.
