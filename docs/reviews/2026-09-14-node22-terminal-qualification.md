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
