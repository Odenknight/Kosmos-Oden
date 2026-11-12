# Kosmos-Oden 0.9.0 build progress

Build authority: the final Personal Notes build instructions (FINAL-2, 2026-11-12).
Branch: `fable/personal-notes-0.9.0`. Nothing here is merged, tagged or released.

Automated checks and real-world trials are recorded separately. A packet is
"pass" only when its automated checks ran here; trials that need Obsidian, a
source account or a second machine are listed under "Pending owner trials".

## P00 — Baseline and patch triage

| Item | Result |
| --- | --- |
| Baseline | `origin/main` `c796139670b122ea70ac66af1dee874876a865a1`, package 0.8.4 (unchanged from the inspected baseline) |
| Toolchain | Node 24.18.0, npm 11.16.0, Windows 11 |
| `npm ci` | pass; `gkos-engine` 2.2.0 at `7511233717cd5ab9ce8f6cec76e9623a21e3c728` |
| `npm run verify` on baseline | pass (exit 0) |
| Patch identity | SHA-256 `f214e28909eb9a563c46b66e2452d7ee0d9f302435e268c9e665109bdb2bc64e`, matches the reviewed value |
| `git apply --check`, `git apply`, `git diff --check` | all exit 0; 35 paths (18 changed, 17 new) |
| `npm run verify` on the unmodified patch | pass (exit 0). This is the patch's own suite, not the 0.9.0 acceptance matrix |

The patch is committed unmodified as `cebe8d9`; every later commit is a correction.

Engine helpers confirmed present at the pin: `applyNoteTimestamps`,
`timestampEligible`, `makeGkxUuidV7`, `makeGkxUuidV4`, `parseFrontmatter`.

## P01 — Versions and build boundaries

| Item | Result |
| --- | --- |
| Version `0.9.0` | package.json, package-lock.json, manifest.json, versions.json, `KOSMOS_VERSION`: `npm run check:versions` pass |
| Obsidian minimum | `minAppVersion` and `versions.json["0.9.0"]` set to `1.13.0` |
| Engine and Three pins | unchanged: `check:lockfile` pass, `check:renderer-provenance` pass |
| MCP test client | `@modelcontextprotocol/client@2.4.0` (Apache-2.0), exact, devDependency only |
| Shared contracts | `src/personal-notes/types.ts` (`kosmos-personal-notes/1`) |

No MiniSearch, Express, database or runtime MCP SDK was added.

## P02 — Settings migration and profile isolation

| Item | Result |
| --- | --- |
| Schema | `AGENT_SETTINGS_SCHEMA = 11`; `activeProfile` and nested `personalNotes` |
| Migration | fresh, baseline 9, patch 10 (with and without a valid recorded prior sensitivity) and corrupt settings tested through `migrateAgentSettings` (`test/personal-profile.test.mjs`) |
| Sensitivity rewrite | `enablePersonalNotes` / `disablePersonalNotes` removed; switching profile never changes `defaultSensitivity`; a patch-10 lowering is restored from its recorded prior value, otherwise the connector stays stopped with a notice |
| Personal token | runtime-injected, never read from or written to persisted settings; the existing profile's `agentToken` is rejected on the Personal connection |

## P03 — Scope, corpus and graph

| Item | Result |
| --- | --- |
| Scope helpers | replaced; strict vault paths, segment-boundary and case-sensitive matching, exclusions win, `/` is the only whole-vault value and excludes everything when listed under exclusions |
| Reproduced bad inputs | `Notes/../Private/a.md` under `Notes`, `/etc/a.md` under `/`, `private/a.md` under `Private`: all rejected (`test/personal-scope.test.mjs`) |
| Read policy | one `PersonalReadPolicy` with a monotonic generation; config directory, `.git`, operational paths, credential guides and selected import reports always excluded |
| Read decision | no authored sensitivity: readable when selected; valid authored sensitivity: existing ceiling; invalid authored sensitivity or unparseable frontmatter: denied with a local diagnostic |
| Corpus | in-memory only, stable path order, 4 concurrent reads, whole-file skip over 5 MiB, 128 MiB budget, atomic revisions |

## P04 — Optional deterministic tagging

| Item | Result |
| --- | --- |
| Modules | `frontmatter-patch.ts` (byte-preserving), `tagging.ts` (frozen plan), `tagging-writer.ts` (hash-checked, per-file serialized, backup manifest `kosmos-tagging-backup/1`), `lineage.ts` |
| Independence | timestamps, unique IDs and supersession plan and apply separately; no `gkx_version` is added; no full GKX conversion |
| Safety | malformed YAML, duplicate keys and unsupported value shapes stop the write; body, line endings, BOM, comments and unrelated properties preserved; stale previews skipped |
| Dependency | none added: built-in scanner plus an injected strict YAML parser |
| Tests | `test/personal-tagging.test.mjs`, `test/personal-lineage.test.mjs` |

## P05 — Bounded memory-only search

| Item | Result |
| --- | --- |
| Worker | built before `main.js` as `dist/kosmos-personal-search-worker.txt`, embedded as text, started from a Blob URL; no remote download, no persistent index |
| Query contract | AND across title 3, alias 2, tag 2, path 1, body 0.5; quoted phrases; unclosed quotes and over-limit queries rejected; NFC and lowercase matching with original-spelling excerpts through a sparse offset map |
| Limits | whole-file skip and `partial` state instead of a stored prefix; coverage counted only inside the requester's scope; filter applied before matching |
| Failure | worker failure rejects with `search_unavailable` and offers retry; no main-thread fallback |
| Tests | `test/personal-search.test.mjs`, `test/personal-search-worker.test.mjs` (worker_threads adapter), `test/browser/personal-search-worker.spec.ts` (real Blob worker in Chromium) |
| Measurements | [PERFORMANCE.md](PERFORMANCE.md) |

## P07 — Read service, pagination and lineage

| Item | Result |
| --- | --- |
| Tools | `search_notes`, `get_note`, `get_related`, `get_lineage`, `vault_overview` from one `PersonalQueryService` behind REST and every MCP era |
| Pagination | `kosmos-personal-notes/1`: UTF-16 offsets, exact slices, SHA-256 of the raw source re-checked on every page, no inserted prose, no surrogate split, `note_changed` and `note_too_large` |
| Denial | missing and excluded notes return the same `not_found`; non-Personal REST routes and hidden tools are denied on direct calls |
| Tests | `test/personal-pagination.test.mjs`, `test/personal-api.test.mjs`, `test/personal-server.test.mjs` (real sockets) |

## P08 — Dual-era MCP and bridge

| Item | Result |
| --- | --- |
| Adapter | `src/plugin/mcp-compat.ts`: classification by presence of modern markers, validated legacy lifecycle, stateless legacy HTTP, minimal legacy tool and result shapes |
| Batches | `2025-03-26` batches over HTTP (request-scoped event stream) and stdio (split and aggregate) |
| Bridge | per-process negotiated revision, `2024-11-05` stdio lifecycle through an internal carriage, clean stdout, pending requests aborted on stdin close |
| Not included | native deprecated HTTP+SSE (`/sse`, `/messages`) |
| Matrix and proofs | [MCP-COMPATIBILITY.md](MCP-COMPATIBILITY.md); `test/mcp-compat.test.mjs`, `test/mcp-bridge-compat.test.mjs` |

## P06 — OneNote and Keep workflow

| Item | Result |
| --- | --- |
| Onboarding | "Add notes": source, official guide link, Open Importer, review results, choose folders, index |
| Importer adapter | guarded detection of the Importer and its version; command `obsidian-importer:open-modal` with a command-palette fallback; never throws |
| Status | "Files present" inventory; reports are selected by the user from any file (no English-dependent discovery); unknown counts shown as unknown |
| Real Obsidian, Importer 3.1.17 installed | detection, version and "Open Importer" opening the Importer's own window: pass (scripted trial) |
| Conversion trials (I01 to I05) | **not run**: need real Takeout and OneNote exports or accounts. Pending owner trials |

## P09 — Quick Connect and network

| Item | Result |
| --- | --- |
| One configuration source | `connectionConfig()` in `src/plugin/connect-snippets.ts`, used by the settings tab, the Connect window and the generated guide |
| Targets | "This computer" and "Another computer / agent server"; `0.0.0.0` and loopback refused for a remote target; a Windows bridge path refused for a POSIX agent |
| Readiness | `connect()` resolves on the listener's `listening` or `error` event; port in use is reported |
| Connection test | real HTTP: authenticated `server/discover`, `tools/list`, `search_notes`, `get_note` on a canary |
| Token | device-local (secret storage, device-local storage as fallback), never in `data.json`, notes or the generated guide; Rotate and Disconnect |
| Second machine (N02, N01 remote half) | **not run**: no firewall change was made on the build machine. Bind addresses checked from the same machine only |

## P10 — User interface and regression

| Item | Result |
| --- | --- |
| Views | Add notes, Search my notes (keyboard navigation, one delegated listener, abort per keystroke, retry on worker failure), Optional tags, This note supersedes…, Connect my AI, settings section |
| Host contract | the UI calls the plugin only through `PersonalPluginHost` (`src/personal-notes/plugin-host.ts`); no casts around it |
| No-write | with tags off: load, index, search, connect and agent reads call no write API (`test/personal-plugin.test.mjs`) and changed no file in real Obsidian |
| Existing profile | tools, selectors, output shapes, Nextcloud, renderer, standalone and mobile viewer: existing suites pass unchanged |

## P11 — Qualification

| Item | Result |
| --- | --- |
| Independent review | six confirmed defects; five fixed with regression tests in `test/personal-review.test.mjs`, the sixth (offset-map memory) fixed afterwards. The most serious: a `file:` path let an agent read Markdown outside the shared selection, including outside the vault |
| Documentation check against code | eleven gaps found and fixed (Personal guide, older-clients toggle, import hold, `get_note` lineage fields, `get_lineage` key naming, profile-switch stop flag, session record, accepted host names, texts) |
| Node suite | `npm run verify`: 640 tests pass; version, lockfile, artifact, invariant and renderer-provenance checks pass |
| Browser, required tier | `npm run test:browser:chromium` (chromium and mobile-chromium, including `renderer-stability.spec.ts`): see the verification log |
| Real Obsidian | scripted trial of the packaged archive: see [ALPHA-TEST.md](ALPHA-TEST.md), "Trials run on the build machine" |
| Performance | [PERFORMANCE.md](PERFORMANCE.md), [PERFORMANCE-AGENT-API.md](PERFORMANCE-AGENT-API.md), [RENDERER-STABILITY.md](RENDERER-STABILITY.md). Timings inside Obsidian with the 3D view open are not measured |

## P12 — Alpha archive

| Item | Result |
| --- | --- |
| Archive | `release/kosmos-oden-0.9.0-alpha.1.zip` from `npm run package:release`: `kosmos-oden/` (main.js, manifest.json, styles.css, kosmos-mcp-stdio.mjs), `docs/`, LICENSE, THIRD-PARTY-NOTICES.md, BUILD-INFO.json, SHA256SUMS |
| Identity | the archive's SHA-256 is in `kosmos-oden-0.9.0-alpha.1.zip.sha256`; the source commit and build environment are in `BUILD-INFO.json` inside it |
| Install check | installed from the archive into a clean vault in Obsidian 1.15.0 by the scripted trial |
| Not done | no tag, no release, no merge to `main` |

## Additional scope requested by the owner

| Item | Result |
| --- | --- |
| Star and planet rendering stability | six defects fixed with regression tests; see [RENDERER-STABILITY.md](RENDERER-STABILITY.md). Visual baselines unchanged relative to the unmodified branch |
| Faster retrieval, Personal profile | worker search replaces per-query vault reads; see [PERFORMANCE.md](PERFORMANCE.md) |
| Faster retrieval, existing profile | per-graph structure caches with byte-identical output; see [PERFORMANCE-AGENT-API.md](PERFORMANCE-AGENT-API.md) |

## Verification log

| Commit | Command | Result |
| --- | --- | --- |
| `c796139` (baseline) | `npm run verify` | pass |
| `cebe8d9` (patch) | `npm run verify` | pass |
| `99c59bc` (P04 + P08) | `npm run verify` | pass, 505 tests |
| `0ace4a4` (wave 1 complete) | `npm run verify` | pass, 573 tests |
| `756118b` (server wiring) | `npm run verify` | pass, 590 tests |
| `fd71026` (plugin and UI wiring) | `npm run verify` | pass, 629 tests |
| `fd71026` | `npm run test:browser:chromium` (one worker) | pass, 52 tests |
| `b9142fd` (review fixes) | `npm run verify` | pass, 635 tests |
| `cf746ed` (fix-up packet) | `npm run verify` | pass, 640 tests |
| `cf746ed` | `npm run test:browser:chromium -- --workers=2` | 50 pass, 2 time out at 30 s under GPU contention on the build laptop: `standalone.spec.ts` "All links gates connection drawing" (a 0.8.4 test) and `renderer-stability.spec.ts` "lays out identically across reloads" (now marked slow). Both spec files pass 15 of 15 with one worker. Not checked whether the 0.8.4 baseline shows the same two-worker timeouts |
| `cf746ed` | `npx playwright test --project=chromium test/browser/personal-search-worker.spec.ts` | pass |
| `cf746ed` | `npm run test:visual` | `overview-high` and `overview-lite` pass; `star-focus` differs by 104,657 px, the same as the unmodified branch (reference image out of date before this release; not refreshed) |
| `cf746ed` | `npm run bench:personal-search` (idle machine) | 10,000 notes, 51 MiB: searchable in 4.1 s, warm search p50 40 ms / p95 102 ms, edit visible in 0.29 s, peak RSS 470 MiB, no main-thread long task in Chromium during indexing, search or edits |

One timing-sensitive baseline test (`server-lifecycle`, authorization change
during a read) raced its 70 ms deadline while other builds loaded the machine;
it now uses a deadline the case cannot race (`98c2f8b`).
