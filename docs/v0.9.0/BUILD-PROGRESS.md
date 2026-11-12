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
