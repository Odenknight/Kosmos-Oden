# Contributing to Kosmos-Oden

Thanks for your interest. This is a small, single-maintainer project with a
deliberately strong assurance pipeline — please work with it rather than around
it.

## Source access and setup

The plugin repository is public. The private `Odenknight/GKOS-Engine` dependency implements graph semantics, folder scope, sensitivity policy and the Personal Notes query service. A public checkout alone cannot build or independently audit those implementations. Anyone can install the [compiled alpha](https://github.com/Odenknight/Kosmos-Oden/releases/tag/kosmos-oden-0.9.5-alpha.6).

To build from source, use a GitHub identity with Engine read access. Check SSH access with `git ls-remote git@github.com:Odenknight/GKOS-Engine.git HEAD` before installing. Use the dependency in the lockfile. A local substitute invalidates the pin and provenance checks.

```bash
nvm use            # Node 22 (see .nvmrc)
npm ci             # clean install from the committed lockfile
npm run verify     # typecheck + build + test + version/artifact/invariant checks
```

## The golden rule

> The pinned **GKOS-Engine** package owns graph semantics. The plugin,
> standalone viewer, Agent API, Graphiti exporter and CLI all consume it. Never
> fork parsing, resolution, lineage, temporal or graph logic into a surface.

## Before opening a PR

- Run `npm run verify` locally. The TypeScript gate rejects implicit `any` throughout `src/`. Explicit `any` annotations remain and full strict mode is disabled.
- The invariant checker detects source and configuration drift, including in the pinned Engine. Runtime tests separately exercise folder exclusion, request authorization and cancellation.
- New behavior has tests; fixed defects get a regression test.
- Security-relevant changes keep `npm run check:invariants` green (see
  `kosmos-invariants.yml`).
- Generated/build artifacts (`main.js`, `kosmos-oden-stand-alone.html`, `dist/`) are **not
  committed** — CI rebuilds them from source on every push and attaches them to
  tagged releases. Run `npm run build` locally to produce a working `main.js`
  for manual testing; don't commit it.
- Docs updated when behavior or claims change; the README must not claim more
  than the code proves.
- Version changes touch `src/kosmos-version.ts` (the single source) — the other
  files are checked against it by `npm run check:versions`.

## Browser and visual tests

The renderer is real WebGL2, so parts of the suite need a real GPU. What runs
where is deliberate — a required check that is red on every push is as harmful
as no check at all, because it trains reviewers to merge through red and buries
genuine regressions.

| suite | where | gating? |
| --- | --- | --- |
| `npm run test:browser:chromium` — standalone, embed-sandbox, context-loss | `Browser / browser-chromium`, every push + PR | **required** |
| `npm run test:browser:full` — the same renderer specs on Firefox + WebKit | `Browser (full matrix)`, weekly + on demand | advisory |
| `npm run test:visual` — deterministic screenshot baselines | `Browser (full matrix)`, weekly + on demand | advisory |

The desktop and mobile Chromium jobs use ANGLE/SwiftShader. The full-matrix workflow runs Firefox and WebKit in headed mode under Xvfb with Mesa llvmpipe, then compares Chromium screenshots with the [committed reference images](test/browser/visual.spec.ts-snapshots/). Each suite reports its own result. A failed comparison fails the workflow.

**Before cutting a release**, run the advisory suites locally on a GPU machine:

```bash
npm run build
npx playwright install chromium firefox webkit
npm run test:browser:full          # Firefox + WebKit renderer specs
npm run test:visual                # compare Chromium screenshots
npm run test:renderer:pair         # connect the released viewer to the pinned Engine using a temporary vault
```

Generate or refresh visual baselines with
`npx playwright test test/browser/visual.spec.ts --update-snapshots` on the
reference machine. An agent may *propose* a baseline update but must never
self-approve one (Doc2 §9).

## Changes that require explicit review (Doc2 §9)

- New network route, or any write capability (must not exist without an
  architectural decision + threat-model update).
- New dependency, or a substantial bundle-size change.
- Any change to authentication, `Host`/`Origin` validation, or LAN behavior.
- Any change to iframe sandbox permissions or the host↔renderer protocol.
- Release-workflow changes.

## Commit / PR conventions

- Keep commits focused; describe the "why".
- The PR template lists the checklist reviewers (human or agent) will verify.

## Contributor License Agreement

Before an outside contribution can be merged, you must accept [CLA.md](CLA.md):
put `I have read and agree to CLA.md v0.1` in the pull request and sign off each
commit with `git commit -s`. See also [AUTHORSHIP.md](AUTHORSHIP.md) and
[TRADEMARKS.md](TRADEMARKS.md).
