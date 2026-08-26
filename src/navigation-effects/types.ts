export interface EffectsPolicyRef {
  id: string;
  version: string;
  digest: string;
}

export interface MocWriteSettings {
  schemaVersion: 1;
  enabled: boolean;
  automaticMaintenanceEnabled: boolean;
  automaticCreationEnabled: boolean;
  debounceMs: number;
  maximumDebounceMs: number;
  periodicReconciliationEnabled: boolean;
  periodicReconciliationMinutes: number;
  archiveRoot: "_archive/moc-runs";
  stateRoot: ".gkx/effects";
  policyRef: EffectsPolicyRef;
}

export interface EffectsActorRef {
  actorId: string;
  actorType: "human" | "system";
  credentialId: string;
}

export interface EffectsAuthorityGrant {
  actor: EffectsActorRef;
  operation: "adopt-managed-moc" | "maintain-managed-moc" | "create-managed-moc" | "rollback-managed-moc";
  targetPath: string;
  authorityDigest: string;
  expiresAt?: string;
}

export interface NavigationEffectsStatusInput {
  navigationAvailable: boolean;
  plannerAvailable: boolean;
  hostAdapterConfigured: boolean;
  authorityProviderConfigured: boolean;
  durableJournalConfigured: boolean;
  policyConfigured: boolean;
  policyDigestValid: boolean;
  vaultLeaseHeld: boolean;
  startupRecoverySafe: boolean;
  reconciliationSafe: boolean;
  ownershipBindingValid: boolean;
  settings: MocWriteSettings;
}

export interface NavigationEffectsStatus extends NavigationEffectsStatusInput {
  applyManagedMocAdvertised: boolean;
  automaticMaintenanceAvailable: boolean;
  automaticCreationAvailable: boolean;
  blockingReasons: string[];
}
