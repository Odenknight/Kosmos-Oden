# Kosmos-Oden 0.9.6 release behavior map

| User action | Implementation | Verification |
| --- | --- | --- |
| Open E-Z setup from settings, ribbon or command palette | `src/plugin/settings.ts` and `openLocalLibrarian` in `src/plugin/main.ts` open or reveal the local Librarian view. | `scripts/obsidian-smoke.mjs` clicks the button in Obsidian and reopens the view by command after plugin reload. |
| Ask about a vault note and open a passage | `PersonalSearchView` calls `askLocalLibrarian`. The local worker ranks the user's Markdown corpus. Selecting a result opens its source file. | `test/personal-ui.test.mjs` covers ranked passages and keyboard opening. The desktop trial opens a source offline and checks edits, renames and deletion. |
| Ask about MCP, tags or sync | `renderLibrarianHelp` in `src/ui/personal-search-view.ts` displays bundled answers and expands relevant topics. | The UI test checks MCP, all three tagging levels and provider guidance. |
| Choose which notes an assistant can read | `src/plugin/personal-runtime.ts` supplies the policy-scoped query service to the Agent API. Using the local view keeps the user's profile, sharing choices and connection state. | `test/personal-plugin.test.mjs` exercises a governed vault. The desktop trial checks that an unshared note is locally searchable and that saved scope survives reload. |

The package pins GKOS-Engine 2.5.2 at `44c62208b8a82d350d29bc7fcf44c8a0a13a575b`. Standalone viewer 0.9.5 is byte-paired with that Engine. The Obsidian plugin version is 0.9.6. The release workflow builds from the exact `0.9.6` tag. The downloadable `BUILD-INFO.json` identifies that build and `SHA256SUMS` records component digests. [Release artifacts](https://github.com/Odenknight/Kosmos-Oden/releases/tag/0.9.6)
