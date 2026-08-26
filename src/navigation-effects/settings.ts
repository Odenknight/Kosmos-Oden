import type { EffectsPolicyRef, MocWriteSettings } from "./types";

export const MOC_SETTINGS_SCHEMA_VERSION = 1 as const;
export const MOC_DEBOUNCE_MIN_MS = 250;
export const MOC_DEBOUNCE_MAX_MS = 10_000;
export const MOC_MAXIMUM_DEBOUNCE_MIN_MS = 1_000;
export const MOC_MAXIMUM_DEBOUNCE_MAX_MS = 30_000;
export const MOC_RECONCILIATION_MINUTES_MIN = 1;
export const MOC_RECONCILIATION_MINUTES_MAX = 1_440;

export const DEFAULT_MOC_WRITE_SETTINGS: MocWriteSettings = Object.freeze({
  schemaVersion: MOC_SETTINGS_SCHEMA_VERSION,
  enabled: false,
  automaticMaintenanceEnabled: false,
  automaticCreationEnabled: false,
  debounceMs: 750,
  maximumDebounceMs: 3_000,
  periodicReconciliationEnabled: true,
  periodicReconciliationMinutes: 5,
  archiveRoot: "_archive/moc-runs",
  stateRoot: ".gkx/effects",
  policyRef: Object.freeze({ id: "", version: "", digest: "" }),
});

export interface MocSettingsMigrationResult {
  settings: MocWriteSettings;
  issues: string[];
  repaired: boolean;
}

const EXACT_KEYS = new Set([
  "schemaVersion", "enabled", "automaticMaintenanceEnabled", "automaticCreationEnabled",
  "debounceMs", "maximumDebounceMs", "periodicReconciliationEnabled",
  "periodicReconciliationMinutes", "archiveRoot", "stateRoot", "policyRef",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function integerIn(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

export function validatePolicyRef(value: unknown): value is EffectsPolicyRef {
  if (!isRecord(value) || Object.keys(value).some((key) => !["id", "version", "digest"].includes(key))) return false;
  return typeof value.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.id)
    && typeof value.version === "string" && /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/.test(value.version)
    && typeof value.digest === "string" && /^sha256:[0-9a-f]{64}$/.test(value.digest);
}

/**
 * Strict additive v1 migration. Unknown schemas, keys, values, or unsafe flag
 * combinations return defaults with every write mode disabled.
 */
export function migrateMocWriteSettings(raw: unknown): MocSettingsMigrationResult {
  if (raw == null) return { settings: structuredClone(DEFAULT_MOC_WRITE_SETTINGS), issues: [], repaired: false };
  const issues: string[] = [];
  if (!isRecord(raw)) issues.push("Navigation Effects settings must be an object.");
  else {
    if (raw.schemaVersion !== 1) issues.push("Unknown Navigation Effects settings schema version.");
    for (const key of Object.keys(raw)) if (!EXACT_KEYS.has(key)) issues.push(`Unknown Navigation Effects setting: ${key}.`);
    for (const key of ["enabled", "automaticMaintenanceEnabled", "automaticCreationEnabled", "periodicReconciliationEnabled"] as const) {
      if (typeof raw[key] !== "boolean") issues.push(`${key} must be boolean.`);
    }
    if (!integerIn(raw.debounceMs, MOC_DEBOUNCE_MIN_MS, MOC_DEBOUNCE_MAX_MS)) issues.push("debounceMs is outside its documented bounds.");
    if (!integerIn(raw.maximumDebounceMs, MOC_MAXIMUM_DEBOUNCE_MIN_MS, MOC_MAXIMUM_DEBOUNCE_MAX_MS)) issues.push("maximumDebounceMs is outside its documented bounds.");
    if (typeof raw.debounceMs === "number" && typeof raw.maximumDebounceMs === "number" && raw.maximumDebounceMs < raw.debounceMs) issues.push("maximumDebounceMs must not be lower than debounceMs.");
    if (!integerIn(raw.periodicReconciliationMinutes, MOC_RECONCILIATION_MINUTES_MIN, MOC_RECONCILIATION_MINUTES_MAX)) issues.push("periodicReconciliationMinutes is outside its documented bounds.");
    if (raw.archiveRoot !== "_archive/moc-runs") issues.push("archiveRoot must remain _archive/moc-runs in schema v1.");
    if (raw.stateRoot !== ".gkx/effects") issues.push("stateRoot must remain .gkx/effects in schema v1.");
    if (!validatePolicyRef(raw.policyRef)) issues.push("policyRef must bind an id, version, and lowercase SHA-256 digest.");
    if (raw.enabled === false && (raw.automaticMaintenanceEnabled === true || raw.automaticCreationEnabled === true)) issues.push("Automatic modes require the effects plane to be enabled.");
  }
  if (issues.length || !isRecord(raw)) return { settings: structuredClone(DEFAULT_MOC_WRITE_SETTINGS), issues, repaired: true };
  const settings: MocWriteSettings = {
    schemaVersion: 1,
    enabled: raw.enabled as boolean,
    automaticMaintenanceEnabled: raw.automaticMaintenanceEnabled as boolean,
    automaticCreationEnabled: raw.automaticCreationEnabled as boolean,
    debounceMs: raw.debounceMs as number,
    maximumDebounceMs: raw.maximumDebounceMs as number,
    periodicReconciliationEnabled: raw.periodicReconciliationEnabled as boolean,
    periodicReconciliationMinutes: raw.periodicReconciliationMinutes as number,
    archiveRoot: "_archive/moc-runs",
    stateRoot: ".gkx/effects",
    policyRef: { ...(raw.policyRef as unknown as EffectsPolicyRef) },
  };
  return { settings, issues: [], repaired: false };
}
