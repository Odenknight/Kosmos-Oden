# Service response-time revocation

Engine candidate `a7b52b3` fixes a shared-service REST authorization race.
Before the fix, revoking a credential during asynchronous snapshot/authorization
work could still permit a successful response using the earlier identity.
The regression reproduced `/health` returning 200 after revocation.

The shared JSON response path now resolves the current credential before sending
a successful response. Revoked credentials or changed credential ID, agent ID,
sensitivity ceiling or capabilities receive a generic 401 without protected data.
The regression covers health, capabilities, notes, graph and Graphiti episodes.
Build, source inventory validation and 20 runtime/authorized-view/secret-canary
tests passed. Full candidate qualification remains pending.

Kosmos' plugin server independently captures its request's token, token requirement,
sensitivity settings, provider, settings object and lifecycle epoch. Its guarded
response checks that context before writes after an await. Inspection found this
existing protection in `KosmosAgentServer.handle`; the Engine fix does not replace
it or prove every consumer lifecycle requirement.

The Kosmos dependency remains pinned to `f898cafb8612be8f2ed13f91a17e6f6f7e4e7d71`.
Neither the newer Engine fix nor its test results have been attributed to the
installed plugin. Consumer repinning and affected verification remain required.
Graphiti's authenticated product query endpoint and policy-to-ledger binding
also remain unimplemented; export readiness does not imply semantic searchability.
