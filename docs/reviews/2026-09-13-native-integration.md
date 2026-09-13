# Native integration candidate

The current upgrade imports the tracked native shell, preparation script and
qualification history from desktop branch commit `98a7023`. It does not merge
the older branch's viewer or Engine dependency. Cargo and Tauri versions now
match Kosmos 0.8.3; the current canonical standalone viewer supplies generated
native HTML. The existing GLib vendor patch and its license records are retained.

`node scripts/prepare-desktop.mjs` generated the native HTML from the current
standalone artifact. Preparation no longer recursively removes its output
directory. With that real viewer, the integrated Rust suite passed 17 ordinary
tests; the explicitly configured process qualification was ignored. All-target
clippy with warnings denied and the repository version check passed.

The source release manifest remains `null`, and bundling remains disabled.
Historical process receipts apply to their original desktop source commit; they
are not reassigned to this integration. Rerun explicit discovery/recovery against
the integrated source before claiming that gate here. Visible native UI, final
resource packaging, non-Windows qualification and the broader release gates
remain open. PowerShell/C# exploratory helpers remain in the historical desktop
branch; the integrated runtime uses direct Rust Windows APIs.

## Integrated process requalification

At `bd72794d460987e611271ca4570ccf4952b33cc2`, the explicitly selected process
qualification passed in 26.25 seconds with the reviewed Engine `c4940c4` binary.
It rejected an invalid discovery candidate, selected the verified executable,
indexed synthetic data through five actual recoveries and refused the next
restart at the retry limit. The final child was absent afterward and the source
manifest restored to `null`. This is new integrated-source evidence, not reuse
of the historical desktop receipt.

Visible startup remains open. The preparation bridge currently redirects on
process liveness, whereas the viewer attempts its IPC credential read once.
Readiness coordination must be implemented and tested before claiming reliable
native startup; a process existing does not prove its credential or HTTP service
is ready.

The preparation bridge now shares a bounded readiness helper for Start and
Reconnect. It waits for native credential retrieval and an authenticated root
response reporting `serving` before navigation. Stop or corpus selection changes
invalidate the pending attempt, and stale completion cannot redirect or overwrite
the current status message. A stalled credential request ends the attempt without
queueing more reads. Tokens stay in request headers, never navigation URLs.

Four component tests pass: delayed credentials/indexing, cancellation of a late
serving response, stalled IPC without retry, and refusal of an unauthorized
serving-shaped response. Preparation generated the current native viewer and
the script syntax check passed. Visible native interaction remains unqualified;
these component checks do not certify that full UI flow.

Generated-bridge tests execute the actual prepared script with DOM and IPC
fixtures. Start and Reconnect do not navigate before credential readiness; Stop
prevents late navigation and preserves its status message. These two checks and
the four helper checks passed in the complete repository verification: 488 tests,
zero failures/skips, plus type/build/version/lockfile/artifact/invariant/provenance
checks. The mocked IPC does not reproduce native worker contention, so Stop while
the credential worker owns admission and visible interaction remain open.

Credential IPC now has its own single-worker admission flag, while Start, Stop,
Reconnect and status/version retain their control admission. Both use the same
worker-owned cleanup helper, so abandoned calls cannot release admission early.
A blocked-worker regression proves another credential read is refused while a
control operation completes. The native suite passed 18 ordinary tests with the
explicit process qualification ignored; all-target clippy passed. This removes
credential-read contention from Stop, but does not prove bounded Stop latency
during a long control operation or visible native interaction.

Native dev/build hooks now use frontend-root-relative script paths and pass
`--build` to preparation. That mode invokes the existing standalone builder
before injecting the bridge, preventing stale viewer output from being packaged.
The hook command ran successfully from the repository frontend root, and all six
readiness/generated-control checks passed. Tauri's
[build implementation](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-cli/src/build.rs)
passes the frontend directory to its hook runner. The earlier `../scripts` path
was therefore unsuitable for this layout. This checks the hook command directly;
the Tauri CLI itself is not installed here, and installer creation is unqualified.
