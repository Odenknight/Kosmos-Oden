/**
 * Pure, injected Navigation Effects authority resolution.
 *
 * This module stores no grants, reads no host state, and performs no effect. A
 * caller must supply an authority provider and a clock. Connectivity, bearer
 * possession, client labels, confidence, and timestamps are never authority.
 */

export type EffectsActorType = "human" | "agent" | "system";
export type EffectsOperation =
  | "moc:create"
  | "moc:replace"
  | "moc:rollback"
  | "agent-note:create"
  | "agent-note:update"
  | "agent-note:append"
  | "agent-note:archive";
export type EffectsObjectClass = "managed-moc" | "agent-note";
export type EffectsSensitivity = "public" | "internal" | "restricted" | "confidential" | "regulated" | "phi" | "secret";

export interface EffectsCredentialBoundActor {
  actorId: string;
  actorType: EffectsActorType;
  credentialId: string;
}

export interface EffectsAuthorityPolicyRef {
  id: string;
  version: string;
  digest: string;
}

export interface EffectsAuthorityGrant {
  grantId: string;
  enabled: boolean;
  actor: EffectsCredentialBoundActor;
  approvedBy: EffectsCredentialBoundActor;
  vaultId: string;
  allowedRoot: string;
  operations: EffectsOperation[];
  objectClasses: EffectsObjectClass[];
  sensitivityCeiling: EffectsSensitivity;
  policyRef: EffectsAuthorityPolicyRef;
  expiresAt?: string;
}

export interface EffectsAuthorityRequest {
  actor: EffectsCredentialBoundActor;
  vaultId: string;
  operation: EffectsOperation;
  targetPath: string;
  objectClass: EffectsObjectClass;
  sensitivity: EffectsSensitivity;
  policyRef: EffectsAuthorityPolicyRef;
}

export interface EffectsAuthorityProvider {
  /** Return an explicit grant or null. Implementations must not infer one. */
  resolveGrant(request: Readonly<EffectsAuthorityRequest>): unknown;
}

export interface EffectsAuthorityClock {
  /** Evaluation time narrows an existing grant; it never creates authority. */
  now(): string;
}

export type EffectsAuthorityReasonCode =
  | "REQUEST_INVALID"
  | "AUTHORITY_INFERENCE_FIELD_FORBIDDEN"
  | "ACTOR_INVALID"
  | "CREDENTIAL_REQUIRED"
  | "VAULT_ID_INVALID"
  | "OPERATION_INVALID"
  | "TARGET_PATH_INVALID"
  | "TARGET_PATH_NOT_NFC"
  | "OBJECT_CLASS_INVALID"
  | "OBJECT_CLASS_OPERATION_MISMATCH"
  | "SENSITIVITY_INVALID"
  | "POLICY_REF_INVALID"
  | "EVALUATION_TIME_INVALID"
  | "PROVIDER_ERROR"
  | "GRANT_NOT_FOUND"
  | "GRANT_INVALID"
  | "GRANT_DISABLED"
  | "ACTOR_MISMATCH"
  | "CREDENTIAL_MISMATCH"
  | "AGENT_SELF_APPROVAL_DENIED"
  | "VAULT_MISMATCH"
  | "TARGET_OUTSIDE_GRANTED_ROOT"
  | "OPERATION_DENIED"
  | "OBJECT_CLASS_DENIED"
  | "SENSITIVITY_CEILING_EXCEEDED"
  | "POLICY_BINDING_MISMATCH"
  | "GRANT_EXPIRY_INVALID"
  | "GRANT_EXPIRED";

export interface EffectsAuthorityDecision {
  authorized: boolean;
  reasonCodes: EffectsAuthorityReasonCode[];
  /** Present only after every validation and scope check passes. */
  grant?: EffectsAuthorityGrant;
  evaluatedAt?: string;
}

const OPERATIONS = new Set<EffectsOperation>([
  "moc:create",
  "moc:replace",
  "moc:rollback",
  "agent-note:create",
  "agent-note:update",
  "agent-note:append",
  "agent-note:archive",
]);
const OBJECT_CLASSES = new Set<EffectsObjectClass>(["managed-moc", "agent-note"]);
const ACTOR_TYPES = new Set<EffectsActorType>(["human", "agent", "system"]);
const SENSITIVITY_RANK: Record<EffectsSensitivity, number> = {
  public: 0,
  internal: 1,
  restricted: 2,
  confidential: 3,
  regulated: 4,
  phi: 5,
  secret: 6,
};
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const RESERVED_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const RFC3339_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/;
const REQUEST_KEYS = new Set(["actor", "vaultId", "operation", "targetPath", "objectClass", "sensitivity", "policyRef"]);
const ACTOR_KEYS = new Set(["actorId", "actorType", "credentialId"]);
const POLICY_KEYS = new Set(["id", "version", "digest"]);
const GRANT_KEYS = new Set([
  "grantId",
  "enabled",
  "actor",
  "approvedBy",
  "vaultId",
  "allowedRoot",
  "operations",
  "objectClasses",
  "sensitivityCeiling",
  "policyRef",
  "expiresAt",
]);
const AUTHORITY_INFERENCE_KEYS = new Set([
  "token",
  "bearerToken",
  "connected",
  "connectivity",
  "clientName",
  "confidence",
  "timestamp",
  "approved",
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value) && value === value.normalize("NFC");
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validateActor(value: unknown): value is EffectsCredentialBoundActor {
  if (!record(value) || !exactKeys(value, ACTOR_KEYS)) return false;
  return validIdentifier(value.actorId)
    && ACTOR_TYPES.has(value.actorType as EffectsActorType)
    && validIdentifier(value.credentialId);
}

function validatePolicyRef(value: unknown): value is EffectsAuthorityPolicyRef {
  if (!record(value) || !exactKeys(value, POLICY_KEYS)) return false;
  return validIdentifier(value.id)
    && validIdentifier(value.version)
    && typeof value.digest === "string"
    && DIGEST.test(value.digest);
}

function validatePath(value: unknown): { valid: boolean; nfc: boolean; normalized?: string } {
  if (typeof value !== "string" || value.length === 0 || value.length > 4_096) return { valid: false, nfc: false };
  const nfc = value === value.normalize("NFC");
  if (!nfc || value.includes("\\") || value.includes("\0") || /^[A-Za-z]:/.test(value) || value.startsWith("/") || value.startsWith("//")) {
    return { valid: false, nfc };
  }
  // Effects paths are already decoded vault-relative names. Reject percent
  // encoding entirely so single and multiply encoded traversal cannot acquire
  // a second interpretation in a downstream host adapter.
  if (value.includes("%")) return { valid: false, nfc };
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return { valid: false, nfc };
  if (segments.some((segment) => /[. ]$/.test(segment) || RESERVED_DEVICE.test(segment) || /[<>:"|?*\u0000-\u001f]/.test(segment))) {
    return { valid: false, nfc };
  }
  return { valid: true, nfc, normalized: value };
}

function parseInstant(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = RFC3339_INSTANT.exec(value);
  if (!match) return undefined;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function expectedObjectClass(operation: EffectsOperation): EffectsObjectClass {
  return operation.startsWith("moc:") ? "managed-moc" : "agent-note";
}

function validateStringSet<T extends string>(value: unknown, allowed: ReadonlySet<T>): value is T[] {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= allowed.size
    && value.every((entry) => typeof entry === "string" && allowed.has(entry as T))
    && new Set(value).size === value.length;
}

function validateGrant(value: unknown): value is EffectsAuthorityGrant {
  if (!record(value) || !exactKeys(value, GRANT_KEYS)) return false;
  const root = validatePath(value.allowedRoot);
  return validIdentifier(value.grantId)
    && typeof value.enabled === "boolean"
    && validateActor(value.actor)
    && validateActor(value.approvedBy)
    && validIdentifier(value.vaultId)
    && root.valid
    && validateStringSet(value.operations, OPERATIONS)
    && validateStringSet(value.objectClasses, OBJECT_CLASSES)
    && typeof value.sensitivityCeiling === "string"
    && Object.prototype.hasOwnProperty.call(SENSITIVITY_RANK, value.sensitivityCeiling)
    && validatePolicyRef(value.policyRef)
    && (value.expiresAt === undefined || typeof value.expiresAt === "string");
}

function samePolicy(left: EffectsAuthorityPolicyRef, right: EffectsAuthorityPolicyRef): boolean {
  return left.id === right.id && left.version === right.version && left.digest === right.digest;
}

function deny(reasonCodes: Iterable<EffectsAuthorityReasonCode>, evaluatedAt?: string): EffectsAuthorityDecision {
  return { authorized: false, reasonCodes: [...new Set(reasonCodes)].sort(), ...(evaluatedAt ? { evaluatedAt } : {}) };
}

function validateRequest(value: unknown): EffectsAuthorityReasonCode[] {
  if (!record(value)) return ["REQUEST_INVALID"];
  const keys = Object.keys(value);
  if (keys.some((key) => AUTHORITY_INFERENCE_KEYS.has(key))) return ["AUTHORITY_INFERENCE_FIELD_FORBIDDEN"];
  const reasons: EffectsAuthorityReasonCode[] = [];
  if (!exactKeys(value, REQUEST_KEYS)) reasons.push("REQUEST_INVALID");
  if (!validateActor(value.actor)) {
    reasons.push("ACTOR_INVALID");
    if (!record(value.actor) || !validIdentifier(value.actor.credentialId)) reasons.push("CREDENTIAL_REQUIRED");
  }
  if (!validIdentifier(value.vaultId)) reasons.push("VAULT_ID_INVALID");
  if (typeof value.operation !== "string" || !OPERATIONS.has(value.operation as EffectsOperation)) reasons.push("OPERATION_INVALID");
  const target = validatePath(value.targetPath);
  if (!target.valid) reasons.push(target.nfc ? "TARGET_PATH_INVALID" : "TARGET_PATH_NOT_NFC");
  if (typeof value.objectClass !== "string" || !OBJECT_CLASSES.has(value.objectClass as EffectsObjectClass)) reasons.push("OBJECT_CLASS_INVALID");
  if (typeof value.operation === "string" && OPERATIONS.has(value.operation as EffectsOperation)
    && typeof value.objectClass === "string" && OBJECT_CLASSES.has(value.objectClass as EffectsObjectClass)
    && expectedObjectClass(value.operation as EffectsOperation) !== value.objectClass) reasons.push("OBJECT_CLASS_OPERATION_MISMATCH");
  if (typeof value.sensitivity !== "string" || !Object.prototype.hasOwnProperty.call(SENSITIVITY_RANK, value.sensitivity)) reasons.push("SENSITIVITY_INVALID");
  if (!validatePolicyRef(value.policyRef)) reasons.push("POLICY_REF_INVALID");
  return reasons;
}

export function resolveNavigationEffectsAuthority(
  requestValue: unknown,
  provider: EffectsAuthorityProvider,
  clock: EffectsAuthorityClock,
): EffectsAuthorityDecision {
  const requestReasons = validateRequest(requestValue);
  if (requestReasons.length) return deny(requestReasons);
  const request = requestValue as EffectsAuthorityRequest;

  let evaluatedAt: string;
  try {
    evaluatedAt = clock.now();
  } catch {
    return deny(["EVALUATION_TIME_INVALID"]);
  }
  const evaluatedAtMs = parseInstant(evaluatedAt);
  if (evaluatedAtMs === undefined) return deny(["EVALUATION_TIME_INVALID"]);

  let grantValue: unknown;
  try {
    grantValue = provider.resolveGrant(Object.freeze({
      ...request,
      actor: Object.freeze({ ...request.actor }),
      policyRef: Object.freeze({ ...request.policyRef }),
    }));
  } catch {
    return deny(["PROVIDER_ERROR"], evaluatedAt);
  }
  if (grantValue === null || grantValue === undefined) return deny(["GRANT_NOT_FOUND"], evaluatedAt);
  if (!validateGrant(grantValue)) return deny(["GRANT_INVALID"], evaluatedAt);
  const grant = grantValue as EffectsAuthorityGrant;
  const reasons: EffectsAuthorityReasonCode[] = [];

  if (!grant.enabled) reasons.push("GRANT_DISABLED");
  if (grant.actor.actorId !== request.actor.actorId || grant.actor.actorType !== request.actor.actorType) reasons.push("ACTOR_MISMATCH");
  if (grant.actor.credentialId !== request.actor.credentialId) reasons.push("CREDENTIAL_MISMATCH");
  if (grant.actor.actorType === "agent" && grant.approvedBy.actorId === grant.actor.actorId) reasons.push("AGENT_SELF_APPROVAL_DENIED");
  if (grant.vaultId !== request.vaultId) reasons.push("VAULT_MISMATCH");
  const target = validatePath(request.targetPath).normalized!;
  const root = validatePath(grant.allowedRoot).normalized!;
  if (target !== root && !target.startsWith(`${root}/`)) reasons.push("TARGET_OUTSIDE_GRANTED_ROOT");
  if (!grant.operations.includes(request.operation)) reasons.push("OPERATION_DENIED");
  if (!grant.objectClasses.includes(request.objectClass)) reasons.push("OBJECT_CLASS_DENIED");
  if (SENSITIVITY_RANK[request.sensitivity] > SENSITIVITY_RANK[grant.sensitivityCeiling]) reasons.push("SENSITIVITY_CEILING_EXCEEDED");
  if (!samePolicy(request.policyRef, grant.policyRef)) reasons.push("POLICY_BINDING_MISMATCH");
  const expiresAtMs = grant.expiresAt === undefined ? undefined : parseInstant(grant.expiresAt);
  if (grant.expiresAt !== undefined && expiresAtMs === undefined) reasons.push("GRANT_EXPIRY_INVALID");
  if (expiresAtMs !== undefined && evaluatedAtMs >= expiresAtMs) reasons.push("GRANT_EXPIRED");
  if (reasons.length) return deny(reasons, evaluatedAt);

  return {
    authorized: true,
    reasonCodes: [],
    evaluatedAt,
    grant: {
      ...grant,
      actor: { ...grant.actor },
      approvedBy: { ...grant.approvedBy },
      operations: [...grant.operations],
      objectClasses: [...grant.objectClasses],
      policyRef: { ...grant.policyRef },
    },
  };
}
