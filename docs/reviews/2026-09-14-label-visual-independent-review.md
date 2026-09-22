# Sol independent label visual-baseline review — 2026-09-14

Reviewer: Sol, independently assigned to Astra-Oden. This review inspected the
12 bound PNGs already present in
`.review-upgrade-20260912/test/browser/visual.spec.ts-snapshots`; it did not run
a browser, build, generate images, or update a baseline. The unavailable `O:`
share prevented reading `O:\_Agents\AGENTS.md`, the assigned-agent `INDEX.md`,
and hive recall. Repository evidence remained available.

## Disposition

**APPROVE all 12 exact candidate image bytes as visual-regression baselines.**
Every recomputed SHA-256 matches
`_Claude-Code/label-visual-proposed-manifest-20260914.json`. Approval is limited
to these hashes and the capture contract in `test/browser/visual.spec.ts`; any
changed image or capture input needs another independent review.

| Image | SHA-256 | Disposition | Direct visual finding |
|---|---|---|---|
| `overview-high-chromium.png` | `e46140dbe4a9556bd038803bc3fd3a06297ee03062b7bb960f4286ba159eb202` | APPROVE | Initial labels are laid out, readable, and fully within the viewport. |
| `overview-high-firefox.png` | `0c734f8e97b6ac987f335c690bb28c9f6d4dae63e9eaee43a49a0fa34d598998` | APPROVE | Initial labels are laid out, readable, and fully within the viewport. |
| `overview-high-mobile-chromium.png` | `90758b9141b4660b06f7d5e90b19e46b5a2b792f734ea8c9f2bb38f273d7def0` | APPROVE | Portrait overview shows six distinct readable labels, all within the viewport. |
| `overview-high-webkit.png` | `47e714b95cd0064e3c543eff043d0c617f6df4e7f82cd4e55c3f4832e2dc7991` | APPROVE | Initial labels are laid out, readable, and fully within the viewport. |
| `overview-lite-chromium.png` | `46ad469c83989fea51ab9d796943401b6ef156dfbf2213ca9e66c26801626fbe` | APPROVE | Initial labels are laid out, readable, and fully within the viewport. |
| `overview-lite-firefox.png` | `e731ca5bbc2d2e86775c841772b5c493682f61e3f6877528823090e78ea40105` | APPROVE | Initial labels are laid out, readable, and fully within the viewport. |
| `overview-lite-mobile-chromium.png` | `950c6439a12d45f538c3340389876dc898531bb7ca499275ccb72939900745eb` | APPROVE | Portrait overview shows six distinct readable labels, all within the viewport. |
| `overview-lite-webkit.png` | `6dfda805d6842efdf88b8a4e25dbaec56dc5fc0043b7d5179cae2cf06e36a40c` | APPROVE | Initial labels are laid out, readable, and fully within the viewport. |
| `star-focus-chromium.png` | `ccad8e59b3f5e2cb3487b4328aa1973d01e48213d9fe08b55210f20eb9561591` | APPROVE | Selected `Vault Gkx` is centered and its two-line focus label is fully readable. Edge crops affect neighboring graph content. |
| `star-focus-firefox.png` | `9853f7653f31ee17e3dc6d5b4059697b09e41c836f4122774764f7e5d327c8bb` | APPROVE | Selected `Vault Gkx` is centered and its two-line focus label is fully readable. Edge crops affect neighboring graph content. |
| `star-focus-mobile-chromium.png` | `d3bdca40aabd75788e7732cd4adcc69007cf928c42dca1c798a02888bcfcebfd` | APPROVE | Selected `Vault Gkx` and its full two-line label are centered horizontally and readable. Partial left/lower neighbors are consistent with a selected-star view. |
| `star-focus-webkit.png` | `2f17c4b4410596c5bce8c6c19207c1b1f22830e6e07c75ebe2e4474564056b09` | APPROVE | Selected `Vault Gkx` is centered and its two-line focus label is fully readable. Edge crops affect neighboring graph content. |

## Contract and code evidence

`test/browser/visual.spec.ts` defines `star-focus` as
`quality=high&camera=focus`, waits for boot completion and more than one rendered
frame, allows a 400 ms frozen-frame settling period, and compares a viewport
screenshot. It does not define focus as a fit-all-neighbors view. The governing
directive likewise names the capture as a **selected star**
(`Kosmos-Oden-Engineering-Review/CI-CD-AND-AGENT-OPERATING-DIRECTIVE.md:454-462`).

The exact source under review initializes `labelScanT = -Infinity`
(`src/renderer/renderer.ts:687`). Frozen capture supplies `t = 0`
(`:1990-1993`), and `updateLabels` rescans when
`t - labelScanT > 0.14` (`:756-757`), so the first frozen frame now performs the
label layout. This is the direct root-cause correction for the former empty
transform/stacked-label state.

The deterministic capture preset selects the top star, sets the camera target
to that star, and sets focus radius **44 for every viewport**
(`src/renderer/renderer.ts:1744-1754`). The separate interactive navigation
helper uses `MOBILE ? 36 : 44` (`:917-922`), but that helper does not define the
`capture=1&camera=focus` preset. Therefore the prior mobile rejection based on
a radius-36 capture premise is inapplicable. Direct inspection confirms the
selected `Vault Gkx` target is centered and readable in the mobile radius-44
image. Cropped neighboring labels such as `Graphy` are not the selected target
and are an expected consequence of the selected-star framing.

The preserved pre-change set confirms that
`star-focus-mobile-chromium.png` is byte-identical before and after this fix
(`d3bdca40...cebfd`). That is consistent with selection itself forcing the
first rescan; it does not create an actionable defect in the unchanged focus
composition. The overview images changed as expected because the overview has
no initial selection to force a rescan.

## Governance and acceptance boundary

The directive requires explicit approval for changed baselines and prohibits
the proposing agent from approving its own update (`CI-CD-AND-AGENT-OPERATING-DIRECTIVE.md:464-472`).
This independent Sol run did not create or modify the reviewed PNGs. The prior
review reports are preserved and were treated as historical evidence only.

The recorded full browser run
`_Claude-Code/kosmos-label-sse-browser-full-20260914.log` ends with 246 passed
and 2 declared skips in 2.1 minutes and has SHA-256
`d73b548e40b7026d08361116675d57bbbdedcd4483cfbcb110313def5f062520`.
That supports browser behavior but is not native acceptance. This visual
approval does not qualify installed Obsidian rendering, physical GPU/vendor
behavior, native pop-out/compositor behavior, context-loss paths represented by
the two declared skips, or release promotion. The repository requires advisory
visual/browser runs on a GPU reference machine before release, and release
promotion remains a separate human-controlled gate.
