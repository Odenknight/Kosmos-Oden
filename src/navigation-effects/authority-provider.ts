import type { EffectsAuthorityGrant } from "./types";

export interface EffectsAuthorityRequest {
  operation: EffectsAuthorityGrant["operation"];
  targetPath: string;
  evaluationTime: string;
}

export interface EffectsAuthorityProvider {
  readonly configured: boolean;
  resolve(request: EffectsAuthorityRequest): Promise<EffectsAuthorityGrant | null>;
}

export function validateAuthorityGrant(grant: EffectsAuthorityGrant | null, request: EffectsAuthorityRequest): grant is EffectsAuthorityGrant {
  if (!grant || grant.operation !== request.operation || grant.targetPath !== request.targetPath) return false;
  if (!grant.actor.actorId || !grant.actor.credentialId || !["human", "system"].includes(grant.actor.actorType)) return false;
  if (!/^sha256:[0-9a-f]{64}$/.test(grant.authorityDigest)) return false;
  if (grant.expiresAt != null) {
    const expiry = Date.parse(grant.expiresAt), evaluation = Date.parse(request.evaluationTime);
    if (!Number.isFinite(expiry) || !Number.isFinite(evaluation) || expiry <= evaluation) return false;
  }
  return true;
}

/** Connectivity and token possession intentionally never produce authority. */
export class UnconfiguredEffectsAuthorityProvider implements EffectsAuthorityProvider {
  readonly configured = false;
  async resolve(_request: EffectsAuthorityRequest): Promise<null> { return null; }
}
