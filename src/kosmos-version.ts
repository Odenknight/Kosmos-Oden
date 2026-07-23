/**
 * Kosmos-Oden's own product-version identity — distinct from the `gkos-engine`
 * dependency's own version (that package has its own release lifecycle).
 * scripts/check-versions.mjs asserts that package.json, manifest.json and
 * versions.json stay in sync with this constant (CI fails otherwise).
 */
export const KOSMOS_VERSION = "0.6.7";
export const KOSMOS_NAME = "kosmos-oden";
