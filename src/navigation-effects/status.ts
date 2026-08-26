import type { NavigationEffectsStatus, NavigationEffectsStatusInput } from "./types";

export function deriveNavigationEffectsStatus(input: NavigationEffectsStatusInput): NavigationEffectsStatus {
  const applyManagedMocAdvertised = input.plannerAvailable
    && input.hostAdapterConfigured
    && input.authorityProviderConfigured
    && input.durableJournalConfigured
    && input.policyConfigured
    && input.policyDigestValid;
  const runtimeSafe = applyManagedMocAdvertised
    && input.vaultLeaseHeld
    && input.startupRecoverySafe
    && input.reconciliationSafe
    && input.ownershipBindingValid;
  const automaticMaintenanceAvailable = runtimeSafe
    && input.settings.enabled
    && input.settings.automaticMaintenanceEnabled;
  const automaticCreationAvailable = runtimeSafe
    && input.settings.enabled
    && input.settings.automaticCreationEnabled;
  const blockingReasons: string[] = [];
  const gates: Array<[boolean, string]> = [
    [input.plannerAvailable, "Navigation Effects planner is unavailable."],
    [input.hostAdapterConfigured, "Host adapter is not configured."],
    [input.authorityProviderConfigured, "Authority provider is not configured."],
    [input.durableJournalConfigured, "Durable journal is not configured."],
    [input.policyConfigured, "Policy is not configured."],
    [input.policyDigestValid, "Policy digest is invalid or stale."],
    [input.vaultLeaseHeld, "Vault write lease is not held."],
    [input.startupRecoverySafe, "Startup recovery is not safe."],
    [input.reconciliationSafe, "Reconciliation is not safe."],
    [input.ownershipBindingValid, "No valid ownership binding exists."],
    [input.settings.enabled, "Navigation Effects is disabled."],
  ];
  for (const [pass, reason] of gates) if (!pass) blockingReasons.push(reason);
  return { ...input, applyManagedMocAdvertised, automaticMaintenanceAvailable, automaticCreationAvailable, blockingReasons };
}
