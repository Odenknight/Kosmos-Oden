# Engine rename fix: consumer qualification

Kosmos now pins Engine `9f336ddf600702f81b48556a04fe1b3280baed80`, replacing
`c4940c4efd98e2cab9118b62c25e708737f62bdb`. The dependency, lockfile, exact build-script
permission, checker and consumer identity assertion agree. Installation changed
only the Engine package; the resolved Node bundle contains the rename guard.

The Engine runtime now requests full MOC reconciliation for rename events even
when the reported path matches remembered self-write bytes. Its 12 host and 67
related executor/reconciliation tests passed. This preserves potential changes
to another path that a single matching digest cannot rule out.

Kosmos `npm run verify` passed with 493 tests and no failures, including build,
version, lockfile, artifact, invariant and renderer provenance checks. These are
consumer checks, not proof that the optional MOC runtime is enabled in a product
host. Effects remain disabled pending the existing authority and prepared-intent
requirements.

The installed Obsidian build remains the separately qualified `59a61ca` artifact
with its original Engine pin. This update does not relabel its receipts or claim
native deployment. Engine and Kosmos hosted CI and the remaining release gates
must pass before main merge.

## Complete Engine qualification follow-up

Engine `f898cafb8612be8f2ed13f91a17e6f6f7e4e7d71` adds the reviewed file hashes
and rationale omitted from the rename fix's qualification inventory. It changes
no runtime code relative to the consumer pin above. The earlier hosted failure
was `Unreviewed candidate change inventory`, before test commands ran; that
failure remains part of the historical record.

The complete Windows Node 24.18.0 qualification then passed on this exact head:
build exit 0; 1,139 tests passed, zero failed/cancelled/skipped/todo. The run
started at 2026-09-13T18:43:40.887Z and ended at 19:02:58.935Z, retaining the same
source snapshot throughout. The test log SHA-256 is
`a324737c3eb9dbf9859653b395c32100511f78fad1079e2729db200b5ab2ce4b`.
The receipt still reports `release_qualified: false`: this is current-runtime
qualification on one platform, not completion of all release, performance,
native-host or operational gates. Kosmos's dependency remains the earlier
runtime-equivalent pin until the final candidate identities are reconciled.
