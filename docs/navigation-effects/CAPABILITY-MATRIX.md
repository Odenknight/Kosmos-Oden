# Navigation and Navigation Effects capability matrix

Status: **draft integration guidance only**
Date: 2026-08-27

This matrix records the capability semantics to preserve while reconciling the
separately versioned Navigation Effects plane into Kosmos-Oden. It does not
claim that Kosmos implements, configures, authorizes, qualifies, or releases an
Effects runtime.

## Audited coordinates

| Repository surface | Audited coordinate | Factual standing |
| --- | --- | --- |
| Kosmos-Oden reconciliation branch | `feature/navigation-effects-reconciliation-20260827@dd92d07cf49e50583108dbca31a89d4efbd37863` | Pins released `gkos-engine#v2.1.1`; contains the read-only Navigation 1.0 adapter and no `src/navigation-effects/` implementation or Effects settings |
| Reconciled Engine candidate | `integration/navigation-effects-reconciliation-20260827@41172b9f94dcda7b3bb81e2752a16cf63a7e54b7` | Candidate contract/source evidence only; not the dependency installed by Kosmos |
| Effects contract | `ENGINE-NAV-EFFECTS-CONTRACT-1.0.0` | `standing: integration-only`, `gkos_conformance: false`, implementation phase `node-executor-experimental`, unreleased Engine target 2.2.0 |

The reconciled Engine candidate does not turn its package version, its Node
executor, or Kosmos into a released Engine 2.2 integration. Import success,
source reachability, and test fixtures are not runtime configuration or write
authority.

## Status vocabulary

Capability reporting must keep these questions separate:

| State | Meaning | Must not be inferred from |
| --- | --- | --- |
| **Available** | The exact contract/code surface is reachable at the selected immutable dependency coordinate | A package name, a floating branch, or documentation |
| **Configured** | A required host service or exact policy binding has been supplied and validated | Import success, bearer-token possession, or client connectivity |
| **Authorized** | A current credential-bound grant permits the specific actor, operation, vault, root, object class, and sensitivity | Configuration alone, model confidence, identity labels, or timestamps |
| **Safe** | Runtime recovery and reconciliation independently prove that effects may proceed | A static capability flag or a clean process start |
| **Enabled** | The operator explicitly enabled the relevant automatic mode after all stricter gates passed | Migration, installation, upgrade, restore, or crash recovery |
| **Qualified** | Applicable parity, security, path, race, crash, durability, scale, and soak evidence exists at exact commits | Unit tests or integration-only fixtures alone |
| **Released** | An owner-authorized immutable artifact and integrity binding were published | A development pin or release target |

Unknown, missing, invalid, stale, or contradictory state is false for effect
enablement. No state automatically advances to the next one.

## Capability matrix

| Capability or gate | Current Kosmos state | Reconciled Engine semantics | Fail-closed default | Minimum condition before a host may report it ready |
| --- | --- | --- | --- | --- |
| **Navigation 1.0** | Present through Engine v2.1.1 and `src/navigation-integration.ts`; product enablement remains opt-in | Deterministic discovery, classification, candidate, diff, audit, context, and planning values; `apply_moc`, `source_content_write`, archive deletion, and rollback execution remain false | Read-only; no source effect | Exact released Engine pin plus the existing Kosmos Navigation setting; enabling Navigation still does not enable Effects |
| **Effects planner** | Not present in the installed Kosmos dependency | The framework-neutral Effects contract can advertise `plan_moc_apply: true`; planning produces deterministic values and performs no filesystem effect | Unavailable in Kosmos; planning alone grants nothing | Exact reviewed Effects dependency coordinate and contract compatibility; report planner availability separately from every execution gate |
| **Host adapter** | Not configured or implemented in this branch | `atomic_replace` depends on an explicitly configured host adapter; merely importing the optional Node executor is insufficient | `adapter: false` | A qualified Kosmos host adapter for the active profile with vault containment, path policy, snapshot, precondition, archive, replace, verify, and durability behavior declared honestly |
| **Authority provider** | Absent | Static Effects capability input is `authority_provider`; each request must still validate the current actor, grant, capability, scope, root, object class, sensitivity ceiling, policy binding, expiry, and retention state | `authority_provider: false`; request denied | Explicit host provider plus a valid credential-bound grant for the exact requested effect; connectivity and tokens alone never supply authority |
| **Durable journal** | Absent | Apply and rollback infrastructure requires a durable journal; the experimental Node executor defines hash-chained entries, checkpoints, receipts, and corruption blocking | `durable_journal: false` | Qualified host wiring with durable intent before source replacement, validated predecessor hashes/checkpoints/receipts, and honest platform durability limits |
| **Policy digest** | No Effects policy is configured | Capability input `policy` is only valid after the host checks an exact policy reference and digest; each plan and authority binding must agree with the same digest | `policy: false`; mismatch or drift denies planning/execution | Exact policy ID, version, and lowercase SHA-256 digest validated against current bytes and rebound into plan, authority, archive, receipt, and status |
| **Vault lease** | No Effects lease exists | The experimental Node executor uses a single-writer vault lease; lease possession is runtime state, not a field proven by the static configured-capability envelope | Not held | Qualified adapter acquires and validates one vault-scoped lease, rejects live/ambiguous ownership, receipts any safe stale cleanup, and releases it only at a safe boundary |
| **Startup recovery** | No Effects recovery controller is wired | Static `startup_recovery` reachability requires adapter, journal, and policy, but reachability does not mean recovery is safe; conflicting or corrupt state closes a write latch | Unsafe/not run | Lease held; journal, checkpoints, archives, receipts, temporary files, and targets classified; every nonterminal effect resolved or safely blocking; `safeToEnableWrites` true |
| **Reconciliation** | No Effects reconciliation runtime exists | The reconciled Engine mechanisms do not supply the Kosmos watcher/coordinator reconciliation source of correctness | Unsafe/not run | Current corpus, configuration, policy, ownership, checkpoint, journal, and target digests converge; unresolved scopes persist; missed-event/full-pass rules prove completeness |
| **MOC ownership** | No adoption registry or Effects ownership UI exists; existing MOCs remain outside an Effects runtime | Contract ownership is `unmanaged`, `region-managed`, or `fully-managed`; unmanaged denies apply; adoption and creation require digest-bound bindings | Every existing MOC is `unmanaged` | Explicit human adoption of exact current bytes, durable ownership binding/receipt, marker validation for region management, and immediate pre-effect digest recheck |
| **Automatic maintenance** | No setting or runtime exists | Not an Engine capability flag; it is a stricter Kosmos operator setting layered above configured apply infrastructure and runtime safety | Off and unavailable | Planner available; adapter, authority provider, journal, and policy configured; policy digest valid; lease held; recovery and reconciliation safe; eligible ownership; operator explicitly enables maintenance |
| **Automatic creation** | No setting or runtime exists | Separate from maintenance; an absent target can be planned only when fully managed creation is explicitly authorized | Off and unavailable | Every maintenance gate plus explicit creation setting, exact authorized root/path, `creationAuthorized: true`, required-absence precondition, and a current grant permitting creation |

## Configured capability is not effect authority

The reconciled Engine helper computes configured infrastructure as follows:

```text
configured_apply_infrastructure =
  adapter
  AND authority_provider
  AND durable_journal
  AND policy
```

When that expression is true, the Engine capability document may report
`apply_managed_moc: true`. That value means the four infrastructure categories
were supplied to the capability reporter. It does **not** prove any of the
following:

- that the current actor has a valid grant for the requested MOC effect;
- that the policy bytes still match the reported digest;
- that a vault lease is held;
- that startup recovery is complete and safe;
- that reconciliation is complete and safe;
- that the target is adopted and eligible for its ownership mode;
- that current target bytes satisfy the plan precondition;
- that automatic maintenance or creation is enabled; or
- that the adapter or product has passed qualification or release gates.

Kosmos status must therefore expose those states independently and apply the
stricter runtime gate below.

## Kosmos automatic-effect gate

Automatic maintenance may be considered only when every term is true:

```text
planner_available
AND adapter_configured
AND authority_provider_configured
AND durable_journal_configured
AND policy_digest_valid
AND vault_lease_held
AND startup_recovery_safe
AND reconciliation_safe
AND ownership_eligible
AND automatic_maintenance_enabled
AND current_request_authorized
AND current_preconditions_match
```

Automatic creation additionally requires:

```text
automatic_creation_enabled
AND fully_managed_creation_binding
AND creation_authorized
AND target_required_absent
```

Any false, unknown, stale, unavailable, or error result blocks the effect. A
failed gate must produce truthful status and review/recovery guidance, not a
degraded write path.

## Ownership-specific truth table

| Ownership state | Existing target | Absent target | Automatic effect |
| --- | --- | --- | --- |
| `unmanaged` | May be discovered and diffed; no apply | No creation | Denied |
| `region-managed` | Only one exact, valid version-1 generated region may be replaced; every byte outside it remains exact | Invalid ownership shape for creation | Allowed only after all global gates and current marker/digest checks pass |
| `fully-managed` | Current bytes must match the digest-bound adoption binding | Requires explicit `creationAuthorized: true` and an absence precondition | Allowed only after all global gates and the relevant maintenance/creation setting pass |

Missing, duplicate, nested, malformed, moved, body-changed, or
configuration-mismatched markers require review and no write. An external edit
or digest mismatch always wins over a stale plan.

## Status presentation requirements

A future trusted operator surface should show at least these independent lines,
without collapsing them into a single green indicator:

```text
Navigation 1.0 available / enabled
Navigation Effects planner available
host adapter configured
authority provider configured
durable journal configured
policy configured / digest valid
vault lease held
startup recovery safe
reconciliation safe
ownership binding eligible
automatic maintenance enabled
automatic creation enabled
```

“Adapter available” must never render as “write authorized.” “Recovery
available” must never render as “recovery safe.” “Planner available” must never
render as “managed MOCs enabled.”

## Current integration conclusion

At the audited Kosmos coordinate, Navigation 1.0 is the only product-integrated
surface in this matrix. It remains read-only and continues to advertise
`apply_moc: false`. All Effects rows are unconfigured and unavailable in the
Kosmos runtime.

The reconciled Engine branch is candidate integration evidence for a separately
versioned Effects plane. It supplies no Kosmos settings, host adapter,
authority, policy ratification, ownership adoption, coordinator,
reconciliation, automatic enablement, release artifact, or conformance
standing. Until those independent gates exist and pass, the truthful product
state is: **Navigation read-only; Navigation Effects not integrated; automatic
maintenance and creation unavailable and off.**
