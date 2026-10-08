import {
  canonicalJson,
  validateAdoptionReceipt,
  validateAdoptionRegistry,
  type AdoptionRegistryGeneration,
  type MocAdoptionReceipt,
} from "./adoption-registry";

/** Test/reference store for atomic generation checks. It has no source-note API. */
export class InMemoryAdoptionStore {
  private readonly receipts = new Map<string, MocAdoptionReceipt>();
  private readonly operations = new Map<string, string>();

  constructor(private current: AdoptionRegistryGeneration) {
    this.current = structuredClone(current);
  }

  load(): AdoptionRegistryGeneration {
    return structuredClone(this.current);
  }

  receipt(receiptId: string): MocAdoptionReceipt | undefined {
    const receipt = this.receipts.get(receiptId);
    return receipt ? structuredClone(receipt) : undefined;
  }

  async commit(expectedDigest: string, next: AdoptionRegistryGeneration, receipt: MocAdoptionReceipt): Promise<void> {
    const currentAtStart = structuredClone(this.current);
    const operationReceipt = this.operations.get(receipt.operationId);
    if (operationReceipt && operationReceipt !== receipt.receiptDigest) throw new Error("ADOPTION_OPERATION_MISMATCH");
    const existing = this.receipts.get(receipt.receiptId);
    if (existing) {
      if (existing.receiptDigest !== receipt.receiptDigest || canonicalJson(existing) !== canonicalJson(receipt)) throw new Error("ADOPTION_RECEIPT_MISMATCH");
      const nextValidation = await validateAdoptionRegistry(next);
      const receiptValidation = await validateAdoptionReceipt(receipt, undefined, next);
      if (!nextValidation.valid || !receiptValidation.valid) throw new Error("ADOPTION_REPLAY_INVALID");
      return;
    }
    if (currentAtStart.registryDigest !== expectedDigest) throw new Error("REGISTRY_GENERATION_STALE");

    const [currentValidation, nextValidation, receiptValidation] = await Promise.all([
      validateAdoptionRegistry(currentAtStart),
      validateAdoptionRegistry(next),
      validateAdoptionReceipt(receipt, currentAtStart, next),
    ]);
    if (!currentValidation.valid) throw new Error("ADOPTION_CURRENT_REGISTRY_INVALID");
    if (!nextValidation.valid) throw new Error("ADOPTION_NEXT_REGISTRY_INVALID");
    if (!receiptValidation.valid) throw new Error("ADOPTION_RECEIPT_BINDING_INVALID");

    const priorOtherBindings = currentAtStart.bindings.filter((item) => item.targetPath !== receipt.targetPath);
    const nextOtherBindings = next.bindings.filter((item) => item.targetPath !== receipt.targetPath);
    if (canonicalJson(priorOtherBindings) !== canonicalJson(nextOtherBindings)
      || next.bindings.length !== priorOtherBindings.length + 1) throw new Error("ADOPTION_REGISTRY_SCOPE_INVALID");

    // Recheck after asynchronous digest validation so concurrent generations
    // cannot both pass against the same predecessor.
    if (this.current.registryDigest !== expectedDigest) throw new Error("REGISTRY_GENERATION_STALE");
    if (this.operations.has(receipt.operationId) || this.receipts.has(receipt.receiptId)) throw new Error("ADOPTION_COMMIT_RACE");
    this.current = structuredClone(next);
    this.receipts.set(receipt.receiptId, structuredClone(receipt));
    this.operations.set(receipt.operationId, receipt.receiptDigest);
  }
}
