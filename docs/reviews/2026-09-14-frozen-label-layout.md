# Frozen capture label layout

Frozen overview captures at time zero displayed area labels stacked at the
top-left. `labelScanT` started at zero, so the first timed rescan never ran.
Initializing it to negative infinity makes the first frame lay out labels
even when time does not advance. No camera, default-link or galaxy-spacing
change is included.

Two frozen mobile checks failed against unchanged `da119b8` renderer source:
visible area labels had empty transforms at (0,0). The corrected candidate
passes eight focused checks: high and lite quality in Chromium, mobile
Chromium, Firefox and WebKit. These are browser checks, not installed Obsidian
acceptance or approval of updated reference images.

The full verification attempt completed 628 tests: 627 passed, one failed,
zero skipped or cancelled. The failure is the native-history private-database
capability test, reporting `HISTORY_STORAGE_UNAVAILABLE`. It is under separate
diagnosis. This run must not be reported as a full pass.

Private logs under the parent workspace's `_Claude-Code/`:

| Log | SHA-256 |
| --- | --- |
| `frozen-label-before-20260914.log` | `4009973961ea10265ee2fe798114bd834f884f5822f7125d2122fb477e45f170` |
| `frozen-label-browser-20260914.log` | `c876e83198ee2a6cc398f4ef5675053dba6144d3b726a443a6b783369229cca2` |
| `kosmos-frozen-label-verify-20260914.log` | `75837b9a9ebfd38b72893753dde7aced86f3f51529ec393fe871dbe38d8d858c` |

A proposed portrait-camera change was removed after its regression passed the
old renderer and failed to establish the reported defect. The patch remains
in private evidence. New overview baselines need independent visual review;
historical unapproved snapshots are preserved.

## Subsequent consumer verification

After the separate SSE denial correction, the uninstrumented `npm run verify`
completed successfully: 632 tests passed, none failed, skipped or cancelled,
and every later version, lockfile, artifact, invariant, provenance and branding
check passed. Log `kosmos-label-sse-verify-20260914.log` has SHA-256
`a2d9f7a3ada30875c6101f875ac07d2c065e15b9c6dc237f7b970275276bc479`.

The earlier history failures remain evidence of unresolved intermittent
behavior; this pass does not establish a history fix. All twelve prior visual
images were separately preserved before generating proposed new baselines.
Proposal generation is not independent visual approval or native acceptance.

## Independently reviewed reference images

The independent Sol reviewer approved all twelve exact images in the
[visual review](2026-09-14-label-visual-independent-review.md). The coordinator
checked the review against the fixed capture code and preserved prior images.
The reference files are bound by the SHA-256 values in that review.
The complete Chromium, mobile Chromium, Firefox and WebKit run recorded
246 passed and two declared context-loss platform skips, with snapshot updates
disabled. Log `kosmos-label-sse-browser-full-20260914.log` has SHA-256
`d73b548e40b7026d08361116675d57bbbdedcd4483cfbcb110313def5f062520`.
The earlier WebKit-lite capture timeout is preserved; neither the later pass
nor image approval establishes native or physical-GPU acceptance.
