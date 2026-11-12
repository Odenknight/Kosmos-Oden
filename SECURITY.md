# Security Policy

## Reporting a vulnerability

Please report security issues **privately** via GitHub Security Advisories
("Report a vulnerability" on the repository's Security tab) rather than a public
issue. Include the version, a description, and reproduction steps. Expect an
initial response within a reasonable window for a small open-source project.

Do **not** include real vault contents or live tokens in a report.

## Scope

Kosmos-Oden reads a local knowledge vault, builds a graph, and can expose it
over a local (optionally LAN) read-only HTTP + MCP API. Security-relevant areas:

- Agent API authentication, `Host`/`Origin` validation, rate/size limits.
- The Personal Notes profile (0.9.0): its read policy and folder scope, the
  device-local Personal token, and the optional tagging writer.
- The MCP era classifier, the legacy (initialize-era) adapter and the stdio
  bridge.
- The plugin iframe trust boundary (sandboxed, `postMessage`-mediated).
- The standalone viewer's read-only directory scanning.
- Optional Nextcloud credentials, remote transport, conflict handling, and
  conditional local/remote writes.
- Build provenance and artifact integrity.

The threat model is documented in [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## Security properties (enforced, not merely intended)

These invariants are declared in [`kosmos-invariants.yml`](kosmos-invariants.yml)
and enforced by `npm run check:invariants` in CI:

- Agent API is **disabled by default**, binds to **localhost by default**, and
  is **authenticated by default**.
- **LAN mode cannot start without a token.**
- Auth tokens come from a **CSPRNG only** (32 bytes); there is no weak fallback.
- Query-string token auth is **deprecated, off by default, and rejected in LAN mode**.
- The API is **read-only** — no write routes exist.
- Request bodies are capped at **4 MiB (bytes)**; responses set `Cache-Control: no-store`.
- Token comparison is **constant-time**.
- The plugin iframe is **sandboxed without `allow-same-origin`**.
- The standalone artifact has **no external runtime URL dependencies**.
- Personal Notes (0.9.0) **shares nothing until folders are chosen**,
  **fails closed without its runtime**, **never accepts a query-string
  token**, and **never rewrites the existing Default sensitivity**.
- Legacy MCP is served **only while Accept older MCP clients is on**, always
  **without sessions**, and the deprecated **HTTP+SSE transport is not
  served**.

Additional 0.9.0 properties, covered by the Personal Notes and MCP test
suites rather than the invariant file:

- The Personal connection always requires its own device-local token by
  header; the existing profile's token is never accepted on it.
- In the Personal profile one read policy governs every agent-facing output;
  hidden and missing notes are indistinguishable; a policy generation ends
  in-flight answers after any scope, profile, token or bind change.
- Requests carrying any modern MCP marker are never handled by the more
  permissive legacy path.
- Local network mode (either profile) listens on all IPv4 interfaces over
  plain HTTP; it is opt-in, token-required and only for trusted networks.
  Use a VPN otherwise.

## Handling of secrets

The existing profile's Agent API token is stored in the plugin's `data.json`
(gitignored, never committed). Tokens are never logged and never placed in
URLs by the default configuration. Regenerating the token invalidates
existing clients immediately.

The Personal Notes token (0.9.0) is device-local: it is kept in Obsidian
Secret Storage (or, where that is unavailable, vault-scoped local storage on
that device), namespaced by plugin ID and the canonical vault path. It is
never written to `data.json`, to notes, or to the guide written by **Write
Agent API guide**, so it does not travel with synced settings. **Rotate
token** invalidates it immediately.

Nextcloud app passwords are stored under a per-vault identifier in Obsidian
Secret Storage (Obsidian 1.11.4+), not in plugin `data.json`. Kosmos-Oden never
logs the password. Prefer a dedicated, revocable Nextcloud app password and
HTTPS; plain HTTP is rejected except for literal private/loopback addresses.
When `.obsidian` synchronization is enabled, Kosmos-Oden still forcibly
excludes `.obsidian/plugins/kosmos-oden/data.json` so device-local state and
the Agent API token cannot be synchronized.
