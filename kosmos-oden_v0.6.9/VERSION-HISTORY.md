# Kosmos-Oden build snapshot history

This folder (`kosmos-oden_v0.6.9/`) is a local build snapshot, following the
same convention as the sibling folders below — not a git-tracked artifact
(see `.gitignore`).

## Folder-name / plugin-id history

| Folder | Plugin id (`manifest.json`) | Version | Notes |
|---|---|---|---|
| `vault-kosmos_v0.5.0/` | `vault-kosmos` | 0.5.0 | |
| `vault-kosmos_v0.5.1/` | `vault-kosmos` | 0.5.1 | |
| `vault-kosmos_v0.5.5/` | `vault-kosmos` | 0.5.5 | |
| `vault-kosmos_v0.5.5-Lite/` | `vault-kosmos` | 0.5.5 (Lite build) | |
| `vault-kosmos_v0.6.0/` | `vault-kosmos` | 0.6.0 | |
| `vault-kosmos_v0.6.5/` | `vault-kosmos` | 0.6.5 | currently installed in the live vault (`_NC\Obsidian-Oden\.obsidian\plugins\vault-kosmos_v0.6.5\`), enabled as `"vault-kosmos"` in `community-plugins.json` — the live vault is still on this build; newer snapshots are installed manually by the user |
| `kosmos-oden_v0.6.6/` | `kosmos-oden` | 0.6.6 | first build under the renamed id, built pre-merge from `feat/plugin-id-rename` @ `a15e73e` ([PR #15](https://github.com/Odenknight/Kosmos-Oden/pull/15), merged 2026-07-23 via admin bypass) |
| `kosmos-oden_v0.6.7/` | `kosmos-oden` | 0.6.7 | gkos-engine v1.0.6 divergence fixes (OKF-TEMPORAL-001 naive-timestamp diagnostic, fail-closed sensitivity default, invalid-epistemic-state fallback) plus a new "Default sensitivity for unlabeled notes" setting, gated above the Agent API enable toggle with a network-access alert. Built from `main` @ `08865a6` ([PR #17](https://github.com/Odenknight/Kosmos-Oden/pull/17)). Superseded. |
| _(no snapshot)_ | `kosmos-oden` | 0.6.8 | **issue-#6 wiring** — adopts gkos-engine v1.0.7 (Odenknight/GKOS-Engine#7, closing engine issue #6) and threads `Okf23ProjectionOptions` through `parseSourceFile`, `buildGraph`, and `new KosmosIndex(projectionOptions?)`, so the **Default sensitivity dropdown now governs the effective sensitivity of every unlabeled note** — both the full vault load and incremental `applyChanges`; `VaultDataProvider` re-projects the whole vault when the setting changes. Merged as [PR #19](https://github.com/Odenknight/Kosmos-Oden/pull/19). Rolled into the v0.6.9 snapshot below. |
| **`kosmos-oden_v0.6.9/`** | **`kosmos-oden`** | **0.6.9** | **current — standalone viewer sidecar API feed + `viewer-v*` release publishing.** The self-contained `vault-kosmos.html` can read a live graph from a running GKOS Engine Desktop sidecar (`kosmos-agent`, loopback `127.0.0.1:4814`) via `?api=…&token=…` or the new **Connect to Local Engine** startup form; the feed is read-only (`GET /health`, `GET /graph`), loopback-only (non-loopback refused before any request), and the bearer token is held in memory only and never persisted. New `standalone-html-release.yml` workflow publishes `dist/kosmos-embed.html` + `vault-kosmos.html` as a GitHub prerelease on `viewer-v*` tags. Built from `main` @ `35d29d1` (merge of [PR #20](https://github.com/Odenknight/Kosmos-Oden/pull/20)). **Supersedes `kosmos-oden_v0.6.7/` and `kosmos-oden_v0.6.6/`.** |

## Snapshot contents

Same file set as the `v0.6.7` snapshot — `main.js`, `manifest.json`,
`styles.css`, `versions.json`, `kosmos-mcp-stdio.mjs` — **plus
`vault-kosmos.html`**, new to this snapshot: the single-file standalone viewer
that carries this version's story (the sidecar API feed). It is normally a
release download rather than a tracked artifact (see `.gitignore`), and is
included here so the snapshot is self-contained.

## Build provenance for this snapshot (v0.6.9)

- Source: `main` @ `35d29d1c06a0fa66bb048978b53db49dfdc288ed` (merge of PR #20:
  "feat: standalone HTML viewer — sidecar API feed + release publishing")
- Verified in-place before snapshotting, all green:
  - `npm install` — OK
  - `npm run build` — clean (`main.js` 1.4 mb; `vault-kosmos.html` 909 KB single file)
  - `npm test` — 209/209 pass, 0 fail
  - `npm run check:versions` — OK, everything agrees on v0.6.9
  - `npm run check:invariants` — OK, source and artifacts satisfy `kosmos-invariants.yml`
- `manifest.json` confirmed: id `kosmos-oden`, version `0.6.9`.

## Breaking-change note (unlabeled notes — updated as of 0.6.8)

Since `v0.6.7`, unlabeled notes fail closed to `secret` sensitivity and drop
below the default `internal` agent-visibility ceiling — they disappear from
agent/MCP results after upgrading from `v0.6.6` or earlier. The default remains
fail-closed `secret`, and classification stays raise-only (a note declaring a
higher sensitivity is never lowered).

**Superseding the 0.6.7-era caveat:** that snapshot's note said the new
"Default sensitivity" dropdown could *not* restore visibility for these notes,
because `KosmosIndex` did not thread projection options
([GKOS-Engine#6](https://github.com/Odenknight/GKOS-Engine/issues/6)). That
limitation is **fixed as of 0.6.8**. Setting Default sensitivity to `internal`
now **does** restore pre-0.6.7 agent visibility for unlabeled notes — they
project to `internal` and clear the default `internal` ceiling — without having
to raise the Agent sensitivity ceiling or edit frontmatter.

## Migration note (plugin id/folder, from the rename — still applies)

    .obsidian/plugins/vault-kosmos/ -> .obsidian/plugins/kosmos-oden/

## Not yet done

This snapshot has **not** been installed into the live vault
(`_NC\Obsidian-Oden\.obsidian\plugins\`) or enabled in
`community-plugins.json` — that requires a separate, explicit step since it
changes the live vault/app configuration. The live vault remains on
`vault-kosmos_v0.6.5`.
