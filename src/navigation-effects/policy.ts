import type { EffectsPolicyRef } from "./types";
import { validatePolicyRef } from "./settings";

export interface EffectsPolicyDocument {
  id: string;
  version: string;
  digest: string;
  allows: readonly string[];
}

export function policyMatchesReference(policy: EffectsPolicyDocument | null | undefined, reference: EffectsPolicyRef): boolean {
  return !!policy && validatePolicyRef(reference)
    && policy.id === reference.id
    && policy.version === reference.version
    && policy.digest === reference.digest
    && /^sha256:[0-9a-f]{64}$/.test(policy.digest)
    && Array.isArray(policy.allows);
}
