# Release Process

Releases are built **from the tag in CI**, not copied from a workstation
(Doc1 §3.9, Doc2 §3). A release is the verified output of a controlled build.

## Cutting a release

1. Update `src/core/version.ts` to the new version (single source of truth).
2. `npm run check:versions` — confirms `package.json`, `manifest.json`,
   `versions.json` and `src/core/version.ts` agree.
3. Update `CHANGELOG.md` (move `[Unreleased]` items under the new version).
4. `npm run build && npm test` — commit the rebuilt `main.js`,
   `vault-kosmos.html`, `dist/`.
5. Commit, then tag: `git tag vX.Y.Z && git push --tags`.

## What CI does on a `v*` tag (`.github/workflows/release.yml`)

1. `npm ci` (clean, from lockfile).
2. `npm run verify` — typecheck + build + tests + version/artifact/invariant checks.
3. Assert the tag matches `manifest.json`.
4. `npm run package:release` — stages `release/` with `manifest.json`, `main.js`,
   `styles.css`, `versions.json`, `vault-kosmos.html`, plus:
   - `BUILD-INFO.json` — provenance: commit, tag, workflow, run id, Node version,
     lockfile SHA-256, dirty flag, build time.
   - `SHA256SUMS` — integrity hashes over every release file.
5. `sha256sum -c SHA256SUMS` — verify the staged checksums.
6. Publish a GitHub release with `release/*` attached and generated notes.

`GITHUB_TOKEN` permission for the release job is `contents: write`; CI
validation runs with `contents: read`.

## Independent verification (any user or agent)

```bash
# Rebuild the tagged commit and compare to the published artifacts
git checkout vX.Y.Z
npm ci
npm run build
sha256sum main.js vault-kosmos.html        # compare against the release SHA256SUMS
jq . BUILD-INFO.json                        # confirm commit/tag match the tag you built
```

Executable artifacts (`main.js`, `vault-kosmos.html`, `dist/kosmos-embed.html`)
are byte-reproducible across clean builds — CI's `reproducibility` job builds
twice and diffs the hashes. Only `BUILD-INFO.json`'s `buildTimeUtc` is expected
to vary between builds; it is release metadata and is never embedded in the
executable artifacts.
