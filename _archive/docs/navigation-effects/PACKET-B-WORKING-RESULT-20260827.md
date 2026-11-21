# Navigation Effects Packet B working-tree receipt

Date: 2026-08-27

Status: **pre-commit working result; not a qualification or adoption receipt**

## Coordinate and scope

Branch: `feature/navigation-effects-reconciliation-20260827`

Committed base: `bc4fd49103053b4d68af7630df893f6e3ee4b80f`

Engine development pin: `41172b91970aac869c161f4842e3526a62fd1fd9`

Packet B source and tests were untracked at verification time. They comprise
`adoption-plan.ts`, `adoption-registry.ts`, `in-memory-adoption-store.ts`, the
`src/ui/` adoption modal, and focused Node/browser adoption tests. Because they
have no commit coordinate, this is working-tree evidence only and does not
satisfy the qualification plan's exact-source-SHA exit requirement.

## Working result present

The working tree contains canonical ownership registry and adoption-receipt
validation/serialization, deterministic exact-byte preview and confirmation,
fail-closed marker/path/collision/credential/stale-state checks, an atomic and
idempotent in-memory test store, and a two-stage freshness- and phrase-gated
trusted preview modal. The modal callback is injected and is not registered in
the plugin or standalone runtime. The in-memory store is not durable storage.

## Local evidence

Environment: Windows 10.0.26200 X64, Node v24.18.0, npm 10.9.4.

- `npm ci`, typecheck, build, version, lockfile, artifact, invariant,
  renderer-provenance, and `git diff --check` gates: pass.
- Full Node suite: 271/271 pass.
- Two standalone builds: identical SHA-256
  `6B79104FF35392668BD363214DC405C15E9B013EA7AE220BD1111BF13E48F30F`.
- Focused adoption Node test: 13/13 pass.
- Focused adoption UI on Chromium, Firefox, and WebKit: 9/9 pass.
- Reconciled Engine `test:navigation`: 128/128 pass at
  `e4f00b3a9289c1d35d1a02e50dcdc266945fe015`.
- All-project browser parallel run: 33 pass, four Chromium timeouts, and two
  documented non-Chromium context-loss skips; this was not a clean parallel
  pass. Serial Chromium then passed 13/13 and the visual suite passed 3/3.

The adoption tests cover unmanaged denial, ownership-mode separation, LF/CRLF
byte preservation, malformed/ambiguous markers, path/case/Unicode hazards,
exact-state rechecks, deterministic/idempotent confirmation, registry/receipt
corruption, receipt source-byte exclusion, browser import purity, blocked UI,
persistence-error messaging, freshness/phrase gating, and focus restoration.
The real-process crash gate, cross-platform host-adapter gate, scale matrix,
and 24-hour soak were not run for this receipt.

## Explicit nonclaims

This receipt does not claim Packet B is committed, configured, authorized,
runtime-safe, qualified, merged, released, or deployed. No MOC was adopted or
written and no generated-region marker was inserted. No host adapter, authority
provider, policy ratification, durable ownership store, journal, archive, lease,
