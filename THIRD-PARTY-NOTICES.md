# Third-Party Notices

Kosmos-Oden bundles and builds upon the following third-party work.

## Three.js

The 3D renderer bundles **Three.js** (r186, npm `three@0.186.1`), © 2010–2025
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

## Semantic search runtimes (0.9.5)

Three libraries are bundled into `main.js` for the optional semantic search.
They are exact-pinned npm dependencies (`package.json` + `package-lock.json`);
nothing is fetched at run time to use them.

- **ONNX Runtime Web** 1.31.1 (`onnxruntime-web`, with `onnxruntime-common`),
  © Microsoft Corporation, MIT License. Its WebAssembly build
  (`ort-wasm-simd-threaded.wasm`) runs the embedding model.
  <https://github.com/microsoft/onnxruntime>
- **sql.js** 1.16.0, © 2017 sql.js authors, MIT License. It is SQLite compiled
  to WebAssembly; SQLite itself is in the public domain.
  <https://github.com/sql-js/sql.js>
- **@huggingface/tokenizers** 0.2.0, © Hugging Face, Apache License 2.0.
  <https://github.com/huggingface/tokenizers.js>

The MIT License text above (under Three.js) applies to ONNX Runtime Web and
sql.js with their own copyright lines. The Apache License 2.0 text is in
`LICENSE`.

## Embedding models (downloaded by the user, not redistributed)

No model is included in the plugin or the release archive. When a user presses
Download, one of these is fetched from its publisher's repository on Hugging
Face, at the commit recorded in `src/semantic/catalog.ts`:

| Model | Repository | Licence |
| --- | --- | --- |
| Snowflake Arctic Embed S | `Snowflake/snowflake-arctic-embed-s` | Apache-2.0 |
| all-MiniLM-L6-v2 | `Xenova/all-MiniLM-L6-v2` (ONNX export of `sentence-transformers/all-MiniLM-L6-v2`) | Apache-2.0 |
| BGE Small EN v1.5 | `BAAI/bge-small-en-v1.5` | MIT |
| BGE Base EN v1.5 | `Xenova/bge-base-en-v1.5` (ONNX export of `BAAI/bge-base-en-v1.5`) | MIT |
| Multilingual E5 Small | `intfloat/multilingual-e5-small` | MIT |

Licences are as declared by each repository at the pinned commit, checked on
2026-11-13. A model a user supplies through "Use my own model files…" is under
whatever licence that model carries.

## Build & dev dependencies

`esbuild` (MIT), `typescript` (Apache-2.0) and `obsidian` type definitions are
development/build dependencies only; they are not redistributed in the plugin
or standalone artifacts. Exact versions are pinned in `package.json` and
`package-lock.json`.

`@modelcontextprotocol/client` 2.4.0 (Apache-2.0, the official MCP TypeScript
SDK client), added in 0.9.0, is likewise a development dependency used only by
the MCP conformance tests. It and the packages it installs
(`@modelcontextprotocol/core` Apache-2.0; `zod`, `cross-spawn`, `path-key`,
`shebang-command`, `shebang-regex`, `eventsource`, `eventsource-parser`,
`jose`, `pkce-challenge` MIT; `which`, `isexe` ISC) are not bundled into
`main.js`, the stdio bridge or the release archive.

## GKOS-Engine

Kosmos-Oden bundles the **GKOS-Engine 2.2.0 development line**, © OdenKnight contributors, under
the Apache License 2.0. The exact commit (`7511233717cd5ab9ce8f6cec76e9623a21e3c728`) is recorded in
`package.json` and `package-lock.json`. Navigation is consumed only through
the source-content-read-only Engine surface; Kosmos-Oden does not configure a
Governance Store or expose source-content write capabilities through it.

GKOS-Engine: <https://github.com/Odenknight/GKOS-Engine>

## Project-authored material

Project-authored documentation and original graphics use CC BY 4.0.
Project-authored schemas, fixtures, workflows, scripts, and reference code use
Apache-2.0. Third-party materials retain their original licenses and notices.
See `LICENSE` and `ACKNOWLEDGMENTS.md`.
