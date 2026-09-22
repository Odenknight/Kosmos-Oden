# GitHub candidate check refresh

Observed through the GitHub API on 2026-09-13. This supersedes the earlier queued
check observation for these exact heads, not their unresolved product gates.

| Candidate | Exact head | Successful | Skipped | Unfinished |
| --- | --- | --- | --- | --- |
| [Kosmos PR80](https://github.com/Odenknight/Kosmos-Oden/pull/80) | `c50e737006b58c156900e42a6c6ba5d4d801e9cc` | 9 | 1 | 0 |
| [Engine PR72](https://github.com/Odenknight/GKOS-Engine/pull/72) | `c4940c4efd98e2cab9118b62c25e708737f62bdb` | 61 | 2 | 0 |

Both PRs were open, draft and mergeable. Counts are check-run entries in the PR
rollup, including repeated workflow runs; they are not counts of distinct tests.
Kosmos skipped one dependency-review run. Engine skipped two manual phase-4
retrieval observation runs. Skips provide no acceptance evidence for those gates.

Successful Kosmos entries cover browser, validation, reproducibility and security
workflows. Engine entries include build and platform/runtime watcher workflows.
These outcomes do not certify native UI, the isolated desktop hardening branch,
the required performance/soak qualification, or every named build-plan assertion.
The [remaining build gates](2026-09-13-remaining-build-gates.md) still apply.
No merge was performed. New commits require their own affected checks.
