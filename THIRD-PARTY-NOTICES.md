# Third-Party Notices

Kosmos-Oden bundles and builds upon the following third-party work.

## Three.js

The 3D renderer bundles **Three.js** (r185, npm `three@0.185.1`), © 2010–2025
three.js authors, under the MIT License. It is an exact-pinned npm dependency
(`package.json` + `package-lock.json`, integrity recorded in
`renderer-provenance.json`); esbuild bundles the ESM module into `main.js`,
`kosmos-oden-stand-alone.html` and `dist/kosmos-embed.html` at build time — no CDN, no
runtime fetch, still a single offline file. The previous vendored global r128
build is retained under `vendor/legacy/` (see its `.PROVENANCE.json`) for an
optional frozen WebGL1-era compatibility artifact only.

```
The MIT License

Copyright © 2010-2021 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Three.js: <https://github.com/mrdoob/three.js>

## glib 0.18.5

The native Linux dependency graph uses a repository copy of **glib 0.18.5**,
copyright the gtk-rs Project Developers, under the MIT License. The copy is
the crates.io source with the upstream `VariantStrIter` pointer correction
backported. Its original crate SHA256, upstream source, correction pull
request, and correction commit are recorded in
`src-tauri/vendor/glib-0.18.5/KOSMOS_BACKPORT.md`. The complete MIT license is
retained in `src-tauri/vendor/glib-0.18.5/LICENSE`.

glib: <https://github.com/gtk-rs/gtk-rs-core>

## Upstream project — vault-kosmos

Kosmos-Oden is an independent fork and rebuild of
[**H4R7W16/vault-kosmos**](https://github.com/H4R7W16/vault-kosmos), also MIT
licensed. The MIT license permits this fork; substantial modifications in this
repository are described in `CHANGELOG.md` and `docs/ARCHITECTURE.md`. This
project is not endorsed by or affiliated with the upstream author.

## GKX provenance

GKX — Governed Knowledge Exchange — is the sole knowledge-format namespace
implemented by this project. Kosmos-Oden does not expose legacy compatibility
identifiers or interchange aliases. This project is independently maintained
and is not affiliated with, endorsed by, sponsored by, or maintained by Google.

## Build & dev dependencies

`esbuild` (MIT), `typescript` (Apache-2.0) and `obsidian` type definitions are
development/build dependencies only; they are not redistributed in the plugin
or standalone artifacts. Exact versions are pinned in `package.json` and
`package-lock.json`.

## GKOS-Engine

Kosmos-Oden bundles **GKOS-Engine 2.1.0**, © OdenKnight contributors, under
the Apache License 2.0. The exact Git tag and resolved commit are recorded in
`package.json` and `package-lock.json`. Navigation is consumed only through
the source-content-read-only Engine surface; Kosmos-Oden does not configure a
Governance Store or expose source-content write capabilities through it.

GKOS-Engine: <https://github.com/Odenknight/GKOS-Engine>

## Project-authored material

Project-authored documentation and original graphics use CC BY 4.0.
Project-authored schemas, fixtures, workflows, scripts, and reference code use
Apache-2.0. Third-party materials retain their original licenses and notices.
See `LICENSE` and `ACKNOWLEDGMENTS.md`.
