# Release Process

Releases are built **from the tag in CI**, not copied from a workstation
(Doc1 §3.9, Doc2 §3). A release is the verified output of a controlled build.

## Cutting a release

1. Update `src/kosmos-version.ts` to the new version (single source of truth).
2. `npm run check:versions` — confirms `package.json`, `manifest.json`,
   `versions.json` and `src/kosmos-version.ts` agree.
3. Update `CHANGELOG.md` (move `[Unreleased]` items under the new version).
4. `npm run verify` locally to confirm the tree is release-ready, including the
   package-lock binding to the released GKOS-Engine commit. `main.js`,
   `kosmos-oden-stand-alone.html`, and `dist/` are generated and **gitignored** — do not
   commit them; CI builds them fresh from source.
5. Commit the version/changelog changes, then tag with the **exact manifest
   version, no `v` prefix** (Obsidian requirement — see
   `docs/COMMUNITY-PLUGIN.md`): `git tag X.Y.Z && git push origin X.Y.Z`.
   Pre-releases use a semver suffix, e.g. `git tag X.Y.Z-beta.1`.

## What CI does on a version tag (`.github/workflows/release.yml`)

1. `npm ci` (clean, from lockfile).
2. `npm run verify` — typecheck + build + tests + version/lockfile/artifact/invariant checks.
3. Assert the tag matches `manifest.json`.
4. `npm run package:release` — stages `release/` with `manifest.json`, `main.js`,
   `styles.css`, `versions.json`, `kosmos-oden-stand-alone.html`, `kosmos-mcp-stdio.mjs`, plus:
   - `BUILD-INFO.json` — provenance: commit, tag, workflow, run id, Node version,
     lockfile SHA-256, dirty flag, build time.
   - `SHA256SUMS` — integrity hashes over every release file.
   Since 0.9.0 it also writes an installable archive,
   `release/kosmos-oden-<version>-<label>.zip` (label `alpha.1` by default;
   `--label=` changes it, `--label=` with no value drops it) and
   `<archive>.zip.sha256`. The archive holds a `kosmos-oden/` plugin folder
   (`main.js`, `manifest.json`, `styles.css`, `kosmos-mcp-stdio.mjs`), every
   `docs/v<version>/*.md` file under `docs/`, `LICENSE`,
   `THIRD-PARTY-NOTICES.md`, `BUILD-INFO.json` and its own `SHA256SUMS`. The
   packager fails if `docs/v<version>/` lacks `ALPHA-INSTALL.md`,
   `ALPHA-TEST.md`, `KNOWN-LIMITATIONS.md`, `MCP-COMPATIBILITY.md` or
   `BUILD-PROGRESS.md`. The archive name's label does not change the manifest
   version.
5. `sha256sum -c SHA256SUMS` — verify the staged checksums.
6. Publish a GitHub release with `release/*` attached and generated notes.

An alpha test candidate (such as `0.9.0-alpha.1`) is built with the same
command and handed to the owner with its checksum, together with the pending
trials listed in its `ALPHA-TEST.md`. It is not tagged or published unless
the owner separately asks for that.

`GITHUB_TOKEN` permission for the release job is `contents: write`; CI
validation runs with `contents: read`.

## Independent verification (any user or agent)

```bash
# Rebuild the tagged commit and compare to the published artifacts
git checkout X.Y.Z
npm ci
npm run build
sha256sum main.js kosmos-oden-stand-alone.html        # compare against the release SHA256SUMS
jq . BUILD-INFO.json                        # confirm commit/tag match the tag you built
```

Executable artifacts (`main.js`, `kosmos-oden-stand-alone.html`, `dist/kosmos-embed.html`)
are byte-reproducible across clean builds — CI's `reproducibility` job builds
twice and diffs the hashes. Only `BUILD-INFO.json`'s `buildTimeUtc` is expected
to vary between builds; it is release metadata and is never embedded in the
executable artifacts.
