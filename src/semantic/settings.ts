/**
 * Semantic search (0.9.5) — the saved choices. Small and pure, so the settings
 * migration can use it without pulling in the rest of semantic search.
 */
import { CUSTOM_MODEL_ID, DEFAULT_MODEL_ID, catalogModel, normalizeCustomModel, type CustomModelSettings } from "./catalog";

/** Saved with the plugin's settings. Model files and the index are per device and are not part of it. */
export interface SemanticSettings {
  enabled: boolean;
  /** A catalog model id, or "custom". */
  modelId: string;
  custom: CustomModelSettings;
}

export function defaultSemanticSettings(): SemanticSettings {
  return { enabled: false, modelId: DEFAULT_MODEL_ID, custom: normalizeCustomModel(undefined) };
}

/** Anything malformed becomes the safe default: off. An unknown model id keeps the choice off too. */
export function normalizeSemanticSettings(value: unknown): SemanticSettings {
  const d = defaultSemanticSettings();
  if (typeof value !== "object" || value === null) return d;
  const v = value as Record<string, unknown>;
  const known = typeof v.modelId === "string" && (v.modelId === CUSTOM_MODEL_ID || catalogModel(v.modelId) !== null);
  return {
    enabled: v.enabled === true && known,
    modelId: known ? (v.modelId as string) : d.modelId,
    custom: normalizeCustomModel(v.custom),
  };
}
