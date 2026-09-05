# Design and implementation review — 2026-09-05

The offline viewer and shared graph/renderer architecture are working, but the
complete standalone uplift is still an internal alpha. This review repaired
several mismatches between visible controls, exported data, and the read-only
connection contract. It does not qualify the unfinished service, managed-MOC
write plane, or desktop distribution as a released product.

Reviewed working tree: `50ebc3c168cf4e34137faf47e0b297b00db1a753` plus the
changes accompanying this report. Version remains `0.8.0`. Existing README edits
and untracked adoption/adapter packets were present before review and preserved;
their presence does not make them part of the compiled application.

## Repaired findings

| Priority | Before | Change and evidence |
| --- | --- | --- |
| High | A remembered folder name was interpolated into startup-button HTML. Names originating outside the application could become markup. | Render labels and descriptions with text nodes. Browser regression verifies an HTML-shaped folder name remains literal text and creates no image or script effect. |
| High | Loopback validation checked the initial address, but fetch followed redirects by default. A local endpoint could redirect outside the promised loopback boundary. | Connection, health probes, and traversal subscriptions reject redirects. A real loopback HTTP redirect test checks that no external destination is contacted and the failure is shown. |
| Medium | Demo, sibling `graph.json`, and service views displayed export actions while graph export consulted only the local Markdown index. Downloads could be absent or refer to a previous local source. | Track the active source graph separately, export that graph, and retain attachment paths. Demo supplies its actual graph. Browser tests inspect downloaded JSON for each source mode. |
| Medium | Graphiti export was offered in source modes without local Markdown bodies. | Offer it only when the active source has an indexed local corpus. Live graph capability does not imply a working episode export. Local folder Graphiti download remains available and is exercised. |
| Medium | Stopping a directory monitor did not invalidate an already-running scan. Its completion or failure could update a replacement view. Demo selection also left an old monitor running. | Ignore callbacks after stop/pause, reject further scans after stop, and stop monitoring on demo selection. Deferred-success and deferred-failure tests cover cancellation. |
| Medium | The expanded startup card could extend beyond a short viewport; connection errors were stacked behind its opaque overlay. | Constrain card height and scroll its contents. Show error alerts above the overlay. Tests exercise the connection controls at 390×600 and use hit testing to verify the error is not obscured. |

The new browser flow suite is included in both the Chromium CI command and the
Firefox/WebKit advisory command. No visual baselines were approved or changed.

## Design-to-runtime assessment

| Intended behavior | Evidence and current boundary |
| --- | --- |
| Markdown is the source of truth; ordinary viewing is read-only and offline. | A real temporary folder is imported from the built `file://` HTML. The rendered graph is downloaded, Graphiti export is invoked, source bytes remain identical, and no HTTP(S) request occurs in that flow. This is a small fixture, not an exhaustive filesystem audit. |
| One semantic engine underlies the viewer, plugin and API. | The build consumes exact-pinned `gkos-engine` 2.1.1 at `f4dfda16eac746c667cf042f908a918d9acc6713`. Existing tests cover parser, resolver, lineage, temporal projection, incremental changes, Graphiti, and REST/MCP parity. |
| The same offline renderer supports standalone and Obsidian. | Both HTML artifacts build; the sandboxed plugin-iframe harness renders successfully. Browser tests cover desktop/mobile controls, WebGL2 fallback, traversal, heatmap opt-in and replay. Real Obsidian application lifecycle and settings interactions were not exercised. |
| Credentials provide explicitly bounded read access. | Existing tests cover bearer authentication, sensitivity filtering, LAN restrictions, origin/host checks and read-only API behavior. Service-client browser tests use synthetic capability/graph responses. They do not prove compatibility with the separate unified runtime. |
| Proposals stay pending until reviewed; writes require separate authority. | Existing proposal/decision/apply tests pass. Navigation Effects defaults remain off. Untracked adapter/adoption packets were not absorbed or activated. |
| Native shell and portable distribution are ready to ship. | Not established. Rust source compiles and its five tests pass on this Windows host; no real sidecar launch, native GUI walkthrough, installer, signing, notarization, or cross-platform distribution test was performed. |

## Validation

Environment: Windows, Node `v24.18.0`, Cargo `1.98.0`, installed lockfile-pinned
dependencies. This run used the existing dependency installation; it was not a
fresh `npm ci` or a clean-clone qualification.

- `npm run verify`: **260 passed, zero failed or skipped**; typecheck, production
  build, versions, lockfile, artifacts, invariants and renderer provenance pass.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml`: **5 passed**;
  no failures or ignored tests.
- Successive production builds produce identical SHA-256 hashes for `main.js`,
  `kosmos-oden-stand-alone.html`, and `dist/kosmos-embed.html`.
- Existing browser checks: **38 passed, 2 existing skips** across Chromium,
  mobile Chromium, Firefox and WebKit. Context-loss tests intentionally skip
  Firefox/WebKit because that extension is only qualified on Chromium.
- New browser flow suite: **24 passed** across those same four profiles in the
  final focused run. The earlier integrated run exposed test-fixture issues
  (a missing mobile viewport declaration and unsupported WebKit mock redirects);
  the fixtures were corrected without weakening product assertions.
- `npm run test:visual -- --workers=2`: **3 passed** against the existing
  Chromium overview-high, overview-lite and star-focus baselines.
- `git diff --check`: passes. Logs and inspection screenshots are retained
  locally under `.codex/review-2026-09-05/` (ignored working evidence).

Standalone artifact SHA-256:
`1795d3198c31914dd70731bd8cbc66324a2bc156eeee06b3d7cf984c6de4854d`.

An exploratory run included mobile screenshot comparisons for which the repo
has no committed baselines. Those three comparisons failed for missing images;
the automatically written candidate images were removed. This is an open visual
qualification gap, not three product-rendering failures or three passes.

## Remaining qualification work

1. Exercise the built plugin in a real Obsidian vault, including startup/shutdown,
   settings, note edits, Secret Storage and optional Nextcloud synchronization.
   Current host mocks and the iframe harness do not substitute for this.
2. Integrate and test the compatible unified Engine service with actual
   credentials, graph refresh, event reconnect/revocation, and desktop lifecycle.
   The service tests here use controlled fixtures; no live-service E2E is claimed.
3. Complete and qualify the Navigation Effects host adapters, adoption,
   coordinator, journal/archive/lease, and recovery paths before enabling writes.
   Source primitives and default-off settings are not a completed write system.
4. Qualify real sidecar binaries and native desktop behavior on each distribution
   target; obtain reviewed mobile visual baselines and platform release evidence.

The current result supports continued offline-viewer and plugin source
development. It does not support changing the repository's internal-alpha
designation or claiming the entire uplift is functionally complete.

## 0.8.1 integration evidence

This section records the clean integration run after the 0.8.1 preparation
commit `87358670d108f894e1df7679df903810494182d2` was merged with `origin/main`
at `3aab1e337a8442d6bc2463cab43cb9b4191291a2`. The resulting integration merge
is `78c127e96ef29e5914d8f751babf8a1d6305e0d8`.

The installed Engine dependency is the exact development pin
`41172b91970aac869c161f4842e3526a62fd1fd9`, declared by the package as 2.1.2.
Its Navigation Effects standing remains integration only. This coordinate is
separate from the Kosmos 0.8.1 product version.

Environment: Windows, Node `v24.18.0`, npm `10.9.4`, Cargo `1.98.0`.

* `npm ci`: completed from the merged lockfile with zero reported
  vulnerabilities.
* `npm run verify`: passed with **316 tests**, zero failures and zero skips,
  plus type checking, production builds, version agreement, lockfile pin,
  artifact, invariant, and renderer provenance checks.
* `npm run test:browser:chromium -- --workers=2`: **36 passed** across
  Chromium and mobile Chromium.
* `npm run test:browser:full -- --workers=2`: **34 passed** across Firefox and
  WebKit.
* `npm run test:visual -- --workers=2`: **3 passed** against the existing
  Chromium baselines.
* `cargo test --locked --manifest-path src-tauri/Cargo.toml`: **5 passed**,
  with zero failures or ignored tests.
* `git diff --check`: passed before the integration commit.

An initial attempt to run independent Playwright commands at the same time
contended for the configured local test server port. The complete Chromium,
Firefox, WebKit, and visual suites were then run with bounded concurrency and
passed as listed above. No visual baseline was added or changed.

The first remote clean build found that `scripts/build.mjs` did not regenerate
`dist/kosmos-corpus-exclusions.mjs`. The local run had passed because that
ignored file remained from an earlier build. The script now emits the bundle,
and a local verification run passed after the generated file was removed first.

GitHub dependency review initially reported moderate advisory
`GHSA-wrw7-89jp-8q8g` in `glib` 0.18.5 through the Tauri Linux GTK dependency
path. The published fix in `glib` 0.20.0 is outside the compatible GTK
generation selected by Tauri 2.11.5. The repository now uses the original
0.18.5 crate source through a Cargo path override and applies the exact upstream
two line pointer correction. The original crate SHA256, license, version,
upstream pull request, and correction commit are recorded beside the vendored
source. A focused optimized Linux test exercises forward, backward, and mixed
direction `VariantStrIter` traversal. The security workflow has no exception or
advisory bypass. Final dependency review results are recorded below.

The local Windows rerun passed `npm run verify` with **317 tests** and
`cargo test --locked --manifest-path src-tauri/Cargo.toml` with **5 tests**.
Cargo metadata resolves `glib` 0.18.5 from
`src-tauri/vendor/glib-0.18.5/Cargo.toml` with no registry source. The available
Debian WSL environment could not run the Linux regression because its Cargo
1.82 toolchain predates stable Edition 2024 and it lacks the required GLib
development package. The Ubuntu CI job is the Linux execution evidence.

These results qualify the merged source against the listed repository checks.
They do not supply the remaining real Obsidian, live unified service, managed
MOC write runtime, packaged desktop, signing, notarization, cross platform, or
soak evidence described above.
