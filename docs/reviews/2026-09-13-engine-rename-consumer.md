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
