import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

import {
  KOSMOS_NAVIGATION_EFFECTS_INTEGRATION,
  getKosmosNavigationEffectsEngineSnapshot,
  navigationEffectsRuntimeFactsFromEngine,
} from "../dist/kosmos-navigation-effects.mjs";
import { getNavigationCapabilities, NAVIGATION_CONTRACT_VERSION } from "gkos-engine/navigation";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const ENGINE_COMMIT = "41172b91970aac869c161f4842e3526a62fd1fd9";

test("adapter exposes the exact experimental contract standing", () => {
  assert.deepEqual(KOSMOS_NAVIGATION_EFFECTS_INTEGRATION, {
    suite: "ENGINE-NAV-EFFECTS-CONTRACT-1.0.0",
    contractVersion: "1.0.0",
    engineReleaseTarget: "2.2.0",
    standing: "integration-only",
    implementationPhase: "node-executor-experimental",
    gkosConformance: false,
  });
});

test("default Engine mapping exposes a planner but no configured or authorized write", () => {
  const snapshot = getKosmosNavigationEffectsEngineSnapshot();
  assert.deepEqual(snapshot.capabilities.configured, {
    adapter: false,
    authority_provider: false,
    durable_journal: false,
    policy: false,
  });
  assert.deepEqual(snapshot.capabilities.navigation_effects, {
    plan_moc_apply: true,
    apply_managed_moc: false,
    archive_previous_moc: false,
    atomic_replace: false,
    startup_recovery: false,
    rollback_execution: false,
    agent_note_create: false,
    agent_note_update: false,
    agent_note_archive: false,
    arbitrary_source_write: false,
    agent_note_delete: false,
  });
  assert.equal(snapshot.currentEffectAuthorized, false);
  assert.equal(snapshot.automaticMaintenanceEnabled, false);
  assert.equal(snapshot.automaticCreationEnabled, false);

  const facts = navigationEffectsRuntimeFactsFromEngine();
  assert.equal(facts.plannerAvailable, true);
  for (const [name, value] of Object.entries(facts)) {
    if (name !== "plannerAvailable") assert.equal(value, false, `${name} must default false`);
  }
});

test("default settings consume planner availability without enabling status writes", async () => {
  const bundled = await build({
    stdin: {
      contents: `
        export * from "./src/navigation-effects/engine-adapter.ts";
        export * from "./src/navigation-effects/settings.ts";
        export * from "./src/navigation-effects/status.ts";
      `,
      resolveDir: ROOT,
      sourcefile: "navigation-effects-status-adapter-test-entry.ts",
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    write: false,
    logLevel: "silent",
  });
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);
  const migration = api.migrateNavigationEffectsSettings(undefined);
  const status = api.buildNavigationEffectsStatus(migration, api.navigationEffectsRuntimeFactsFromEngine());
  assert.equal(status.planner.ready, true);
  assert.equal(status.hostAdapter.ready, false);
  assert.equal(status.authorityProvider.ready, false);
  assert.equal(status.automaticMaintenance.ready, false);
  assert.equal(status.automaticMaintenance.state, "disabled");
  assert.equal(status.automaticCreation.ready, false);
  assert.equal(status.automaticCreation.state, "disabled");
});

test("configured capability inputs are exact booleans and never invent current authority or safety", () => {
  const partial = getKosmosNavigationEffectsEngineSnapshot({
    hostAdapterConfigured: true,
    // Deliberately bypass TypeScript as a persisted/IPC boundary would.
    authorityProviderConfigured: "yes",
    durableJournalConfigured: 1,
    policyConfigured: true,
  });
  assert.deepEqual(partial.capabilities.configured, {
    adapter: true,
    authority_provider: false,
    durable_journal: false,
    policy: true,
  });
  assert.equal(partial.capabilities.navigation_effects.apply_managed_moc, false);
  assert.equal(partial.currentEffectAuthorized, false);

  const configured = getKosmosNavigationEffectsEngineSnapshot({
    hostAdapterConfigured: true,
    authorityProviderConfigured: true,
    durableJournalConfigured: true,
    policyConfigured: true,
  });
  assert.equal(configured.capabilities.navigation_effects.apply_managed_moc, true,
    "Engine reports configured effect capability, not a current operation grant");
  assert.equal(configured.currentEffectAuthorized, false);
  assert.equal(configured.automaticMaintenanceEnabled, false);
  assert.equal(configured.automaticCreationEnabled, false);

  const facts = navigationEffectsRuntimeFactsFromEngine({
    hostAdapterConfigured: true,
    authorityProviderConfigured: true,
    durableJournalConfigured: true,
    policyConfigured: true,
  });
  assert.equal(facts.hostAdapterConfigured, true);
  assert.equal(facts.authorityProviderConfigured, true);
  assert.equal(facts.durableJournalConfigured, true);
  assert.equal(facts.policyConfigured, true);
  assert.equal(facts.policyDigestValid, false);
  assert.equal(facts.vaultLeaseHeld, false);
  assert.equal(facts.startupRecoverySafe, false);
  assert.equal(facts.reconciliationSafe, false);
  assert.equal(facts.ownershipEligible, false);
  assert.equal(facts.creationAuthorized, false);
});

test("framework-neutral adapter browser graph contains no Node or filesystem executor", async () => {
  const result = await build({
    entryPoints: [join(ROOT, "src/navigation-effects/engine-adapter.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  const inputs = Object.keys(result.metafile.inputs).map((path) => path.replaceAll("\\", "/"));
  const output = result.outputFiles[0].text;
  assert.ok(inputs.some((path) => path.endsWith("node_modules/gkos-engine/dist/navigation-effects.mjs")));
  assert.equal(inputs.some((path) => /navigation-effects(?:-node|\/node)(?:\.|\/)/.test(path)), false);
  assert.equal(inputs.some((path) => /(?:^|\/)node:(?:fs|path|os|crypto|child_process)(?:$|\/)/.test(path)), false);
  assert.doesNotMatch(output, /navigation-effects\/node|navigation-effects-node|node:(?:fs|path|os|crypto|child_process)/);
});

test("Navigation 1.0 remains separately source-content read-only", () => {
  const capability = getNavigationCapabilities({ governanceStoreConfigured: true, validAuthorityPathActive: true });
  assert.equal(NAVIGATION_CONTRACT_VERSION, "1.0.0");
  assert.equal(capability.navigation.apply_moc, false);
  assert.equal(capability.navigation.source_content_write, false);
  assert.equal(capability.navigation.archive_delete, false);
  assert.equal(capability.navigation.reentry_write, false);
  assert.equal(capability.navigation.rollback_execution, false);
});

test("exact development pin includes the framework-neutral package export", async () => {
  const [rootPackage, lock, installedPackage, contractManifest] = await Promise.all([
    readFile(join(ROOT, "package.json"), "utf8").then(JSON.parse),
    readFile(join(ROOT, "package-lock.json"), "utf8").then(JSON.parse),
    readFile(join(ROOT, "node_modules/gkos-engine/package.json"), "utf8").then(JSON.parse),
    readFile(join(ROOT, "node_modules/gkos-engine/contracts/navigation-effects/ENGINE-NAV-EFFECTS-CONTRACT-1.0.0/manifest.json"), "utf8").then(JSON.parse),
  ]);
  assert.equal(rootPackage.dependencies["gkos-engine"], `github:Odenknight/GKOS-Engine#${ENGINE_COMMIT}`);
  assert.equal(lock.packages["node_modules/gkos-engine"].resolved,
    `git+ssh://git@github.com/Odenknight/GKOS-Engine.git#${ENGINE_COMMIT}`);
  assert.deepEqual(installedPackage.exports["./navigation-effects"], {
    types: "./dist/navigation-effects/index.d.ts",
    import: "./dist/navigation-effects.mjs",
    default: "./dist/navigation-effects.mjs",
  });
  assert.deepEqual({
    suite: contractManifest.suite,
    contractVersion: contractManifest.navigation_effects_contract,
    engineReleaseTarget: contractManifest.engine_release_target,
    standing: contractManifest.standing,
    implementationPhase: contractManifest.implementation_phase,
    gkosConformance: contractManifest.gkos_conformance,
  }, KOSMOS_NAVIGATION_EFFECTS_INTEGRATION);
});
