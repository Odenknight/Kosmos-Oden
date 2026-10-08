import type { AdoptionRegistryGeneration, MocAdoptionReceipt } from "./adoption-registry";

/** Test/reference store for atomic generation checks. It has no source-note API. */
export class InMemoryAdoptionStore {
  readonly receipts = new Map<string, MocAdoptionReceipt>();
  private readonly operations = new Map<string, string>();
  constructor(private current: AdoptionRegistryGeneration) {}
  load(): AdoptionRegistryGeneration { return structuredClone(this.current); }
  commit(expectedDigest: string, next: AdoptionRegistryGeneration, receipt: MocAdoptionReceipt): void {
    const operationReceipt = this.operations.get(receipt.operationId);
    if (operationReceipt && operationReceipt !== receipt.receiptDigest) throw new Error("ADOPTION_OPERATION_MISMATCH");
    const existing = this.receipts.get(receipt.receiptId);
    if (existing) {
      if (existing.receiptDigest !== receipt.receiptDigest) throw new Error("ADOPTION_RECEIPT_MISMATCH");
      return;
    }
    if (this.current.registryDigest !== expectedDigest) throw new Error("REGISTRY_GENERATION_STALE");
    if (receipt.priorRegistryDigest !== expectedDigest || receipt.newRegistryDigest !== next.registryDigest || receipt.newRegistryGeneration !== next.generation) throw new Error("ADOPTION_RECEIPT_BINDING_INVALID");
    this.current = structuredClone(next);
    this.receipts.set(receipt.receiptId, structuredClone(receipt));
    this.operations.set(receipt.operationId, receipt.receiptDigest);
  }
}
