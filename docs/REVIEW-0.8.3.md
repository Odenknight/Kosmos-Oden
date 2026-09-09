# 0.8.3 release candidate qualification

Includes PR #49, merged to main as `172443abe4d6bc8b1ee27b017da011b9d3890ff1`, modern MCP 2026-07-28, and bounded concurrent vault reads. Locally installable; **Hermes native MCP compatibility remains blocked.**

## Validation on 2026-09-09

- `npm run verify`: 333 tests passed; typecheck, build, version, lockfile, artifact, invariant and renderer provenance checks passed.
- Chromium desktop/mobile suite: 24 tests passed before the host-side batching change; renderer source unchanged afterward.
- Installed in Obsidian 1.12.7 with existing settings preserved. The graph rendered 2,229 eligible notes.
- Live MCP authentication, discovery, tool listing, unsupported-version, header-mismatch and unknown-method checks passed.
- Authorized note retrieval passed. A temporary synthetic public note verified UID retrieval. An existing internal note was denied at the unchanged public ceiling, without returning its body. The synthetic note was moved to vault trash afterward.
- Initial API searches disconnected during sequential cold index reads. Full snapshots now read up to 16 notes concurrently, retaining source order. Live search and retrieval passed after installing this fix. Storage and sync latency still affect startup.

Credentials, private selectors, note bodies, settings and vault screenshots are excluded from the release.

## Hermes blocker

Installed Hermes WebUI v0.21.1 reaches the server but its native connection test fails with missing `params._meta["io.modelcontextprotocol/protocolVersion"]`. Native discovery and note retrieval have not passed. Static headers alone cannot fix missing body metadata or legacy initialization.

The client needs modern per-request metadata, matching headers, `server/discover`, and complete-result handling. Keep the server modern-only. Remote client-code access or a verified compatible Hermes build is needed, followed by allowed-note and denied-note tests from Hermes itself. Direct HTTP tests do not qualify Hermes.

## Installation and rollback

1. Disable Kosmos-Oden. Use the existing backup.
2. Extract the candidate ZIP. Copy `main.js`, `manifest.json`, `styles.css`, and `kosmos-mcp-stdio.mjs` into the existing plugin directory. For a new installation use `<vault>/.obsidian/plugins/kosmos-oden/`.
3. Preserve `data.json`, which holds settings and credentials. Avoid creating duplicate plugin directories when upgrading a version-suffixed installation.
4. Enable the plugin and reload Obsidian. Open Kosmos-Oden, allow the initial scan to complete, and confirm version 0.8.3 and the intended sensitivity ceiling.
5. Verify extracted files against `SHA256SUMS`; a separate ZIP checksum accompanies the archive.

To roll back, disable the plugin, restore prior plugin files from the existing backup and reload. Preserve settings unless intentionally restoring their backed-up version.

Read-only direct qualification:

```sh
node scripts/smoke-live-mcp.mjs /path/to/plugin/data.json http://127.0.0.1:4816/mcp /path/to/private-selectors.json
```

The optional private selectors file contains a public fixture `uid` and a `restrictedPath`. Without it, restricted-note qualification is reported incomplete. Never commit this file.

## Limitations

- Modern MCP only; legacy initialization clients cannot connect.
- Separate Engine retrieval transport is not upgraded or live-qualified.
- No new body search, vocabulary work, Graphiti ingestion guarantee or historical `known_at` support.
- Agent activity rendering has browser coverage; Hermes-to-live-vault visual qualification remains pending.
- This candidate is not a stable-release claim that Hermes qualification passed.
