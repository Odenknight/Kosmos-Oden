# Navigation Effects Packet C0 working-result receipt

Date: 2026-08-27

Status: **working-tree contract evidence only; Packet C is not implemented or qualified**

## Scope present

The working tree contains a host-neutral `KosmosEffectHostAdapter` contract and
deterministic Obsidian and standalone/native profile descriptors. The contract
keeps capability evidence, exact-byte snapshots, path receipts, prepared-effect
handles, execution evidence, authorized recovery/rollback, and bounded shutdown
results structurally separate.

Both profile factories are intentionally unavailable. Every snapshot,
path-inspection, prepare, execute, recovery-inspection, recovery, rollback, and
shutdown call returns structured unavailability. Neither descriptor imports the
Engine Node executor, Obsidian, Electron, filesystem modules, or a server
runtime. No writer or runtime endpoint is registered.

## Engine API blockers

The standalone/native descriptor records these exact gaps:

- `READ_ONLY_INSPECTION_UNAVAILABLE`: the Engine Node executor exposes no
  non-mutating snapshot/path/recovery inspection API;
- `SPLIT_PREPARE_EXECUTE_UNAVAILABLE`: its public API does not expose the C0
  split prepare handle and later execute step;
- `AUTHORIZED_RECOVERY_UNAVAILABLE`: startup recovery is mutating and accepts
  no authorized recovery decision;
- `DEADLINE_SHUTDOWN_UNAVAILABLE`: shutdown accepts no deadline or abort signal;
- `DIRECTORY_FLUSH_UNPROVEN`: directory-entry persistence is not proven; and
- `COOPERATIVE_VAULT_THREAT_MODEL_ONLY`: the executor requires acknowledgement
  that untrusted local processes cannot replace vault path ancestors.

The Obsidian descriptor separately reports each required Vault/path, collision,
link/reparse/mount, durable-intent, flush/replace, lease, recovery, and shutdown
primitive as unavailable or unsupported. It binds no Vault lifecycle API or
optional path-safety service.

## Verification

- Combined C0 focused adapter suites: 12/12 passed.
- Full Node suite: 283/283 passed.
- `npm run verify`: passed, including typecheck, build, the full Node suite,
  version, lockfile, artifact, invariant, and renderer-provenance checks.
- Pinned Engine `npm run test:navigation`: 128/128 passed.
- Two standalone builds were byte-identical (SHA-256
  `6b79104ff35392668bd363214dc405c15e9b013ea7ae220bd1111bf13e48f30f`).
- Profile bundle checks found no Engine Node executor, Obsidian/Electron,
  filesystem, runtime endpoint, watcher, or registration surface.

These local results do not qualify an adapter or Packet C.

## Explicit nonclaims

Packet C is not implemented, configured, authorized, runtime-safe, qualified,
merged, released, or deployed by this working result. No MOC or source note was
written. No host lease, journal, archive, recovery controller, reconciliation
coordinator, authority provider, durable adoption store, or automatic-write
path is configured. Automatic maintenance and creation remain unavailable and
off.
