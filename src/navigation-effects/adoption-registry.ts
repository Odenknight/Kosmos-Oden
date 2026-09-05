import {
  parseGeneratedMocRegion,
  validateVaultRelativePath,
  type EffectsActorRef,
  type MocGeneratedRegion,
  type MocOwnership,
} from "gkos-engine/navigation-effects";

export const ADOPTION_REGISTRY_SCHEMA = 1 as const;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const RECEIPT_ID_RE = /^adoption:[0-9a-f]{32}$/;
const RFC3339_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/;

export interface ManagedMocBinding {
  schemaVersion: typeof ADOPTION_REGISTRY_SCHEMA;
  targetPath: string;
  ownership: MocOwnership;
  adoptedDigest?: string;
  generatedRegion?: MocGeneratedRegion;
  adoptedBy?: EffectsActorRef;
  adoptedAt?: string;
  adoptionReceiptId?: string;
  creationAuthorized?: true;
}

export interface AdoptionRegistryGeneration {
  artifactKind: "kosmos.navigation-effects-ownership-registry";
  schemaVersion: typeof ADOPTION_REGISTRY_SCHEMA;
  generation: number;
  predecessorDigest?: string;
  bindings: ManagedMocBinding[];
  registryDigest: string;
}

export interface MocAdoptionReceipt {
  artifactKind: "kosmos.navigation-effects-adoption-receipt";
  schemaVersion: typeof ADOPTION_REGISTRY_SCHEMA;
  receiptId: string;
  operationId: string;
  priorRegistryDigest: string;
  targetPath: string;
  targetDigest: string;
  ownership: Exclude<MocOwnership, "unmanaged">;
  policyDigest: string;
  configDigest: string;
  actor: EffectsActorRef;
  credentialId: string;
  newRegistryGeneration: number;
  newRegistryDigest: string;
  occurredAt: string;
  sourceContentIncluded: false;
  receiptDigest: string;
}

export interface RegistryValidationResult {
  valid: boolean;
  reasonCodes: string[];
}

const BINDING_KEYS = new Set(["schemaVersion", "targetPath", "ownership", "adoptedDigest", "generatedRegion", "adoptedBy", "adoptedAt", "adoptionReceiptId", "creationAuthorized"]);
const REGION_KEYS = new Set(["markerVersion", "configDigest", "startOffset", "endOffset", "bodyDigest"]);
const ACTOR_KEYS = new Set(["actorId", "actorType", "displayName"]);
const REGISTRY_KEYS = new Set(["artifactKind", "schemaVersion", "generation", "predecessorDigest", "bindings", "registryDigest"]);
const RECEIPT_KEYS = new Set(["artifactKind", "schemaVersion", "receiptId", "operationId", "priorRegistryDigest", "targetPath", "targetDigest", "ownership", "policyDigest", "configDigest", "actor", "credentialId", "newRegistryGeneration", "newRegistryDigest", "occurredAt", "sourceContentIncluded", "receiptDigest"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

export function compareAdoptionPaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalValue(value: unknown, seen = new Set<object>()): unknown {
  if (typeof value === "string") return value;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonicalization rejects non-finite numbers.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Canonicalization rejects cyclic arrays.");
    seen.add(value);
    const result = value.map((entry) => canonicalValue(entry, seen));
    seen.delete(value);
    return result;
  }
  if (record(value)) {
    if (seen.has(value)) throw new TypeError("Canonicalization rejects cyclic objects.");
    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compareAdoptionPaths)) {
      if (value[key] !== undefined) result[key] = canonicalValue(value[key], seen);
    }
    seen.delete(value);
    return result;
  }
  throw new TypeError(`Canonicalization rejects ${typeof value} values.`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export async function sha256Text(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto SHA-256 is unavailable in this runtime.");
  const bytes = new TextEncoder().encode(value);
  const digest = await subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function canonicalDigest(value: unknown): Promise<string> {
  return sha256Text(canonicalJson(value));
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER_RE.test(value) && value === value.normalize("NFC");
}

function validInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = RFC3339_INSTANT.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]), offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth && hour <= 23 && minute <= 59 && second <= 59
    && offsetHour <= 23 && offsetMinute <= 59 && !Number.isNaN(Date.parse(value));
}

function validateActor(value: unknown, humanRequired = false): boolean {
  if (!record(value) || !exactKeys(value, ACTOR_KEYS)) return false;
  return validIdentifier(value.actorId)
    && (value.actorType === "human" || !humanRequired && (value.actorType === "agent" || value.actorType === "system"))
    && (value.displayName === undefined || typeof value.displayName === "string" && value.displayName.length <= 256 && value.displayName === value.displayName.normalize("NFC"));
}

function canonicalPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const validation = validateVaultRelativePath(value);
  return validation.valid && validation.normalized === value;
}

function sameActor(left: unknown, right: unknown): boolean {
  try { return canonicalJson(left) === canonicalJson(right); } catch { return false; }
}

export async function validateManagedMocBinding(value: unknown): Promise<RegistryValidationResult> {
  const reasons: string[] = [];
  if (!record(value)) return { valid: false, reasonCodes: ["OWNERSHIP_BINDING_INVALID"] };
  if (!exactKeys(value, BINDING_KEYS)) reasons.push("OWNERSHIP_BINDING_UNKNOWN_FIELD");
  if (value.schemaVersion !== 1) reasons.push("OWNERSHIP_SCHEMA_UNSUPPORTED");
  if (!canonicalPath(value.targetPath)) reasons.push("OWNERSHIP_PATH_NOT_CANONICAL");
  if (value.ownership !== "unmanaged" && value.ownership !== "region-managed" && value.ownership !== "fully-managed") reasons.push("OWNERSHIP_MODE_INVALID");
  if (value.adoptedDigest !== undefined && (typeof value.adoptedDigest !== "string" || !SHA256_RE.test(value.adoptedDigest))) reasons.push("ADOPTED_DIGEST_INVALID");
  if (value.creationAuthorized !== undefined && value.creationAuthorized !== true) reasons.push("CREATION_AUTHORIZATION_INVALID");

  if (value.ownership === "unmanaged") {
    if (value.adoptedDigest !== undefined || value.generatedRegion !== undefined || value.adoptedBy !== undefined || value.adoptedAt !== undefined
      || value.adoptionReceiptId !== undefined || value.creationAuthorized !== undefined) reasons.push("UNMANAGED_BINDING_HAS_AUTHORITY");
  } else if (value.ownership === "region-managed" || value.ownership === "fully-managed") {
    if (typeof value.adoptedDigest !== "string" || !SHA256_RE.test(value.adoptedDigest)) reasons.push("MANAGED_BINDING_ADOPTED_DIGEST_REQUIRED");
    if (!validateActor(value.adoptedBy, true)) reasons.push("MANAGED_BINDING_HUMAN_ACTOR_REQUIRED");
    if (!validInstant(value.adoptedAt)) reasons.push("MANAGED_BINDING_ADOPTION_TIME_INVALID");
    if (typeof value.adoptionReceiptId !== "string" || !RECEIPT_ID_RE.test(value.adoptionReceiptId)) reasons.push("MANAGED_BINDING_RECEIPT_REQUIRED");
    if (value.ownership === "region-managed" && value.creationAuthorized !== undefined) reasons.push("REGION_BINDING_CANNOT_AUTHORIZE_CREATION");
  }

  if (value.ownership === "region-managed" && !record(value.generatedRegion)) reasons.push("REGION_BINDING_MISSING");
  if (value.ownership === "fully-managed" && value.generatedRegion !== undefined) reasons.push("FULL_BINDING_HAS_REGION");
  if (record(value.generatedRegion)) {
    const region = value.generatedRegion;
    if (!exactKeys(region, REGION_KEYS)) reasons.push("REGION_UNKNOWN_FIELD");
    if (region.markerVersion !== "1") reasons.push("MARKER_VERSION_INVALID");
    if (typeof region.configDigest !== "string" || typeof region.bodyDigest !== "string" || !SHA256_RE.test(region.configDigest) || !SHA256_RE.test(region.bodyDigest)) reasons.push("REGION_DIGEST_INVALID");
    if (!Number.isInteger(region.startOffset) || !Number.isInteger(region.endOffset) || Number(region.startOffset) < 0 || Number(region.endOffset) <= Number(region.startOffset)) reasons.push("REGION_OFFSET_INVALID");
  }
  return { valid: reasons.length === 0, reasonCodes: [...new Set(reasons)].sort(compareAdoptionPaths) };
}

export async function createEmptyAdoptionRegistry(): Promise<AdoptionRegistryGeneration> {
  const base = { artifactKind: "kosmos.navigation-effects-ownership-registry" as const, schemaVersion: 1 as const, generation: 0, bindings: [] as ManagedMocBinding[] };
  return Object.freeze({ ...base, registryDigest: await canonicalDigest(base) });
}

export async function validateAdoptionRegistry(value: unknown): Promise<RegistryValidationResult> {
  const reasons: string[] = [];
  if (!record(value)) return { valid: false, reasonCodes: ["REGISTRY_INVALID"] };
  if (!exactKeys(value, REGISTRY_KEYS)) reasons.push("REGISTRY_UNKNOWN_FIELD");
  if (value.artifactKind !== "kosmos.navigation-effects-ownership-registry" || value.schemaVersion !== 1) reasons.push("REGISTRY_SCHEMA_INVALID");
  if (!Number.isInteger(value.generation) || Number(value.generation) < 0) reasons.push("REGISTRY_GENERATION_INVALID");
  if (!Array.isArray(value.bindings)) reasons.push("REGISTRY_BINDINGS_INVALID");
  if (value.generation === 0 && (value.predecessorDigest !== undefined || Array.isArray(value.bindings) && value.bindings.length !== 0)) reasons.push("EMPTY_REGISTRY_INVALID");
  if (Number(value.generation) > 0 && (typeof value.predecessorDigest !== "string" || !SHA256_RE.test(value.predecessorDigest))) reasons.push("REGISTRY_PREDECESSOR_INVALID");
  const seen = new Set<string>();
  let priorPath: string | undefined;
  for (const binding of Array.isArray(value.bindings) ? value.bindings : []) {
    const validation = await validateManagedMocBinding(binding);
    reasons.push(...validation.reasonCodes);
    if (!record(binding) || typeof binding.targetPath !== "string") continue;
    const collision = binding.targetPath.normalize("NFC").toLowerCase();
    if (seen.has(collision)) reasons.push("OWNERSHIP_PATH_COLLISION");
    seen.add(collision);
    if (priorPath !== undefined && compareAdoptionPaths(priorPath, binding.targetPath) >= 0) reasons.push("REGISTRY_BINDINGS_NOT_CANONICAL");
    priorPath = binding.targetPath;
  }
  const { registryDigest: _digest, ...unsigned } = value;
  try {
    if (typeof value.registryDigest !== "string" || !SHA256_RE.test(value.registryDigest) || await canonicalDigest(unsigned) !== value.registryDigest) reasons.push("REGISTRY_DIGEST_MISMATCH");
  } catch { reasons.push("REGISTRY_CANONICALIZATION_FAILED"); }
  return { valid: reasons.length === 0, reasonCodes: [...new Set(reasons)].sort(compareAdoptionPaths) };
}

export async function validateAdoptionReceipt(value: unknown, priorRegistry?: AdoptionRegistryGeneration, nextRegistry?: AdoptionRegistryGeneration): Promise<RegistryValidationResult> {
  const reasons: string[] = [];
  if (!record(value)) return { valid: false, reasonCodes: ["ADOPTION_RECEIPT_INVALID"] };
  if (!exactKeys(value, RECEIPT_KEYS)) reasons.push("ADOPTION_RECEIPT_UNKNOWN_FIELD");
  if (value.artifactKind !== "kosmos.navigation-effects-adoption-receipt" || value.schemaVersion !== 1) reasons.push("ADOPTION_RECEIPT_SCHEMA_INVALID");
  if (typeof value.receiptId !== "string" || !RECEIPT_ID_RE.test(value.receiptId)) reasons.push("ADOPTION_RECEIPT_ID_INVALID");
  if (!validIdentifier(value.operationId)) reasons.push("ADOPTION_OPERATION_ID_INVALID");
  for (const [name, digest] of Object.entries({ prior: value.priorRegistryDigest, target: value.targetDigest, policy: value.policyDigest, config: value.configDigest, next: value.newRegistryDigest })) {
    if (typeof digest !== "string" || !SHA256_RE.test(digest)) reasons.push(`ADOPTION_${name.toUpperCase()}_DIGEST_INVALID`);
  }
  if (!canonicalPath(value.targetPath)) reasons.push("ADOPTION_TARGET_PATH_INVALID");
  if (value.ownership !== "region-managed" && value.ownership !== "fully-managed") reasons.push("ADOPTION_OWNERSHIP_INVALID");
  if (!validateActor(value.actor, true)) reasons.push("ADOPTION_ACTOR_INVALID");
  if (!validIdentifier(value.credentialId)) reasons.push("ADOPTION_CREDENTIAL_INVALID");
  if (!Number.isInteger(value.newRegistryGeneration) || Number(value.newRegistryGeneration) < 1) reasons.push("ADOPTION_GENERATION_INVALID");
  if (!validInstant(value.occurredAt)) reasons.push("ADOPTION_TIME_INVALID");
  if (value.sourceContentIncluded !== false) reasons.push("ADOPTION_RECEIPT_CONTAINS_SOURCE");
  const { receiptDigest: _receiptDigest, ...unsigned } = value;
  try {
    if (typeof value.receiptDigest !== "string" || !SHA256_RE.test(value.receiptDigest) || await canonicalDigest(unsigned) !== value.receiptDigest) reasons.push("ADOPTION_RECEIPT_DIGEST_MISMATCH");
  } catch { reasons.push("ADOPTION_RECEIPT_CANONICALIZATION_FAILED"); }
  if (priorRegistry) {
    if (value.priorRegistryDigest !== priorRegistry.registryDigest) reasons.push("ADOPTION_PRIOR_REGISTRY_MISMATCH");
    if (value.newRegistryGeneration !== priorRegistry.generation + 1) reasons.push("ADOPTION_GENERATION_CHAIN_INVALID");
  }
  if (nextRegistry) {
    if (value.newRegistryDigest !== nextRegistry.registryDigest || value.newRegistryGeneration !== nextRegistry.generation) reasons.push("ADOPTION_NEXT_REGISTRY_MISMATCH");
    if (priorRegistry && nextRegistry.predecessorDigest !== priorRegistry.registryDigest) reasons.push("ADOPTION_PREDECESSOR_MISMATCH");
    const binding = nextRegistry.bindings.find((item) => item.targetPath === value.targetPath);
    if (!binding || binding.ownership !== value.ownership || binding.adoptedDigest !== value.targetDigest || binding.adoptionReceiptId !== value.receiptId
      || binding.adoptedAt !== value.occurredAt || !sameActor(binding.adoptedBy, value.actor)
      || value.ownership === "region-managed" && binding.generatedRegion?.configDigest !== value.configDigest) reasons.push("ADOPTION_BINDING_MISMATCH");
  }
  return { valid: reasons.length === 0, reasonCodes: [...new Set(reasons)].sort(compareAdoptionPaths) };
}

export function serializeAdoptionRegistry(registry: AdoptionRegistryGeneration): string { return `${canonicalJson(registry)}\n`; }
export function serializeAdoptionReceipt(receipt: MocAdoptionReceipt): string { return `${canonicalJson(receipt)}\n`; }

export async function loadAdoptionRegistry(bytes: string): Promise<AdoptionRegistryGeneration> {
  let value: unknown;
  try { value = JSON.parse(bytes); } catch { throw new Error("ADOPTION_REGISTRY_PARSE_FAILED"); }
  const validation = await validateAdoptionRegistry(value);
  if (!validation.valid || bytes !== `${canonicalJson(value)}\n`) throw new Error(["ADOPTION_REGISTRY_INVALID", ...validation.reasonCodes].join(","));
  return structuredClone(value) as AdoptionRegistryGeneration;
}

export async function loadAdoptionReceipt(bytes: string): Promise<MocAdoptionReceipt> {
  let value: unknown;
  try { value = JSON.parse(bytes); } catch { throw new Error("ADOPTION_RECEIPT_PARSE_FAILED"); }
  const validation = await validateAdoptionReceipt(value);
  if (!validation.valid || bytes !== `${canonicalJson(value)}\n`) throw new Error(["ADOPTION_RECEIPT_INVALID", ...validation.reasonCodes].join(","));
  return structuredClone(value) as MocAdoptionReceipt;
}

/** Build the exact-byte ownership portion of a preview; it grants no authority. */
export async function bindingForExactBytes(targetPath: string, ownership: MocOwnership, currentBytes: string, configDigest: string): Promise<ManagedMocBinding> {
  const adoptedDigest = await sha256Text(currentBytes);
  if (ownership === "unmanaged") return { schemaVersion: 1, targetPath, ownership };
  if (ownership === "fully-managed") return { schemaVersion: 1, targetPath, ownership, adoptedDigest };
  const parsed = await parseGeneratedMocRegion(currentBytes);
  if (parsed.ok === false) throw new Error(parsed.reasonCodes.join(","));
  if (parsed.region.configDigest !== configDigest) throw new Error("MARKER_CONFIG_MISMATCH");
  return { schemaVersion: 1, targetPath, ownership, adoptedDigest, generatedRegion: parsed.region };
}
