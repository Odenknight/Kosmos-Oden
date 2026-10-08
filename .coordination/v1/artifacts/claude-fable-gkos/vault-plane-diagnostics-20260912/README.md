# Vault-plane diagnostics — claude-fable-gkos

Reproduction scripts behind my seq 16, 17 and 18 findings. Delivered at owner
request so the evidence is durable rather than living in a session scratchpad.

**Immutable.** Corrections are appended as a new task directory, never edited here.

## Provenance of the measurements in seq 16/17

All measurements were taken **2026-09-10 between ~13:00Z and ~14:14Z** against
the live server on `192.168.5.95:4816`, which is the same Windows host the
plugin and vault live on.

At that time the installed plugin reported `gitCommit b0c7ee2845f2...`,
`buildTimeUtc 2026-09-10T15:08:14Z`, `sourceTreeDirty false`, and all ten of its
`SHA256SUMS` verified. **That reading was accurate when taken.** The plugin was
subsequently rebuilt and redeployed — it now reports `gitCommit 0ed5268f54ee...`,
`buildTimeUtc 2026-09-10T20:08:10Z`, `main.js` sha256 beginning `84deffb20ca4b31a`,
matching dale seq 21's byte-identical rebuild. So my runs measured the PRE-fix
build, consistent with dale seq 23's timeline reasoning, and they do not describe
the currently deployed bundle.

## Credentials

No script contains a credential. All network scripts read `KOSMOS_MCP_URL` and
`KOSMOS_MCP_TOKEN` from the environment. `mcp-client-capture.mjs` additionally
redacts credential headers to length + SHA-256 prefix and scrubs any seen value
from its transcripts before writing them.

## Scripts

| file | what it answers | cost |
|---|---|---|
| `measure-graph.mjs` | How long does a cold graph build of the real vault actually take, outside the server? | none — local only, never touches the server |
| `probe-metadata.mjs` | Is the metadata plane healthy, and is the process already degraded by leaked counters? | none — all calls complete and release their slots |
| `probe-vault.mjs` | Do two back-to-back vault reads hang? | leaks up to 2 concurrency slots |
| `defect-d-test.mjs` | On a fresh restart, does call 1 succeed then later calls pin? Is the perpetual-rebuild defect live? | stops after 2 consecutive hangs |
| `patience.mjs` | Does a rebuild ever complete given 300s of quiet, or is it stuck? | leaks up to 3 slots |
| `mcp-client-capture.mjs` | What does a given MCP client actually put on the wire — modern `_meta` or a legacy handshake? | none — it is a listener, not a client |

**Slot cost is real.** Per carl seq 11 every hung vault read permanently leaks one
slot from `inFlight` and `perAgentInFlight` until the process restarts. Run the
zero-cost scripts first and restart before comparing runs.

## Usage

    # local only, no server contact
    node measure-graph.mjs [vaultPath]

    # server probes
    export KOSMOS_MCP_URL=http://<host>:4816/mcp
    export KOSMOS_MCP_TOKEN=<token>
    node probe-metadata.mjs        # safe, start here
    node defect-d-test.mjs         # costs slots
    node patience.mjs              # costs slots

    # client capture listener (separate purpose)
    node mcp-client-capture.mjs --port 4817 [--strict] [--seconds N]

`measure-graph.mjs` imports the engine from a `node_modules/gkos-engine` path
that is hard-coded near the top; adjust it for your checkout.

## Results obtained, for reference

Local, real vault, same host as the server:

    2,257 markdown files, 736 folders, 27.6 MiB
    raw fs read of every file        0.54s   (zero hangs)
    buildGraph() cold                3.30s   (3,386 nodes)
    GkxIndex.setFiles() cold         5.30s
    cold end-to-end                  5.84s   vs REQUEST_TIMEOUT_MS 30s

Against the pre-fix live server: metadata plane 0.01-0.07s throughout; every
vault-backed read dead at ~30.0s including the first after a clean restart; still
dead after 300s of quiet. The viewer held a working graph (3211 nodes / 14446
links) in the same process at the same time, and Obsidian's own "Indexing vault..."
notice was displayed throughout.
