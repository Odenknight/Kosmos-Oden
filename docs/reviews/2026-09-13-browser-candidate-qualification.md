# Browser candidate qualification

Date: 2026-09-13.
Candidate code: `f04d76a`. Reading-guide checkpoint: `f402bc4`.

The full browser matrix completed with 231 passes, three failures, and two skips.
Command: `npx playwright test --workers=2`.
Projects: Chromium, Firefox, WebKit, and mobile Chromium.
This is incomplete qualification. It is not a release approval.

The failures were the desktop `visual: star-focus` comparisons in all three browsers.
A targeted second run used:

```sh
npx playwright test test/browser/visual.spec.ts --grep star-focus --project chromium --project firefox --project webkit --workers=2 --output=test-results-repeat-focus
```

All three comparisons failed again.
Each browser's actual PNG was byte-identical to its first capture.
That proves repeatability for these two runs on this workstation.
It does not establish that the candidate appearance is correct.

The reference images were last committed at `13a13b5`.
Later commit `490a338` corrected connection-line visibility.
The current renderer defaults All links to off and gates line meshes on that setting.
The full matrix passed the functional All-links drawing test.
Commit `82f16d7` also moved whole galaxies 25 percent closer.
These changes are relevant to the old/current image differences.
They have not been isolated as an explanation of every changed pixel or label.

The visual test explicitly requires independent approval of baseline updates.
No tracked reference image was changed during these runs.
Three mobile reference images were already untracked and unapproved.
Passing comparisons against those files do not establish approved mobile visual acceptance.
The two skipped tests do not count as passed checks.

Local evidence preserves both run logs, old/current/difference images, and repeat hashes.
The image review is in the private task evidence directory under
`visual-baseline-review-20260913/REVIEW.md`.
No private vault data was used in these synthetic captures.

Remaining work includes review of desktop and mobile references, any necessary renderer fixes,
and final installed acceptance of durable comet routes and registered agent names.
This browser result does not close the other build gates.
