import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MOC_WRITE_SETTINGS,
  UnconfiguredEffectsAuthorityProvider,
  deriveNavigationEffectsStatus,
  migrateMocWriteSettings,
  policyMatchesReference,
  validateAuthorityGrant,
} from "../dist/kosmos-navigation-effects.mjs";

const digest = `sha256:${"a".repeat(64)}`;
const valid = {
  schemaVersion: 1,
  enabled: true,
  automaticMaintenanceEnabled: true,
  automaticCreationEnabled: false,
  debounceMs: 750,
  maximumDebounceMs: 3000,
  periodicReconciliationEnabled: true,
  periodicReconciliationMinutes: 5,
  archiveRoot: "_archive/moc-runs",
  stateRoot: ".gkx/effects",
  policyRef: { id: "local-moc-policy", version: "1.0.0", digest },
};

test("Navigation Effects settings are absent and write-disabled by default", () => {
  const result = migrateMocWriteSettings(undefined);
  assert.deepEqual(result.settings, DEFAULT_MOC_WRITE_SETTINGS);
  assert.equal(result.settings.enabled, false);
  assert.equal(result.settings.automaticMaintenanceEnabled, false);
  assert.equal(result.settings.automaticCreationEnabled, false);
  assert.equal(result.repaired, false);
});

test("valid explicit v1 settings round-trip without silently enabling creation", () => {
  const result = migrateMocWriteSettings(valid);
  assert.equal(result.repaired, false);
  assert.deepEqual(result.issues, []);
  assert.equal(result.settings.enabled, true);
  assert.equal(result.settings.automaticMaintenanceEnabled, true);
  assert.equal(result.settings.automaticCreationEnabled, false);
});

test("unknown, malformed, out-of-bounds, and incoherent settings fail closed", () => {
  for (const candidate of [
    { ...valid, schemaVersion: 2 },
    { ...valid, surprise: true },
    { ...valid, debounceMs: 1 },
    { ...valid, maximumDebounceMs: 500 },
    { ...valid, periodicReconciliationMinutes: 0 },
    { ...valid, archiveRoot: "elsewhere" },
    { ...valid, policyRef: { ...valid.policyRef, digest: "sha256:ABC" } },
    { ...valid, enabled: false, automaticMaintenanceEnabled: true },
  ]) {
    const result = migrateMocWriteSettings(candidate);
    assert.equal(result.repaired, true);
    assert.ok(result.issues.length > 0);
    assert.equal(result.settings.enabled, false);
    assert.equal(result.settings.automaticMaintenanceEnabled, false);
    assert.equal(result.settings.automaticCreationEnabled, false);
  }
});

test("policy matching binds exact id, version, and lowercase digest", () => {
  assert.equal(policyMatchesReference({ ...valid.policyRef, allows: ["maintain-managed-moc"] }, valid.policyRef), true);
  assert.equal(policyMatchesReference({ ...valid.policyRef, digest: `sha256:${"b".repeat(64)}`, allows: [] }, valid.policyRef), false);
  assert.equal(policyMatchesReference(null, valid.policyRef), false);
});

test("connectivity supplies no authority and grants bind actor, credential, target, time, and digest", async () => {
  const provider = new UnconfiguredEffectsAuthorityProvider();
  assert.equal(provider.configured, false);
  const request = { operation: "maintain-managed-moc", targetPath: "Maps/Index.md", evaluationTime: "2026-08-26T12:00:00.000Z" };
  assert.equal(await provider.resolve(request), null);
  const grant = { actor: { actorId: "operator-1", actorType: "human", credentialId: "credential-1" }, operation: request.operation, targetPath: request.targetPath, authorityDigest: digest, expiresAt: "2026-08-26T12:05:00.000Z" };
  assert.equal(validateAuthorityGrant(grant, request), true);
  assert.equal(validateAuthorityGrant({ ...grant, targetPath: "Other.md" }, request), false);
  assert.equal(validateAuthorityGrant({ ...grant, expiresAt: request.evaluationTime }, request), false);
});

test("capability, authority, safety, ownership, and automatic settings remain independent", () => {
  const base = {
    navigationAvailable: true,
    plannerAvailable: true,
    hostAdapterConfigured: true,
    authorityProviderConfigured: true,
    durableJournalConfigured: true,
    policyConfigured: true,
    policyDigestValid: true,
    vaultLeaseHeld: true,
    startupRecoverySafe: true,
    reconciliationSafe: true,
    ownershipBindingValid: true,
    settings: migrateMocWriteSettings(valid).settings,
  };
  const ready = deriveNavigationEffectsStatus(base);
  assert.equal(ready.applyManagedMocAdvertised, true);
  assert.equal(ready.automaticMaintenanceAvailable, true);
  assert.equal(ready.automaticCreationAvailable, false);

  const adapterOnly = deriveNavigationEffectsStatus({ ...base, authorityProviderConfigured: false });
  assert.equal(adapterOnly.applyManagedMocAdvertised, false);
  assert.equal(adapterOnly.automaticMaintenanceAvailable, false);
  assert.match(adapterOnly.blockingReasons.join(" "), /Authority provider/);

  const unreconciled = deriveNavigationEffectsStatus({ ...base, reconciliationSafe: false });
  assert.equal(unreconciled.applyManagedMocAdvertised, true);
  assert.equal(unreconciled.automaticMaintenanceAvailable, false);
});
