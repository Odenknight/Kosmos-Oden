# Backlog head review

Live GitHub state checked on 2026-09-13 against candidate `8e7926f`.
This supplements the historical September 12 disposition; it does not replace
its records or certify the entire backlog as integrated.

| PR | Verified head | State | Disposition |
| --- | --- | --- | --- |
| 27 | `a326f7e9b72e278d996ab8276284ff7e10c1f666` | Open | Retain. Its notices change the historical claim from independent development without reference to Google OKF to development informed by it. This needs provenance evidence; branding changes alone do not justify rewriting that claim. |
| 28 | `eb8486aa4c7c51b0c63869a4139c748c69b63745` | Closed | Preserve its exact Engine 1.1.2-era documentation as history. The current product name and immutable Engine 2.2.0 pin supersede that version-specific wording. |
| 38 | `fbec1f9daeb4c3cc258ddec0d046adc2dac3483d` | Open | Preserve as source input. Current native integration is separately documented; replacing the candidate with this tree would remove newer API, workspace, recovery and adoption safeguards. |
| 41 | `65e9354f220b19a16c67504ff228e58caf8128ca` | Open | Compare its additional behavior with PR 38 separately, as below. Do not merge the old tree wholesale. |

## PR 41 additions over PR 38

The exact Git diff contains 14 files. Its runtime change is confined to
`src/standalone/api-feed.ts`: reject ambiguous service origins, including empty
query/fragment markers, and stop traversal retries after HTTP 401/403.
The candidate already rejects credential-bearing origins, paths and nonempty
queries/fragments, and stops retries on 401/403. Its tests cover those behaviors.

The empty `?` and `#` guard was missing: the URL parser reports empty `search`
and `hash` values even though an appended route can become query or fragment
text. The guard is now carried forward, with four origin regression cases.
Those cases failed against the previously built artifact and passed after the
source rebuild. Full `npm run verify` passed: 492 tests, zero failures, plus
type/build/version/lock/artifact/invariant/provenance checks.

PR 41 also checks that the active Engine dependency has a matching `allowScripts`
entry. That guard is now restored against the current dependency specifier.
A subprocess regression test runs the actual checker against isolated copies:
missing, empty, false, string-valued and stale-specifier permissions fail; the
exact current specifier with boolean `true` passes. The current repository check
also passes. No dependency or permission was added or changed. Its historical
dependency pin must not replace the current immutable pin. Documentation and
test changes remain traceable in the retained PR head.

## Remaining source work

PR 38/41 contain local event-debouncer, reconciliation and self-write-suppression
helpers absent from the candidate tree. The pinned Engine already has a durable
managed-MOC coordinator with bounded admissions and recovery, but that does not
prove every historical helper behavior is wired into the product host. Reconcile
those behaviors with the actual supported host, including prepared intents and
authority, before closing that part of the backlog. The broader native and
release acceptance gates also remain open.
