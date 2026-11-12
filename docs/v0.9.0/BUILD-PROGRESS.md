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

One timing-sensitive baseline test (`server-lifecycle`, authorization change
during a read) raced its 70 ms deadline while other builds loaded the machine;
it now uses a deadline the case cannot race (`98c2f8b`).
