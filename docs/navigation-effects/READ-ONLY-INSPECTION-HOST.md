# Read-only Effects inspection host

This current integration preserves the absolute rule in
`DEVELOPMENT-PIN.md`: browser and Obsidian bundles do not import the Engine
Node executor. The existing `IMPLEMENTATION-HANDOFF.md` permits Node/path
inspection behind a narrow optional host service. The build therefore emits
`effects-inspection-host.cjs` as a separate desktop-only artifact, and
`main.js` loads it only after an operator invokes inspection on desktop
Obsidian with an actual `FileSystemAdapter`.

The action binds the adapter object and its exact vault root before reading,
then checks both again before publishing a result. Plugin unload invalidates
pending publication. Mobile, non-filesystem adapters, missing artifacts, and
changed bindings report inspection unavailable without loading Node code.
Ordinary Community Plugins and BRAT installs fetch only Obsidian's standard
plugin files, so inspection also remains unavailable unless the separately
released `effects-inspection-host.cjs` is installed beside `main.js`.

The host constructs a private executor and calls only `inspectRecovery`, then
uses the existing Kosmos inspection mapper. It does not create roots, acquire
a lease, recover work, prepare or execute effects, call durable shutdown, or
expose an executor. Its `cooperative-vault` acknowledgement describes this
read-only observation scope only; it is not evidence that source effects are
safe or authorized. Every write and recovery capability remains unavailable.
