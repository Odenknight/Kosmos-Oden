# Kosmos MOC prototype 0.2.0

This version catalogs a selected folder and its entire visible folder tree.
Each folder gets **Kosmos Index.md** with links to its parent, child folders and
files grouped as Markdown notes, documents, images, audio, video, spreadsheets
and other files. Attachment links keep their actual extension.

This is a folder and file catalog. It does not read attachment contents, run
OCR, perform semantic search or infer relationships. Existing `index.md` notes
are listed and preserved. The generated index belongs to this prototype.

## Install or update

Pause maintenance in the old prototype and disable it. Copy `main.js`,
`manifest.json` and `styles.css` from this package into the copied vault's
`.obsidian/plugins/kosmos-moc-prototype/` folder. Keep `data.json`, `.gkx` and
`_archive`. Enable the plugin. The controls must show **0.2.0**.

Old folder records migrate automatically. Old `index.md` notes remain intact;
this version creates `Kosmos Index.md` alongside them. It does not automatically
adopt an existing file named `Kosmos Index.md` without its own ownership record.

No separate Engine installation, server, token or network access is needed.
Your normal Kosmos plugin can remain installed. Use a local copy of your vault
and pause other automation or sync that could modify generated catalogs.

## Start

1. Run **Kosmos MOC Prototype: Open MOC test controls** from the command palette.
2. Enter an existing subfolder such as `Research`. Paths use forward slashes.
3. Click **Preview folder tree**. Check the count of indexes and files. The
   displayed list is limited to 100 entries; the catalog covers the full scope.
4. Type **COPY**, then click **Start maintenance**. This explicitly authorizes
   generated indexes throughout that tree, including newly created subfolders.
5. Click **Open main index** and follow its folder and file links.

The status updates every second. Start is disabled while maintenance is running.
Pause before selecting another folder. Reopening Obsidian leaves maintenance
paused; each explicitly authorized session lasts two hours.

## Test

1. Choose a tree containing several subfolders, Markdown notes, PDFs and images.
   Verify folder links, file groups and attachment links open the expected paths.
   Empty folders should also have an index.
2. Create a note or attachment. Its link should appear within several seconds.
3. Create a new subfolder with a file. Verify its index and its parent's link.
4. Rename or delete a note or attachment. Verify the catalog updates.
5. Click Reconcile now without changes. Index bytes should remain stable.
6. Pause, change a source, then start again. Verify it catches up.
7. Pause and reopen Obsidian. Start again and verify ownership recovery.
8. Pause and manually edit a generated catalog. Restart should refuse conflicting
   replacement. The status identifies the conflicting target.

Renaming a folder containing generated catalogs currently requires review:
ownership is bound to its old paths, so moved catalogs are not silently adopted.
Do not delete journals or ownership records to force a write. Report the status.

## Boundaries

Hidden entries and `_archive` are excluded. Symbolic links and junctions are
refused. Limits: 500 folders, 10000 visible entries and depth 32. All listed
metadata is treated as secret locally; existing labels are not modified.
Snapshots record names, sizes and modification times, not attachment content
digests. The selected root must be a subfolder, not the whole vault.

Kosmos renders the catalog. Engine plans and executes effects with its lease,
journal, conflict checks and recovery. Kosmos persists catalog ownership and
reconciliation intent under `.gkx/effects` and checks current authorization and
tree metadata before each write. This uses a cooperative filesystem model;
directory flush durability and hostile filesystem mutation are not qualified.
There is no packaged sidecar claim.

Always pause before disabling or removing the plugin. Keep generated files and
recovery data when reporting a failure. Send the Obsidian version, operating
system, steps and visible status, without private contents.
