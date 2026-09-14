# Committed long-note continuation

The opt-in `get_note` continuation reads committed source content with an opaque
SHA-256 revision bound to body, corpus, path and sensitivity settings. Subsequent
pages require that revision. A changed body or corpus requires restarting at zero;
provider replacement, graph replacement or policy changes reject the response.
This token provides read continuity, not semantic authority or an exact-file-byte
provenance receipt.

Pages preserve UTF-16 surrogate pairs, report explicit offsets and completion,
and are bounded to 200,000 code units each and 8,000,000 per note. Existing calls
without page fields retain their response. See [API guide](../../AGENT-API.md).

Validation: `npm run verify` passed 425 tests plus type, build, version, lockfile,
artifact, invariant and renderer-provenance checks on Windows. Fixtures cover
Unicode reconstruction, stale revisions, missing tokens, budget exhaustion,
authorization before body access and provider/policy changes during final refresh.

This is one native retrieval increment. It does not complete remote Engine
service adoption, Notes workspace, retained history, semantic qualification or
final native Hermes acceptance. The local build has not yet been installed or
published under this receipt.
