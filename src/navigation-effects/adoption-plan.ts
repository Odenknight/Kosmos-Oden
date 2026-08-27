import {
  extractNavigationCandidateBody,
  mergeGeneratedMocRegion,
  validateVaultRelativePath,
  type EffectsActorRef,
  type MocOwnership,
} from "gkos-engine/navigation-effects";
import {
  bindingForExactBytes,
  canonicalDigest,
  compareAdoptionPaths,
  sha256Text,
  validateAdoptionReceipt,
  validateAdoptionRegistry,
  type AdoptionRegistryGeneration,
  type ManagedMocBinding,
  type MocAdoptionReceipt,
} from "./adoption-registry";

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

export interface AdoptionPreviewInput {
  operationId: string;
  targetPath: string;
  currentBytes: string;
  /** Exact Engine Navigation candidate bytes, including its managed marker pair. */
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

export interface AdoptionCurrentState {
  targetPath: string;
  targetDigest: string;
  proposedDigest: string;
  policyDigest: string;
  configDigest: string;
  actorDigest: string;
  registryDigest: string;
  existingPaths?: readonly string[];
}

function exactDiff(before: string, after: string): string {
  if (before === after) return "(byte-identical)";
  return `--- current\n+++ candidate\n@@ exact bytes @@\n-${JSON.stringify(before)}\n+${JSON.stringify(after)}`;
}

function pathReasons(targetPath: string, existingPaths: readonly string[] = []): string[] {
  const reasons: string[] = [];
  const path = validateVaultRelativePath(targetPath);
  if (!path.valid || path.normalized !== targetPath) reasons.push(...path.reasonCodes, "TARGET_PATH_NOT_CANONICAL");
  if (/%/.test(targetPath)) reasons.push("PATH_ENCODING_DENIED");
  if (/[\u0000-\u001f\u007f]/.test(targetPath)) reasons.push("PATH_CONTROL_DENIED");
  const folded = targetPath.normalize("NFC").toLowerCase();
  if (existingPaths.some((candidate) => candidate !== targetPath && candidate.normalize("NFC").toLowerCase() === folded)) reasons.push("PATH_CASE_OR_UNICODE_COLLISION");
  const operational = targetPath.normalize("NFC").toLowerCase();
  if (operational === ".gkx" || operational.startsWith(".gkx/") || operational === "_archive/moc-runs" || operational.startsWith("_archive/moc-runs/")) reasons.push("OPERATIONAL_PATH_DENIED");
  return reasons;
}

export async function planMocAdoption(input: AdoptionPreviewInput): Promise<AdoptionPreview> {
  const reasons = pathReasons(input.targetPath, input.existingPaths);
  const registryValidation = await validateAdoptionRegistry(input.registry);
  reasons.push(...registryValidation.reasonCodes);
  if (!input.operationId || input.operationId !== input.operationId.normalize("NFC")) reasons.push("OPERATION_ID_REQUIRED");
  if (!DIGEST_RE.test(input.policyDigest)) reasons.push("POLICY_DIGEST_INVALID");
  if (!DIGEST_RE.test(input.configDigest)) reasons.push("CONFIG_DIGEST_INVALID");
  if (!input.actor?.actorId || input.actor.actorType !== "human") reasons.push("HUMAN_ACTOR_REQUIRED");

  let binding: ManagedMocBinding | undefined;
  try { binding = await bindingForExactBytes(input.targetPath, input.ownership, input.currentBytes, input.configDigest); }
  catch (error) { reasons.push(...String(error instanceof Error ? error.message : error).split(",")); }
  if (input.ownership === "unmanaged") reasons.push("UNMANAGED_NOT_ADOPTABLE");

  let proposedBytes = input.candidateBytes;
  let preservedHumanPrefix = "", preservedHumanSuffix = "";
  if (binding?.ownership === "region-managed" && binding.generatedRegion) {
    try {
      const generatedBody = extractNavigationCandidateBody(input.candidateBytes);
      const merged = await mergeGeneratedMocRegion({
        currentBytes: input.currentBytes,
        generatedBody,
        currentBinding: binding.generatedRegion,
        nextConfigDigest: input.configDigest,
      });
      if (merged.ok === false) reasons.push(...merged.reasonCodes);
      else {
        proposedBytes = merged.bytes;
        preservedHumanPrefix = merged.prefix;
        preservedHumanSuffix = merged.suffix;
      }
    } catch { reasons.push("CANDIDATE_REGION_INVALID"); }
  }

  const currentDigest = await sha256Text(input.currentBytes);
  const proposedDigest = await sha256Text(proposedBytes);
  const unsigned = {
    artifactKind: "kosmos.navigation-effects-adoption-preview" as const,
    operationId: input.operationId,
    targetPath: input.targetPath,
    ownership: input.ownership,
    currentDigest,
    proposedDigest,
    policyDigest: input.policyDigest,
    configDigest: input.configDigest,
    actorDigest: await canonicalDigest(input.actor),
    priorRegistryDigest: input.registry.registryDigest,
    priorRegistryGeneration: input.registry.generation,
    binding,
    preservedHumanPrefix,
    preservedHumanSuffix,
    exactDiff: exactDiff(input.currentBytes, proposedBytes),
    semanticSummary: input.ownership === "region-managed"
      ? "Adopt exactly one generated region; preserve surrounding bytes."
      : "Adopt the complete current MOC bytes.",
    confirmable: reasons.length === 0,
    reasonCodes: [...new Set(reasons)].sort(compareAdoptionPaths),
  };
  return Object.freeze({ ...unsigned, previewDigest: await canonicalDigest(unsigned) });
}

export function previewStillCurrent(preview: AdoptionPreview, current: AdoptionCurrentState): boolean {
  return preview.confirmable && preview.targetPath === current.targetPath && preview.currentDigest === current.targetDigest
    && preview.proposedDigest === current.proposedDigest && preview.policyDigest === current.policyDigest
    && preview.configDigest === current.configDigest && preview.actorDigest === current.actorDigest
    && preview.priorRegistryDigest === current.registryDigest && pathReasons(current.targetPath, current.existingPaths).length === 0;
}

export async function confirmMocAdoption(input: {
  preview: AdoptionPreview;
  registry: AdoptionRegistryGeneration;
  rereadBytes: string;
  currentTargetPath: string;
  currentProposedDigest: string;
  currentPolicyDigest: string;
  currentConfigDigest: string;
  currentExistingPaths?: readonly string[];
  actor: EffectsActorRef;
  credentialId: string;
  confirmed: boolean;
  occurredAt: string;
}): Promise<{ registry: AdoptionRegistryGeneration; receipt: MocAdoptionReceipt }> {
  const { preview, registry } = input;
  if (!preview.confirmable || preview.ownership === "unmanaged" || !preview.binding) throw new Error("ADOPTION_PREVIEW_NOT_CONFIRMABLE");
  if (!input.confirmed || input.actor.actorType !== "human" || !input.credentialId) throw new Error("CREDENTIAL_BOUND_HUMAN_CONFIRMATION_REQUIRED");
  const registryValidation = await validateAdoptionRegistry(registry);
  if (!registryValidation.valid) throw new Error("ADOPTION_REGISTRY_INVALID");
  const { previewDigest, ...previewUnsigned } = preview;
  if (await canonicalDigest(previewUnsigned) !== previewDigest) throw new Error("ADOPTION_PREVIEW_CORRUPT");

  const current: AdoptionCurrentState = {
    targetPath: input.currentTargetPath,
    targetDigest: await sha256Text(input.rereadBytes),
    proposedDigest: input.currentProposedDigest,
    policyDigest: input.currentPolicyDigest,
    configDigest: input.currentConfigDigest,
    actorDigest: await canonicalDigest(input.actor),
    registryDigest: registry.registryDigest,
    existingPaths: input.currentExistingPaths,
  };
  if (!previewStillCurrent(preview, current) || registry.generation !== preview.priorRegistryGeneration) throw new Error("ADOPTION_PREVIEW_STALE");

  const receiptId = `adoption:${preview.previewDigest.slice(7, 39)}`;
  const binding: ManagedMocBinding = {
    ...preview.binding,
    adoptedBy: { ...input.actor },
    adoptedAt: input.occurredAt,
    adoptionReceiptId: receiptId,
  };
  const bindings = registry.bindings.filter((item) => item.targetPath !== preview.targetPath).concat(binding).sort((a, b) => compareAdoptionPaths(a.targetPath, b.targetPath));
  const registryUnsigned = {
    artifactKind: "kosmos.navigation-effects-ownership-registry" as const,
    schemaVersion: 1 as const,
    generation: registry.generation + 1,
    predecessorDigest: registry.registryDigest,
    bindings,
  };
  const nextRegistry: AdoptionRegistryGeneration = { ...registryUnsigned, registryDigest: await canonicalDigest(registryUnsigned) };
  const receiptUnsigned = {
    artifactKind: "kosmos.navigation-effects-adoption-receipt" as const,
    schemaVersion: 1 as const,
    receiptId,
    operationId: preview.operationId,
    priorRegistryDigest: registry.registryDigest,
    targetPath: preview.targetPath,
    targetDigest: preview.currentDigest,
    ownership: preview.ownership,
    policyDigest: preview.policyDigest,
    configDigest: preview.configDigest,
    actor: { ...input.actor },
    credentialId: input.credentialId,
    newRegistryGeneration: nextRegistry.generation,
    newRegistryDigest: nextRegistry.registryDigest,
    occurredAt: input.occurredAt,
    sourceContentIncluded: false as const,
  };
  const receipt = { ...receiptUnsigned, receiptDigest: await canonicalDigest(receiptUnsigned) } as MocAdoptionReceipt;
  const nextValidation = await validateAdoptionRegistry(nextRegistry);
  const receiptValidation = await validateAdoptionReceipt(receipt, registry, nextRegistry);
  if (!nextValidation.valid || !receiptValidation.valid) throw new Error("ADOPTION_ARTIFACT_VALIDATION_FAILED");
  return { registry: Object.freeze(nextRegistry), receipt: Object.freeze(receipt) };
}
