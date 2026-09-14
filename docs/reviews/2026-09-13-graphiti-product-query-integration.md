# Graphiti product query integration requirements

Historical source inspection: Engine `a7b52b3886b2a2ffbea51bfc7b03114b6508fff0`.
This identifies the remaining G5/G6 implementation boundary; it does not claim
an authenticated product query endpoint exists.

The product service owns credentials, corpus snapshots and authorization through
`src/service/server.ts`. Its current `/graphiti/episodes` route exports authorized
episodes. It does not execute semantic queries. The private `GraphitiQueryBroker`
already bounds admission, retains physical slots for transports that ignore
cancellation, and validates replies against fresh host context.

## Required host binding

1. Authenticate through `ServiceCredentialRegistry`; derive the authorized view
   through the service's existing policy evaluator. Request fields must not select
   a corpus, scope, projection, configuration, or ledger job as authority.
2. Obtain the complete authorized source manifest from the ingestion authority.
   `ledger.validate_manifest` binds an ordered list of source ID, source digest
   and episode digest to `source_snapshot_digest`. A set of visible notes alone
   cannot reconstruct this list or establish complete dependency scope.
3. Reuse the exact ingestion canonicalization. Python `ledger.canonical` sorts
   object keys, escapes non-ASCII characters and preserves array order. Generic
   JavaScript JSON serialization is not an interchangeable digest algorithm.
   Bind source and episode hashes according to their distinct input definitions;
   `AuthorizedRecordEvidence.content_digest` is not evidence of raw source bytes.
4. Read a published ledger generation using the host-derived binding. Its
   `projection_id`, source mappings, observation receipt and sequence belong to
   that generation. A successful read is publication evidence, not a user grant.
5. Supply the broker with a host-owned current-context function and the bounded
   read-only transport. After asynchronous snapshot or ledger work, recompute
   authority before accepting or publishing results. A cached context closure
   would defeat the broker's post-query check.
6. Revalidate credentials, policy, corpus generation, configuration and complete
   dependency scope after the provider returns. Return no partial result if any
   binding changes. Preserve unverified semantic support on accepted citations.

## Required executable acceptance

Exercise the actual authenticated service route with a published synthetic
ledger: permitted request, missing credential, restricted source dependency,
cross-corpus projection, changed policy/configuration/generation, credential
revocation during each await, cancellation, bounded oversized response and
backend outage. Confirm rejected requests never invoke the provider where
preflight authority is unavailable, and late results never escape after revocation.
Run non-ASCII episode digest vectors across the TypeScript/Python boundary.

Then exercise the Kosmos client against that route, including unavailable status,
native fallback and explicitly unverified evidence display. Existing broker,
ledger and renderer component tests do not substitute for this integration.
Keep query capability unavailable until the host binding is implemented and
qualified. G5/G6 and final release remain open.

## Candidate implementation update

The Kosmos candidate now pins Engine
`7f28b2a45d176a85895210bb23e55a7e9bc0faca`. This supersedes the initial
endpoint inventory above: the Engine provides authenticated query and status
routes with a trusted host callback, deadline and authority rechecks. Cross-language
manifest vectors and a synthetic Engine-to-Python HTTP/ledger chain exercise
the protocol. They do not prove a production host binding or live retrieval.

Relationship episodes now carry their originating `source_path`. Kosmos uses
that path to attach exact source-byte evidence even when an export page contains
only a relationship episode. The relationship does not include the note body.
`test/source-evidence.test.mjs` covers that page boundary and denied, stale,
revoked and oversized source reads. The full `npm run verify` passes with this
pin, including 503 tests and the exact dependency guard.

The candidate Notes client and related-facts display exist, but the installed
plugin is unchanged. Production authority, configured native client, resolved
citations and live acceptance remain required; G5/G6 remain open.

The subsequent Engine `5f96a71` host implementation has now been exercised as a
persistent isolated synthetic reader. Five live HTTP queries returned the expected
fixture fact and matching source citations, missing credentials and wrong bindings
were denied, graph counts were unchanged, and a new service process recovered the
same published ledger generation after restart. The original Engine source manifest
and returned query contract were also reconciled locally. Private deployment receipts
remain in the operator's local records. This advances backend qualification; the
upstream Engine adapter, native client and actual vault scope still require integration
and acceptance. The installed plugin and this consumer's Engine pin are unchanged.

The deployed synthetic reader is now connected through `createServiceGraphitiHost`
and the authenticated Engine query/status routes. A resident private ledger
inspector reduced repeated-interpreter overhead: five end-to-end gateway queries
took 392–403 ms, versus an initial 14-second result. Mutating the synthetic source
disabled readiness and queries; restoring its exact bytes recovered readiness.
Restarting the reader replaced the reader, inspector and gateway processes and
restored the expected query result. These are one-source synthetic measurements,
not the outstanding large-vault latency or soak qualification. Native-client and
actual vault-scope acceptance remain open.
