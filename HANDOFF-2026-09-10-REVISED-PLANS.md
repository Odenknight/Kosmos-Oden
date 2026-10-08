# Current reliability handoff

Source implementation: 0ed5268f54ee501b3f75bb7a4321c07c9aea0259.
Qualification/plans publication: https://github.com/Odenknight/Kosmos-Oden/blob/6d3417ab2edd0f949d58b092961613a77339017a/docs/plans/2026-09-10-revised-execution/TEST-PACKAGE.md

Local test ZIP: _Claude-Code/release-reliability/kosmos-oden-0.8.3-test-0ed5268.zip
SHA256: cc4210734e4331e1a6e2b68db5b94f76f7634027e59abd948c99b5f815fea318
Local matching plans: _Claude-Code/revised-plans-20260910/published/

The corrected test candidate is installed and loaded in the existing Obsidian plugin directory, with settings preserved. Frozen verify: 364 passing tests. Desktop/mobile browser checks: 28 passing cases. Direct live cold search: 6818ms; UID read and identified traversal pass; no logical/physical work remains outstanding. All ten ZIP artifact hashes match installed files. Source and plan commits are pushed on codex/release-reliability; main is unchanged.

The earlier e0709ab ZIP is superseded because metadata-only events starved cold builds. Native Hermes client identity/acceptance and a live restricted-sensitivity fixture remain open. Do not call this a release-qualified final release. No private selectors, vault content or credentials are in the package or repository evidence.
