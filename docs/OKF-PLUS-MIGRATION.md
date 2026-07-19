# OKF+ 2.2 to 2.3 Migration Behavior

Beta.9 does not silently rewrite 2.2 notes. It reads them through `compatible`
mode and projects their flat fields into the v2.3 origin-separated model with
migration and authority diagnostics where origin cannot be proven.

The existing **Mark notes in OKF+ format** and **Upgrade all to 2.2** workflows
remain explicit, previewed, hash-bound, backed-up compatibility tools. They do
not claim to emit canonical nested 2.3 notes.

A future governed 2.3 writer must produce a reviewable proposed patch, preserve
unknown fields and source bytes, prohibit automatic epistemic promotion or
sensitivity reduction, recheck source hashes, and require authenticated
authority for consequential changes. Until then, use the validating projection
and diagnostics to plan manual or separately governed migration.

Modes are:

- `strict-v2.3`: canonical nested 2.3 source;
- `compatible`: versioned legacy source projected without rewrite;
- `legacy`: unversioned recognizable metadata projected conservatively.
