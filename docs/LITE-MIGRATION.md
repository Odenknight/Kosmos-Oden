# Moving from Kosmos-Oden Lite

Kosmos-Oden opens an existing folder of Markdown notes. Migration does not
require changing compatible note bodies or bulk-adding frontmatter.

1. Back up the vault and the old plugin directory, including its settings.
2. Disable the Lite plugin before enabling Kosmos-Oden in the same vault.
3. Install the complete Kosmos package and verify its `SHA256SUMS` and
   `BUILD-INFO.json`. Keep one active Kosmos installation.
4. Open the vault and allow the index to finish. Check several known paths,
   links, attachments and explicit sensitivity labels.
5. Configure the Agent API independently. Do not copy credentials, port
   bindings, write permissions or settings fields blindly between products.
6. Leave optional source-editing workflows disabled until separately reviewed.

Unlabeled or invalid sensitivity can be excluded from agent results under the
configured fail-closed policy. A missing search result is not proof that a note
was deleted. Use the Obsidian file explorer to verify the original file.

For rollback, disable Kosmos-Oden and restore the backed-up Lite plugin/settings.
Viewing and indexing do not require source-format conversion. Changes made
through separately enabled editing or sync workflows need their own rollback.

Lite remains a frozen maintenance line; this migration does not promise feature
parity or authorize changes to that repository. Cross-version source fixtures
remain part of the Engine compatibility checks.
