# Kosmos-Oden 0.8.2 integration review

Reviewed 2026-09-08 from GitHub main `3aab1e337a8442d6bc2463cab43cb9b4191291a2`.
Engine: TypeScript main `650eab4a6752227cae336d7556a57826c22a0d5a`,
declared 2.2.0 development candidate, pinned immutably in both dependency files.
This is not an Engine tagged release or Rust adoption.

## Findings and changes

| Area | Finding / disposition |
| --- | --- |
| Obsidian incremental index | Edits/deletions received during asynchronous reads were cleared with the completed batch. A revision counter now forces the next snapshot to include overlapping changes; initial and incremental deletion regressions pass. |
| Local service | Origin validation accepted URL credentials, paths, queries and fragments; fetch followed redirects. Connections now accept bare loopback origins and refuse redirects across health, graph, capability and traversal requests. |
| Traversal | HTTP 401/403 retried indefinitely. Rejected credentials now disconnect until the user reconnects. |
| Nextcloud | Null saved file maps or records could throw during restoration. Invalid records are discarded while valid records survive. |
| Dependency/build | Main's older Effects pin is replaced with the exact current TypeScript candidate. Lock guard and Engine contract tests track the new pin; supported build runtimes are Node 22/24. |
| Documentation/install | Product metadata is synchronized to 0.8.2, obsolete current-version claims corrected, and plugin install directory matches manifest ID `kosmos-oden`. |

## Regression evidence

Windows, Node 24.18.0, npm 10.9.4:

- Fresh `npm ci`: passed; dependency audit reported zero vulnerabilities.
- `npm run verify`: passed, **291 tests**, no failures or skips; typecheck,
  plugin/standalone/CLI builds, versions, lock pin, artifact containment,
  invariants and renderer provenance all passed.
- Desktop/mobile Chromium gate: **24 passed** (standalone, sandbox embed,
  controls, agent identity, replay, heat display and WebGL context recovery).
- Navigation Effects adoption browser suite: passed separately in Chromium.

Existing tests exercise GKX parsing/migration/enrichment, resolution, lineage,
temporal projection, incremental indexing, Graphiti export, Agent REST/MCP,
stdio bridging, sync planning, Navigation and fail-closed Effects boundaries.
Three.js remains 0.185.1. No existing feature is intentionally removed.

Limitations: real Obsidian desktop/mobile installation remains user acceptance
testing. Firefox/WebKit, live Nextcloud credentials, real external Engine service
request-to-render flows and cross-platform native packaging were not qualified
in this pass. Existing unmerged native/service PRs and local MOC prototypes were
preserved separately. No Rust build, automatic MOC writer or additional effect
authority is enabled by this update.

## Local acceptance test

Copy the packaged `kosmos-oden` folder into a test vault's
`.obsidian/plugins/`, retaining your existing plugin settings when upgrading.
Reload Obsidian, enable Vault Kosmos, and open its view. Test folder/note edits,
rapid edits during graph refresh, Chrono, navigation, settings and your optional
Agent API/Nextcloud workflows. Keep the previous plugin files for rollback;
this release does not migrate or rewrite source notes on installation.

The release folder also contains the offline standalone HTML, stdio bridge,
build provenance and SHA256 sums. The plugin bundle contains Engine code and
does not require installing Node or GKOS-Engine in the vault.
