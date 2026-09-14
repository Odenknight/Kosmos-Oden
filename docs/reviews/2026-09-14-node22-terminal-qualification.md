# Node 22 terminal qualification

The full Windows x64 Node 22.22.1 run at Engine
`13ff119bbe7a1d9dd686d75267a4eb8f2cc65504` failed on September 14, 2026.
It started at 06:53:46 UTC and ended at 07:15:16 UTC: 1,215 tests,
1,212 passed, two failed, one skipped, zero cancelled. Release qualification
remains false. This supersedes current statements that this run is pending;
historical receipts and prior Node 24 results retain their original scope.

The non-strict CLI publication test expected exit 0 and received 3.
The oversized sparse database test encountered Windows EPERM while renaming
an authority temporary file during fixture activation, before testing the
oversized database. The CLI assertion did not expose the underlying cause.
The two failures must not be assumed to have the same cause.

Later the complete CLI file passed 14 tests in 22.64 seconds, and the sparse
database case passed alone in 1.71 seconds. These focused results establish
that the failures did not recur in those executions, not a full qualification
pass. One earlier filtered command failed its global fixture-accounting hook
and is not counted as a passing file test.

## Retained evidence

Private paths below are relative to the parent workspace's `_Claude-Code/`.
The full receipt and log hashes were rechecked during reboot resume.

| Artifact | SHA-256 |
| --- | --- |
| `engine-node22-full-qualification-20260914/current-runtime.json` | `7379e4799929bbaec197afda3b5706de804f1b00b6afcd7309acc928d1b2932a` |
| `engine-node22-full-qualification-20260914/current-runtime-1.log` | `01b3b6baf17dec63fdcb28d7ee4f26603939c5956918f5e72e17d7940432f67c` |
| `engine-node22-ingest-cli-file-20260914.log` | `482f913fd88df8936b33c902626a9b635dc2a6aefa235f84ba5f175b7861ba43` |
| `engine-node22-focused-ingest-storage-20260914.log` | `62b98374d7aa8d54b6d032f568a333cb13035bf38d76e713ad95cbf226a925db` |

Diagnose the failure paths and improve focused diagnostics before a new full
qualification. Keep every failed receipt, and bind any new run to its exact
source and runtime. Production history and automatic source writes stay disabled.

## Resume reproduction

The two complete test files were run together with a private test-only rename
diagnostic preload. The elevated user-context run reproduced six EPERM failures
replacing `ingest-authority.json`, including the original oversized-database
setup failure. It recorded 92 tests, 84 passed, eight failed, zero skipped or
cancelled. The failure count includes parent subtest accounting. This shows
the sandbox is not the sole cause; it does not identify the Windows component
denying the rename or explain the original non-strict CLI exit conclusively.

The production candidate stayed unchanged. The preload rethrew original errors
without retrying. The earlier sandbox control remains retained separately.
Private evidence: `node22-focused-resume-20260914/receipt.json`, SHA-256
`d2a58864847427235df96c08fcf3772fd59c18cdce7f6a51096070ed167fb197`;
`focused-complete-elevated.log`, SHA-256
`76ddd43d3d517b4d40f0fa3288df9c49a7d983c4ce4cdb5e35b7428fccd0ac9c`.
The failing rename is the final activating-to-active authority witness update,
after the outer pointer is published. `ingest-authority.lock` is a separate
file. An initial lock-only correction was rejected as targeting the wrong
operation. An isolated witness replacement correction is under review. It must
retain phase-appropriate authority checks and atomic publication before qualification resumes.

## Subsequent corrected candidate: full Node 22 pass

Engine `3cab7a28b3b34045e92eca48003720e2d3dd2405` is signed and published in
[draft PR 78](https://github.com/Odenknight/GKOS-Engine/pull/78), stacked on the
native guard branch. The bounded atomic witness retry covers normal activation
and recovery, with authority and artifact checks repeated after each wait.
Independent review and the source inventory check passed. The final affected
CLI/storage run passed 92 tests; deterministic faults cover exhaustion and
temporary, witness, lock, pointer, namespace and during-wait drift.

The full Windows Node 22.22.1 qualification started at 08:18:29.411 UTC and
ended at 08:39:42.172 UTC on September 14. All **1,216 tests passed**, with zero
failures, skips or cancellations. Both command logs match their receipt hashes,
and the frozen worktree remains clean. The receipt retains
`release_qualified: false`.

| Private evidence | SHA-256 |
| --- | --- |
| `engine-node22-witness-3cab7a2-qualification-20260914/current-runtime.json` | `ef8e4defc0b660d022ed8a9b672dd6c5d67de586d6f6d46d712d477de5adfdb3` |
| `current-runtime-0.log` in that directory | `e0af3c9d29a96d73df7cd9c0b3df1829625e805428667c1b123c388d157d4794` |
| `current-runtime-1.log` in that directory | `d4fa6cd8fc8fb4fba9ce6d89800aa78f3d7dccd700b4c96142b1e8b28259ead7` |

This pass does not rewrite the failed `13ff119` run. Updated Node 24
qualification, consumer pin adoption and the remaining product/native release
gates remain open. The consumer still pins `13ff119`.
