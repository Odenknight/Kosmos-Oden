/**
 * Pure Navigation Effects configuration and status types.
 *
 * This module deliberately has no Engine or host imports. It describes
 * configuration intent and truthful readiness signals; it grants no authority
 * and exposes no filesystem operation.
 */

export const NAVIGATION_EFFECTS_SETTINGS_SCHEMA = 1 as const;

export interface NavigationEffectsPolicyRef {
  id: string;
  version: string;
  digest: string;
}

export interface NavigationEffectsSettings {
  schemaVersion: typeof NAVIGATION_EFFECTS_SETTINGS_SCHEMA;
  enabled: boolean;
  automaticMaintenanceEnabled: boolean;
  automaticCreationEnabled: boolean;
  debounceMs: number;
  maximumDebounceMs: number;
  periodicReconciliationEnabled: boolean;
  periodicReconciliationMinutes: number;
  archiveRoot: "_archive/moc-runs";
  stateRoot: ".gkx/effects";
  policyRef: NavigationEffectsPolicyRef;
}

export type NavigationEffectsSettingsDiagnosticCode =
  | "settings-not-object"
  | "schema-version-missing"
  | "schema-version-unsupported"
  | "unknown-setting"
  | "invalid-boolean"
  | "invalid-debounce"
  | "invalid-maximum-debounce"
  | "maximum-debounce-before-debounce"
  | "invalid-reconciliation-interval"
  | "automatic-creation-requires-maintenance"
  | "fixed-root-mismatch"
  | "policy-not-object"
  | "unknown-policy-setting"
  | "invalid-policy-reference";

export interface NavigationEffectsSettingsDiagnostic {
  code: NavigationEffectsSettingsDiagnosticCode;
  path: string;
  message: string;
  repairRequired: true;
}

export interface NavigationEffectsSettingsMigration {
  settings: NavigationEffectsSettings;
  diagnostics: NavigationEffectsSettingsDiagnostic[];
  repairRequired: boolean;
}

/** Runtime facts supplied by a future coordinator. Defaults must all be false. */
export interface NavigationEffectsRuntimeFacts {
  navigation1Available: boolean;
  plannerAvailable: boolean;
  hostAdapterConfigured: boolean;
  authorityProviderConfigured: boolean;
  durableJournalConfigured: boolean;
  policyConfigured: boolean;
  policyDigestValid: boolean;
  vaultLeaseHeld: boolean;
  startupRecoverySafe: boolean;
  reconciliationSafe: boolean;
  ownershipEligible: boolean;
  creationAuthorized: boolean;
}

export type NavigationEffectsStatusState =
  | "available"
  | "unavailable"
  | "configured"
  | "unconfigured"
  | "valid"
  | "invalid"
  | "held"
  | "not-held"
  | "safe"
  | "unsafe"
  | "eligible"
  | "ineligible"
  | "enabled"
  | "disabled"
  | "blocked";

export interface NavigationEffectsStatusItem {
  ready: boolean;
  state: NavigationEffectsStatusState;
  reasonCode: string;
}

/** Each field is independent; consumers must not collapse these into one flag. */
export interface NavigationEffectsStatus {
  standing: "draft-integration-only";
  settingsRepairRequired: boolean;
  navigation1: NavigationEffectsStatusItem;
  planner: NavigationEffectsStatusItem;
  hostAdapter: NavigationEffectsStatusItem;
  authorityProvider: NavigationEffectsStatusItem;
  journal: NavigationEffectsStatusItem;
  policyDigest: NavigationEffectsStatusItem;
  lease: NavigationEffectsStatusItem;
  recovery: NavigationEffectsStatusItem;
  reconciliation: NavigationEffectsStatusItem;
  ownership: NavigationEffectsStatusItem;
  automaticMaintenance: NavigationEffectsStatusItem;
  automaticCreation: NavigationEffectsStatusItem;
}
