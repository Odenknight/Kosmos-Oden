# Native inspector qualification

Installed candidate: `e6b3d37052008c0b1ab1a434f621f0b23144327b`, built from a clean
checkout with Engine `fb05e68b08ff60c1f753c5236de4ba0e6b05b6ca`.
Installed main SHA-256:
`05811235db594f93a80cfffc066eff30f355baa65bd84bf59de7f539e0ad8821`.
All eleven artifact copies matched, package checksums verified, settings hash
unchanged, and the previous installed package retained for rollback. Reload passed.

At 2026-09-13T13:32:49Z, actual Obsidian Node 22.22.1 opened the existing
qualification fixture through Notes. Its canonical path matched; the three
inspector tabs were present with exactly one selected tab and one unhidden panel.
The page was hidden. These observations do not qualify physical interaction,
pane resize, visual appearance, performance or cross-mode behavior.

**Open defect:** native lineage inspection reported unavailable. The live vault
provider builds through `gkos-engine/adapter`; inspection imported from the root
Engine bundle cannot access that adapter bundle's private receipt store. The
earlier combined root-Engine/server fixture did not reproduce the actual adapter
entry point. Preserve that narrower test result without treating it as native
qualification. Add an adapter-owned inspection operation and a real provider
integration test, then rebuild and repeat native acceptance.

Private harness and receipt: `_Claude-Code/native-current-acceptance-20260913.js`
and `.json`. Installation script: `install-native-current-20260913.ps1`;
rollback directory: `native-current-backup-20260913`, under `_Claude-Code`.
