import {
  NAVIGATION_EFFECTS_SETTINGS_SCHEMA,
  type NavigationEffectsPolicyRef,
  type NavigationEffectsSettings,
  type NavigationEffectsSettingsDiagnostic,
  type NavigationEffectsSettingsMigration,
} from "./types";

export const NAVIGATION_EFFECTS_ARCHIVE_ROOT = "_archive/moc-runs" as const;
export const NAVIGATION_EFFECTS_STATE_ROOT = ".gkx/effects" as const;
export const NAVIGATION_EFFECTS_DEFAULT_DEBOUNCE_MS = 750;
export const NAVIGATION_EFFECTS_DEFAULT_MAXIMUM_DEBOUNCE_MS = 3_000;
export const NAVIGATION_EFFECTS_MIN_DEBOUNCE_MS = 100;
export const NAVIGATION_EFFECTS_MAX_DEBOUNCE_MS = 3_000;
export const NAVIGATION_EFFECTS_MIN_MAXIMUM_DEBOUNCE_MS = 750;
export const NAVIGATION_EFFECTS_MAX_MAXIMUM_DEBOUNCE_MS = 30_000;
export const NAVIGATION_EFFECTS_DEFAULT_RECONCILIATION_MINUTES = 5;
export const NAVIGATION_EFFECTS_MIN_RECONCILIATION_MINUTES = 1;
export const NAVIGATION_EFFECTS_MAX_RECONCILIATION_MINUTES = 1_440;

const POLICY_DIGEST = /^sha256:[0-9a-f]{64}$/;

const EMPTY_POLICY_REF: NavigationEffectsPolicyRef = Object.freeze({
  id: "",
  version: "",
  digest: "",
});

export const DEFAULT_NAVIGATION_EFFECTS_SETTINGS: Readonly<NavigationEffectsSettings> = Object.freeze({
  schemaVersion: NAVIGATION_EFFECTS_SETTINGS_SCHEMA,
  enabled: false,
  automaticMaintenanceEnabled: false,
  automaticCreationEnabled: false,
  debounceMs: NAVIGATION_EFFECTS_DEFAULT_DEBOUNCE_MS,
  maximumDebounceMs: NAVIGATION_EFFECTS_DEFAULT_MAXIMUM_DEBOUNCE_MS,
  periodicReconciliationEnabled: true,
  periodicReconciliationMinutes: NAVIGATION_EFFECTS_DEFAULT_RECONCILIATION_MINUTES,
  archiveRoot: NAVIGATION_EFFECTS_ARCHIVE_ROOT,
  stateRoot: NAVIGATION_EFFECTS_STATE_ROOT,
  policyRef: EMPTY_POLICY_REF,
});

const SETTING_KEYS = new Set([
  "schemaVersion",
  "enabled",
  "automaticMaintenanceEnabled",
  "automaticCreationEnabled",
  "debounceMs",
  "maximumDebounceMs",
  "periodicReconciliationEnabled",
  "periodicReconciliationMinutes",
  "archiveRoot",
  "stateRoot",
  "policyRef",
]);

const POLICY_KEYS = new Set(["id", "version", "digest"]);

function defaults(): NavigationEffectsSettings {
  return {
    ...DEFAULT_NAVIGATION_EFFECTS_SETTINGS,
    policyRef: { ...EMPTY_POLICY_REF },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addDiagnostic(
  diagnostics: NavigationEffectsSettingsDiagnostic[],
  code: NavigationEffectsSettingsDiagnostic["code"],
  path: string,
  message: string,
): void {
  diagnostics.push({ code, path, message, repairRequired: true });
}

function readBoolean(
  raw: Record<string, unknown>,
  key: "enabled" | "automaticMaintenanceEnabled" | "automaticCreationEnabled" | "periodicReconciliationEnabled",
  fallback: boolean,
  diagnostics: NavigationEffectsSettingsDiagnostic[],
): boolean {
  if (!(key in raw)) return fallback;
  if (typeof raw[key] === "boolean") return raw[key];
  addDiagnostic(diagnostics, "invalid-boolean", key, `${key} must be a boolean.`);
  return fallback;
}

function readBoundedInteger(
  raw: Record<string, unknown>,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
  code: NavigationEffectsSettingsDiagnostic["code"],
  diagnostics: NavigationEffectsSettingsDiagnostic[],
): number {
  if (!(key in raw)) return fallback;
  const value = raw[key];
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum) return value;
  addDiagnostic(diagnostics, code, key, `${key} must be an integer from ${minimum} through ${maximum}.`);
  return fallback;
}

function readPolicyRef(
  value: unknown,
  diagnostics: NavigationEffectsSettingsDiagnostic[],
): NavigationEffectsPolicyRef {
  if (value === undefined) return { ...EMPTY_POLICY_REF };
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "policy-not-object", "policyRef", "policyRef must be an object.");
    return { ...EMPTY_POLICY_REF };
  }

  for (const key of Object.keys(value).sort()) {
    if (!POLICY_KEYS.has(key)) {
      addDiagnostic(diagnostics, "unknown-policy-setting", `policyRef.${key}`, `Unknown policyRef setting: ${key}.`);
    }
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const version = typeof value.version === "string" ? value.version.trim() : "";
  const digest = typeof value.digest === "string" ? value.digest.trim() : "";
  const empty = id === "" && version === "" && digest === "";
  if (empty) return { ...EMPTY_POLICY_REF };
  if (!id || !version || !POLICY_DIGEST.test(digest)) {
    addDiagnostic(
      diagnostics,
      "invalid-policy-reference",
      "policyRef",
      "policyRef requires non-empty id and version plus sha256:<64 lowercase hex> digest.",
    );
    return { ...EMPTY_POLICY_REF };
  }
  return { id, version, digest };
}

/**
 * Additively migrate one nested Navigation Effects settings value.
 *
 * `undefined` is a fresh/older install and returns quiet fail-closed defaults.
 * Any supplied malformed, unsupported, or unknown value requires repair and
 * forces every effects/write/automatic flag off.
 */
export function migrateNavigationEffectsSettings(raw: unknown): NavigationEffectsSettingsMigration {
  const settings = defaults();
  const diagnostics: NavigationEffectsSettingsDiagnostic[] = [];

  if (raw === undefined || raw === null) return { settings, diagnostics, repairRequired: false };
  if (!isRecord(raw)) {
    addDiagnostic(diagnostics, "settings-not-object", "navigationEffects", "Navigation Effects settings must be an object.");
    return { settings, diagnostics, repairRequired: true };
  }

  for (const key of Object.keys(raw).sort()) {
    if (!SETTING_KEYS.has(key)) addDiagnostic(diagnostics, "unknown-setting", key, `Unknown Navigation Effects setting: ${key}.`);
  }

  if (!("schemaVersion" in raw)) {
    addDiagnostic(diagnostics, "schema-version-missing", "schemaVersion", "Navigation Effects settings schemaVersion is required.");
  } else if (raw.schemaVersion !== NAVIGATION_EFFECTS_SETTINGS_SCHEMA) {
    addDiagnostic(
      diagnostics,
      "schema-version-unsupported",
      "schemaVersion",
      `Unsupported Navigation Effects settings schemaVersion; expected ${NAVIGATION_EFFECTS_SETTINGS_SCHEMA}.`,
    );
  }

  settings.enabled = readBoolean(raw, "enabled", false, diagnostics);
  settings.automaticMaintenanceEnabled = readBoolean(raw, "automaticMaintenanceEnabled", false, diagnostics);
  settings.automaticCreationEnabled = readBoolean(raw, "automaticCreationEnabled", false, diagnostics);
  settings.periodicReconciliationEnabled = readBoolean(raw, "periodicReconciliationEnabled", true, diagnostics);
  settings.debounceMs = readBoundedInteger(
    raw,
    "debounceMs",
    NAVIGATION_EFFECTS_DEFAULT_DEBOUNCE_MS,
    NAVIGATION_EFFECTS_MIN_DEBOUNCE_MS,
    NAVIGATION_EFFECTS_MAX_DEBOUNCE_MS,
    "invalid-debounce",
    diagnostics,
  );
  settings.maximumDebounceMs = readBoundedInteger(
    raw,
    "maximumDebounceMs",
    NAVIGATION_EFFECTS_DEFAULT_MAXIMUM_DEBOUNCE_MS,
    NAVIGATION_EFFECTS_MIN_MAXIMUM_DEBOUNCE_MS,
    NAVIGATION_EFFECTS_MAX_MAXIMUM_DEBOUNCE_MS,
    "invalid-maximum-debounce",
    diagnostics,
  );
  settings.periodicReconciliationMinutes = readBoundedInteger(
    raw,
    "periodicReconciliationMinutes",
    NAVIGATION_EFFECTS_DEFAULT_RECONCILIATION_MINUTES,
    NAVIGATION_EFFECTS_MIN_RECONCILIATION_MINUTES,
    NAVIGATION_EFFECTS_MAX_RECONCILIATION_MINUTES,
    "invalid-reconciliation-interval",
    diagnostics,
  );

  if (settings.maximumDebounceMs < settings.debounceMs) {
    addDiagnostic(
      diagnostics,
      "maximum-debounce-before-debounce",
      "maximumDebounceMs",
      "maximumDebounceMs must be greater than or equal to debounceMs.",
    );
    settings.maximumDebounceMs = NAVIGATION_EFFECTS_DEFAULT_MAXIMUM_DEBOUNCE_MS;
  }

  if ("archiveRoot" in raw && raw.archiveRoot !== NAVIGATION_EFFECTS_ARCHIVE_ROOT) {
    addDiagnostic(diagnostics, "fixed-root-mismatch", "archiveRoot", `archiveRoot is fixed at ${NAVIGATION_EFFECTS_ARCHIVE_ROOT}.`);
  }
  if ("stateRoot" in raw && raw.stateRoot !== NAVIGATION_EFFECTS_STATE_ROOT) {
    addDiagnostic(diagnostics, "fixed-root-mismatch", "stateRoot", `stateRoot is fixed at ${NAVIGATION_EFFECTS_STATE_ROOT}.`);
  }
  settings.archiveRoot = NAVIGATION_EFFECTS_ARCHIVE_ROOT;
  settings.stateRoot = NAVIGATION_EFFECTS_STATE_ROOT;
  settings.policyRef = readPolicyRef(raw.policyRef, diagnostics);

  if (!settings.enabled && (settings.automaticMaintenanceEnabled || settings.automaticCreationEnabled)) {
    addDiagnostic(
      diagnostics,
      "invalid-boolean",
      "enabled",
      "Automatic modes cannot be enabled while the Effects plane is disabled.",
    );
  }
  if (settings.automaticCreationEnabled && !settings.automaticMaintenanceEnabled) {
    addDiagnostic(
      diagnostics,
      "automatic-creation-requires-maintenance",
      "automaticCreationEnabled",
      "Automatic creation requires automatic maintenance to be enabled.",
    );
  }

  const repairRequired = diagnostics.length > 0;
  if (repairRequired) {
    settings.enabled = false;
    settings.automaticMaintenanceEnabled = false;
    settings.automaticCreationEnabled = false;
  }
  if (!settings.enabled) {
    settings.automaticMaintenanceEnabled = false;
    settings.automaticCreationEnabled = false;
  }

  return { settings, diagnostics, repairRequired };
}

export function isNavigationEffectsPolicyRefConfigured(policyRef: NavigationEffectsPolicyRef): boolean {
  return Boolean(policyRef.id && policyRef.version && POLICY_DIGEST.test(policyRef.digest));
}
