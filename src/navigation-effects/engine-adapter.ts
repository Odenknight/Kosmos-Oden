/**
 * Framework-neutral Kosmos boundary for the experimental Engine effects
 * contract. Host executors deliberately live outside this import graph.
 *
 * This adapter reports package capability and sanitized configuration facts.
 * It does not resolve per-effect authority, inspect policy bytes, hold a lease,
 * perform recovery, or enable an automatic write mode.
 */
import {
  NAVIGATION_EFFECTS_CONTRACT_VERSION,
  getNavigationEffectsCapabilities,
  type NavigationEffectsCapabilities,
} from "gkos-engine/navigation-effects";

import type { NavigationEffectsRuntimeFacts } from "./types";

export const KOSMOS_NAVIGATION_EFFECTS_INTEGRATION = Object.freeze({
  suite: "ENGINE-NAV-EFFECTS-CONTRACT-1.0.0",
  contractVersion: NAVIGATION_EFFECTS_CONTRACT_VERSION,
  engineReleaseTarget: "2.2.0",
  standing: "integration-only",
  implementationPhase: "node-executor-experimental",
  gkosConformance: false,
} as const);

export interface NavigationEffectsConfiguredInputs {
  hostAdapterConfigured?: boolean;
  authorityProviderConfigured?: boolean;
  durableJournalConfigured?: boolean;
  policyConfigured?: boolean;
}

export interface KosmosNavigationEffectsEngineSnapshot {
  integration: typeof KOSMOS_NAVIGATION_EFFECTS_INTEGRATION;
  capabilities: NavigationEffectsCapabilities;
  /** Configuration is not current authority for an operation. */
  currentEffectAuthorized: false;
  automaticMaintenanceEnabled: false;
  automaticCreationEnabled: false;
}

function configured(value: unknown): boolean {
  return value === true;
}

/**
 * Ask Engine for its truthful configured capability projection. Import
 * reachability alone supplies only the deterministic planner; every configured
 * effect capability stays false until its exact configuration input is true.
 */
export function getKosmosNavigationEffectsEngineSnapshot(
  inputs: NavigationEffectsConfiguredInputs = {},
): KosmosNavigationEffectsEngineSnapshot {
  const capabilities = getNavigationEffectsCapabilities({
    adapterConfigured: configured(inputs.hostAdapterConfigured),
    authorityProviderConfigured: configured(inputs.authorityProviderConfigured),
    durableJournalConfigured: configured(inputs.durableJournalConfigured),
    policyConfigured: configured(inputs.policyConfigured),
  });
  return Object.freeze({
    integration: KOSMOS_NAVIGATION_EFFECTS_INTEGRATION,
    capabilities,
    currentEffectAuthorized: false,
    automaticMaintenanceEnabled: false,
    automaticCreationEnabled: false,
  });
}

/**
 * Map only facts proven by the Engine capability response. Safety, policy
 * digest, ownership, lease, recovery, reconciliation, creation authority, and
 * Navigation 1.0 availability remain false until their owning packets supply
 * independent evidence.
 */
export function navigationEffectsRuntimeFactsFromEngine(
  inputs: NavigationEffectsConfiguredInputs = {},
): NavigationEffectsRuntimeFacts {
  const engine = getKosmosNavigationEffectsEngineSnapshot(inputs).capabilities;
  return {
    navigation1Available: false,
    plannerAvailable: engine.navigation_effects.plan_moc_apply,
    hostAdapterConfigured: engine.configured.adapter,
    authorityProviderConfigured: engine.configured.authority_provider,
    durableJournalConfigured: engine.configured.durable_journal,
    policyConfigured: engine.configured.policy,
    policyDigestValid: false,
    vaultLeaseHeld: false,
    startupRecoverySafe: false,
    reconciliationSafe: false,
    ownershipEligible: false,
    creationAuthorized: false,
  };
}
