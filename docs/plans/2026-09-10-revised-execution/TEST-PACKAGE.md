# Test package: 0.8.3 reliability and agent identity

Candidate source: [0ed5268](https://github.com/Odenknight/Kosmos-Oden/commit/0ed5268f54ee501b3f75bb7a4321c07c9aea0259). This is an installable test candidate, not a release-qualified final release.

- ZIP: `kosmos-oden-0.8.3-test-0ed5268.zip`
- ZIP SHA-256: `cc4210734e4331e1a6e2b68db5b94f76f7634027e59abd948c99b5f815fea318`
- Loaded main.js SHA-256: `84deffb20ca4b31a60a1eefce2c413f88b92999fbb7527015c03db0cdd26736c`
- Build: clean source, Node v24.18.0, unchanged Engine pin 650eab4a6752227cae336d7556a57826c22a0d5a.

## Verification

`npm run verify` passes on the frozen checkout: 364 tests, typecheck, build, versions, dependency lock, artifacts, invariants and renderer provenance. Desktop/mobile Chromium checks pass all 28 cases; the four marker cases were also rerun after waiting for the boot overlay to disappear, and desktop/mobile screenshots were inspected. Renderer code did not change during the subsequent source-event correction.

The exact candidate is installed in the existing Obsidian plugin directory. Settings were preserved. Loaded server, provider and plugin function bodies match the installed artifact. Vault-object identity survived reload. Direct modern HTTP discovery/list, modern ping rejection, search, allowed UID read and operational-namespace denial pass. First cold search: 6818 ms; warm search: 21 ms in the bounded five-result check. Four traversal callbacks carried agent name and stable identity. Final logical in-flight requests and physical reads are zero.

The earlier e0709ab candidate is superseded: its cold build timed out because cache-only changes repeatedly invalidated source reads. The corrected source-event test fails on that baseline and passes on this candidate. Deadlines remain 10/20/25 seconds; no timeout increase hid the defect.

## Remaining acceptance gates

Native Hermes client/SDK/patch identity and its full client gate are not available to this agent. Direct Node HTTP is not Hermes evidence. No restricted-sensitivity note exists in the current live projection, so live sensitivity denial remains open; isolated automated sensitivity tests pass. Synthetic stalls and recovery were exercised only in isolated tests. See CANDIDATE-QUALIFICATION.json for the sanitized receipt.

## Installation and rollback

This candidate is already installed and loaded on the host used for the live check. To test elsewhere, close Obsidian, extract the ZIP into the existing Kosmos plugin directory, preserve data.json, then reopen the vault. Do not create a second plugin directory for the same plugin ID. Confirm BUILD-INFO.json identifies the source above and verify SHA256SUMS.

Rollback on the current host: close Obsidian and restore the retained `kosmos-oden-0.8.3-main-b0c7ee2.zip` into the same directory, preserving data.json. The original main.js hash is recorded in LIFECYCLE-FREEZE.md. The package contains no vault content, credentials, private mailbox messages or data.json.
