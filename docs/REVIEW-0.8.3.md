# 0.8.3 release candidate qualification

The consolidated candidate includes merged PR #49 and #51, candidate #50's
bounded vault reads, candidate #52's corrected DELETE guard, and modern-client
fairness fixes. **Final real-Hermes qualification of this combined build remains
pending.** Do not interpret the historical qualification below as evidence for
every later change.

## Consolidated R0 validation on 2026-09-10

- `npm run verify`: 342 tests passed with all verification checks.
- Browser suite: 23 passed, one mobile viewport-resize operation exceeded the
  30-second test timeout. That exact test passed independently with one worker
  (4.8-second run). No renderer source changed; retain the first failure in the
  evidence instead of reporting an uninterrupted all-green run.
- Named MCP callers sharing a User-Agent now have independent execution buckets
  after authentication/metadata validation; all requests, including loopback,
  remain globally bounded. HTTP tests verify saturation, independent progress,
  anonymous fallback, name rotation, slot release and invalid requests.
- Era-signal decision: preserve envelope validation before method dispatch.
  Missing headers yield HeaderMismatch; missing body metadata yields Invalid
  params; `initialize` with valid modern metadata reaches Method not found.
  These are distinct request shapes, not contradictory results. The unused
  status-map code cleanup remains a coordinated server-lane follow-up.
- PR #52 was reviewed locally and its four targeted tests pass. GitHub requires
  an independent approval: the current account cannot approve its own PR.
  No branch-protection override was used.

## Validation on 2026-09-09

- `npm run verify`: 333 tests passed; typecheck, build, version, lockfile, artifact, invariant and renderer provenance checks passed.
- Chromium desktop/mobile suite: 24 tests passed before the host-side batching change; renderer source unchanged afterward.
- Installed in Obsidian 1.12.7 with existing settings preserved. The graph rendered 2,229 eligible notes.
- Live MCP authentication, discovery, tool listing, unsupported-version, header-mismatch and unknown-method checks passed.
- Authorized note retrieval passed. A temporary synthetic public note verified UID retrieval. An existing internal note was denied at the unchanged public ceiling, without returning its body. The synthetic note was moved to vault trash afterward.
- Initial API searches disconnected during sequential cold index reads. Full snapshots now read up to 16 notes concurrently, retaining source order. Live search and retrieval passed after installing this fix. Storage and sync latency still affect startup.

Credentials, private selectors, note bodies, settings and vault screenshots are excluded from the release.

## Hermes qualification status

The earlier installed Hermes WebUI test failed with missing modern body
metadata. Since then the client maintainer reports successful modern negotiation
and synthetic strict-client tool listing/retrieval with the cache-field fix.
That report supersedes the earlier diagnosis as a current client-status claim,
but does not qualify this combined installed candidate.

Run discovery, listing, allowed-note and denied-note tests through the actual
Hermes client against the final artifact, recording exact client/source versions.
Keep the server modern-only. Direct HTTP tests do not qualify Hermes.

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
