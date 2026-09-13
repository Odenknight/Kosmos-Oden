# Native semantic connection

`prepareNativeSemanticClient` connects the native source manifest to the shared
Engine publication validator and the bounded semantic query client.
It lives in `src/workspace/native-semantic.ts`.

The owning native host supplies its API instance, endpoint, credential, current
authority digests, and host-read published ledger receipt. These values must
come from trusted host configuration. A remote readiness response cannot
supply the authority grant.

The host also supplies a synchronous `current` callback and a lifetime abort
signal. The callback must return exactly `true` while the credential,
publication, and authority revision remain current. An asynchronous callback
is refused. The owner must invalidate the revision synchronously when any
covered setting changes, including a rollback to an earlier setting.

Preparation reads the current native manifest and compares all published
source mappings and the ledger observation digest. It returns null if the
receipt, source state, or authority does not match. Otherwise it returns a
client compatible with the optional `NotesWorkspaceHost` semantic argument.

The retained client checks both host authority and native source revision
before transport, after transport, and before publication. An observed
invalidation is permanent for that client. Reconnection requires fresh
preparation. Closing the owning connection must abort its lifetime signal.

Tests use the actual native vault provider with synthetic original source
bytes. They cover successful query acceptance, revoked host access during
transport, pending source changes before transport, malformed readiness data,
and refusal of an asynchronous authority callback.

The native plugin's configuration lifecycle and Notes view wiring remain
unfinished. This module does not install a connection, ingest vault content,
or establish native user-interface acceptance.
