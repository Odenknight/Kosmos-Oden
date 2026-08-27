# Navigation Effects qualification plan

Status: implementation and qualification plan only. This document does not
enable writes, qualify a host adapter, authorize an MOC adoption, or approve a
release.

## 1. Purpose and status language

This plan divides the Navigation Effects uplift into independently reviewable
packets and defines the evidence required before one packet may be consumed by
the next. A source file, passing unit test, importable Engine planner, or visible
UI control proves only that the corresponding code is reachable. It does not
by itself prove that the capability is configured, authorized, safe, qualified,
or released.

Use these labels in test output, status UI, and qualification evidence:

- **implemented**: the source and focused tests exist at an exact commit;
- **configured**: the required host adapter, policy, authority provider, and
  durable stores have been supplied and validated;
- **authorized**: a credential-bound actor has a valid grant for the exact
  operation and target;
- **runtime-safe**: recovery, reconciliation, ownership, lease, policy, and
  target preconditions currently pass;
- **qualified**: every applicable gate in this document has evidence tied to
  exact source and artifact hashes;
- **released**: an owner-authorized immutable dependency and product artifact
  have passed the release process.

No label implies a later label. All automatic write settings remain false
unless an operator explicitly enables them after the runtime-safe gates pass.
Navigation 1.0 remains a read-only input to the effects plane.

## 2. Qualification layers

| Layer | Where it runs | What it may prove | What it cannot prove |
|---|---|---|---|
| Local synthetic | One developer host, fake clocks, memory or temporary-directory adapters | Pure validation, deterministic plans, state-machine decisions, bounded queues, fail-closed behavior, byte preservation under injected faults | Cross-platform path behavior, true durability, process-crash recovery, Obsidian lifecycle parity, long-run stability |
| Local real-process | One developer host with child-process kill points and a real filesystem | Restart classification, on-disk framing, atomic-replacement behavior on that filesystem, exactly-once receipt completion or safe blocking | Behavior on other operating systems/filesystems or during a 24-hour run |
| Cross-platform | Required Windows, macOS, and Debian hosts with recorded runtime/filesystem versions | Host-specific path, lock, replacement, flush, watcher, shutdown, and adapter behavior | Unmeasured platforms, signing/release readiness, 24-hour stability |
| Scale | Recorded 100, 2,000, 10,000, and 50,000-note fixtures | Queue, parse, memory, journal, reconciliation, and convergence measurements for the declared fixture/hardware | General performance claims beyond the measured environment |
| Soak | One uninterrupted 24-hour watcher/reconciliation run per release-candidate host profile selected for shipping | Long-run watcher delivery, periodic reconciliation, queue bounds, journal growth, and recovery evidence | Correctness on an untested host profile or filesystem |

Local synthetic success permits the next implementation packet to begin. It
does not remove any cross-platform, real-process, scale, or soak blocker.

## 3. Capability gate map

The status model must expose each row independently. A false row supplies a
bounded reason code and must not be summarized as merely “disabled.”

| Gate | Evidence source | Required before advertising `apply_managed_moc` | Required before automatic maintenance | Required before automatic creation |
|---|---|:---:|:---:|:---:|
| Navigation 1.0 available and read-only | Engine capability plus import-graph test | No | Yes | Yes |
| Effects planner available | exact Engine effects contract/version | Yes | Yes | Yes |
| Host adapter configured | adapter capability receipt | Yes | Yes | Yes |
| Authority provider configured | provider status; no token/connectivity inference | Yes | Yes | Yes |
| Durable journal configured | opened and validated store identity | Yes | Yes | Yes |
| Policy configured and digest-valid | exact id/version/SHA-256 match | Yes | Yes | Yes |
| Vault lease held | current lease identity | No | Yes | Yes |
| Startup recovery safe | recovery classification receipt | No | Yes | Yes |
| Reconciliation safe | current reconciliation decision/checkpoint | No | Yes | Yes |
| Valid ownership binding | exact target/digest/configuration binding | No | Yes | Yes |
| Effects plane explicitly enabled | migrated settings | No | Yes | Yes |
| Automatic maintenance explicitly enabled | migrated settings | No | Yes | No |
| Automatic creation explicitly enabled and creation authorized | settings plus exact grant | No | No | Yes |

Advertising a planner or adapter is never equivalent to authority. A bearer
token, MCP connection, client name, confidence value, timestamp, or watcher
event is never accepted as an authority source.

## 4. Incremental work packets

Each packet is committed separately. Its focused tests must pass before the
next packet consumes its interfaces. After each packet, run the repository
typecheck, build, focused tests, full Node tests, and `git diff --check`.
Generated plugin/HTML artifacts are rebuilt only by the integrating
orchestrator after source review.

### Packet A — settings, status, policy, and authority

Expected source areas:

- `src/navigation-effects/settings.ts`
- `src/navigation-effects/status.ts`
- `src/navigation-effects/policy.ts`
- `src/navigation-effects/authority-provider.ts`
- the repository's existing settings integration and focused tests

Local synthetic gate:

1. Undefined settings produce schema-v1 defaults with the effects plane,
   maintenance, and creation all false.
2. Additive migration never changes a false write flag to true.
3. Unknown schema versions/keys, invalid types, unsafe flag combinations,
   policy drift, and values outside documented debounce/reconciliation bounds
   return write-disabled settings plus an actionable repair reason.
4. State and archive roots remain exactly `.gkx/effects` and
   `_archive/moc-runs`; they and temporary files remain excluded from indexing.
5. Capability permutations prove planner, adapter, authority, journal, policy,
   lease, recovery, reconciliation, ownership, and operator enablement are
   independent.
6. Authority grants bind operation, normalized target, credential-derived
   actor identity, authority digest, and evaluation time. Expired, malformed,
   mismatched, agent-self-approved, or unconfigured grants reject.
7. Secrets are obtained only from the established host secret provider.
   Settings, status, logs, and test snapshots contain only stable non-secret
   identifiers.

Packet exit evidence: a machine-readable capability-permutation fixture, the
focused TAP output, exact source SHA, and confirmation that read-only users saw
no migration prompt or filesystem write.

### Packet B — ownership and digest-bound adoption

Expected source areas:

- `src/navigation-effects/adoption-registry.ts`
- `src/ui/moc-adoption-modal.ts`
- focused adoption/marker/byte-preservation tests

Local synthetic gate:

1. Every discovered existing MOC begins `unmanaged`; unmanaged targets never
   produce an executable write.
2. Adoption snapshots exact bytes and binds target path, ownership mode,
   adopted digest, actor, time, configuration/policy digests, and receipt ID.
3. The preview displays the same deterministic candidate and exact diff later
   bound by confirmation. A changed re-read digest makes the plan stale.
4. Registry binding and adoption receipt persist atomically and idempotently;
   an ID collision with different bytes fails closed.
5. Adoption does not modify the MOC unless the reviewed plan explicitly
   contains a separate authorized effect.
6. Region management accepts exactly one unnested version-1 marker pair.
   Missing, duplicate, nested, malformed, moved, body/configuration-mismatched,
   or externally changed markers require review and write nothing.
7. LF and CRLF fixtures prove every prefix/suffix byte outside the generated
   region remains exact. Fully managed and create-only plans use distinct
   ownership/absence preconditions.
8. Rename, Unicode normalization, case-collision, and registry-corruption
   fixtures block rather than retarget an adoption silently.

Packet exit evidence: byte-for-byte before/after fixtures, deterministic
registry/receipt digests, stale-plan cases, and UI keyboard/focus assertions
for explicit confirmation.

### Packet C — Obsidian and standalone/native effect adapters

Expected source areas:

- `src/navigation-effects/engine-adapter.ts`
- `src/navigation-effects/obsidian-effect-adapter.ts`
- standalone/native adapter wiring to the qualified Engine Node executor
- journal, archive, lease, receipt, recovery, and rollback integration tests

Local synthetic gate:

1. Both profiles consume the same Engine plan and emit the same contract-level
   state transitions, digests, archive meanings, and receipt meanings.
2. Every target is normalized to NFC with `/` separators and proven inside the
   registered vault/authorized root before disk access.
3. Absolute, drive, UNC, parent/encoded traversal, malformed percent encoding,
   NUL/control, empty segment, backslash, Windows device, trailing-dot/space,
   case/Unicode collision, symlink, junction, reparse-point, and mount escape
   fixtures reject.
4. The transaction follows `RECEIVED -> PLANNED -> PREPARED -> APPLYING ->
   VERIFIED -> COMMITTED`, with only the contracted stale, recovery-required,
   and reason-bound aborted exits.
5. `PREPARED` intent is durable before source replacement. Before-image or
   required absence, manifest, diff, proposed image, after-image, receipt,
   journal predecessor, and checkpoint are digest-bound.
6. Temporary writes use the target directory; the strongest supported flush
   and same-volume replacement are reported honestly. A weaker host primitive
   keeps automatic writes unavailable.
7. The target, authority, policy, ownership, retention hold, configuration,
   and prior digest are rechecked immediately before replacement. External
   bytes win every race.
8. Archive corruption, write/flush/replace/verify/journal/receipt/checkpoint
   failure, permission failure, and disk-full injection leave either no effect
   or a recoverable/blocking durable state. No before-image is lost.
9. Rollback is a new explicit authorized, preconditioned, archived, receipted
   effect; it never deletes the original archive.

Local synthetic adapter tests are necessary but not sufficient. This packet
remains unqualified until the real-process and cross-platform adapter gates in
Sections 6 and 7 pass.

### Packet D — coordinator, reconciliation, and self-write suppression

Expected source areas:

- `src/navigation-effects/event-debouncer.ts`
- `src/navigation-effects/moc-coordinator.ts`
- `src/navigation-effects/reconciliation.ts`
- `src/navigation-effects/recovery-controller.ts`
- `src/navigation-effects/self-write-suppression.ts`
- focused coordinator and watcher fixtures

Local synthetic gate:

1. A fake monotonic clock proves the quiet debounce and maximum-delay bound;
   a continuously active batch cannot postpone forever.
2. Create/modify/rename/delete deliveries coalesce by stable identity, retain
   all relevant old/new paths, and sort targets by deterministic code-unit
   order.
3. Queue and path capacity are bounded. Overflow persists a full-
   reconciliation intent instead of dropping correctness state.
4. `.gkx/**`, `_archive/moc-runs/**`, and verified adapter temporary files are
   ignored before indexing/Navigation context.
5. Only completed durable receipt bindings matching effect ID, normalized
   target path, committed digest, and index generation suppress a self-write.
   No timing fallback exists; external or mismatched bytes always enter the
   index.
6. The coordinator reuses the canonical index, derives only provably complete
   affected scopes and parent/master dependencies, skips byte-identical plans,
   and serializes conflicting targets deterministically.
7. Graph deltas publish only after a verified source commit is re-indexed.
8. Reconciliation compares corpus, configuration, policy, ownership,
   checkpoint, journal, and target digests. Invalid/corrupt inputs block;
   structural drift, incomplete dependencies, overflow, or empty affected
   scope force a full pass.
9. Startup, recovery, resume, overflow, bulk-sync, manual, and periodic reasons
   merge deterministically and persist across shutdown. Intent clears only
   after the resulting checkpoint is durably verified.
10. Startup recovery and reconciliation independently report safe before an
    automatic mode becomes available.

Packet exit evidence: deterministic fake-clock TAP, queue high-water marks,
parse-count assertions for an ordinary edit, reconciliation decision fixtures,
and a no-loop duplicate-delivery fixture.

### Packet E — adversarial, crash, security, scale, and soak tooling

Expected source areas:

- test-only fault-injection adapters and fixture generators;
- child-process crash driver and machine-readable recovery receipts;
- scale/soak runner with bounded logs and environment metadata.

Local synthetic gate:

1. Every adapter failure seam has a deterministic injected case and expected
   terminal/recovery classification.
2. Every redacted surface (logs, errors, status, receipts, audit export) is
   byte-scanned for credential, token, note-body, and conflict canaries.
3. Fixture generators are deterministic and record aggregate corpus/expected-
   plan digests.
4. Queue, lock, session, journal, receipt, and output caps fail closed at the
   boundary and one item beyond it.

This packet supplies tooling; it cannot mark the real-process, cross-platform,
scale, or soak rows complete from mocks alone.

### Packet F — trusted settings, adoption, recovery, status, and audit UI

Expected source areas:

- `src/ui/navigation-effects-settings.ts`
- `src/ui/moc-adoption-modal.ts`
- `src/ui/moc-recovery-view.ts`
- `src/ui/moc-status-view.ts`
- `src/navigation-effects/audit-export.ts`
- browser/accessibility tests

Local synthetic gate:

1. UI labels preserve the capability distinctions in Section 3; “adapter
   available” never renders as “authorized” or “safe.”
2. Write-plane enablement, automatic maintenance, and automatic creation are
   separate explicit controls and remain false after install, migration,
   restore, crash, and invalid settings repair.
3. Adoption shows target, current/proposed digests, ownership, policy/config
   digests, preserved regions, marker region, and exact diff before a human
   confirms.
4. Recovery distinguishes stale, effect-present-verified,
   effect-absent-retryable, conflicting-external-bytes, and ambiguous/corrupt
   states. Ambiguity exposes no “continue automatically” action.
5. Manual reconciliation, archive/receipt inspection, preconditioned rollback,
   and audit export are keyboard reachable and use explicit confirmation.
6. Credentials, raw note bodies, and unredacted conflicts are absent from DOM,
   accessibility names, logs, screenshots, and exported audit bytes.
7. Reduced motion, focus order/restoration, labels, contrast, error summaries,
   and screen-reader status changes receive browser evidence.

Packet exit evidence: Chromium synthetic UI results and DOM/export canary
scans. Firefox/WebKit and supported Obsidian/browser versions remain
cross-platform blockers.

## 5. Common local synthetic command gate

Run from a clean implementation worktree at the exact packet SHA. Record Node,
npm, OS, architecture, Engine dependency resolution, and dirty state.

```text
npm ci
npm run typecheck
npm run build
node --test test/navigation-effects-settings.test.mjs
node --test test/navigation-effects-adoption.test.mjs
node --test test/navigation-effects-adapters.test.mjs
node --test test/navigation-effects-coordination.test.mjs
node --test test/navigation-effects-security.test.mjs
npm test
npm run test:browser
npm run check:invariants
git diff --check
```

Only commands whose test files exist at that packet SHA are applicable. A
missing planned test is recorded as **not implemented**, never skipped as a
pass. Exact test totals and documented skips belong in the qualification
receipt rather than this evergreen plan. Two clean builds must be compared
when the packet changes generated runtime output.

## 6. Real-process crash gate

This is a release blocker for each adapter profile. Exception injection inside
one process is not a substitute.

For each transaction transition and each archive, temp-write, flush, replace,
verify, receipt, journal, and checkpoint boundary:

1. start a child process against a fresh fixture copy;
2. wait for a durable test-only transition signal that contains IDs/digests but
   no content or secret;
3. terminate the child without invoking graceful cleanup;
4. restart with the same durable state;
5. validate journal framing, predecessor hashes, checkpoint, receipt, archive,
   temporary files, lease, target bytes, and source corpus hash;
6. assert exactly one of: effect absent and freshly retryable, effect present
   and verified/committable exactly once, external conflict stale with no
   overwrite, or ambiguity/corruption blocking all writes;
7. rerun recovery to prove idempotency and no duplicate commit/receipt; and
8. retain a bounded machine-readable result bound to the kill point and all
   relevant hashes.

Also exercise graceful shutdown before work, during a queued batch, and at each
safe transaction boundary. If the shutdown budget expires, restart must find
an honest recoverable nonterminal state, not a clean-shutdown claim.

## 7. Cross-platform blockers

The following evidence is required at the exact release-candidate SHA for each
profile intended to ship:

| Host | Required evidence |
|---|---|
| Debian 13 x64, native/Node adapter | ext4 (and any additionally claimed filesystem), symlink/mount containment, file modes, same-volume replace, flush limitation, watcher burst/overflow/resume, SIGTERM, restart recovery |
| Windows 11 x64, native/Node adapter | NTFS, drive/UNC/device/trailing-dot-space rejection, short/long path spelling, case collisions, hard links, junctions/reparse points, sharing violations, replace/flush behavior, process termination/restart |
| macOS 14+ arm64 and x64, native/Node adapter | APFS case-sensitive and claimed case-insensitive behavior, Unicode normalization collisions, symlinks/mounts, replace/flush behavior, sleep/resume watcher recovery, process restart |
| Supported Obsidian profile on each claimed OS | exact Obsidian/Electron/Node versions, Vault lifecycle, rename/delete/bulk-sync, plugin enable/disable, app shutdown, Secret Storage unavailable/locked, adapter parity receipts |
| Browser/operator UI | Chromium, Firefox, and WebKit coverage for settings, adoption, stale/recovery/corrupt states, rollback, audit, keyboard/focus, reduced motion, and redaction |

A platform limitation is recorded and keeps the affected automatic mode false.
It must not be hidden by a compatibility shim or described as stronger
durability than the host demonstrated.

## 8. Scale and convergence evidence

Run deterministic fixtures with 100, 2,000, 10,000, and 50,000 notes. Record
fixture generator/version/digest, MOC/dependency distribution, changed paths,
hardware, OS, filesystem, runtime versions, and exact command.

For each size, retain raw measurements for:

- event-to-index, event-to-plan, and event-to-verified-MOC convergence;
- incremental and full parse counts;
- ordinary edit, 50-note burst, rename, delete, missed event, and overflow;
- pending/coalesced/reconciliation queue high-water marks and backpressure;
- process and heap memory high-water marks;
- journal/checkpoint/archive growth and compaction behavior, if implemented;
- lock hold/wait durations and concurrent-target serialization;
- startup recovery and full/incremental reconciliation duration; and
- byte-identical no-op rate and self-write redelivery count.

The working objectives are P95 below two seconds for an ordinary edit on the
declared 2,000-note fixture and P95 below five seconds for the declared 50-note
burst. They are objectives to measure, not claims or permission to discard a
run. A miss is reported with raw evidence and remains an owner-reviewed release
blocker. No “ordinary edit is incremental” claim is allowed unless the parse
counter proves it for that fixture.

## 9. Twenty-four-hour soak blocker

Run only after the applicable cross-platform adapter and crash gates pass. At
minimum, execute one 24-hour soak for every host profile selected for the
release candidate; if a profile is omitted, it remains unqualified.

The deterministic schedule must include ordinary edits, bursts, renames,
deletes, duplicated deliveries, intentionally missed deliveries, watcher
overflow/error, periodic reconciliation, sleep/resume where supported, one
clean restart, and one crash/recovery cycle. Automatic creation remains off
unless that distinct capability is in release scope and independently
authorized.

Record start/end timestamps, event seed and counts, committed/no-op/stale/
blocked effect counts, reconciliation reasons/results, watcher faults, queue
and memory high-water marks, journal/archive growth, parse counts, convergence
samples, shutdown/restart results, and bounded raw-log digests. The source
fixture's human regions and a secret-canary scan must pass at the end.

The soak fails on lost before-images, silent overwrite, unexplained divergence,
unbounded growth, self-write loop, corrupt/ambiguous state that did not block,
credential/content disclosure, or an automatic-mode enablement while recovery
or reconciliation was unsafe. A completed 24-hour clock alone is not a pass.

## 10. Evidence and handoff format

Each packet hands the orchestrator a bounded receipt containing:

- repository base/result SHA, branch, clean-tree state, and changed paths;
- Engine version/commit, effects contract version, dependency integrity, and
  experimental/release standing;
- exact commands, exit codes, test totals, failures, and documented skips;
- applicable fixture and artifact SHA-256 values;
- implemented/configured/authorized/runtime-safe/qualified/released labels;
- fault, crash, path-security, canary, byte-preservation, and recovery results;
- unavailable gates and the reason they remain blocked; and
- reviewer identity for deliberate snapshot, durability, or contract changes.

The orchestrator reruns shared gates after integrating each packet. It stops on
contract drift, a hidden write-enablement path, a Navigation 1.0 executor
import, a non-immutable/floating Engine dependency, unexplained test weakening,
or any failure to preserve source bytes and external edits.

## 11. Release-blocker summary

Local synthetic packets may be integrated for further development when their
focused and repository gates pass. None of the following may be inferred from
that integration:

- Obsidian or standalone/native adapter qualification;
- cross-platform filesystem safety or durable atomicity;
- exactly-once crash recovery;
- scale objectives;
- 24-hour watcher/reconciliation stability;
- authorization of any existing MOC adoption;
- enablement of automatic maintenance or creation;
- production readiness of an experimental Engine effects dependency; or
- release, signing, publication, deployment, or GKOS conformance.

Those remain explicit blockers until their receipts exist at the exact
release-candidate source and artifact hashes.
