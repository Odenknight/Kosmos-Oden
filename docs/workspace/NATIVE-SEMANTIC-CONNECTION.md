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

The native plugin now owns a `NativeSemanticConnection` and passes it to the
Notes workspace. Startup prepares a connection only when the plugin's trusted
`data.json` contains a `nativeSemantic` profile. The profile has exactly these
fields: `vaultIdentity`, `endpoint`, `token`, `authority`, and `publication`.
`authority` contains the configured corpus, scope, policy, and configuration
digests. `publication` is the host-read published ledger receipt described by
the Engine. The profile's vault identity must equal the native provider's
identity. A query-status response is insufficient.

The profile is optional. Missing, invalid, mismatched, or stale configuration
leaves ordinary readable search available. Existing profile data is preserved
when other plugin settings are saved. The profile contains credentials and
must remain private; do not place it in source notes or GitHub.

Reload the plugin after updating the profile. The command **Reconnect
related-fact search** prepares a fresh connection from the loaded profile.
Saving agent settings disconnects the old connection immediately. Plugin
unload also disconnects it. Source changes invalidate retained clients;
updated ingestion and a matching published receipt are needed for a changed
corpus.

Reconnection cannot revive old results or allow an older preparation to
replace a newer one. Replacement clients share the physical transport limit.
Cancelled preparation retains its slot until the underlying work settles.

This code does not provision a profile, ingest vault content, or establish
visible native user-interface acceptance. Those deployment checks remain open.
