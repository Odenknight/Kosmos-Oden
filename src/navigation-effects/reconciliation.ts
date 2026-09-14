import { normalizeWatcherPath } from "./event-debouncer";

export type ReconciliationReason = "startup" | "recovery" | "resume" | "overflow" | "bulk-sync" | "manual" | "periodic";
export type ReconciliationClassification = "safe" | "incremental" | "full" | "block";

export interface PersistedReconciliationIntent {
  schemaVersion: 1;
  revision: number;
  reasons: ReconciliationReason[];
  affectedScopes: string[];
  fullRequired: boolean;
}

export interface ReconciliationSnapshot {
  corpusDigest: string;
  configurationDigest: string;
  policyDigest: string;
  ownershipDigest: string;
  checkpointDigest: string;
  journalDigest: string;
  targetDigests: Record<string, string>;
}

export interface ReconciliationEvaluation {
  expected: ReconciliationSnapshot;
  current: ReconciliationSnapshot;
  intent: PersistedReconciliationIntent;
  dependencySetComplete: boolean;
  journalValid: boolean;
  checkpointValid: boolean;
  unresolvedRecovery: boolean;
}

export interface ReconciliationDecision {
  classification: ReconciliationClassification;
  scopes: string[];
  mismatches: string[];
  blockingReasons: string[];
}

const REASON_ORDER: ReconciliationReason[] = ["startup", "recovery", "resume", "overflow", "bulk-sync", "manual", "periodic"];

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const normalizeScope = normalizeWatcherPath;

function validIntent(value: unknown): value is PersistedReconciliationIntent {
  return isRecord(value)
    && value.schemaVersion === 1
    && Number.isSafeInteger(value.revision) && Number(value.revision) >= 0
    && Number(value.revision) < Number.MAX_SAFE_INTEGER
    && typeof value.fullRequired === "boolean"
    && Array.isArray(value.reasons)
    && value.reasons.every(reason => REASON_ORDER.includes(reason))
    && new Set(value.reasons).size === value.reasons.length
    && Array.isArray(value.affectedScopes)
    && value.affectedScopes.every(scope => normalizeScope(scope) === scope)
    && new Set(value.affectedScopes).size === value.affectedScopes.length;
}

export function createReconciliationIntent(
  reason: ReconciliationReason,
  affectedScopes: readonly string[] = [],
  fullRequired = reason === "overflow",
): PersistedReconciliationIntent {
  return mergeReconciliationIntent({ schemaVersion: 1, revision: 0, reasons: [], affectedScopes: [], fullRequired: false }, reason, affectedScopes, fullRequired);
}

/** Returns a new serializable value; persistence belongs to the host. */
export function mergeReconciliationIntent(
  current: PersistedReconciliationIntent,
  reason: ReconciliationReason,
  affectedScopes: readonly string[] = [],
  fullRequired = reason === "overflow",
): PersistedReconciliationIntent {
  if (!validIntent(current) || !REASON_ORDER.includes(reason) || typeof fullRequired !== "boolean") throw new Error("invalid reconciliation intent");
  const scopes = new Set(current.affectedScopes);
  for (const raw of affectedScopes) {
    const scope = normalizeScope(raw);
    if (!scope) throw new Error("invalid reconciliation scope");
    scopes.add(scope);
  }
  const reasons = new Set(current.reasons);
  reasons.add(reason);
  return {
    schemaVersion: 1,
    revision: current.revision + 1,
    reasons: REASON_ORDER.filter((candidate) => reasons.has(candidate)),
    affectedScopes: [...scopes].sort(compareCodeUnits),
    fullRequired: current.fullRequired || fullRequired,
  };
}

export function clearReconciliationIntent(current: PersistedReconciliationIntent): PersistedReconciliationIntent {
  if (!validIntent(current)) throw new Error("invalid reconciliation intent");
  return { schemaVersion: 1, revision: current.revision + 1, reasons: [], affectedScopes: [], fullRequired: false };
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateSnapshot(snapshot: unknown, label: string): string[] {
  const failures: string[] = [];
  if (!isRecord(snapshot)) return [`${label} snapshot is invalid`];
  for (const field of ["corpusDigest", "configurationDigest", "policyDigest", "ownershipDigest", "checkpointDigest", "journalDigest"] as const) {
    if (!validDigest(snapshot[field])) failures.push(`${label}.${field} is invalid`);
  }
  if (!snapshot.targetDigests || typeof snapshot.targetDigests !== "object" || Array.isArray(snapshot.targetDigests)) failures.push(`${label}.targetDigests is invalid`);
  else for (const [path, digest] of Object.entries(snapshot.targetDigests)) {
    if (!normalizeScope(path) || !validDigest(digest)) failures.push(`${label}.targetDigests contains an invalid binding`);
  }
  return failures;
}

function compareSnapshots(expected: ReconciliationSnapshot, current: ReconciliationSnapshot): string[] {
  const mismatches: string[] = [];
  for (const field of ["corpusDigest", "configurationDigest", "policyDigest", "ownershipDigest", "checkpointDigest", "journalDigest"] as const) {
    if (expected[field] !== current[field]) mismatches.push(field);
  }
  const paths = new Set([...Object.keys(expected.targetDigests), ...Object.keys(current.targetDigests)]);
  for (const path of [...paths].sort(compareCodeUnits)) {
    if (expected.targetDigests[path] !== current.targetDigests[path]) mismatches.push(`target:${path}`);
  }
  return mismatches;
}

export function evaluateReconciliation(input: ReconciliationEvaluation): ReconciliationDecision {
  if (!isRecord(input)) {
    return { classification: "block", scopes: [], mismatches: [], blockingReasons: ["reconciliation evaluation is invalid or corrupt"] };
  }
  const blockingReasons = [
    ...validateSnapshot(input.expected, "expected"),
    ...validateSnapshot(input.current, "current"),
  ];
  if (!validIntent(input.intent)) {
    blockingReasons.push("persisted reconciliation intent is invalid or corrupt");
  }
  if (input.journalValid !== true) blockingReasons.push("journal state is invalid or corrupt");
  if (input.checkpointValid !== true) blockingReasons.push("checkpoint state is invalid or corrupt");
  if (input.unresolvedRecovery !== false) blockingReasons.push("startup recovery is unresolved");
  if (blockingReasons.length) return { classification: "block", scopes: [], mismatches: [], blockingReasons };

  const expected = input.expected as ReconciliationSnapshot;
  const current = input.current as ReconciliationSnapshot;
  const intent = input.intent as unknown as PersistedReconciliationIntent;
  const mismatches = compareSnapshots(expected, current);
  const scopes = [...new Set(intent.affectedScopes)].sort(compareCodeUnits);
  if (mismatches.length === 0 && intent.reasons.length === 0
    && scopes.length === 0 && !intent.fullRequired && input.dependencySetComplete === true) return { classification: "safe", scopes: [], mismatches, blockingReasons: [] };

  const structuralMismatch = mismatches.some((field) => ["configurationDigest", "policyDigest", "ownershipDigest", "checkpointDigest", "journalDigest"].includes(field));
  if (intent.fullRequired || input.dependencySetComplete !== true || structuralMismatch || scopes.length === 0) {
    return { classification: "full", scopes: [], mismatches, blockingReasons: [] };
  }
  return { classification: "incremental", scopes, mismatches, blockingReasons: [] };
}
