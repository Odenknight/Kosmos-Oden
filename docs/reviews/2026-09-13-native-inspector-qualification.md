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

## Adapter correction and native recheck

Engine `b309d5ec41aac9f20c946598fbc8a5a75b4afcec` adds inspection to the
owning adapter. Kosmos `78abe886e5ae88a2a25eee356b8fa37c8f2e954e` delegates
through the vault provider and was built clean, installed with verified copies
and unchanged settings, and reloaded. Installed main SHA-256:
`648b93ace90e685214db25767bbbb253c71d67c2eeb57546fb1e4438c5520a25`.

At 2026-09-13T13:40:04Z the same native check reported receipts available,
matching fixture path, three tabs and one selected/unhidden panel. This fixture
has zero canonical declarations. The adapter subpath and actual vault-provider
tests separately cover nonempty, hidden-target and incremental receipts. The
previous unavailable-receipt observation is preserved above as failure evidence;
this recheck closes that bundle-ownership defect, not the full native gate.
The page remained hidden. Private receipt: `native-adapter-acceptance-20260913.json`;
rollback: `native-adapter-backup-20260913`, retaining the preceding package.
