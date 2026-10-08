import { validateVaultRelativePath, type EffectsActorRef, type MocOwnership } from "gkos-engine/navigation-effects";
import {
  canonicalDigest, sha256Text, validateAdoptionRegistry, bindingForExactBytes,
  type AdoptionRegistryGeneration, type ManagedMocBinding, type MocAdoptionReceipt,
} from "./adoption-registry";

export interface AdoptionPreviewInput {
  operationId: string;
  targetPath: string;
  currentBytes: string;
  candidateBytes: string;
  ownership: MocOwnership;
  policyDigest: string;
  configDigest: string;
  actor: EffectsActorRef;
  registry: AdoptionRegistryGeneration;
  existingPaths?: readonly string[];
}

export interface AdoptionPreview {
  artifactKind: "kosmos.navigation-effects-adoption-preview";
  previewDigest: string;
  operationId: string;
  targetPath: string;
  ownership: MocOwnership;
  currentDigest: string;
  proposedDigest: string;
  policyDigest: string;
  configDigest: string;
  actorDigest: string;
  priorRegistryDigest: string;
  priorRegistryGeneration: number;
  binding?: ManagedMocBinding;
  preservedHumanPrefix: string;
  preservedHumanSuffix: string;
  exactDiff: string;
  semanticSummary: string;
  confirmable: boolean;
  reasonCodes: string[];
}

function exactDiff(before: string, after: string): string {
  if (before === after) return "(byte-identical)";
  return `--- current\n+++ candidate\n@@ exact bytes @@\n-${JSON.stringify(before)}\n+${JSON.stringify(after)}`;
}

export async function planMocAdoption(input: AdoptionPreviewInput): Promise<AdoptionPreview> {
  const reasons: string[] = [];
  const path = validateVaultRelativePath(input.targetPath);
  if (!path.valid || path.normalized !== input.targetPath) reasons.push(...path.reasonCodes, "TARGET_PATH_NOT_CANONICAL");
  const folded = input.targetPath.normalize("NFC").toLocaleLowerCase("en-US");
  if ((input.existingPaths ?? []).some((candidate) => candidate !== input.targetPath && candidate.normalize("NFC").toLocaleLowerCase("en-US") === folded)) reasons.push("PATH_CASE_OR_UNICODE_COLLISION");
  if (input.targetPath === ".gkx" || input.targetPath.startsWith(".gkx/") || input.targetPath === "_archive/moc-runs" || input.targetPath.startsWith("_archive/moc-runs/")) reasons.push("OPERATIONAL_PATH_DENIED");
  const registryValidation = await validateAdoptionRegistry(input.registry);
  reasons.push(...registryValidation.reasonCodes);
  if (!input.operationId) reasons.push("OPERATION_ID_REQUIRED");
  if (!/^sha256:[0-9a-f]{64}$/.test(input.policyDigest)) reasons.push("POLICY_DIGEST_INVALID");
  if (!/^sha256:[0-9a-f]{64}$/.test(input.configDigest)) reasons.push("CONFIG_DIGEST_INVALID");
  if (!input.actor?.actorId || input.actor.actorType !== "human") reasons.push("HUMAN_ACTOR_REQUIRED");
  let binding: ManagedMocBinding | undefined;
  try { binding = await bindingForExactBytes(input.targetPath, input.ownership, input.currentBytes, input.configDigest); }
  catch (error) { reasons.push(...String(error instanceof Error ? error.message : error).split(",")); }
  if (input.ownership === "unmanaged") reasons.push("UNMANAGED_NOT_ADOPTABLE");
  const currentDigest = await sha256Text(input.currentBytes);
  const proposedDigest = await sha256Text(input.candidateBytes);
  let prefix = "", suffix = "";
  if (binding?.generatedRegion) {
    prefix = input.currentBytes.slice(0, binding.generatedRegion.startOffset);
    suffix = input.currentBytes.slice(binding.generatedRegion.endOffset);
  }
  const unsigned = {
    artifactKind: "kosmos.navigation-effects-adoption-preview" as const, operationId: input.operationId,
    targetPath: input.targetPath, ownership: input.ownership, currentDigest, proposedDigest,
    policyDigest: input.policyDigest, configDigest: input.configDigest, actorDigest: await canonicalDigest(input.actor),
    priorRegistryDigest: input.registry.registryDigest, priorRegistryGeneration: input.registry.generation,
    binding, preservedHumanPrefix: prefix, preservedHumanSuffix: suffix, exactDiff: exactDiff(input.currentBytes, input.candidateBytes),
    semanticSummary: input.ownership === "region-managed" ? "Adopt exactly one generated region; preserve surrounding bytes." : "Adopt the complete current MOC bytes.",
    confirmable: reasons.length === 0, reasonCodes: [...new Set(reasons)].sort(),
  };
  return Object.freeze({ ...unsigned, previewDigest: await canonicalDigest(unsigned) });
}

export function previewStillCurrent(preview: AdoptionPreview, current: { targetDigest: string; policyDigest: string; configDigest: string; actorDigest: string; registryDigest: string }): boolean {
  return preview.confirmable && preview.currentDigest === current.targetDigest && preview.policyDigest === current.policyDigest
    && preview.configDigest === current.configDigest && preview.actorDigest === current.actorDigest && preview.priorRegistryDigest === current.registryDigest;
}

export async function confirmMocAdoption(input: { preview: AdoptionPreview; registry: AdoptionRegistryGeneration; rereadBytes: string; actor: EffectsActorRef; credentialId: string; confirmed: boolean; occurredAt: string }): Promise<{ registry: AdoptionRegistryGeneration; receipt: MocAdoptionReceipt }> {
  const { preview, registry } = input;
  if (!preview.confirmable || preview.ownership === "unmanaged" || !preview.binding) throw new Error("ADOPTION_PREVIEW_NOT_CONFIRMABLE");
  if (!input.confirmed || input.actor.actorType !== "human" || !input.credentialId) throw new Error("CREDENTIAL_BOUND_HUMAN_CONFIRMATION_REQUIRED");
  if (!(await validateAdoptionRegistry(registry)).valid) throw new Error("ADOPTION_REGISTRY_INVALID");
  if (await sha256Text(input.rereadBytes) !== preview.currentDigest || registry.registryDigest !== preview.priorRegistryDigest || registry.generation !== preview.priorRegistryGeneration || await canonicalDigest(input.actor) !== preview.actorDigest) throw new Error("ADOPTION_PREVIEW_STALE");
  const receiptId = `adoption:${preview.previewDigest.slice(7, 39)}`;
  const binding: ManagedMocBinding = { ...preview.binding, adoptedBy: { ...input.actor }, adoptedAt: input.occurredAt, adoptionReceiptId: receiptId };
  const bindings = registry.bindings.filter((item) => item.targetPath !== preview.targetPath).concat(binding).sort((a, b) => a.targetPath.localeCompare(b.targetPath));
  const registryUnsigned = { artifactKind: "kosmos.navigation-effects-ownership-registry" as const, schemaVersion: 1 as const, generation: registry.generation + 1, predecessorDigest: registry.registryDigest, bindings };
  const nextRegistry = { ...registryUnsigned, registryDigest: await canonicalDigest(registryUnsigned) };
  const receiptUnsigned = { artifactKind: "kosmos.navigation-effects-adoption-receipt" as const, schemaVersion: 1 as const, receiptId, operationId: preview.operationId, priorRegistryDigest: registry.registryDigest, targetPath: preview.targetPath, targetDigest: preview.currentDigest, ownership: preview.ownership, policyDigest: preview.policyDigest, configDigest: preview.configDigest, actor: { ...input.actor }, credentialId: input.credentialId, newRegistryGeneration: nextRegistry.generation, newRegistryDigest: nextRegistry.registryDigest, occurredAt: input.occurredAt, sourceContentIncluded: false as const };
  return { registry: Object.freeze(nextRegistry), receipt: Object.freeze({ ...receiptUnsigned, receiptDigest: await canonicalDigest(receiptUnsigned) }) as MocAdoptionReceipt };
}
