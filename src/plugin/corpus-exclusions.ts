/** Operational sidecars and exact effect archives are never corpus content. */
export function isKosmosOperationalPath(path: string): boolean {
  const normalized = String(path || "").normalize("NFC").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  return normalized === ".gkx" || normalized.startsWith(".gkx/")
    || normalized === "_archive/moc-runs" || normalized.startsWith("_archive/moc-runs/");
}

export function filterKosmosCorpusFiles<T extends { path: string }>(files: readonly T[]): T[] {
  return files.filter((file) => !isKosmosOperationalPath(file.path));
}
