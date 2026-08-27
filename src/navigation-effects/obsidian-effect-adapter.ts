import {
  EFFECT_HOST_CAPABILITY_PRIMITIVES,
  createEffectHostUnavailable,
  normalizeEffectHostCapabilityReport,
  type AuthorizedEffectExecution,
  type AuthorizedRecoveryDecision,
  type AuthorizedRollbackRequest,
  type AuthorizedTarget,
  type EffectHostCapabilityPrimitive,
  type EffectHostCapabilityReport,
  type EffectHostUnavailableReason,
  type HostPrimitiveEvidence,
  type KosmosEffectHostAdapter,
  type PreparedEffect,
} from "./effect-adapter";

export const OBSIDIAN_EFFECT_HOST_PROFILE = "obsidian" as const;

export const OBSIDIAN_EFFECT_ADAPTER_GAP_CODES = Object.freeze({
  exactByteSnapshot: "OBSIDIAN_VAULT_API_NOT_BOUND",
  vaultContainment: "OBSIDIAN_PATH_SAFETY_SERVICE_NOT_BOUND",
  grantedRootContainment: "OBSIDIAN_GRANTED_ROOT_PROOF_NOT_IMPLEMENTED",
  caseUnicodeCollisionDetection: "OBSIDIAN_COLLISION_SCAN_NOT_IMPLEMENTED",
  linkEscapeDetection: "OBSIDIAN_LINK_ESCAPE_PROOF_UNAVAILABLE",
  reparseJunctionDetection: "OBSIDIAN_REPARSE_JUNCTION_PROOF_UNAVAILABLE",
  mountEscapeDetection: "OBSIDIAN_MOUNT_ESCAPE_PROOF_UNAVAILABLE",
  durablePreparedIntent: "OBSIDIAN_DURABLE_INTENT_NOT_IMPLEMENTED",
  fileFlush: "OBSIDIAN_FILE_FLUSH_UNPROVEN",
  directoryFlush: "OBSIDIAN_DIRECTORY_FLUSH_UNPROVEN",
  sameVolumeAtomicReplace: "OBSIDIAN_ATOMIC_REPLACE_UNPROVEN",
  vaultLease: "OBSIDIAN_VAULT_LEASE_NOT_IMPLEMENTED",
  startupRecovery: "OBSIDIAN_STARTUP_RECOVERY_NOT_IMPLEMENTED",
  safeShutdown: "OBSIDIAN_SAFE_SHUTDOWN_NOT_IMPLEMENTED",
} as const satisfies Readonly<Record<EffectHostCapabilityPrimitive, string>>);

export type ObsidianEffectAdapterGapCode = typeof OBSIDIAN_EFFECT_ADAPTER_GAP_CODES[EffectHostCapabilityPrimitive];

const UNSUPPORTED_PRIMITIVES = new Set<EffectHostCapabilityPrimitive>([
  "linkEscapeDetection",
  "reparseJunctionDetection",
  "mountEscapeDetection",
  "fileFlush",
  "directoryFlush",
  "sameVolumeAtomicReplace",
]);

const REQUIRED_SERVICE_PRIMITIVES = new Set<EffectHostCapabilityPrimitive>([
  "vaultContainment",
  "grantedRootContainment",
]);

function mechanism(primitive: EffectHostCapabilityPrimitive): string {
  return `obsidian:${OBSIDIAN_EFFECT_ADAPTER_GAP_CODES[primitive].toLowerCase().replaceAll("_", "-")}`;
}

function evidence(primitive: EffectHostCapabilityPrimitive): Readonly<HostPrimitiveEvidence> {
  if (UNSUPPORTED_PRIMITIVES.has(primitive)) {
    return Object.freeze({ proof: "unsupported", mechanism: mechanism(primitive), limitationCode: "CAPABILITY_UNPROVEN" });
  }
  if (REQUIRED_SERVICE_PRIMITIVES.has(primitive)) {
    return Object.freeze({ proof: "unavailable", mechanism: mechanism(primitive), limitationCode: "REQUIRED_PRIMITIVE_UNPROVEN" });
  }
  return Object.freeze({ proof: "unavailable", mechanism: mechanism(primitive), limitationCode: "ADAPTER_NOT_IMPLEMENTED" });
}

export const OBSIDIAN_EFFECT_HOST_PRIMITIVE_EVIDENCE = Object.freeze(Object.fromEntries(
  EFFECT_HOST_CAPABILITY_PRIMITIVES.map((primitive) => [primitive, evidence(primitive)]),
)) as Readonly<Record<EffectHostCapabilityPrimitive, Readonly<HostPrimitiveEvidence>>>;

const CAPABILITY_REPORT = normalizeEffectHostCapabilityReport(OBSIDIAN_EFFECT_HOST_PROFILE, {
  configured: false,
  primitives: OBSIDIAN_EFFECT_HOST_PRIMITIVE_EVIDENCE,
  limitationCodes: ["ADAPTER_NOT_IMPLEMENTED", "CAPABILITY_UNPROVEN", "REQUIRED_PRIMITIVE_UNPROVEN"],
});

const UNAVAILABLE_REASONS = Object.freeze([
  "ADAPTER_NOT_CONFIGURED",
  "ADAPTER_NOT_IMPLEMENTED",
  "REQUIRED_PRIMITIVE_UNPROVEN",
] as const satisfies readonly EffectHostUnavailableReason[]);

/** Deterministic evidence for the intentionally unavailable Obsidian profile. */
export function getObsidianEffectHostCapabilityReport(): EffectHostCapabilityReport {
  return CAPABILITY_REPORT;
}

/**
 * Return the Packet C0 Obsidian descriptor. It binds no Vault, registers no
 * runtime hook, snapshots no source, and exposes no write path.
 */
export function createObsidianEffectHostAdapter(): KosmosEffectHostAdapter {
  const unavailable = (operation: Parameters<typeof createEffectHostUnavailable>[1]) =>
    Promise.resolve(createEffectHostUnavailable(OBSIDIAN_EFFECT_HOST_PROFILE, operation, UNAVAILABLE_REASONS));
  return Object.freeze({
    profile: OBSIDIAN_EFFECT_HOST_PROFILE,
    capabilities: () => CAPABILITY_REPORT,
    snapshot: (_target: AuthorizedTarget) => unavailable("snapshot"),
    inspectPath: (_target: AuthorizedTarget) => unavailable("inspect-path"),
    prepare: (_request: AuthorizedEffectExecution) => unavailable("prepare"),
    execute: (_prepared: PreparedEffect) => unavailable("execute"),
    inspectRecovery: () => unavailable("inspect-recovery"),
    recover: (_decision: AuthorizedRecoveryDecision) => unavailable("recover"),
    rollback: (_request: AuthorizedRollbackRequest) => unavailable("rollback"),
    shutdown: (_deadline: AbortSignal) => unavailable("shutdown"),
  });
}
