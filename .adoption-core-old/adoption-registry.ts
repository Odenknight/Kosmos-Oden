import {
  parseGeneratedMocRegion,
  validateVaultRelativePath,
  type EffectsActorRef,
  type MocGeneratedRegion,
  type MocOwnership,
} from "gkos-engine/navigation-effects";

export const ADOPTION_REGISTRY_SCHEMA = 1 as const;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

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

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

export async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function canonicalDigest(value: unknown): Promise<string> {
  return sha256Text(JSON.stringify(stableValue(value)));
}

export async function validateManagedMocBinding(binding: ManagedMocBinding): Promise<RegistryValidationResult> {
  const reasons: string[] = [];
  const path = validateVaultRelativePath(binding?.targetPath);
  if (binding?.schemaVersion !== 1) reasons.push("OWNERSHIP_SCHEMA_UNSUPPORTED");
  if (!path.valid || path.normalized !== binding?.targetPath) reasons.push(...path.reasonCodes, "OWNERSHIP_PATH_NOT_CANONICAL");
  if (!(["unmanaged", "region-managed", "fully-managed"] as unknown[]).includes(binding?.ownership)) reasons.push("OWNERSHIP_MODE_INVALID");
  if (binding?.adoptedDigest !== undefined && !SHA256_RE.test(binding.adoptedDigest)) reasons.push("ADOPTED_DIGEST_INVALID");
  if (binding?.ownership === "unmanaged" && (binding.adoptedDigest || binding.generatedRegion || binding.adoptionReceiptId)) reasons.push("UNMANAGED_BINDING_HAS_AUTHORITY");
  if (binding?.ownership === "region-managed" && !binding.generatedRegion) reasons.push("REGION_BINDING_MISSING");
  if (binding?.ownership === "fully-managed" && binding.generatedRegion) reasons.push("FULL_BINDING_HAS_REGION");
  if (binding?.generatedRegion) {
    if (binding.generatedRegion.markerVersion !== "1") reasons.push("MARKER_VERSION_INVALID");
    if (!SHA256_RE.test(binding.generatedRegion.configDigest) || !SHA256_RE.test(binding.generatedRegion.bodyDigest)) reasons.push("REGION_DIGEST_INVALID");
    if (!Number.isInteger(binding.generatedRegion.startOffset) || !Number.isInteger(binding.generatedRegion.endOffset)
      || binding.generatedRegion.startOffset < 0 || binding.generatedRegion.endOffset <= binding.generatedRegion.startOffset) reasons.push("REGION_OFFSET_INVALID");
  }
  return { valid: reasons.length === 0, reasonCodes: [...new Set(reasons)].sort() };
}

export async function createEmptyAdoptionRegistry(): Promise<AdoptionRegistryGeneration> {
  const base = { artifactKind: "kosmos.navigation-effects-ownership-registry" as const, schemaVersion: 1 as const, generation: 0, bindings: [] as ManagedMocBinding[] };
  return Object.freeze({ ...base, registryDigest: await canonicalDigest(base) });
}

export async function validateAdoptionRegistry(registry: AdoptionRegistryGeneration): Promise<RegistryValidationResult> {
  const reasons: string[] = [];
  if (registry?.artifactKind !== "kosmos.navigation-effects-ownership-registry" || registry?.schemaVersion !== 1) reasons.push("REGISTRY_SCHEMA_INVALID");
  if (!Number.isInteger(registry?.generation) || registry.generation < 0) reasons.push("REGISTRY_GENERATION_INVALID");
  if (!Array.isArray(registry?.bindings)) reasons.push("REGISTRY_BINDINGS_INVALID");
  const seen = new Set<string>();
  for (const binding of registry?.bindings ?? []) {
    const validation = await validateManagedMocBinding(binding);
    reasons.push(...validation.reasonCodes);
    if (typeof binding?.targetPath !== "string") { reasons.push("OWNERSHIP_PATH_INVALID"); continue; }
    const collisionKey = binding.targetPath.normalize("NFC").toLocaleLowerCase("en-US");
    if (seen.has(collisionKey)) reasons.push("OWNERSHIP_PATH_COLLISION");
    seen.add(collisionKey);
  }
  const { registryDigest: _digest, ...unsigned } = registry ?? {} as AdoptionRegistryGeneration;
  if (!SHA256_RE.test(registry?.registryDigest ?? "") || await canonicalDigest(unsigned) !== registry?.registryDigest) reasons.push("REGISTRY_DIGEST_MISMATCH");
  return { valid: reasons.length === 0, reasonCodes: [...new Set(reasons)].sort() };
}

export async function bindingForExactBytes(targetPath: string, ownership: MocOwnership, currentBytes: string, configDigest: string): Promise<ManagedMocBinding> {
  const adoptedDigest = await sha256Text(currentBytes);
  if (ownership === "unmanaged") return { schemaVersion: 1, targetPath, ownership };
  if (ownership === "fully-managed") return { schemaVersion: 1, targetPath, ownership, adoptedDigest };
  const parsed = await parseGeneratedMocRegion(currentBytes);
  if (parsed.ok === false) throw new Error(parsed.reasonCodes.join(","));
  if (parsed.region.configDigest !== configDigest) throw new Error("MARKER_CONFIG_MISMATCH");
  return { schemaVersion: 1, targetPath, ownership, adoptedDigest, generatedRegion: parsed.region };
}
