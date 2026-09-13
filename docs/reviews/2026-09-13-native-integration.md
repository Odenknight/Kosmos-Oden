# Native integration candidate

The current upgrade imports the tracked native shell, preparation script and
qualification history from desktop branch commit `98a7023`. It does not merge
the older branch's viewer or Engine dependency. Cargo and Tauri versions now
match Kosmos 0.8.3; the current canonical standalone viewer supplies generated
native HTML. The existing GLib vendor patch and its license records are retained.

`node scripts/prepare-desktop.mjs` generated the native HTML from the current
standalone artifact. Preparation no longer recursively removes its output
directory. With that real viewer, the integrated Rust suite passed 17 ordinary
tests; the explicitly configured process qualification was ignored. All-target
clippy with warnings denied and the repository version check passed.

The source release manifest remains `null`, and bundling remains disabled.
Historical process receipts apply to their original desktop source commit; they
are not reassigned to this integration. Rerun explicit discovery/recovery against
the integrated source before claiming that gate here. Visible native UI, final
resource packaging, non-Windows qualification and the broader release gates
remain open. PowerShell/C# exploratory helpers remain in the historical desktop
branch; the integrated runtime uses direct Rust Windows APIs.
