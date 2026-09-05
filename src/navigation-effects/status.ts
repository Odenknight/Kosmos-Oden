import type {
  NavigationEffectsRuntimeFacts,
  NavigationEffectsSettingsMigration,
  NavigationEffectsStatus,
  NavigationEffectsStatusItem,
  NavigationEffectsStatusState,
} from "./types";
import { isNavigationEffectsPolicyRefConfigured } from "./settings";

export const DEFAULT_NAVIGATION_EFFECTS_RUNTIME_FACTS: Readonly<NavigationEffectsRuntimeFacts> = Object.freeze({
  navigation1Available: false,
  plannerAvailable: false,
  hostAdapterConfigured: false,
  authorityProviderConfigured: false,
  durableJournalConfigured: false,
  policyConfigured: false,
  policyDigestValid: false,
  vaultLeaseHeld: false,
  startupRecoverySafe: false,
  reconciliationSafe: false,
  ownershipEligible: false,
  creationAuthorized: false,
});

function item(ready: boolean, yes: NavigationEffectsStatusState, no: NavigationEffectsStatusState, reasonCode: string): NavigationEffectsStatusItem {
  return { ready, state: ready ? yes : no, reasonCode };
}

/**
 * Construct independent, truthful status lines from sanitized settings and
 * host-supplied runtime facts. This function does not claim current per-effect
 * authority and must not be used as an effect executor.
 */
export function buildNavigationEffectsStatus(
  migration: NavigationEffectsSettingsMigration,
  facts: Partial<NavigationEffectsRuntimeFacts> = {},
): NavigationEffectsStatus {
  const runtime: NavigationEffectsRuntimeFacts = {
    navigation1Available: facts.navigation1Available === true,
    plannerAvailable: facts.plannerAvailable === true,
    hostAdapterConfigured: facts.hostAdapterConfigured === true,
    authorityProviderConfigured: facts.authorityProviderConfigured === true,
    durableJournalConfigured: facts.durableJournalConfigured === true,
    policyConfigured: facts.policyConfigured === true,
    policyDigestValid: facts.policyDigestValid === true,
    vaultLeaseHeld: facts.vaultLeaseHeld === true,
    startupRecoverySafe: facts.startupRecoverySafe === true,
    reconciliationSafe: facts.reconciliationSafe === true,
    ownershipEligible: facts.ownershipEligible === true,
    creationAuthorized: facts.creationAuthorized === true,
  };
  const policyReady = isNavigationEffectsPolicyRefConfigured(migration.settings.policyRef)
    && runtime.policyConfigured
    && runtime.policyDigestValid;
  const commonAutomaticGates =
    !migration.repairRequired
    && migration.settings.enabled
    && runtime.plannerAvailable
    && runtime.hostAdapterConfigured
    && runtime.authorityProviderConfigured
    && runtime.durableJournalConfigured
    && policyReady
    && runtime.vaultLeaseHeld
    && runtime.startupRecoverySafe
    && runtime.reconciliationSafe
    && runtime.ownershipEligible;
  const maintenanceReady = commonAutomaticGates && migration.settings.automaticMaintenanceEnabled;
  const creationReady = maintenanceReady
    && migration.settings.automaticCreationEnabled
    && runtime.creationAuthorized;

  return {
    standing: "draft-integration-only",
    settingsRepairRequired: migration.repairRequired,
    navigation1: item(runtime.navigation1Available, "available", "unavailable", runtime.navigation1Available ? "navigation-1-available" : "navigation-1-unavailable"),
    planner: item(runtime.plannerAvailable, "available", "unavailable", runtime.plannerAvailable ? "planner-available" : "planner-unavailable"),
    hostAdapter: item(runtime.hostAdapterConfigured, "configured", "unconfigured", runtime.hostAdapterConfigured ? "adapter-configured" : "adapter-unconfigured"),
    authorityProvider: item(runtime.authorityProviderConfigured, "configured", "unconfigured", runtime.authorityProviderConfigured ? "authority-provider-configured" : "authority-provider-unconfigured"),
    journal: item(runtime.durableJournalConfigured, "configured", "unconfigured", runtime.durableJournalConfigured ? "journal-configured" : "journal-unconfigured"),
    policyDigest: item(policyReady, "valid", "invalid", policyReady ? "policy-digest-valid" : "policy-unconfigured-or-invalid"),
    lease: item(runtime.vaultLeaseHeld, "held", "not-held", runtime.vaultLeaseHeld ? "vault-lease-held" : "vault-lease-not-held"),
    recovery: item(runtime.startupRecoverySafe, "safe", "unsafe", runtime.startupRecoverySafe ? "startup-recovery-safe" : "startup-recovery-unsafe"),
    reconciliation: item(runtime.reconciliationSafe, "safe", "unsafe", runtime.reconciliationSafe ? "reconciliation-safe" : "reconciliation-unsafe"),
    ownership: item(runtime.ownershipEligible, "eligible", "ineligible", runtime.ownershipEligible ? "ownership-eligible" : "ownership-ineligible"),
    automaticMaintenance: item(
      maintenanceReady,
      "enabled",
      migration.settings.automaticMaintenanceEnabled ? "blocked" : "disabled",
      maintenanceReady ? "automatic-maintenance-enabled" : migration.settings.automaticMaintenanceEnabled ? "automatic-maintenance-gates-blocked" : "automatic-maintenance-disabled",
    ),
    automaticCreation: item(
      creationReady,
      "enabled",
      migration.settings.automaticCreationEnabled ? "blocked" : "disabled",
      creationReady ? "automatic-creation-enabled" : migration.settings.automaticCreationEnabled ? "automatic-creation-gates-blocked" : "automatic-creation-disabled",
    ),
  };
}
