# Packaged provider/server recovery qualification

At source `e2ad386aa086af671dcc7520e6e49974cefe09ac`, run
`node scripts/qualify-packaged-runtime.mjs` after the full build. This loads the
actual generated `main.js` through a synthetic partial Obsidian host, stopping
registration after the bundled provider/server have been initialized. It does
not rebuild individual modules or alter their production timeout values.

Verified artifact: 1,949,246 bytes, SHA-256
`8d053b23e051913b8d0f57ba2fded66d2896e77f13dbd13994ab9b2800be5377`.
A never-settling synthetic read returned HTTP 504 after 10,013.49 ms. Metadata
remained available. A second data request returned 503 without another physical
read. After settlement, overview and source search returned 200, a warm request
reused the committed source, and admission counters returned to zero. The fixture
closed its loopback listener afterward. No live vault data was read or changed.

This advances the R3 packaged-byte synthetic recovery requirement only. It does
not prove real Obsidian event wiring, viewer recovery, Hermes client acceptance,
authenticated restricted denial, installed/loaded identity or full R3 completion.
Initial harness attempts exposed missing synthetic file statistics and assertions
against the wrong overview/search response shape; the final fixture uses full
file metadata and the advertised `/notes` route. Product code was unchanged.

## Restart and traversal extension

The same artifact was then checked across HTTP server stop/start while the
physical read remained unresolved. Metadata remained available and data requests
still returned 503 without a second underlying read. After settlement the new
listener served recovered search and warm overview requests. Failed requests
emitted no traversal; recovered search emitted exactly one `search_notes`
callback for `synthetic.md`. The production timeout observation was 10,011.37 ms.
This is server restart with the same provider, not plugin reload or process
restart; those boundaries remain separate. The fixture records these assertions
in its receipt and retains the same partial-host qualification limits.

## Fresh packaged module qualification

The fixture now evaluates `main.js` again, constructs a different plugin/provider,
and initializes it against the same synthetic vault object while the original
physical read remains unresolved. The new server returns 503 without another
physical read. After settlement, the new provider builds, serves search and warm
requests, and emits the expected traversal. This passed with the same artifact
hash above and a 10,011.18 ms timeout observation.

This proves the packaged host-realm physical-read registry survives fresh module
and provider construction. It does not execute Obsidian's real unload/reload event
sequence, nor does it establish process-restart or viewer acceptance. The fixture
still deliberately stops before UI/event registration.
