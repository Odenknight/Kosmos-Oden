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

## Official CLI build

The official `@tauri-apps/cli` 2.11.4 package was subsequently installed in an
isolated tool directory after checking its registry repository identity. Project
JavaScript dependencies were unchanged. At source
`872c35eb29859d7b6b72b99b505a64d5c62cf414`, `tauri build --debug --no-bundle --ci --
--locked --offline` passed, including the frontend preparation hook. It produced
a Windows executable of 13,311,488 bytes, SHA-256
`c29cf34cba407bcecbafd86f133840d4665d9d8ac63bbb6413e592a5720498fc`.
The embedded Engine manifest remained null. This supersedes the earlier missing
CLI observation; it proves the actual CLI build, not installer creation, release
signing, visible app behavior or Engine-enabled native UI.

The repository version check now includes Tauri config, the Cargo shell package,
and its lockfile entry. Each was temporarily changed to 0.0.0 independently; all
three mismatches were refused, originals restored, and the normal check passed.
Dependency/vendor versions remain independent. The native manifest's explicit
empty feature lists observed after the CLI build are retained; the earlier build
receipt identifies the base commit, with this equivalent manifest normalization
present in the working tree rather than committed at that time.

## Internal installer generation

At `8b1d9a32d6060ecfda86921894dbc7386cbc7a9a`, the official CLI command
`tauri build --debug --bundles nsis --ci -- --locked --offline` generated the
Windows x64 installer. Tauri downloaded its NSIS 3.11 and utility 0.5.3 artifacts
and reported hash validation. The installer is 2,767,905 bytes, SHA-256
`3bf6ab84273a59cb9276ce8c25838e9d4b688ef2f481d2d53e73362695936db0`.
Authenticode status is `NotSigned`. No installer was executed and the Engine
manifest remains null. This proves internal debug installer generation only;
installation, upgrade/rollback, signing and visible UI remain unqualified. NSIS
packaging patches the built application with bundle-type information, so its
executable must not be identified using the earlier unbundled binary receipt.

## Silent installer lifecycle qualification

The generated debug installer was subsequently tested on Windows with an existing
WebView2 runtime. Silent installation and same-version reinstallation returned
exit 0 in a dedicated test directory; `/NS` disabled shortcuts and omission of
`/R` prevented application launch. Ordinary silent uninstall removed the app
binary and uninstall registration. An unrelated synthetic file placed in the
installation directory survived reinstall and uninstall.

The installed executable SHA-256 was
`8d829221c098d2013bba7aae4f6bb118102b08684b528947d65d4b28f8f4b34b`.
It differs from the post-build cache executable at three bytes representing the
bundle marker (`NSS` versus `UNK`); artifact identities must remain separate.
The installer identity and source commit are those recorded above.

The first test supplied a forward-slash `/D` destination, which the installer
ignored in favor of its default per-user directory. That test installation was
removed without requesting application-data deletion. Repeating with an absolute
backslash Windows path honored the dedicated directory. Qualification scripts
must check the actual registered location before reporting success.

This proves only silent installation, same-version reinstall, and ordinary
uninstall with an unrelated installation-directory file. It does not qualify
cross-version upgrade or rollback, application-data preservation, signing,
visible UI behavior, or Engine-enabled operation. The Engine manifest remains
null. No existing vault records were used by these tests.

## Dialog worker and late completion handling

Corpus selection and redacted diagnostic export now run in the existing
worker-owned admission helper through a separate single-dialog slot. An open
dialog or slow export therefore does not occupy the sidecar control or credential
slot, and repeated dialog operations are refused rather than queued. This moves
the synchronous picker and export work out of the native command handler.

The generated bridge now ignores obsolete folder-selection, Stop and diagnostic
results after a newer connection action. A regression exercises all three late
completion cases and checks status, Start-button state and absence of navigation.
Seven generated-bridge/readiness tests passed. Native compilation, 18 ordinary
Rust tests and all-target clippy passed; the explicit Engine process qualification
was ignored in this run. Visible dialogs and full native responsiveness remain
unqualified. Diagnostic file replacement still requires a separate review: its
current remove-before-rename sequence does not preserve the original on failure.
