/**
 * Kosmos-Oden's bounded consumer adapter for GKOS-Engine Navigation 1.0.
 *
 * The adapter is source-content read-only. It discovers possible MOC centers
 * for rendering, reports Engine findings, and advertises unsupported effects
 * as false. Kosmos-Oden does not configure a Governance Store or promote MOC
 * names in v0.8.0.
 */
import {
  CANONICAL_MOC_NAMES,
  NAVIGATION_CONTRACT_VERSION,
  discoverNavigation,
  getNavigationCapabilities,
  type NavigationFinding,
  type NavigationSource,
  type VaultNavigationConfig,
} from "gkos-engine/navigation";
import { ENGINE_VERSION } from "gkos-engine";

export const KOSMOS_NAVIGATION_DEFAULT_ENABLED = false;

/** Pre-digested, immutable built-in-only rendering policy. It is not a
 * persisted vault configuration and cannot authorize a governed change. */
export const KOSMOS_NAVIGATION_VIEWER_CONFIG: VaultNavigationConfig = Object.freeze({
  configId: "0198b2a2-0000-7000-8000-000000000210",
  version: 1,
  vaultId: "kosmos-oden:viewer-policy",
  promotedMocNames: [],
  createdAt: "2026-08-16T00:00:00Z",
  createdBy: "kosmos-oden/0.8.0",
  policy: Object.freeze({ id: "kosmos-oden.navigation", version: "1.0.0" }),
  digest: "sha256:0ae7e5a17f863f45605b288606d54083408768d1931962573ca8d0cb8608009e",
});

const LEGACY_MOC_NAMES = Object.freeze([
  "index", "home", "readme", "_index", "moc", "map",
  "overview", "dashboard", "start", "contents", "toc",
]);

export interface KosmosNavigationProjection {
  enabled: boolean;
  recognizedPaths: ReadonlySet<string>;
  orderedMocNames: readonly string[];
  findings: readonly NavigationFinding[];
}

export function projectKosmosNavigation(paths: readonly string[], enabled: boolean): KosmosNavigationProjection {
  if (!enabled) {
    return Object.freeze({
      enabled: false,
      recognizedPaths: new Set<string>(),
      orderedMocNames: LEGACY_MOC_NAMES,
      findings: Object.freeze([]),
    });
  }
  const sources: NavigationSource[] = paths.map((relativePath) => ({ relativePath, content: "" }));
  const discovery = discoverNavigation({
    vaultId: KOSMOS_NAVIGATION_VIEWER_CONFIG.vaultId,
    sources,
  }, KOSMOS_NAVIGATION_VIEWER_CONFIG);
  return Object.freeze({
    enabled: true,
    recognizedPaths: new Set(discovery.entries.filter((entry) => entry.recognizedMocName).map((entry) => entry.path)),
    orderedMocNames: CANONICAL_MOC_NAMES,
    findings: discovery.findings,
  });
}

export function getKosmosNavigationManifest(enabled: boolean) {
  return Object.freeze({
    enabled,
    engine_version: ENGINE_VERSION,
    navigation_contract: NAVIGATION_CONTRACT_VERSION,
    governance_store_configured: false,
    engine_contract_suite: Object.freeze({
      suite: "ENGINE-NAV-CONTRACT-1.0.0",
      standing: "integration-only",
      consumer_result: "covered-by-kosmos-tests",
    }),
    gkos_conformance: Object.freeze({ claimed: false, status: "not-evaluated-by-engine-contract" }),
    capabilities: getNavigationCapabilities({ governanceStoreConfigured: false, validAuthorityPathActive: false }).navigation,
  });
}
