import { normalizeWatcherPath } from "./event-debouncer";

export interface CompletedEffectReceiptRef {
  effectId: string;
  targetPath: string;
  committedDigest: string;
  indexGeneration: number;
  completed: true;
}

export interface SelfWriteDeliveryRef {
  effectId?: string;
  targetPath: string;
  observedDigest: string;
  indexGeneration: number;
}

function validDigest(value: string): boolean {
  return /^sha256:[0-9a-f]{64}$/.test(value);
}

function normalizedReceipt(receipt: CompletedEffectReceiptRef): CompletedEffectReceiptRef {
  const targetPath = normalizeWatcherPath(receipt.targetPath);
  if (!targetPath || !receipt.effectId || !validDigest(receipt.committedDigest)
    || !Number.isSafeInteger(receipt.indexGeneration) || receipt.indexGeneration < 0
    || receipt.completed !== true) throw new Error("invalid completed effect receipt reference");
  return { ...receipt, targetPath };
}

/**
 * A delivery is suppressible only when all durable receipt bindings match.
 * There is deliberately no timestamp or grace-period input.
 */
export function isVerifiedSelfWrite(
  delivery: SelfWriteDeliveryRef,
  receipt: CompletedEffectReceiptRef,
): boolean {
  const path = normalizeWatcherPath(delivery.targetPath);
  if (!path || !delivery.effectId || !validDigest(delivery.observedDigest)) return false;
  let trusted: CompletedEffectReceiptRef;
  try { trusted = normalizedReceipt(receipt); } catch { return false; }
  return delivery.effectId === trusted.effectId
    && path === trusted.targetPath
    && delivery.observedDigest === trusted.committedDigest
    && delivery.indexGeneration === trusted.indexGeneration;
}

/** Bounded in-memory lookup over already completed durable receipts. */
export class CompletedSelfWriteLedger {
  private readonly receipts = new Map<string, CompletedEffectReceiptRef>();

  constructor(private readonly capacity = 2_048) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("capacity must be a positive integer");
  }

  record(receipt: CompletedEffectReceiptRef): void {
    const normalized = normalizedReceipt(receipt);
    const existing = this.receipts.get(normalized.effectId);
    if (existing && (existing.targetPath !== normalized.targetPath
      || existing.committedDigest !== normalized.committedDigest
      || existing.indexGeneration !== normalized.indexGeneration)) {
      throw new Error("completed effect receipt binding changed");
    }
    if (existing) this.receipts.delete(normalized.effectId);
    this.receipts.set(normalized.effectId, normalized);
    while (this.receipts.size > this.capacity) this.receipts.delete(this.receipts.keys().next().value as string);
  }

  shouldSuppress(delivery: SelfWriteDeliveryRef): boolean {
    if (!delivery.effectId) return false;
    const receipt = this.receipts.get(delivery.effectId);
    return !!receipt && isVerifiedSelfWrite(delivery, receipt);
  }
}
