import type {
  EffectExecutionRequest,
  EffectExecutionResult,
  EffectOperation,
  EffectsActorRef,
  RecoveryClassification,
  RecoveryResult,
} from "gkos-engine/navigation-effects";

export type EffectHostProfile = "obsidian" | "standalone-native";
export type HostProof = "proven" | "unsupported" | "unavailable";

export const EFFECT_HOST_CAPABILITY_PRIMITIVES = Object.freeze([
  "exactByteSnapshot",
  "vaultContainment",
  "grantedRootContainment",
  "caseUnicodeCollisionDetection",
  "linkEscapeDetection",
  "reparseJunctionDetection",
  "mountEscapeDetection",
  "durablePreparedIntent",
  "fileFlush",
  "directoryFlush",
  "sameVolumeAtomicReplace",
  "vaultLease",
  "startupRecovery",
  "safeShutdown",
] as const);

export type EffectHostCapabilityPrimitive = typeof EFFECT_HOST_CAPABILITY_PRIMITIVES[number];

export type EffectHostLimitationCode =
  | "ADAPTER_NOT_IMPLEMENTED"
  | "CAPABILITY_EVIDENCE_INVALID"
  | "CAPABILITY_UNPROVEN"
  | "REQUIRED_PRIMITIVE_UNPROVEN";

export interface HostPrimitiveEvidence {
  proof: HostProof;
  mechanism?: string;
  limitationCode?: EffectHostLimitationCode;
}

export type EffectHostPrimitiveReport = Readonly<Record<EffectHostCapabilityPrimitive, Readonly<HostPrimitiveEvidence>>>;

export interface EffectHostCapabilityReport {
  artifactKind: "kosmos.effect-host-capability-report";
  schemaVersion: 1;
  effectsContract: "1.0.0";
  profile: EffectHostProfile;
  configured: boolean;
  effectExecutionAvailable: boolean;
  /** An adapter alone can never satisfy the coordinator's automatic-write gates. */
  automaticWriteEligible: false;
  primitives: EffectHostPrimitiveReport;
  limitationCodes: readonly EffectHostLimitationCode[];
  browserViewerWriteAdapter: false;
  sourceContentIncluded: false;
}

export interface EffectHostCapabilityInput {
  configured?: boolean;
  primitives?: Partial<Record<EffectHostCapabilityPrimitive, unknown>>;
  limitationCodes?: readonly unknown[];
}

export interface EffectHostCapabilityValidation {
  valid: boolean;
  reasonCodes: readonly EffectHostLimitationCode[];
  normalized: EffectHostCapabilityReport;
}

export interface AuthorizedTarget {
  artifactKind: "kosmos.authorized-effect-target";
  effectsContract: "1.0.0";
  vaultId: string;
  operation: EffectOperation;
  targetPath: string;
  grantedRoot: string;
  objectClass: string;
  sensitivity: string;
  targetPrecondition: "absent" | "present";
  priorDigest?: string;
  policyDigest: string;
  authorityDigest: string;
  ownershipDigest: string;
  ownershipRegistryDigest: string;
  configurationDigest: string;
  retentionHold: "clear";
}

export type ExactByteSnapshot =
  | {
      artifactKind: "kosmos.effect-byte-snapshot";
      schemaVersion: 1;
      profile: EffectHostProfile;
      vaultId: string;
      targetPath: string;
      existence: "absent";
      digest: null;
      byteLength: 0;
      bytes?: never;
      pathSafetyReceiptDigest: string;
    }
  | {
      artifactKind: "kosmos.effect-byte-snapshot";
      schemaVersion: 1;
      profile: EffectHostProfile;
      vaultId: string;
      targetPath: string;
      existence: "present";
      digest: string;
      byteLength: number;
      bytes: Uint8Array;
      pathSafetyReceiptDigest: string;
    };

export type PathSafetyCheckName =
  | "canonical-path"
  | "vault-containment"
  | "granted-root-containment"
  | "case-unicode-collision"
  | "link-escape"
  | "reparse-junction-escape"
  | "mount-escape";

export interface PathSafetyCheck {
  check: PathSafetyCheckName;
  proof: "passed" | "failed" | "unproven";
  mechanism?: string;
  reasonCode?: string;
}

export interface PathSafetyReceipt {
  artifactKind: "kosmos.effect-path-safety-receipt";
  schemaVersion: 1;
  profile: EffectHostProfile;
  vaultId: string;
  targetPath: string;
  grantedRoot: string;
  outcome: "safe" | "denied" | "unproven";
  checks: readonly PathSafetyCheck[];
  receiptDigest: string;
  sourceContentIncluded: false;
}

export interface AuthorizedEffectExecution {
  execution: EffectExecutionRequest;
  target: AuthorizedTarget;
}

declare const PREPARED_EFFECT_HANDLE_BRAND: unique symbol;

/** Adapter-instance-bound handle. Proposed source bytes are retained privately by the adapter. */
export interface PreparedEffect {
  readonly [PREPARED_EFFECT_HANDLE_BRAND]: true;
  readonly artifactKind: "kosmos.prepared-effect-handle";
  readonly schemaVersion: 1;
  readonly profile: EffectHostProfile;
  readonly adapterInstanceId: string;
  readonly handleId: string;
  readonly effectId: string;
  readonly targetPath: string;
  readonly planDigest: string;
  readonly proposedDigest: string;
  readonly targetSnapshotDigest: string | null;
  readonly pathSafetyReceiptDigest: string;
  readonly gateBindingDigest: string;
  readonly sourceContentIncluded: false;
}

export type EffectHostOperation =
  | "snapshot"
  | "inspect-path"
  | "prepare"
  | "execute"
  | "inspect-recovery"
  | "recover"
  | "rollback"
  | "shutdown";

export type EffectHostUnavailableReason =
  | "ADAPTER_NOT_IMPLEMENTED"
  | "ADAPTER_NOT_CONFIGURED"
  | "OPERATION_UNSUPPORTED"
  | "REQUIRED_PRIMITIVE_UNPROVEN";

export interface EffectHostUnavailable {
  artifactKind: "kosmos.effect-host-unavailable";
  schemaVersion: 1;
  profile: EffectHostProfile;
  operation: EffectHostOperation;
  status: "unavailable";
  reasonCodes: readonly EffectHostUnavailableReason[];
  sourceContentIncluded: false;
}

export type EffectPreparationResult =
  | { status: "prepared"; prepared: PreparedEffect }
  | EffectHostUnavailable;

export interface HostExecutionEvidence {
  profile: EffectHostProfile;
  capabilityReportDigest: string;
  pathSafetyReceiptDigest: string;
  durabilityLimitationCodes: readonly string[];
  sourceContentIncluded: false;
}

export interface HostExecutionResult {
  engine: EffectExecutionResult;
  hostEvidence: HostExecutionEvidence;
}

export interface RecoveryInspection {
  artifactKind: "kosmos.effect-recovery-inspection";
  schemaVersion: 1;
  profile: EffectHostProfile;
  status: "safe" | "action-required" | "blocked";
  engineWriteCapabilityMayEnable: boolean;
  automaticWriteEnabled: false;
  results: readonly RecoveryResult[];
  inspectionDigest: string;
  reasonCodes: readonly string[];
  sourceContentIncluded: false;
}

export interface AuthorizedRecoveryDecision {
  artifactKind: "kosmos.authorized-recovery-decision";
  schemaVersion: 1;
  inspectionDigest: string;
  action: "run-engine-startup-recovery" | "retry-with-fresh-plan" | "seal-stale";
  actor: EffectsActorRef;
  credentialId: string;
  authorityDigest: string;
  policyDigest: string;
  confirmed: true;
}

export interface RecoveryReceipt {
  artifactKind: "kosmos.effect-recovery-receipt";
  schemaVersion: 1;
  profile: EffectHostProfile;
  status: "completed" | "blocked";
  decisionDigest: string;
  classifications: readonly RecoveryClassification[];
  engineWriteCapabilityMayEnable: boolean;
  automaticWriteEnabled: false;
  reasonCodes: readonly string[];
  receiptDigest: string;
  sourceContentIncluded: false;
}

export interface AuthorizedRollbackRequest {
  artifactKind: "kosmos.authorized-rollback-request";
  schemaVersion: 1;
  originalEffectId: string;
  expectedCurrentDigest: string;
  restoreDigest: string;
  target: AuthorizedTarget;
  actor: EffectsActorRef;
  credentialId: string;
  authorityDigest: string;
  confirmed: true;
}

export interface ShutdownReceipt {
  artifactKind: "kosmos.effect-host-shutdown-receipt";
  schemaVersion: 1;
  profile: EffectHostProfile;
  status: "complete" | "deadline-exceeded" | "blocked";
  admissionStopped: boolean;
  checkpointVerified: boolean;
  leaseReleased: boolean;
  reasonCodes: readonly string[];
  receiptDigest: string;
  sourceContentIncluded: false;
}

export interface KosmosEffectHostAdapter {
  readonly profile: EffectHostProfile;
  capabilities(): EffectHostCapabilityReport;
  snapshot(target: AuthorizedTarget): Promise<ExactByteSnapshot | EffectHostUnavailable>;
  inspectPath(target: AuthorizedTarget): Promise<PathSafetyReceipt | EffectHostUnavailable>;
  prepare(request: AuthorizedEffectExecution): Promise<EffectPreparationResult>;
  execute(prepared: PreparedEffect): Promise<HostExecutionResult | EffectHostUnavailable>;
  inspectRecovery(): Promise<RecoveryInspection | EffectHostUnavailable>;
  recover(decision: AuthorizedRecoveryDecision): Promise<RecoveryReceipt | EffectHostUnavailable>;
  rollback(request: AuthorizedRollbackRequest): Promise<HostExecutionResult | EffectHostUnavailable>;
  shutdown(deadline: AbortSignal): Promise<ShutdownReceipt | EffectHostUnavailable>;
}

const PROOFS = new Set<HostProof>(["proven", "unsupported", "unavailable"]);
const LIMITATIONS = new Set<EffectHostLimitationCode>([
  "ADAPTER_NOT_IMPLEMENTED",
  "CAPABILITY_EVIDENCE_INVALID",
  "CAPABILITY_UNPROVEN",
  "REQUIRED_PRIMITIVE_UNPROVEN",
]);
const UNAVAILABLE_REASONS = new Set<EffectHostUnavailableReason>([
  "ADAPTER_NOT_IMPLEMENTED",
  "ADAPTER_NOT_CONFIGURED",
  "OPERATION_UNSUPPORTED",
  "REQUIRED_PRIMITIVE_UNPROVEN",
]);
const CAPABILITY_REPORT_KEYS = Object.freeze([
  "artifactKind", "schemaVersion", "effectsContract", "profile", "configured",
  "effectExecutionAvailable", "automaticWriteEligible", "primitives",
  "limitationCodes", "browserViewerWriteAdapter", "sourceContentIncluded",
].sort());
const PRIMITIVE_EVIDENCE_KEYS = Object.freeze(["proof", "mechanism", "limitationCode"].sort());

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.every((key) => allowed.includes(key)) && required.every((key) => keys.includes(key));
}

function sameStringArray(left: unknown, right: readonly string[]): boolean {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function samePrimitiveEvidence(left: unknown, right: HostPrimitiveEvidence): boolean {
  if (!record(left) || !hasOnlyKeys(left, PRIMITIVE_EVIDENCE_KEYS, ["proof"])) return false;
  return left.proof === right.proof && left.mechanism === right.mechanism && left.limitationCode === right.limitationCode;
}

function boundedLabel(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:/ -]*$/.test(value);
}

export function isEffectHostProfile(value: unknown): value is EffectHostProfile {
  return value === "obsidian" || value === "standalone-native";
}

export function normalizeHostPrimitiveEvidence(value: unknown): Readonly<HostPrimitiveEvidence> {
  if (value === undefined) return Object.freeze({ proof: "unavailable", limitationCode: "CAPABILITY_UNPROVEN" });
  if (!record(value) || !PROOFS.has(value.proof as HostProof)
    || value.proof === "proven" && !boundedLabel(value.mechanism)
    || value.mechanism !== undefined && !boundedLabel(value.mechanism)
    || value.limitationCode !== undefined && !LIMITATIONS.has(value.limitationCode as EffectHostLimitationCode)) {
    return Object.freeze({ proof: "unavailable", limitationCode: "CAPABILITY_EVIDENCE_INVALID" });
  }
  const evidence: HostPrimitiveEvidence = {
    proof: value.proof as HostProof,
    ...(value.mechanism === undefined ? {} : { mechanism: value.mechanism as string }),
    ...(value.limitationCode === undefined ? {} : { limitationCode: value.limitationCode as EffectHostLimitationCode }),
  };
  if (evidence.proof !== "proven" && evidence.limitationCode === undefined) evidence.limitationCode = "CAPABILITY_UNPROVEN";
  return Object.freeze(evidence);
}

function normalizedLimitations(values: readonly unknown[]): readonly EffectHostLimitationCode[] {
  return Object.freeze([...new Set(values.filter((value): value is EffectHostLimitationCode => LIMITATIONS.has(value as EffectHostLimitationCode)))].sort());
}

export function normalizeEffectHostCapabilityReport(profile: EffectHostProfile, input: EffectHostCapabilityInput = {}): EffectHostCapabilityReport {
  if (!isEffectHostProfile(profile)) throw new TypeError("EFFECT_HOST_PROFILE_INVALID");
  const primitives = {} as Record<EffectHostCapabilityPrimitive, Readonly<HostPrimitiveEvidence>>;
  for (const primitive of EFFECT_HOST_CAPABILITY_PRIMITIVES) primitives[primitive] = normalizeHostPrimitiveEvidence(input.primitives?.[primitive]);
  const everyPrimitiveProven = EFFECT_HOST_CAPABILITY_PRIMITIVES.every((primitive) => primitives[primitive].proof === "proven");
  const configured = input.configured === true && everyPrimitiveProven;
  const evidenceLimitations = EFFECT_HOST_CAPABILITY_PRIMITIVES.map((primitive) => primitives[primitive].limitationCode).filter(Boolean);
  const limitations = normalizedLimitations([
    ...(input.limitationCodes ?? []),
    ...evidenceLimitations,
    ...(input.configured === true && !everyPrimitiveProven ? ["REQUIRED_PRIMITIVE_UNPROVEN"] : []),
  ]);
  return Object.freeze({
    artifactKind: "kosmos.effect-host-capability-report",
    schemaVersion: 1,
    effectsContract: "1.0.0",
    profile,
    configured,
    effectExecutionAvailable: configured,
    automaticWriteEligible: false,
    primitives: Object.freeze(primitives),
    limitationCodes: limitations,
    browserViewerWriteAdapter: false,
    sourceContentIncluded: false,
  });
}

export function validateEffectHostCapabilityReport(profile: EffectHostProfile, value: unknown): EffectHostCapabilityValidation {
  const input = record(value) ? value : {};
  const normalized = normalizeEffectHostCapabilityReport(profile, {
    configured: input.configured === true,
    primitives: record(input.primitives) ? input.primitives : {},
    limitationCodes: Array.isArray(input.limitationCodes) ? input.limitationCodes : [],
  });
  const reasons: EffectHostLimitationCode[] = [];
  const exactTopLevel = record(value) && hasOnlyKeys(value, CAPABILITY_REPORT_KEYS, CAPABILITY_REPORT_KEYS);
  const exactPrimitiveSet = record(input.primitives)
    && Object.keys(input.primitives).length === EFFECT_HOST_CAPABILITY_PRIMITIVES.length
    && EFFECT_HOST_CAPABILITY_PRIMITIVES.every((primitive) => Object.hasOwn(input.primitives as object, primitive));
  const exactPrimitiveEvidence = exactPrimitiveSet && EFFECT_HOST_CAPABILITY_PRIMITIVES.every((primitive) =>
    samePrimitiveEvidence((input.primitives as Record<string, unknown>)[primitive], normalized.primitives[primitive]));
  const exactLimitations = sameStringArray(input.limitationCodes, normalized.limitationCodes)
    && normalized.limitationCodes.every((code, index, values) => LIMITATIONS.has(code) && (index === 0 || values[index - 1] < code));
  const exactDerivedContent = input.configured === normalized.configured
    && input.effectExecutionAvailable === normalized.effectExecutionAvailable
    && input.automaticWriteEligible === normalized.automaticWriteEligible
    && input.browserViewerWriteAdapter === normalized.browserViewerWriteAdapter
    && input.sourceContentIncluded === normalized.sourceContentIncluded;
  if (!exactTopLevel || !exactPrimitiveSet || !exactPrimitiveEvidence || !exactLimitations || !exactDerivedContent
    || !record(value) || value.artifactKind !== "kosmos.effect-host-capability-report" || value.schemaVersion !== 1
    || value.effectsContract !== "1.0.0" || value.profile !== profile || value.automaticWriteEligible !== false
    || value.browserViewerWriteAdapter !== false || value.sourceContentIncluded !== false) reasons.push("CAPABILITY_EVIDENCE_INVALID");
  if (record(value) && (value.configured !== normalized.configured || value.effectExecutionAvailable !== normalized.effectExecutionAvailable)) reasons.push("REQUIRED_PRIMITIVE_UNPROVEN");
  if (normalized.configured && normalized.limitationCodes.length > 0) reasons.push("CAPABILITY_EVIDENCE_INVALID");
  if (normalized.limitationCodes.includes("CAPABILITY_EVIDENCE_INVALID")) reasons.push("CAPABILITY_EVIDENCE_INVALID");
  return Object.freeze({ valid: reasons.length === 0, reasonCodes: normalizedLimitations(reasons), normalized });
}

export function serializeEffectHostCapabilityReport(report: EffectHostCapabilityReport): string {
  return `${JSON.stringify(report)}\n`;
}

function normalizeUnavailableReasons(values: readonly EffectHostUnavailableReason[]): readonly EffectHostUnavailableReason[] {
  const reasons = [...new Set(values.filter((value) => UNAVAILABLE_REASONS.has(value)))].sort().slice(0, 8);
  return Object.freeze((reasons.length ? reasons : ["ADAPTER_NOT_IMPLEMENTED"]) as EffectHostUnavailableReason[]);
}

export function createEffectHostUnavailable(
  profile: EffectHostProfile,
  operation: EffectHostOperation,
  reasonCodes: readonly EffectHostUnavailableReason[] = ["ADAPTER_NOT_IMPLEMENTED"],
): EffectHostUnavailable {
  if (!isEffectHostProfile(profile)) throw new TypeError("EFFECT_HOST_PROFILE_INVALID");
  return Object.freeze({
    artifactKind: "kosmos.effect-host-unavailable",
    schemaVersion: 1,
    profile,
    operation,
    status: "unavailable",
    reasonCodes: normalizeUnavailableReasons(reasonCodes),
    sourceContentIncluded: false,
  });
}

export function createUnavailableEffectHostAdapter(
  profile: EffectHostProfile,
  reasonCodes: readonly EffectHostUnavailableReason[] = ["ADAPTER_NOT_IMPLEMENTED"],
): KosmosEffectHostAdapter {
  if (!isEffectHostProfile(profile)) throw new TypeError("EFFECT_HOST_PROFILE_INVALID");
  const unavailable = (operation: EffectHostOperation) => Promise.resolve(createEffectHostUnavailable(profile, operation, reasonCodes));
  return Object.freeze({
    profile,
    capabilities: () => normalizeEffectHostCapabilityReport(profile, {
      configured: false,
      limitationCodes: ["ADAPTER_NOT_IMPLEMENTED"],
    }),
    snapshot: () => unavailable("snapshot"),
    inspectPath: () => unavailable("inspect-path"),
    prepare: () => unavailable("prepare"),
    execute: () => unavailable("execute"),
    inspectRecovery: () => unavailable("inspect-recovery"),
    recover: () => unavailable("recover"),
    rollback: () => unavailable("rollback"),
    shutdown: () => unavailable("shutdown"),
  });
}
