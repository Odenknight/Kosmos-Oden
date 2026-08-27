import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({
  stdin: {
    contents: `
      export * from "./src/navigation-effects/types.ts";
      export * from "./src/navigation-effects/settings.ts";
      export * from "./src/navigation-effects/status.ts";
      export {
        AGENT_SETTINGS_SCHEMA,
        DEFAULT_AGENT_SETTINGS,
        getNavigationEffectsSettingsMigration,
        migrateAgentSettings,
      } from "./src/plugin/agent-server.ts";
    `,
    resolveDir: process.cwd(),
    sourcefile: "navigation-effects-test-entry.ts",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
});

const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);

const {
  DEFAULT_NAVIGATION_EFFECTS_SETTINGS,
  AGENT_SETTINGS_SCHEMA,
  DEFAULT_AGENT_SETTINGS,
  buildNavigationEffectsStatus,
  getNavigationEffectsSettingsMigration,
  migrateAgentSettings,
  migrateNavigationEffectsSettings,
} = api;

function validSettings(overrides = {}) {
  return {
    ...DEFAULT_NAVIGATION_EFFECTS_SETTINGS,
    policyRef: {
      id: "local-policy",
      version: "1",
      digest: `sha256:${"a".repeat(64)}`,
    },
    ...overrides,
  };
}

test("fresh install defaults every Effects/write/automatic setting closed", () => {
  const migrated = migrateNavigationEffectsSettings(undefined);
  assert.equal(migrated.repairRequired, false);
  assert.deepEqual(migrated.diagnostics, []);
  assert.deepEqual(migrated.settings, {
    schemaVersion: 1,
    enabled: false,
    automaticMaintenanceEnabled: false,
    automaticCreationEnabled: false,
    debounceMs: 750,
    maximumDebounceMs: 3000,
    periodicReconciliationEnabled: true,
    periodicReconciliationMinutes: 5,
    archiveRoot: "_archive/moc-runs",
    stateRoot: ".gkx/effects",
    policyRef: { id: "", version: "", digest: "" },
  });
});

test("unknown schema, values, fields, roots, and policy fail closed with repair diagnostics", () => {
  const migrated = migrateNavigationEffectsSettings({
    schemaVersion: 99,
    enabled: true,
    automaticMaintenanceEnabled: true,
    automaticCreationEnabled: true,
    debounceMs: 0,
    maximumDebounceMs: 1,
    periodicReconciliationEnabled: "yes",
    periodicReconciliationMinutes: 0,
    archiveRoot: "Notes",
    stateRoot: ".elsewhere",
    policyRef: { id: "p", version: "1", digest: "SHA256:NO", surprise: true },
    futureAuthorityShortcut: true,
  });
  assert.equal(migrated.repairRequired, true);
  assert.equal(migrated.settings.enabled, false);
  assert.equal(migrated.settings.automaticMaintenanceEnabled, false);
  assert.equal(migrated.settings.automaticCreationEnabled, false);
  assert.equal(migrated.settings.archiveRoot, "_archive/moc-runs");
  assert.equal(migrated.settings.stateRoot, ".gkx/effects");
  assert.deepEqual(migrated.settings.policyRef, { id: "", version: "", digest: "" });
  assert.deepEqual(new Set(migrated.diagnostics.map((entry) => entry.code)), new Set([
    "schema-version-unsupported",
    "unknown-setting",
    "invalid-boolean",
    "invalid-debounce",
    "invalid-maximum-debounce",
    "invalid-reconciliation-interval",
    "fixed-root-mismatch",
    "unknown-policy-setting",
    "invalid-policy-reference",
  ]));
});

test("valid explicit settings preserve bounded timing and exact policy binding", () => {
  const migrated = migrateNavigationEffectsSettings(validSettings({
    enabled: true,
    automaticMaintenanceEnabled: true,
    automaticCreationEnabled: true,
    debounceMs: 100,
    maximumDebounceMs: 30_000,
    periodicReconciliationMinutes: 1_440,
  }));
  assert.equal(migrated.repairRequired, false);
  assert.equal(migrated.settings.enabled, true);
  assert.equal(migrated.settings.automaticMaintenanceEnabled, true);
  assert.equal(migrated.settings.automaticCreationEnabled, true);
  assert.equal(migrated.settings.debounceMs, 100);
  assert.equal(migrated.settings.maximumDebounceMs, 30_000);
  assert.equal(migrated.settings.periodicReconciliationMinutes, 1_440);
  assert.match(migrated.settings.policyRef.digest, /^sha256:[0-9a-f]{64}$/);
});

test("status reports every capability independently and blocks automatic modes by default", () => {
  const migrated = migrateNavigationEffectsSettings(undefined);
  const status = buildNavigationEffectsStatus(migrated, { navigation1Available: true, plannerAvailable: true });
  assert.equal(status.standing, "draft-integration-only");
  assert.deepEqual(status.navigation1, { ready: true, state: "available", reasonCode: "navigation-1-available" });
  assert.equal(status.planner.ready, true);
  assert.equal(status.hostAdapter.ready, false);
  assert.equal(status.authorityProvider.ready, false);
  assert.equal(status.journal.ready, false);
  assert.equal(status.policyDigest.ready, false);
  assert.equal(status.lease.ready, false);
  assert.equal(status.recovery.ready, false);
  assert.equal(status.reconciliation.ready, false);
  assert.equal(status.ownership.ready, false);
  assert.equal(status.automaticMaintenance.state, "disabled");
  assert.equal(status.automaticCreation.state, "disabled");
});

test("automatic status stays blocked until every independent runtime gate passes", () => {
  const migrated = migrateNavigationEffectsSettings(validSettings({
    enabled: true,
    automaticMaintenanceEnabled: true,
    automaticCreationEnabled: true,
  }));
  const almost = {
    plannerAvailable: true,
    hostAdapterConfigured: true,
    authorityProviderConfigured: true,
    durableJournalConfigured: true,
    policyConfigured: true,
    policyDigestValid: true,
    vaultLeaseHeld: true,
    startupRecoverySafe: true,
    reconciliationSafe: false,
    ownershipEligible: true,
    creationAuthorized: true,
  };
  const blocked = buildNavigationEffectsStatus(migrated, almost);
  assert.equal(blocked.automaticMaintenance.state, "blocked");
  assert.equal(blocked.automaticCreation.state, "blocked");

  const maintenance = buildNavigationEffectsStatus(migrated, { ...almost, reconciliationSafe: true, creationAuthorized: false });
  assert.equal(maintenance.automaticMaintenance.state, "enabled");
  assert.equal(maintenance.automaticCreation.state, "blocked");

  const ready = buildNavigationEffectsStatus(migrated, { ...almost, reconciliationSafe: true });
  assert.equal(ready.automaticMaintenance.state, "enabled");
  assert.equal(ready.automaticCreation.state, "enabled");
});

test("invalid runtime fact types and creation without maintenance fail closed", () => {
  const invalidSettings = migrateNavigationEffectsSettings(validSettings({
    enabled: true,
    automaticMaintenanceEnabled: false,
    automaticCreationEnabled: true,
  }));
  assert.equal(invalidSettings.repairRequired, true);
  assert.ok(invalidSettings.diagnostics.some((entry) => entry.code === "automatic-creation-requires-maintenance"));

  const safeSettings = migrateNavigationEffectsSettings(validSettings({ enabled: true }));
  const status = buildNavigationEffectsStatus(safeSettings, {
    // Deliberately bypass TypeScript to exercise a persisted/IPC boundary.
    plannerAvailable: "yes",
    hostAdapterConfigured: 1,
  });
  assert.equal(status.planner.ready, false);
  assert.equal(status.hostAdapter.ready, false);
});

test("single plugin settings migration adds quiet, disabled Effects defaults", () => {
  const legacy = migrateAgentSettings({
    schemaVersion: 8,
    agentEnabled: true,
    agentToken: "existing-token",
  });
  assert.equal(legacy.schemaVersion, AGENT_SETTINGS_SCHEMA);
  assert.equal(legacy.agentEnabled, true);
  assert.equal(legacy.agentToken, "existing-token");
  assert.deepEqual(legacy.navigationEffects, {
    ...DEFAULT_NAVIGATION_EFFECTS_SETTINGS,
    policyRef: { ...DEFAULT_NAVIGATION_EFFECTS_SETTINGS.policyRef },
  });
  assert.equal(getNavigationEffectsSettingsMigration(legacy).repairRequired, false);
  assert.equal(DEFAULT_AGENT_SETTINGS.navigationEffects.enabled, false);
  assert.equal(DEFAULT_AGENT_SETTINGS.navigationEffects.automaticMaintenanceEnabled, false);
  assert.equal(DEFAULT_AGENT_SETTINGS.navigationEffects.automaticCreationEnabled, false);
});

test("plugin migration retains malformed Effects diagnostics in memory and saves sanitized state", () => {
  const migrated = migrateAgentSettings({
    schemaVersion: 8,
    navigationEffects: {
      schemaVersion: 500,
      enabled: true,
      automaticMaintenanceEnabled: true,
      automaticCreationEnabled: true,
      stateRoot: "../../escape",
      unknownAuthority: "self",
    },
  });
  const retained = getNavigationEffectsSettingsMigration(migrated);
  assert.equal(retained.repairRequired, true);
  assert.ok(retained.diagnostics.some((entry) => entry.code === "schema-version-unsupported"));
  assert.ok(retained.diagnostics.some((entry) => entry.code === "unknown-setting"));
  assert.ok(retained.diagnostics.some((entry) => entry.code === "fixed-root-mismatch"));
  assert.equal(migrated.navigationEffects.enabled, false);
  assert.equal(migrated.navigationEffects.automaticMaintenanceEnabled, false);
  assert.equal(migrated.navigationEffects.automaticCreationEnabled, false);
  assert.equal(migrated.navigationEffects.stateRoot, ".gkx/effects");

  // The existing save path spreads AgentSettings; only sanitized nested data is
  // enumerable. Repair diagnostics remain in memory and are not persisted.
  const persisted = { ...migrated };
  assert.deepEqual(persisted.navigationEffects, migrated.navigationEffects);
  assert.equal("navigationEffectsDiagnostics" in persisted, false);
  assert.equal(getNavigationEffectsSettingsMigration(migrated), retained);
});
