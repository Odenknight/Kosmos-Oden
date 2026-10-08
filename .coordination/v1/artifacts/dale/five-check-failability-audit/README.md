# Five-check fail-ability audit

**Question:** can each of the five checks in `npm run verify` actually reject a
violation of the thing it claims to guard?

**Why it was asked:** `check:artifacts` shipped a guard reading `/method:s*"DELETE"/`
where `\s*` was intended. It reported green while matching nothing a real adapter
would contain (claude seq 13/14 F3, fixed in PR #52, absorbed into #53). Every peer
in this root — including me — had cited "all five checks pass" as release evidence
while one of the five could not fail. That made the other four an open question.

**Base:** `b0c7ee28` (main, post-#53/#54). Node v24.18.0. Throwaway detached
worktree; the repository was not modified and no branch or PR came out of this.

## Method

Per check: record the GREEN baseline, plant **one realistic violation** of the
specific property that check asserts, re-run, record exit code and message,
restore the file byte-for-byte, confirm GREEN again. A check that stays green
under its own violation cannot fail.

Restoration was verified with `git status --porcelain --untracked-files=no`
returning empty, and all five checks GREEN afterwards.

## Result — 5/5 can fail

| check | planted violation | verdict | assertion that fired |
|---|---|---|---|
| `check:versions` | `manifest.json` version bumped to 0.8.4, disagreeing with `KOSMOS_VERSION` | **CAN FAIL** | `manifest.json version 0.8.4 != 0.8.3` |
| `check:lockfile` | a git dependency's `resolved` ref unpinned from a 40-hex commit SHA to branch `main` | **CAN FAIL** | `resolved ref "main" is not a 40-hex SHA` |
| `check:invariants` | `DEFAULT_AGENT_SETTINGS.agentEnabled` flipped `false` → `true` | **CAN FAIL** | `DEFAULT_AGENT_SETTINGS.agentEnabled must be false` |
| `check:renderer-provenance` | external CDN `<script src>` injected into the single-file standalone build | **CAN FAIL** | `kosmos-oden-stand-alone.html loads an external script` |
| `check:artifacts` | session termination reintroduced — `{ method: "DELETE" }` in the stdio adapter | **CAN FAIL** | `stdio adapter reintroduced session termination` |

Each failure message names the intended assertion, not an unrelated guard that
happened to trip first. That distinction is the point of the audit and it cost
one correction to establish — see below.

## The correction worth reading

My first `check:lockfile` mutation replaced the first `#<40 hex>` occurrence
anywhere in `package-lock.json`. The check failed — but on
`package-lock root dependencies.gkos-engine does not match package.json`, a
*different* guard later in the file. The 40-hex assertion itself was still
unproven, and a less careful reading of that run would have recorded
"CAN FAIL" for the wrong reason.

Re-planted by parsing the lockfile and unpinning a `packages[*].resolved` entry
that actually starts with `git+`, which is the only shape the 40-hex guard
inspects. It then fired correctly.

**A check firing is not evidence that the assertion you care about works.**
That is the same error class as the original F3 defect: trusting a green-to-red
transition without confirming which line produced it.

## Standing

No repository change. No claim on any file. Reported at `dale` seq 9.
