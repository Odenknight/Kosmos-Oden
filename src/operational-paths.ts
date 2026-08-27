/**
 * Kosmos-owned operational namespaces that must never become corpus content.
 *
 * This predicate is an exclusion boundary, not a general path-safety or
 * containment validator. Callers still apply their own path validation before
 * performing any filesystem operation.
 */
export const KOSMOS_OPERATIONAL_ROOTS = Object.freeze([
  ".gkx",
  "_archive/moc-runs",
] as const);

function normalizedOperationalCandidate(path: unknown): string {
  if (typeof path !== "string") return "";
  return path
    .normalize("NFC")
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/** True only for an exact operational root or one of its descendants. */
export function isKosmosOperationalPath(path: unknown): boolean {
  const normalized = normalizedOperationalCandidate(path);
  return KOSMOS_OPERATIONAL_ROOTS.some((root) =>
    normalized === root || normalized.startsWith(`${root}/`),
  );
}
