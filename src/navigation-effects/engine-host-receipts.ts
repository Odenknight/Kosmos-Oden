import { canonicalDigest } from "./adoption-registry";
import { isEffectHostProfile, type EffectHostProfile, type RecoveryInspection, type ShutdownReceipt } from "./effect-adapter";
import type { RecoveryResult } from "gkos-engine/navigation-effects";

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const CLASSIFICATIONS = new Set(["effect-absent-retryable", "effect-present-verified", "conflicting-external-bytes", "ambiguous-or-corrupt"]);

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("ENGINE_HOST_EVIDENCE_INVALID");
  const descriptors: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(value as object);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== "string" || !keys.includes(key) ||
      !("value" in descriptors[key]))) throw new Error("ENGINE_HOST_EVIDENCE_INVALID");
  return Object.fromEntries(Object.entries(descriptors).map(([key, property]) => [key, property.value]));
}

function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new Error("ENGINE_HOST_EVIDENCE_INVALID");
  const descriptors: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(value as object);
  const length = descriptors.length.value;
  if (!Number.isInteger(length) || length < 0 || length > maximum ||
      Reflect.ownKeys(descriptors).length !== length + 1) throw new Error("ENGINE_HOST_EVIDENCE_INVALID");
  const copy: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const property = descriptors[String(index)];
    if (!property || !("value" in property)) throw new Error("ENGINE_HOST_EVIDENCE_INVALID");
    copy.push(property.value);
  }
  return copy;
}

function reasons(value: unknown): string[] {
  const copy = array(value, 128);
  if (copy.some(code => typeof code !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/.test(code))) {
    throw new Error("ENGINE_HOST_EVIDENCE_INVALID");
  }
  return copy as string[];
}

function recoveryResult(value: unknown): RecoveryResult {
  const row = record(value, ["artifactKind", "effectsContract", "effectId", "classification", "writeCapabilityMayEnable", "reasonCodes", "observed"]);
  const observed = record(row.observed, ["targetDigest", "temporaryDigest", "archiveBeforeDigest", "proposedDigest"]);
  if (row.artifactKind !== "engine.navigation-effect-recovery-result" || row.effectsContract !== "1.0.0" ||
      typeof row.effectId !== "string" || !/^effect:(?:rollback:)?[0-9a-f]{32}$/.test(row.effectId) ||
      !CLASSIFICATIONS.has(row.classification as string) || row.writeCapabilityMayEnable !== false ||
      typeof observed.proposedDigest !== "string" || !DIGEST.test(observed.proposedDigest) ||
      Object.values(observed).some(value => typeof value !== "string" || !DIGEST.test(value))) {
    throw new Error("ENGINE_HOST_EVIDENCE_INVALID");
  }
  return { artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0",
    effectId: row.effectId, classification: row.classification as RecoveryResult["classification"],
    writeCapabilityMayEnable: false, reasonCodes: reasons(row.reasonCodes),
    observed: { ...observed } as RecoveryResult["observed"] };
}

/** Maps evidence only. Neither the Engine digest nor this receipt grants authority. */
export async function mapEngineRecoveryInspection(profile: EffectHostProfile, value: unknown) {
  if (!isEffectHostProfile(profile)) throw new Error("EFFECT_HOST_PROFILE_INVALID");
  const row = record(value, ["artifactKind", "effectsContract", "journalDigest", "checkpointDigest", "results",
    "writeCapabilityMayEnable", "sourceContentIncluded", "inspectionDigest"]);
  if (row.artifactKind !== "engine.effect-recovery-inspection" || row.effectsContract !== "1.0.0" ||
      row.writeCapabilityMayEnable !== false || row.sourceContentIncluded !== false ||
      ![row.journalDigest, row.checkpointDigest].every(value => value === null || typeof value === "string" && DIGEST.test(value)) ||
      !Array.isArray(row.results) || row.results.length > 100_000 ||
      typeof row.inspectionDigest !== "string" || !DIGEST.test(row.inspectionDigest)) throw new Error("ENGINE_HOST_EVIDENCE_INVALID");
  const results = array(row.results, 100_000).map(recoveryResult);
  const expectedEngineDigest = row.inspectionDigest;
  if (new Set(results.map(result => result.effectId)).size !== results.length) throw new Error("ENGINE_HOST_EVIDENCE_INVALID");
  const evidence = { artifactKind: row.artifactKind, effectsContract: row.effectsContract,
    journalDigest: row.journalDigest, checkpointDigest: row.checkpointDigest, results,
    writeCapabilityMayEnable: false, sourceContentIncluded: false };
  const engineInspectionDigest = await canonicalDigest(evidence);
  if (engineInspectionDigest !== expectedEngineDigest) throw new Error("ENGINE_INSPECTION_DIGEST_MISMATCH");
  const inspection = {
    artifactKind: "kosmos.effect-recovery-inspection" as const, schemaVersion: 1 as const, profile,
    status: (results.some(result => ["ambiguous-or-corrupt", "conflicting-external-bytes"].includes(result.classification))
      ? "blocked" : results.length ? "action-required" : "safe") as RecoveryInspection["status"],
    engineWriteCapabilityMayEnable: false, automaticWriteEnabled: false as const, results,
    reasonCodes: [...new Set(results.flatMap(result => result.reasonCodes))].sort(), sourceContentIncluded: false as const,
  };
  // Include the Engine digest in the host binding, even when two inspections
  // have identical classifications but different journal/checkpoint bytes.
  const inspectionDigest = await canonicalDigest({ ...inspection, engineInspectionDigest });
  for (const result of results) { Object.freeze(result.observed); Object.freeze(result.reasonCodes); Object.freeze(result); }
  Object.freeze(results); Object.freeze(inspection.reasonCodes);
  return Object.freeze({ engineInspectionDigest, inspection: Object.freeze({ ...inspection, inspectionDigest }) });
}

/** A deadline response can report an unfinished drain; it cannot assert completion. */
export async function mapEngineShutdownResult(profile: EffectHostProfile, value: unknown): Promise<ShutdownReceipt> {
  if (!isEffectHostProfile(profile)) throw new Error("EFFECT_HOST_PROFILE_INVALID");
  const row = record(value, ["status", "admissionStopped", "checkpointVerified", "leaseReleased", "reasonCodes"]);
  const reasonCodes = reasons(row.reasonCodes);
  if (!["complete", "deadline-exceeded", "blocked"].includes(row.status as string) || row.admissionStopped !== true ||
      typeof row.checkpointVerified !== "boolean" || typeof row.leaseReleased !== "boolean" ||
      row.leaseReleased && !row.checkpointVerified ||
      row.status === "complete" && (!row.checkpointVerified || !row.leaseReleased || reasonCodes.length !== 0) ||
      row.status !== "complete" && reasonCodes.length === 0) throw new Error("ENGINE_HOST_EVIDENCE_INVALID");
  const evidence = { artifactKind: "kosmos.effect-host-shutdown-receipt" as const, schemaVersion: 1 as const, profile,
    status: row.status as ShutdownReceipt["status"], admissionStopped: true,
    checkpointVerified: row.checkpointVerified, leaseReleased: row.leaseReleased, reasonCodes, sourceContentIncluded: false as const };
  Object.freeze(reasonCodes);
  return Object.freeze({ ...evidence, receiptDigest: await canonicalDigest(evidence) });
}
