**Graphiti re-verified · hardened Agent API · folder-safe right-click · live agent traversal · faster + prettier renderer**

- **Graphiti**: episode export verified against graphiti-core 0.29.x (fields unchanged); per-vault `group_id` on all exporters; ingest sample pins `>=0.28.2`.
- **Security**: DNS-rebinding (Host/Origin) validation + constant-time token comparison on the local Agent API.
- **Fixed**: right-clicking a folder galaxy now *expands the folder* — it can no longer create/open a phantom note.
- **New**: AI agents querying the vault leave a live, fading emerald traversal trail in the 3D view.
- **Performance**: rendering fully halts while the view is hidden (background CPU/GPU → ~0); idle halo/GPU-upload/label-scan work trimmed. Same visible rendering speed.
- **Visuals**: planet land/sea tones + polar ice caps, lunar maria, irregular rocky asteroids, ring grooves — all in-shader; mobile keeps its lightweight path.
- **Docs**: README rewritten in plain language; AGENT-API.md refreshed. Reusable Agent-API test harness (33 checks) in `test/`.

**Install (manual):** drop `manifest.json`, `main.js`, `styles.css` into `<vault>/.obsidian/plugins/vault-kosmos/` and enable it in Community plugins.
