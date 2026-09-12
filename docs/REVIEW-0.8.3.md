# 0.8.3 release candidate qualification

## September 12 startup and renderer update

The [startup and connection-line bugfix report](reviews/2026-09-12-startup-and-links-bugfix.md)
records the newer reliability baseline, timestamp repair, forced full reindex,
and All links behavior. The full-reindex evidence belongs to startup candidate
`d56d0d3`; renderer candidate `f862d45` adds line visibility changes and passed
its own build/browser checks. Native Hermes acceptance remains pending. The
September 10 records below describe earlier candidates and are retained as history.

PR #53 merged the consolidated candidate as
`b9fab6b2b556e94c47064354671d804c2c6b6800`. Its tree exactly matches reviewed
candidate `0d3342b3655e18e19444b6c9e2e80b2f051b863d`: merged #49/#51,
#50's bounded vault reads, #52's corrected DELETE guard, and modern-client
fairness fixes. PRs #50 and #52 are closed as superseded by #53.
**Final real-Hermes qualification of this combined build remains
pending.** Do not interpret the historical qualification below as evidence for
every later change.

## Consolidated R0 validation on 2026-09-10

- `npm run verify`: 342 tests passed with all verification checks.
- All GitHub checks passed on the exact candidate before merge, including both
  Chromium runs, validation, reproducibility, dependency review, CodeQL and
  provenance/SBOM. Documentation-only housekeeping does not add a new claim
  that the entire suite was rerun.
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
- PR #52 was reviewed locally and its four targeted tests pass. The normal
  GitHub approval gate could not be satisfied by the author account. The owner
  subsequently authorized the administrator override used to merge consolidated
  PR #53. Repository-wide protections were not changed.
- The consolidated executable was installed with settings unchanged and its
  bytes verified against the package. Direct HTTP checks passed authentication,
  discovery, listing, protocol errors, public retrieval, UID retrieval and
  restricted-note denial. These do not establish actual Hermes qualification.

## Release closeout still required

1. Jeffrey: run and report actual Hermes discovery/list/search, allowed-note/UID
   retrieval, restricted-note denial and visible traversal on the final build.
2. Carl/Claude: complete authoritative protocol evidence and independent
   wire-conformance coverage. Coordinate the unused status-map code cleanup;
   preserve validation before dispatch. Other visual-record cleanups are
   follow-ups unless review establishes a release-blocking defect.
3. Dale/Carl under Jeffrey's allocation: deliver the proposed mutation audit of
   verification checks; report actual findings rather than presume failure.
4. Codex: integrate any required fixes, rerun affected qualification, and record
   final client/build versions before declaring a stable release.

Notes-workspace design, shared semantic parity and optional UI implementation
remain separate planned work. No complete governance redesign is included here.

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
