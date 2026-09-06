import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildVaultNavigationConfig } from "gkos-engine/navigation";
import { startKosmosManagedMocs } from "../kosmos-moc.mjs";

test("managed host rejects implicit enablement and missing live authority", async () => {
  await assert.rejects(startKosmosManagedMocs({}), /explicit enablement/);
  await assert.rejects(startKosmosManagedMocs({ enabled: true, vaultRoot: "/unused", pathThreatModel: "cooperative-vault", snapshot: async () => ({}) }), /live precondition/);
});

test("real managed host creates, reconciles and restarts a synthetic registered MOC", async () => {
  const vaultRoot = await mkdtemp(join(tmpdir(), "kosmos-moc-test-"));
  await mkdir(join(vaultRoot, "topics"));
  const source = join(vaultRoot, "topics/example.md"); await writeFile(source, "# Example\n\n#demo\n");
  const policyRef = { id: "synthetic-policy", version: "1", digest: `sha256:${"b".repeat(64)}` };
  const config = await buildVaultNavigationConfig({ configId: "01990ac0-0000-7000-8000-000000000001", version: 1, vaultId: "synthetic-kosmos", promotedMocNames: [], createdAt: "2026-09-06T12:00:00Z", createdBy: "test-owner", policy: policyRef });
  let validations = 0;
  const options = {
    enabled: true, vaultRoot, pathThreatModel: "cooperative-vault",
    snapshot: async () => ({ snapshot: { vaultId: "synthetic-kosmos", sources: [{ relativePath: "topics/example.md", title: "Example", content: await readFile(source, "utf8"), sensitivity: "public" }] }, config, policyRef, allowedSensitivities: ["public"], targets: [{ path: "topics/index.md", ownership: { targetPath: "topics/index.md", ownership: "fully-managed", creationAuthorized: true }, authority: { actor: { actorId: "test-owner", actorType: "human" }, grantId: "test-only", allowedRoot: "topics", capability: "moc:apply", sensitivityCeiling: "public", policyRef } }] }),
    // Synthetic fixture only: production modules must consult live grants,
    // retention, policy, configuration and source freshness here.
    validatePreconditions: plan => { validations++; return plan.vaultId === "synthetic-kosmos" && plan.targetPath === "topics/index.md" && plan.policyRef.digest === policyRef.digest ? [] : ["TEST_SCOPE_DENIED"]; },
  };
  let runtime;
  try {
    runtime = await startKosmosManagedMocs(options);
    const before = await readFile(join(vaultRoot, "topics/index.md"), "utf8"); assert.match(before, /Example/); assert.ok(validations > 0);
    await runtime.reconcileNow(); assert.equal(await readFile(join(vaultRoot, "topics/index.md"), "utf8"), before);
    assert.equal((await runtime.shutdown()).clean, true); runtime = null;
    runtime = await startKosmosManagedMocs(options);
    assert.equal(await readFile(join(vaultRoot, "topics/index.md"), "utf8"), before);
    assert.equal(await readFile(source, "utf8"), "# Example\n\n#demo\n");
  } finally { if (runtime) assert.equal((await runtime.shutdown()).clean, true); }
  // Retain synthetic journal/archive state for diagnosis; no real vault used.
});
