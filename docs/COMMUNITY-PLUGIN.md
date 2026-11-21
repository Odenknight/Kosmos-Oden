# Obsidian Community Plugin — packaging, releases & submission

How Kosmos-Oden is packaged so the **Obsidian plugin** and the **standalone
viewer** stay cleanly separated, and how to publish and submit it.

## Plugin components vs standalone (the separation)

| Kind | Files | Where it lives | How a user gets it |
|---|---|---|---|
| **Plugin** | `manifest.json`, `styles.css`, `versions.json` (committed) + `main.js` (build output, gitignored) | source at repo root; all four attached to each release | Obsidian **Community plugins** browser / BRAT — Obsidian installs the three runtime files; versions.json is a compatibility map |
| **Standalone** | `kosmos-oden-stand-alone.html` (one self-contained file) | **not** committed (build output); attached to each release as its own asset | download the single file from the **Releases** page and open it in a browser |

The standalone is **never** part of the plugin download — Obsidian only fetches
`manifest.json` / `main.js` / `styles.css`. `kosmos-oden-stand-alone.html` is a separate,
independently downloadable asset on the same release. Build outputs
(`main.js`, `kosmos-oden-stand-alone.html`, `dist/`) are gitignored so the tracked tree
shows only source + `manifest.json`/`styles.css`/`versions.json`; CI rebuilds
`main.js` fresh on every push and attaches it to tagged releases.

## Cutting a release

Releases are produced by CI (`.github/workflows/release.yml`) on a version tag.
**The tag must equal `manifest.json`'s `version` exactly, with no `v` prefix**
(Obsidian requirement):

```bash
# 1. bump the version in ONE place; check:versions enforces agreement across
#    manifest.json / versions.json / package.json / src/kosmos-version.ts
# 2. commit, then tag with the exact version — NO leading v:
git tag 0.5.6
git push origin 0.5.6           # → release.yml runs verify, builds, publishes
```

Pre-releases use a semver suffix and are auto-marked as GitHub pre-releases
(Obsidian ignores them for the community listing): `git tag 0.6.0-beta.1`.

The workflow runs `npm run verify`, checks the tag matches the manifest,
assembles `release/` via `npm run package:release` (plugin files + standalone +
`BUILD-INFO.json` + `SHA256SUMS`), verifies checksums, and creates the release
with each file as an individual asset.

> Legacy `v*` tags still trigger the workflow, but new releases should use the
> unprefixed form so they're valid for the community listing.

## Fork attribution and submission evidence

Kosmos-Oden’s 3D renderer began from H4R7W16’s MIT-licensed vault-kosmos and was later rebuilt. Derived portions remain, so the original MIT notice ships in `THIRD-PARTY-NOTICES.md`, which every release includes. GKOS-Engine and the Engine integration are original work by the maintainer. Confirm the mobile manifest with the directory reviewer because the MCP listener uses desktop Node APIs. [Upstream project](https://github.com/H4R7W16/vault-kosmos) · [Obsidian developer policies](https://docs.obsidian.md/community-directory/developer-policies) · [Plugin submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)

## Directory submission and build verification

In the [Obsidian Community directory](https://community.obsidian.md/), sign in, link the GitHub account that owns this repository, choose **Plugins → New plugin**, and enter the public Kosmos-Oden repository. The directory reads the default branch manifest and installs `main.js`, `manifest.json` and `styles.css` from the matching release. The optional stdio bridge and standalone viewer are separate downloads. [Official submission guide](https://docs.obsidian.md/plugins/releasing/submit-plugin)

The production command is `npm run build` after `npm ci` on Node 22. The lockfile resolves GKOS-Engine 2.5.2 to commit `44c62208b8a82d350d29bc7fcf44c8a0a13a575b`. Maintainer CI uses a read-only repository deploy key. That key is available only to the project's own workflows.

To keep Engine private, prepare a private build-source repository containing the tagged Kosmos sources and the pinned Engine build inputs. Bind the dependency to an integrity-checked local package built from that commit, including required package exports and provenance. From a fresh checkout of that single repository, install and build without a second repository credential. Compare all three plugin assets with the public release's SHA-256 values. Grant the Obsidian Community directory GitHub App read access to the private build-source repository, associate it with the public entry, and run **Review branch**. Obsidian documents this single-private-source arrangement. Its documentation does not establish that an external private Git dependency will be fetched automatically. [Private source and preview scans](https://docs.obsidian.md/community-directory/manage-entry)

This arrangement was tested locally for 0.9.5 on Windows with Node 24.18.0 and npm 11.16.0. In the Engine directory installed by the authorized lockfile, `npm pack --ignore-scripts` packaged the prepared modules and their source. In a separate clean Kosmos checkout, the dependency was changed to `file:vendor/gkos-engine-2.5.2.tgz` and the private Git install-script entry removed. Running `npm install --package-lock-only --ignore-scripts` bound the tarball to its SHA-512 digest. With an empty cache and no Engine credentials, `npm ci` and `npm run build` reproduced the authorized Windows build’s three plugin assets byte for byte. The same private reviewer input was then built from a fresh checkout and empty cache on Debian x64 with Node 22.23.5 and npm 10.9.9. All three SHA-256 digests matched the public GitHub release, including `main.js` at `ada95ff63e1f93b4696b14b85810e5e3dfb5a0df94185d7c57aecee1f1e895d8`. Windows and Linux set different OS identifiers in two embedded gzip headers. The WebAssembly payloads match. Keep the package and this alternate lockfile together in the private review checkout. A directory preview scan remains a separate check.

Alternatively, the Engine owner can publish a reviewed, versioned package containing the required Engine modules and license notices, then update the dependency, lockfile and provenance checks and repeat the clean build anonymously. Both routes require the same release asset comparison before claiming an independent rebuild.

Use the directory review results to resolve any outstanding findings. Installation from the in-app directory becomes available after the listing passes review and is published.
