import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: ["src/navigation-effects/authority-provider.ts"],
  absWorkingDir: process.cwd(),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
});
const { resolveNavigationEffectsAuthority } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`
);

const digest = (character) => `sha256:${character.repeat(64)}`;
const human = { actorId: "human:owner", actorType: "human", credentialId: "credential:owner" };
const agent = { actorId: "agent:alpha", actorType: "agent", credentialId: "credential:alpha" };
const policyRef = { id: "moc-policy", version: "1.0.0", digest: digest("a") };
const clock = { now: () => "2026-08-27T12:00:00Z" };

function request(overrides = {}) {
  return {
    actor: { ...agent },
    vaultId: "vault:research",
    operation: "moc:replace",
    targetPath: "MOCs/Résumé.md",
    objectClass: "managed-moc",
    sensitivity: "internal",
    policyRef: { ...policyRef },
    ...overrides,
  };
}

function grant(overrides = {}) {
  return {
    grantId: "grant:moc-alpha",
    enabled: true,
    actor: { ...agent },
    approvedBy: { ...human },
    vaultId: "vault:research",
    allowedRoot: "MOCs",
    operations: ["moc:replace"],
    objectClasses: ["managed-moc"],
    sensitivityCeiling: "internal",
    policyRef: { ...policyRef },
    expiresAt: "2026-08-28T12:00:00Z",
    ...overrides,
  };
}

const providerFor = (value) => ({ resolveGrant: () => value });

test("explicit credential-bound grant authorizes only its exact scoped effect", () => {
  const decision = resolveNavigationEffectsAuthority(request(), providerFor(grant()), clock);
  assert.equal(decision.authorized, true);
  assert.deepEqual(decision.reasonCodes, []);
  assert.equal(decision.evaluatedAt, clock.now());
  assert.notEqual(decision.grant, grant());
});

test("missing grant and provider failures deny without exposing raw errors", () => {
  assert.deepEqual(resolveNavigationEffectsAuthority(request(), providerFor(null), clock).reasonCodes, ["GRANT_NOT_FOUND"]);
  const failed = resolveNavigationEffectsAuthority(request(), { resolveGrant: () => { throw new Error("token=secret"); } }, clock);
  assert.deepEqual(failed.reasonCodes, ["PROVIDER_ERROR"]);
  assert.doesNotMatch(JSON.stringify(failed), /secret/);
});

test("operation, vault, root, object class, credential, sensitivity, and policy are independent exact gates", () => {
  const cases = [
    [grant({ operations: ["moc:create"] }), "OPERATION_DENIED"],
    [grant({ vaultId: "vault:other" }), "VAULT_MISMATCH"],
    [grant({ allowedRoot: "Other" }), "TARGET_OUTSIDE_GRANTED_ROOT"],
    [grant({ objectClasses: ["agent-note"] }), "OBJECT_CLASS_DENIED"],
    [grant({ actor: { ...agent, credentialId: "credential:other" } }), "CREDENTIAL_MISMATCH"],
    [grant({ sensitivityCeiling: "public" }), "SENSITIVITY_CEILING_EXCEEDED"],
    [grant({ policyRef: { ...policyRef, digest: digest("b") } }), "POLICY_BINDING_MISMATCH"],
  ];
  for (const [candidate, reason] of cases) {
    const decision = resolveNavigationEffectsAuthority(request(), providerFor(candidate), clock);
    assert.equal(decision.authorized, false, reason);
    assert.ok(decision.reasonCodes.includes(reason), reason);
  }
});

test("request object class must match the exact operation before provider resolution", () => {
  let called = false;
  const decision = resolveNavigationEffectsAuthority(
    request({ operation: "agent-note:update", objectClass: "managed-moc" }),
    { resolveGrant: () => { called = true; return grant(); } },
    clock,
  );
  assert.equal(called, false);
  assert.deepEqual(decision.reasonCodes, ["OBJECT_CLASS_OPERATION_MISMATCH"]);
});

test("target and root use exact NFC vault-relative segment boundaries", () => {
  const decomposed = resolveNavigationEffectsAuthority(request({ targetPath: "MOCs/Re\u0301sume\u0301.md" }), providerFor(grant()), clock);
  assert.deepEqual(decomposed.reasonCodes, ["TARGET_PATH_NOT_NFC"]);
  for (const targetPath of ["../MOCs/A.md", "/MOCs/A.md", "MOCs\\A.md", "MOCs/%2e%2e/A.md", "MOCs/%252e%252e/A.md", "MOCs2/A.md"]) {
    const decision = resolveNavigationEffectsAuthority(request({ targetPath }), providerFor(grant()), clock);
    assert.equal(decision.authorized, false, targetPath);
    assert.ok(decision.reasonCodes.includes(targetPath === "MOCs2/A.md" ? "TARGET_OUTSIDE_GRANTED_ROOT" : "TARGET_PATH_INVALID"));
  }
});

test("agent self-approval is denied even when every other grant field matches", () => {
  const decision = resolveNavigationEffectsAuthority(request(), providerFor(grant({ approvedBy: { ...agent } })), clock);
  assert.deepEqual(decision.reasonCodes, ["AGENT_SELF_APPROVAL_DENIED"]);
});

test("token, connectivity, client name, confidence, approval, and timestamp cannot be supplied as authority", () => {
  for (const [field, value] of [
    ["token", "secret"],
    ["connected", true],
    ["clientName", "trusted-client"],
    ["confidence", 1],
    ["approved", true],
    ["timestamp", "2026-08-27T12:00:00Z"],
  ]) {
    let called = false;
    const decision = resolveNavigationEffectsAuthority(
      { ...request(), [field]: value },
      { resolveGrant: () => { called = true; return grant(); } },
      clock,
    );
    assert.equal(called, false, field);
    assert.deepEqual(decision.reasonCodes, ["AUTHORITY_INFERENCE_FIELD_FORBIDDEN"], field);
  }
});

test("expiry and evaluation time only narrow authority", () => {
  const expired = resolveNavigationEffectsAuthority(request(), providerFor(grant({ expiresAt: clock.now() })), clock);
  assert.deepEqual(expired.reasonCodes, ["GRANT_EXPIRED"]);
  const invalidExpiry = resolveNavigationEffectsAuthority(request(), providerFor(grant({ expiresAt: "tomorrow" })), clock);
  assert.deepEqual(invalidExpiry.reasonCodes, ["GRANT_EXPIRY_INVALID"]);
  const invalidClock = resolveNavigationEffectsAuthority(request(), providerFor(grant()), { now: () => "now" });
  assert.deepEqual(invalidClock.reasonCodes, ["EVALUATION_TIME_INVALID"]);
});

test("malformed provider grants fail closed rather than being partially interpreted", () => {
  for (const candidate of [
    { ...grant(), confidence: 1 },
    { ...grant(), enabled: "true" },
    { ...grant(), actor: { ...agent, token: "secret" } },
    { ...grant(), operations: ["moc:replace", "moc:replace"] },
    { ...grant(), policyRef: { ...policyRef, digest: `sha256:${"A".repeat(64)}` } },
  ]) {
    assert.deepEqual(resolveNavigationEffectsAuthority(request(), providerFor(candidate), clock).reasonCodes, ["GRANT_INVALID"]);
  }
});
