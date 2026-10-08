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

- `npm run typecheck`: passed during standalone/native descriptor development.
- `node --test test/navigation-effects-native-adapter.test.mjs`: 3/3 passed,
  including bundle checks for absence of the Node executor, filesystem imports,
  and runtime endpoints.
- Final combined C0 focused and repository gate totals: pending final run.

These local results do not qualify an adapter or Packet C.

## Explicit nonclaims

Packet C is not implemented, configured, authorized, runtime-safe, qualified,
merged, released, or deployed by this working result. No MOC or source note was
written. No host lease, journal, archive, recovery controller, reconciliation
coordinator, authority provider, durable adoption store, or automatic-write
path is configured. Automatic maintenance and creation remain unavailable and
off.
