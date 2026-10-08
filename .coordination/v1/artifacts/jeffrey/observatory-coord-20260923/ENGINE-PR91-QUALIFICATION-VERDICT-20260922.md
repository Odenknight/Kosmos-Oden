# Engine PR #91 qualification verdict — the J2 "inventory regeneration" blocker is falsified

**Author**: JEFFREY (GKOS-Engine lane) · **Date**: 2026-09-22 · **Subject**: `Odenknight/GKOS-Engine` PR #91
**Head under test**: `613409c5c982a20e4011f88ab6efcdf399940f0b`
**Verdict**: the gate PASSES at this head, locally and in CI. No inventory regeneration is required.
Nothing here clears a qualification gate: overall qualification remains **HOLD** (integration owner's call).

## 1. Local evidence, on a clean LF clone

`git config core.autocrlf` = `false`; `git status --porcelain` empty; `HEAD` = `613409c`.

| check | result |
| --- | --- |
| `node scripts/runtime-qualification.mjs --check` | **exit 0** |
| receipts | `manifest_sha256` `6a09089d3245ef10f9512dd21f0e9fbdcdc0069895460ba628c85d0387e38361`, `source.sha256` `b257db93e85de062b366b84214980cba53f690d70b94eb8d8f8f7c97ee6b695d`, `tree` `d04e9a00382d1cf2cb1a8ec299b6fa0d1d03c09e` |
| `node --test test/runtime-qualification.test.mjs` | `# tests 13 · # pass 13 · # fail 0` |

## 2. CI evidence at the same head

`gh pr view 91 --repo Odenknight/GKOS-Engine`: `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`,
**63 checks, 0 failing**. `historical-contract-replay` passes on `ubuntu-24.04` and `macos-14` across
runtimes 22, 23 and 24 (workflow runs `35735214698`, `35784070078`).

## 3. Root cause of the reported failure — line endings, not content

Reproduced by experiment: converting `src/service/mcp.ts` to CRLF inside an otherwise clean clone makes
`--check` fail with `Unreviewed candidate bytes`. The gate byte-hashes **every** tracked file
(`scripts/runtime-qualification.mjs` → `sourceSnapshot()` over `git ls-files --cached --others
--exclude-standard`) and binds the whole-source digest to the inventory at
`contracts/runtime-qualification/v1/change-inventory.json`. A Windows checkout with git-for-Windows'
default `core.autocrlf=true` therefore rewrites those bytes and fails the gate even though no source
changed.

`.gitattributes` pins `eol=lf` for a subset of paths only. Proven with `git check-attr`:

```
src/service/mcp.ts: text: unspecified   eol: unspecified   <- rewritten on Windows checkouts
src/service/stdio.ts: text: set         eol: lf            <- pinned, unaffected
```

So the defect is a coverage gap in `.gitattributes`, not a missing inventory regeneration.

## 4. Consequence for the blocked claim

"PR91 is blocked on the inventory regeneration" is falsified. The engine change is gate-clean at
`613409c`; the failure observed on the Windows side is a checkout artifact and reproduces on any
unpinned tracked file. Operational rule for Windows participants: clone with `core.autocrlf=false`
(or `git config core.autocrlf false` before checkout).

## 5. Candidate permanent remedies (held, not applied)

- **Preferred**: extend `.gitattributes` so repo-wide text defaults to LF (`* text=auto eol=lf`) while
  keeping the existing `-text` exceptions for OD-02 imported blobs and byte-hashed receipts. Removes the
  gap for `src/**` and every future file.
- Rejected as default: making the gate normalise line endings before hashing. The manifest's value rests
  on byte governance; normalising would weaken the claim rather than fix the checkout.

Either edit is a source change to Engine and must go through the repository's change gate (inventory +
review). **Prepared, not opened** — awaiting FAC's direction and the gate's approval path.

## Verification of this record

`ENGINE-PR91-QUALIFICATION-VERDICT-20260922.md` — sha256 recorded in `SHA256SUMS` beside it. The two
commands in §1 and the two `gh` calls in §2 are sufficient to re-derive every claim here.