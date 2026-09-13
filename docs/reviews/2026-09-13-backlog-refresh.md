# Backlog refresh — 2026-09-13

Live GitHub state and fetched history were checked against main `3c6611d`
and candidate `edce0f9`. This supplements the September 12 disposition; it does
not replace historical findings or certify all unique behavior integrated.

| PR | Verified head | State | Changed paths: identical / absent / different in candidate |
| --- | --- | --- | --- |
| 27 | `a326f7e9b72e278d996ab8276284ff7e10c1f666` | Open, unmerged | 0 / 5 / 9 |
| 28 | `eb8486aa4c7c51b0c63869a4139c748c69b63745` | Closed, unmerged | 0 / 0 / 2 |
| 38 | `fbec1f9daeb4c3cc258ddec0d046adc2dac3483d` | Open, unmerged | 2 / 147 / 26 |
| 41 | `65e9354f220b19a16c67504ff228e58caf8128ca` | Open, unmerged | 3 / 150 / 29 |

Counts compare Git blobs for paths changed between each PR's merge base and
head. They are not semantic equivalence counts. In particular, historical `okf-*`
paths may have modern `gkx-*` replacements. Vendor files contribute to the large
absent counts for PR38 and PR41.

PR27 still proposes a historical provenance wording change in
`THIRD-PARTY-NOTICES.md`; preserve existing notices pending source evidence.
Its branding checker also needs independent assessment before adoption.
PR28 changes naming and old pin descriptions, not an additional runtime feature;
its old Engine coordinate must not replace the current exact pin.

PR38 and PR41 retain absent desktop preparation, Tauri shell/sidecar, vendored
glib, event debouncer, reconciliation and self-write suppression files, together
with their tests and qualification documents. Review those against current host
contracts and Engine coordination before selecting code. Neither whole tree is
approved for replay, and B1 remains open until the remaining behavior is accounted
for and required platform qualification passes. No PR or branch was deleted.

Main's PR81 was integrated into the candidate. Its Engine `777ba17` is an ancestor
of the candidate's `f2bafb7`; the newer pin is retained. The earlier qualification
report remains unchanged. Merge resolution changes only documentation relative
to the previously verified candidate; dependency pin validation passed, and the
481-test receipt remains scoped to the unchanged executable files.

## Retained host code review

Inspection of PR41's exact head above found that its debouncer, reconciliation
classifier and self-write ledger are exposed through a test entry point, with no
production callers in that tree. Copying those files would not wire a host.
Current Engine owns `ManagedMocCoordinator`; reuse its durable admission and
recovery boundary when implementing the host. Its revision overflow correction
is separately documented in the coordinator consumer report.

The retained `src-tauri/src/sidecar.rs` has the following concrete follow-ups:

| Boundary | Source observation | Required repair or qualification |
| --- | --- | --- |
| CLI arguments | Launch passes `--notes`, `--status-file`, and `--port`; current Engine accepts these flags | Verify the packaged executable's actual version, identity and behavior; flag compatibility alone is insufficient |
| Executable discovery | Resource, adjacent-executable and development-state candidates are selected with `is_file()` | Bind the selected binary to the release manifest and reject mismatching bytes before launch |
| Version discovery | `sidecar_version()` uses synchronous `Command::output()` without a deadline | Bound the probe, terminate/reap a stalled process, and keep the shell responsive |
| Windows state protection | `owner_only_directory` and `owner_only_file` apply Unix modes but are no-ops on non-Unix platforms | Establish and test Windows ACL policy; inherited permissions have not been inspected and are not proven unsafe or owner-only |

These findings are source review, not Windows runtime acceptance. No sidecar was
started and no permission or credential configuration was changed by this review.
