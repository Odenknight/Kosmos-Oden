/**
 * Truthful standalone/native profile boundary.
 *
 * The experimental Engine Node executor is intentionally not imported here:
 * its public API cannot yet satisfy the complete host contract without
 * duplicating security-sensitive behavior or weakening recovery/shutdown
 * semantics.
 */
import {
  createUnavailableEffectHostAdapter,
  normalizeEffectHostCapabilityReport,
  type EffectHostCapabilityReport,
  type EffectHostOperation,
  type KosmosEffectHostAdapter,
} from "./effect-adapter";

export const STANDALONE_NATIVE_LIMITATION_CODES = Object.freeze([
  "AUTHORIZED_RECOVERY_UNAVAILABLE",
  "COOPERATIVE_VAULT_THREAT_MODEL_ONLY",
  "DEADLINE_SHUTDOWN_UNAVAILABLE",
  "DIRECTORY_FLUSH_UNPROVEN",
  "READ_ONLY_INSPECTION_UNAVAILABLE",
  "SPLIT_PREPARE_EXECUTE_UNAVAILABLE",
] as const);

export type StandaloneNativeLimitationCode = typeof STANDALONE_NATIVE_LIMITATION_CODES[number];

export interface StandaloneNativeLimitationEvidence {
  code: StandaloneNativeLimitationCode;
  proof: "unsupported" | "unproven";
  affectedOperations: readonly EffectHostOperation[];
}

export interface StandaloneNativeEffectAdapterEvidence {
  artifactKind: "kosmos.standalone-native-effect-adapter-evidence";
  schemaVersion: 1;
  effectsContract: "1.0.0";
  profile: "standalone-native";
  implemented: false;
  configured: false;
  effectExecutionAvailable: false;
  engineNodeExecutorImported: false;
  writerRuntimeEndpointExposed: false;
  browserViewerWriteAdapter: false;
  sourceContentIncluded: false;
  limitations: readonly Readonly<StandaloneNativeLimitationEvidence>[];
  capabilityReport: EffectHostCapabilityReport;
}

const LIMITATIONS: readonly Readonly<StandaloneNativeLimitationEvidence>[] = Object.freeze([
  Object.freeze({
    code: "AUTHORIZED_RECOVERY_UNAVAILABLE",
    proof: "unsupported",
    affectedOperations: Object.freeze(["inspect-recovery", "recover"] as const),
  }),
  Object.freeze({
    code: "COOPERATIVE_VAULT_THREAT_MODEL_ONLY",
    proof: "unsupported",
    affectedOperations: Object.freeze(["snapshot", "inspect-path", "prepare", "execute", "rollback"] as const),
  }),
  Object.freeze({
    code: "DEADLINE_SHUTDOWN_UNAVAILABLE",
    proof: "unsupported",
    affectedOperations: Object.freeze(["shutdown"] as const),
  }),
  Object.freeze({
    code: "DIRECTORY_FLUSH_UNPROVEN",
    proof: "unproven",
    affectedOperations: Object.freeze(["execute", "recover", "rollback", "shutdown"] as const),
  }),
  Object.freeze({
    code: "READ_ONLY_INSPECTION_UNAVAILABLE",
    proof: "unsupported",
    affectedOperations: Object.freeze(["snapshot", "inspect-path", "inspect-recovery"] as const),
  }),
  Object.freeze({
    code: "SPLIT_PREPARE_EXECUTE_UNAVAILABLE",
    proof: "unsupported",
    affectedOperations: Object.freeze(["prepare", "execute", "rollback"] as const),
  }),
]);

const CAPABILITY_REPORT = normalizeEffectHostCapabilityReport("standalone-native", {
  configured: false,
  limitationCodes: ["ADAPTER_NOT_IMPLEMENTED", "REQUIRED_PRIMITIVE_UNPROVEN"],
  primitives: {
    exactByteSnapshot: { proof: "unsupported", mechanism: "read-only-inspection-api-missing", limitationCode: "CAPABILITY_UNPROVEN" },
    durablePreparedIntent: { proof: "unsupported", mechanism: "split-prepare-api-missing", limitationCode: "CAPABILITY_UNPROVEN" },
    directoryFlush: { proof: "unsupported", mechanism: "directory-flush-not-proven", limitationCode: "CAPABILITY_UNPROVEN" },
    startupRecovery: { proof: "unsupported", mechanism: "authorized-recovery-api-missing", limitationCode: "CAPABILITY_UNPROVEN" },
    safeShutdown: { proof: "unsupported", mechanism: "deadline-shutdown-api-missing", limitationCode: "CAPABILITY_UNPROVEN" },
  },
});

const EVIDENCE: StandaloneNativeEffectAdapterEvidence = Object.freeze({
  artifactKind: "kosmos.standalone-native-effect-adapter-evidence",
  schemaVersion: 1,
  effectsContract: "1.0.0",
  profile: "standalone-native",
  implemented: false,
  configured: false,
  effectExecutionAvailable: false,
  engineNodeExecutorImported: false,
  writerRuntimeEndpointExposed: false,
  browserViewerWriteAdapter: false,
  sourceContentIncluded: false,
  limitations: LIMITATIONS,
  capabilityReport: CAPABILITY_REPORT,
});

export function getStandaloneNativeEffectAdapterEvidence(): StandaloneNativeEffectAdapterEvidence {
  return EVIDENCE;
}

/** Return a complete host-contract object whose every operation fails closed. */
export function createStandaloneNativeEffectAdapter(): KosmosEffectHostAdapter {
  const unavailable = createUnavailableEffectHostAdapter("standalone-native", [
    "ADAPTER_NOT_IMPLEMENTED",
    "OPERATION_UNSUPPORTED",
    "REQUIRED_PRIMITIVE_UNPROVEN",
  ]);
  return Object.freeze({
    ...unavailable,
    capabilities: () => CAPABILITY_REPORT,
  });
}
