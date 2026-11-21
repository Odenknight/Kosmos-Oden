# Kosmos-Oden: managed identity and Engine 2.x / Rust 3.0 integration plan

Date: November 17, 2026. Status: proposed feature plan; documentation only.

Canonical cross-repository plan: [GKOS Observatory IAM coordinated build plan](https://github.com/Odenknight/GKOS-Observatory/blob/plan/iam-coordinated-20261117/docs/plans/GKOS-OBSERVATORY-IAM-COORDINATED-BUILD-PLAN-2026-11-17.md). The coordinated proposal is carried on branch plan/iam-coordinated-20261117; use the reviewed immutable commit and SHA-256 recorded in the integration evidence before implementation. Canonical document SHA-256: 6052cb15a8b275d7cc0cc86a9f6e4be55dada9a7b7e79013c2821f65a35c248b. This proposal does not change runtime behavior or grant credentials.

## Current reference and responsibility

Main b77eec5664c2e6d70faf2ebef5b00ee45e14de48 is package 0.9.5. Reuse its Personal Notes, Librarian/map-of-content, optional semantic search, renderer and host UX. The Engine dependency remains pinned to 7511233717cd5ab9ce8f6cec76e9623a21e3c728; adding this proposal does not update that dependency or establish compatibility with today's Engine head.

Engine 2.5 already contains the deterministic Librarian and a governed adapter. Its newer integration document and PR107–109 reconcile the older port plan. Do not re-port the core or create an Observatory-only ranking implementation.

## Managed connection profile: I06

- Preserve simple local/home use. Offer a separate managed Engine connection profile for service-owned corporate/intranet knowledge.
- Show the authenticated principal/account, tenant, accountable agent owner, grant summary, credential expiry and connection/revocation state.
- Use the same IAM contract for TypeScript and Rust; do not implement a second independent permission system in Obsidian.
- Keep credential/refresh secrets in approved host storage or protected token files. Pass only safe display identity and authorized data to the renderer.
- Bind ships to stable principal identity, flights to sessions and requests to operations; labels and agent_name do not authenticate a user.
- Retrieve through the governed service using real per-record grants. Personal GET /librarian is not the governed service route.
- Adopt a public Engine Librarian export only after stable contract/package and exact consumer verification. Until then preserve deliberate synchronized source behavior rather than claiming runtime deduplication.
- SSO uses OIDC through an enterprise IdP; LDAP/AD federation stays behind the broker. Local identities and explicit offline read leases remain possible.
- Treat read, proposal, human review, Effects authorization and publication as separate authorities. IAM login alone never authorizes note mutation.

## Storage and disclosure boundary

A person with direct filesystem access to the whole Obsidian vault can bypass a search UI's restrictions. Corporate enforcement needs service-owned storage or a physically scoped local projection. An offline SQLite export must exclude denied records and derived leaks. Never sync live IAM databases or bearer secrets through ordinary Nextcloud note synchronization.

## Acceptance

Exercise the exact built plugin with a qualified Engine artifact and a real MCP client. Two employees with the same clearance and different grants must see different correct notes, graph and Librarian citations; display-name collisions must not merge principals. Verify account switch/reconnect, revoked credential, source/policy changes during query, no token in renderer/storage/log output, denied offline material absent, and preview/approval rules unchanged.

The current 0.9.5 functionality is the UX reference. Its open relevance judgement, actual Obsidian/client/runtime and real service checks remain separate. Managed IAM/SSO and native Rust compatibility are planned, not delivered by this document.

## Implementation entry and acceptance

Start with I00/I01 from the canonical plan. Preserve the source and qualification gates of this repository. The new IAM contract is an application extension and does not amend GKOS/GKX or frozen oracle/identity packs. All named APIs and lifetime policies are proposals until contract review. Do not infer SSO, LDAP, per-record access or cross-runtime parity from this document's presence.

The complete test matrix, migration and rollback rules, source pins and primary standards references are in the canonical plan. Required evidence includes exact commit/artifact/contract/config identities, real authorization enforcement, original failures/skips, no-secret logs/exports, and independent boundary review. Only document checks were performed while preparing this proposal.
