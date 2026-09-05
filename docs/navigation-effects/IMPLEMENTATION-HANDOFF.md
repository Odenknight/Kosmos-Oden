# Navigation Effects implementation handoff

Date: 2026-08-27
Status: feature-branch implementation handoff; no merge, release, deployment,
MOC adoption, source-write authority, or automatic-write activation is implied

## 1. Exact handoff coordinates

| Repository | Branch | Handoff coordinate |
| --- | --- | --- |
| GKOS-Engine | `integration/navigation-effects-reconciliation-20260827` | `e4f00b3a9289c1d35d1a02e50dcdc266945fe015` |
| Kosmos-Oden | `feature/navigation-effects-reconciliation-20260827` | `5a864ac3fb54243724880173bfa239bd0a6d2a01` |
| Kosmos Engine development pin | exact Git dependency | `41172b91970aac869c161f4842e3526a62fd1fd9` |
| Effects contract | `ENGINE-NAV-EFFECTS-CONTRACT-1.0.0` | integration-only; Node executor experimental; GKOS conformance false |

The Engine documentation head follows the exact code coordinate pinned by
Kosmos. The dependency intentionally remains at the reviewed code commit so a
documentation-only successor does not silently alter installed package bytes.
Before release qualification, replace this development pin with the
owner-authorized immutable Engine 2.2 artifact and integrity value.

## 2. Work completed

### Engine reconciliation

- Reconciled the separately versioned framework-neutral Effects contract,
  deterministic planner, generated-region handling, path/grant validation, and
  optional experimental Node executor onto the current Engine service baseline.
- Preserved Navigation 1.0 import purity and its unchanged read-only capability
  document.
- Preserved the existing bounded frontmatter correction instead of replaying a
  duplicate historical commit.
- Added an import-purity test proving that importing root, Navigation, Effects,
  and Effects/Node creates no files or runtime authority.
- Corrected the Draft.2 historical freeze test to inspect its qualified commit
  tree. Frozen Draft.1/Draft.2 bytes remain protected while later versioned
  descendants may add unrelated surfaces.
- Documented the exact reconciliation ledger, reusable mechanisms, exclusions,
  and nonclaims.

### Kosmos no-write foundation

- Added an exact development-only dependency pin and integrity ledger.
- Added one central operational-path predicate for `.gkx/**` and
  `_archive/moc-runs/**` and applied it before plugin/standalone corpus,
  graph, viewer, migration, enrichment, attachment, content, and timestamp
  boundaries.
- Added schema-v1 Effects settings with additive migration through the existing
  plugin settings object. Effects, automatic maintenance, and automatic
  creation default false and fail closed on malformed supplied state.
- Added independent status fields for planner, adapter, authority provider,
  journal, policy, lease, recovery, reconciliation, ownership, maintenance,
  and creation.
- Added a browser-safe Engine adapter importing only
  `gkos-engine/navigation-effects`; the Node executor does not enter the plugin
  or browser import graph.
- Added bounded canonical policy validation and a pure credential-bound
  authority boundary. Tokens, connectivity, client labels, confidence,
  approval booleans, and timestamps cannot create authority.
- Added capability, qualification, and development-pin documentation, plus
  updated public and technical READMEs.

### Verification evidence at the handoff boundary

- Engine full local run: 918 tests, 912 passed, zero failed, six documented
  platform skips.
- Engine Navigation/Effects focused run: 128/128 passed.
- Kosmos local verification at the no-write foundation: 258/258 passed.
- Kosmos browser qualification at the preceding renderer-equivalent code head:
  37 passed with two documented non-Chromium context-loss skips; visual suite
  3/3 passed. Subsequent changes were non-renderer validators and documentation.
- KnightsAI Debian 13 qualification passed for the reconciled Engine and the
  pinned Kosmos foundation, including import purity and operational exclusions.
- Kosmos hosted CI and Browser workflows passed on the pushed code heads through
  the framework-neutral adapter, with later validator/documentation CI passing
  as recorded by the feature-branch runs.

Exact hosted-run status remains evidence tied to its SHA. Do not copy these
totals forward after further implementation; rerun and record the new results.

## 3. Controlling implementation order

Implement the remaining work in this order:

1. ownership/adoption registry and preview UI;
2. host-neutral adapter contract plus Obsidian and standalone/native profiles;
3. durable journal/archive/lease/recovery integration;
4. coordinator, reconciliation, and receipt-bound self-write suppression;
5. trusted status/recovery/rollback/audit UI and qualification tooling.

Do not make a source-effect entry point callable merely to make a later packet
easier to test. Each packet first exposes pure plans and status. Execution
becomes reachable only when ownership, policy, authority, durable intent,
adapter safety, recovery, reconciliation, and explicit operator enablement are
all independently true.

## 4. Ownership and adoption registry

### Goal

Make every existing MOC unmanaged by default and allow an operator to adopt
exact current bytes only after reviewing the ownership mode, deterministic
candidate, preserved regions, and exact diff. Adoption records authority; it
does not silently perform the MOC update.

### Recommended files

```text
src/navigation-effects/adoption-registry.ts
src/navigation-effects/adoption-plan.ts
src/ui/moc-adoption-modal.ts
test/navigation-effects-adoption.test.mjs
test/browser/navigation-effects-adoption.spec.ts
```

### Registry model

Store the registry below `.gkx/effects/ownership/`, separate from generated MOC
content. Reuse the Engine ownership contract rather than defining a second
meaning:

```ts
interface ManagedMocBinding {
  schemaVersion: 1;
  targetPath: string;
  ownership: "unmanaged" | "region-managed" | "fully-managed";
  adoptedDigest?: string;
  generatedRegion?: {
    markerVersion: "1";
    configDigest: string;
    startOffset: number;
    endOffset: number;
    bodyDigest: string;
  };
  adoptedBy?: EffectsActorRef;
  adoptedAt?: string;
  adoptionReceiptId?: string;
  creationAuthorized?: true;
}
```

Persist one canonical registry generation plus immutable adoption receipts. A
binding should reference a receipt digest; the receipt should bind the prior
registry generation, exact target bytes, selected ownership, policy/config
digests, actor, operation ID, and new registry generation. Do not place note
bodies in the receipt.

### Adoption workflow

1. Normalize the target to NFC `/` form and reject operational, absolute,
   traversal, collision, device, trailing-dot/space, and encoded paths.
2. Read exact bytes through the future host snapshot interface and compute
   SHA-256.
3. Ask Engine for deterministic marker/ownership/candidate results.
4. Render target path, current/proposed digests, ownership mode,
   policy/configuration digests, exact text and semantic diff, preserved human
   prefix/suffix, and generated region.
5. Require an explicit credential-bound human confirmation. Viewer or MCP
   credentials cannot adopt.
6. Re-read and re-hash immediately before persisting adoption.
7. On any mismatch, mark the preview stale and require regeneration.
8. Atomically persist the new registry generation and immutable adoption
   receipt. Do not modify the MOC unless the reviewed operation separately
   included an authorized effect plan.

### Marker rules

Region management accepts exactly one unnested pair:

```markdown
<!-- gkos:moc generated:start version=1 config=sha256:<64 lowercase hex> -->
...generated content...
<!-- gkos:moc generated:end -->
```

Missing, duplicate, nested, malformed, moved, body-changed, or
configuration-mismatched markers produce `review-required` and no write.
Preserve every byte before and after the generated region, including CRLF/LF.
Never insert markers into an existing MOC before the operator reviews and
confirms that exact adoption plan.

### UI solution

Build the modal as a trusted Obsidian/operator surface, not in the Local
Cluster canvas or MCP endpoint. Use a two-stage interaction:

- Stage 1: select ownership and inspect candidate/marker validation.
- Stage 2: review exact digest-bound diff and type/activate an explicit
  confirmation control.

Disable confirmation if policy, authority, target digest, path safety, or
candidate generation is stale. Restore focus after completion, expose an error
summary, and ensure the entire flow is keyboard and screen-reader usable.

### Required tests

- Every discovered existing MOC starts unmanaged and cannot execute.
- Region/full/create bindings remain distinct.
- Adoption is deterministic and idempotent for the same operation ID.
- A changed target, policy, configuration, actor, or registry generation makes
  the plan stale.
- All malformed marker cases fail closed.
- CRLF and LF prefix/suffix fixtures remain byte exact.
- Rename, case/Unicode collision, registry corruption, and receipt mismatch
  cannot silently retarget ownership.
- Adoption alone writes no source note.

## 5. Obsidian and standalone/native effect adapters

### Goal

Expose one Kosmos host-adapter interface with two profiles that assign the same
meaning to Engine plans, transaction states, archives, and receipts:

- Obsidian profile: respects the Obsidian Vault lifecycle and host APIs.
- Standalone/native profile: delegates to the qualified
  `gkos-engine/navigation-effects/node` executor inside the service or desktop
  shell. Do not duplicate the Node executor in Kosmos.

The browser-only folder viewer remains read-only and is not a write adapter.

### Recommended files

```text
src/navigation-effects/effect-adapter.ts
src/navigation-effects/obsidian-effect-adapter.ts
src/navigation-effects/native-effect-adapter.ts
test/navigation-effects-adapter-contract.test.mjs
test/navigation-effects-obsidian-adapter.test.mjs
test/navigation-effects-native-adapter.test.mjs
```

### Host-neutral interface

Keep the interface about bytes and durable effects, not semantic planning:

```ts
interface KosmosEffectHostAdapter {
  profile: "obsidian" | "standalone-native";
  capabilities(): EffectHostCapabilityReport;
  snapshot(target: AuthorizedTarget): Promise<ExactByteSnapshot>;
  inspectPath(target: AuthorizedTarget): Promise<PathSafetyReceipt>;
  prepare(plan: EngineEffectPlan): Promise<PreparedEffect>;
  execute(prepared: PreparedEffect): Promise<EngineEffectReceipt>;
  inspectRecovery(): Promise<RecoveryInspection>;
  recover(decision: AuthorizedRecoveryDecision): Promise<RecoveryReceipt>;
  shutdown(deadline: AbortSignal): Promise<ShutdownReceipt>;
}
```

Only the Engine owns effect-plan and receipt meanings. Kosmos owns host
configuration, lifecycle, stricter enablement gates, and UI coordination.

### Shared pre-I/O safety boundary

Before either profile reads or writes a target:

1. normalize Unicode to NFC and separators to `/`;
2. reject absolute, drive, UNC, parent/encoded traversal, NUL/control,
   empty-segment, reserved-device, trailing-dot/space, and portability-hazard
   paths;
3. reject case-insensitive and Unicode-normalization collisions;
4. prove target containment in the registered vault and granted root;
5. reject symlink, junction, mount, or reparse escape using the strongest
   available host primitive; and
6. revalidate policy, authority, retention hold, ownership, configuration,
   sensitivity, and target digest immediately before replacement.

If the host cannot prove a required primitive, report the precise limitation
and keep automatic writing unavailable. Do not downgrade silently.

### Obsidian profile solution

- Use Vault APIs for lifecycle-coherent reads, notifications, and supported
  atomic host operations.
- Keep Node/path inspection behind a narrow optional host service; do not make
  `require("fs")` reachable from the browser bundle.
- Serialize all effects through one vault-scoped queue and lease.
- Treat plugin unload as asynchronous shutdown coordination: stop admission,
  persist reconciliation intent, allow the active replacement to reach a safe
  boundary, checkpoint, then release resources.
- Do not reuse migration/enrichment backups or time-based timestamp suppression
  as the Effects transaction/recovery protocol.

### Standalone/native profile solution

- Instantiate the Engine Node executor in the loopback service or Tauri
  backend, never in viewer JavaScript.
- Pass exact vault root, state root, archive root, policy provider, authority
  provider, and current-precondition provider.
- Expose only redacted capability/recovery/status values to the trusted local
  operator surface. Viewer and MCP credentials remain read-only identities.
- Keep the service loopback-only; no LAN binding or proxy bypass.

### Parity tests

Run the same fixture table through both profiles and compare normalized Engine
plan/receipt meanings: transition, effect ID, target, prior/proposed/after
digests, archive bindings, policy/authority/ownership digests, stale/recovery
classification, and rollback preconditions. Host-specific durability details
may differ but must be reported explicitly rather than changing semantics.

## 6. Journal, archive, lease, and recovery integration

### Goal

Connect Kosmos lifecycle and status to the existing Engine transaction
protocol. Do not invent another journal or receipt format.

### Required state roots

```text
.gkx/effects/
  ownership/
  journal/
  checkpoints/
  receipts/
  reconciliation/
  lease/

_archive/moc-runs/
  YYYY-MM-DD/<run-id>/
```

Both roots are already excluded from corpus projections. Ordinary coordinator
operation must never delete archives.

### Mandatory transaction order

```text
RECEIVED -> PLANNED -> PREPARED -> APPLYING -> VERIFIED -> COMMITTED

PREPARED/APPLYING -> STALE
APPLYING/VERIFIED -> RECOVERY_REQUIRED
nonterminal -> ABORTED only with a reason and receipt
```

For every effect:

1. Resolve current credential-bound authority and exact policy.
2. Snapshot target bytes/metadata and build the deterministic Engine plan.
3. Bind target, prior digest/absence, proposed digest, corpus/configuration,
   policy, authority, ownership, and idempotency key.
4. Persist and flush `PREPARED` intent.
5. Acquire one vault lease plus deterministic scoped locks.
6. Recheck all preconditions.
7. Create and validate the exact archive before replacement.
8. Write a temporary file in the target directory and flush with the strongest
   honest host primitive.
9. Recheck target immediately before replacement.
10. Perform strongest supported same-volume replacement.
11. Reread and verify the after-image digest.
12. Persist archive result/diff, immutable receipt, `COMMITTED` journal entry,
    and checkpoint.
13. Release locks and feed the committed source through canonical indexing.

External bytes always win. A mismatch becomes stale/conflict; never overwrite.

### Archive layout

```text
_archive/moc-runs/YYYY-MM-DD/<run-id>/
  manifest.json
  result.json
  diff.json
  before/<original-relative-path>
  after/<original-relative-path>
  receipts/<effect-id>.json
```

The manifest binds Engine version, Effects contract, source snapshot, corpus,
configuration, policy, authority, ownership, plan, before/absence, proposed,
after, diff, and receipt digests. Sort multi-target effects by normalized
code-unit path. Use immutable per-effect receipts so concurrent effects cannot
overwrite one shared receipt or diff.

### Lease solution

Use the Engine vault lease implementation for the native profile and preserve
its semantics in the Obsidian adapter:

- one writer per registered vault;
- lease binds host/process identity, vault identity, creation time, and owner;
- a live or ambiguous lease blocks effects;
- stale cleanup occurs only for a verifiably dead same-host owner and creates a
  cleanup receipt; and
- shutdown releases the lease only after checkpoint verification.

Bearer possession or plugin presence never substitutes for the lease or
authority.

### Startup recovery solution

Before automatic modes can become available:

1. acquire/validate the lease;
2. validate journal framing, sequence, predecessor hashes, checkpoints,
   receipts, and archive bindings;
3. inspect every nonterminal effect against target, temp, before, proposed,
   after, and manifest digests;
4. classify `effect-absent-retryable`, `effect-present-verified`,
   `conflicting-external-bytes`, or `ambiguous-or-corrupt`;
5. complete commit only when proposed bytes are already present and verified;
6. retry only after fresh current preconditions;
7. seal conflicts stale without overwriting; and
8. block all writes on ambiguity/corruption.

Recovery completion does not enable writing by itself. Reconciliation must
independently report safe.

### Required failure tests

- Process termination after every transition and archive/temp/replace/verify/
  receipt/checkpoint boundary.
- Disk full, permission, archive, temp write, flush, replace, verify, journal,
  receipt, and checkpoint failure.
- Journal predecessor, checkpoint, primary/archive receipt, manifest, before,
  after, diff, result, and committed-target corruption.
- Live/stale/ambiguous lease cases.
- Exactly-once completion when proposed bytes are already present.
- No lost before-image and no silent external overwrite.

## 7. Coordinator, reconciliation, and self-write suppression

### Goal

Create one authoritative coordinator per open vault. Watchers deliver hints;
reconciliation proves convergence. Reuse the existing `VaultDataProvider` and
canonical `GkxIndex` lifecycle rather than creating another parser or graph.

### Recommended files

```text
src/navigation-effects/event-debouncer.ts
src/navigation-effects/moc-coordinator.ts
src/navigation-effects/reconciliation.ts
src/navigation-effects/recovery-controller.ts
src/navigation-effects/self-write-suppression.ts
test/navigation-effects-coordinator.test.mjs
test/navigation-effects-reconciliation.test.mjs
```

### Coordinator input contract

Normalize Obsidian/service watcher signals into one envelope:

```ts
interface CorpusChangeHint {
  sequence: number;
  kind: "create" | "modify" | "rename" | "delete" | "overflow";
  stableIdentity?: string;
  path?: string;
  previousPath?: string;
  observedDigest?: string;
  source: "obsidian" | "native-watcher" | "recovery" | "reconciliation";
}
```

Hints contain no note body. Coalesce by stable identity and retain every
relevant old/new path. Ignore operational roots and verified temporary files
before indexing.

### Debounce and queue solution

- Default quiet period: 750 ms after the latest related hint.
- Forced maximum: 3 seconds from the first continuously active hint.
- Use an injected monotonic clock, not wall time or render frames.
- Bound hint, scope, and target queues. On overflow, persist a full-
  reconciliation intent rather than dropping correctness state.
- Serialize conflicting targets by normalized code-unit path order.
- Skip byte-identical candidates before preparing an effect.

### Affected-scope solution

After the canonical index applies changes, derive directly affected Navigation
scopes plus dependent parent/master MOCs from one dependency projection. Use
incremental regeneration only when that dependency set is provably complete.
Rename, duplicate identity, configuration change, policy change, ownership
change, overflow, missed generation, or uncertain dependency ancestry forces a
full deterministic Navigation pass.

Do not publish graph deltas for an effect until replacement is verified and the
committed source bytes have been re-indexed.

### Receipt-bound self-write suppression

Never suppress by time window alone. Record:

```ts
interface CompletedSelfWrite {
  effectId: string;
  targetPath: string;
  committedDigest: string;
  indexGeneration: string;
  receiptDigest: string;
}
```

A watcher hint may be suppressed only when path and observed bytes match a
completed, valid receipt and the expected indexing generation. Consume the
suppression binding exactly once or retain a bounded duplicate-delivery count
according to the watcher contract. A different digest, missing receipt, moved
path, generation mismatch, or external edit always enters the canonical index.

### Reconciliation solution

Persist a reconciliation checkpoint binding:

- canonical corpus digest;
- Navigation configuration digest;
- policy digest;
- ownership registry digest;
- journal/checkpoint head;
- unresolved scope set; and
- current managed-target digests.

Run reconciliation after readiness, recovery, resume, watcher error/overflow,
bulk sync, manual request, completed recovery, and periodically (default five
minutes). Merge reasons deterministically. Clear durable intent only after the
resulting checkpoint is validated and flushed.

Automatic writing remains unavailable unless recovery and reconciliation each
report safe for the current exact state. A watcher being quiet is not proof of
convergence.

### Required tests

- Fake-clock quiet/max debounce and continuous activity.
- Create/modify/rename/delete convergence and deterministic coalescing.
- Bounded queue overflow persists full-reconciliation intent.
- Ordinary edits reparse only the expected records; structural uncertainty
  forces a documented full pass.
- Duplicate/replayed self-write hints do not loop.
- External edit immediately before or after replacement is indexed and wins.
- Missed events, watcher overflow/error, startup, resume, and periodic passes
  converge or safely block.
- Graph delta occurs only after verified commit and re-index.
- Unresolved reconciliation scopes survive shutdown/restart.

## 8. Cross-packet integration gates

After each packet:

```text
npm ci
npm run typecheck
npm run build
npm test
npm run check:lockfile
npm run check:artifacts
npm run check:invariants
npm run check:renderer-provenance
git diff --check
```

Also rerun Engine Navigation/Effects/public API/import-purity tests and the
Kosmos browser suite whenever import graphs, generated artifacts, or UI change.
Compare two clean standalone builds byte-for-byte.

Before calling an adapter qualified, run real-process crash tests and platform
path/durability tests on Debian, Windows, and both supported macOS
architectures. Before release qualification, run deterministic 100, 2,000,
10,000, and 50,000-note measurements plus the 24-hour watcher/reconciliation
soak. Measurements are evidence, not claims to rewrite when an objective is
missed.

## 9. Immediate next implementation packet

The next bounded packet should implement the ownership/adoption registry and
pure adoption preview only:

1. add the canonical registry/receipt types using Engine ownership values;
2. implement deterministic load/validate/plan functions over injected bytes;
3. add marker and exact-prefix/suffix fixtures;
4. add an in-memory adapter for atomic registry-generation tests;
5. build the trusted preview modal with confirmation disabled by default; and
6. prove adoption does not write the target MOC.

Do not begin the source-effect adapter in the same commit. The adapter should
consume the reviewed ownership interface only after the adoption packet and
its focused gates are green.

## 10. Stop conditions

Stop and report if implementation would require any of the following:

- changing Navigation 1.0 output or importing an executor into its graph;
- treating MCP/viewer credentials, connectivity, confidence, or timestamps as
  write authority;
- writing an unmanaged or stale-adoption MOC;
- changing bytes outside one exact generated region;
- continuing after marker, target, policy, authority, ownership, archive,
  journal, receipt, lease, recovery, or reconciliation ambiguity;
- suppressing watcher events by timing alone;
- creating another GKX parser/index/graph interpretation;
- exposing the Node executor to browser/Obsidian renderer code;
- weakening loopback, path, authorization, crash, or durability tests;
- using a floating Engine dependency; or
- merging, releasing, deploying, adopting, or enabling automatic writes
  without the required owner authorization.

## 11. Related records

- [Development pin](DEVELOPMENT-PIN.md)
- [Capability matrix](CAPABILITY-MATRIX.md)
- [Qualification plan](QUALIFICATION-PLAN.md)
- [Engine reconciliation record](https://github.com/Odenknight/GKOS-Engine/blob/e4f00b3a9289c1d35d1a02e50dcdc266945fe015/docs/navigation-effects/RECONCILIATION-20260827.md)
