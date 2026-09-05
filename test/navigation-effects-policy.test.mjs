import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: ["src/navigation-effects/policy.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  metafile: true,
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);

const canonical = '{"constraints":{"automatic":false,"roots":["MOCs"]},"id":"local.moc-policy","version":"1.0.0"}';
const digest = `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
const ref = Object.freeze({ id: "local.moc-policy", version: "1.0.0", digest });

test("canonical policy digest is deterministic across JSON formatting and key order", async () => {
  const first = JSON.parse(canonical);
  const second = {
    version: "1.0.0",
    id: "local.moc-policy",
    constraints: { roots: ["MOCs"], automatic: false },
  };
  assert.equal(await api.canonicalNavigationEffectsPolicyDigest(first), digest);
  assert.equal(await api.canonicalNavigationEffectsPolicyDigest(second), digest);
});

test("exact policy identity and canonical digest validate for strings and UTF-8 bytes", async () => {
  const formatted = '{\n  "version": "1.0.0",\n  "constraints": { "roots": ["MOCs"], "automatic": false },\n  "id": "local.moc-policy"\n}';
  const expected = {
    valid: true,
    code: "policy-valid",
    policyId: ref.id,
    policyVersion: ref.version,
    expectedDigest: digest,
    canonicalDigest: digest,
  };
  assert.deepEqual(await api.validateNavigationEffectsPolicy(ref, formatted), expected);
  assert.deepEqual(await api.validateNavigationEffectsPolicy(ref, new TextEncoder().encode(formatted)), expected);
});

test("missing and malformed references fail closed before bytes are interpreted", async () => {
  assert.equal((await api.validateNavigationEffectsPolicy(undefined, canonical)).code, "policy-reference-missing");
  for (const invalid of [
    {},
    { ...ref, extra: true },
    { ...ref, id: " local.moc-policy" },
    { ...ref, version: "" },
    { ...ref, digest: digest.toUpperCase() },
    { ...ref, digest: "sha256:abc" },
  ]) {
    const outcome = await api.validateNavigationEffectsPolicy(invalid, canonical);
    assert.equal(outcome.valid, false);
    assert.equal(outcome.code, "policy-reference-invalid");
    assert.equal(outcome.canonicalDigest, null);
  }
});

test("missing, malformed, non-object, and invalid UTF-8 policy bytes fail closed", async () => {
  for (const missing of [undefined, null, "", new Uint8Array()]) {
    assert.equal((await api.validateNavigationEffectsPolicy(ref, missing)).code, "policy-bytes-missing");
  }
  for (const invalid of ["{", "null", "[]", new Uint8Array([0xc3, 0x28])]) {
    const outcome = await api.validateNavigationEffectsPolicy(ref, invalid);
    assert.equal(outcome.valid, false);
    assert.equal(outcome.code, "policy-bytes-invalid");
    assert.equal(outcome.canonicalDigest, null);
  }
});

test("policy bytes are bounded before parsing or canonicalization", async () => {
  const oversized = " ".repeat(api.NAVIGATION_EFFECTS_MAX_POLICY_BYTES + 1);
  const outcome = await api.validateNavigationEffectsPolicy(ref, oversized);
  assert.equal(outcome.valid, false);
  assert.equal(outcome.code, "policy-bytes-too-large");
  assert.equal(outcome.canonicalDigest, null);
});

test("missing, malformed, or noncanonical identity fields fail closed", async () => {
  for (const policy of [
    { version: ref.version },
    { id: ref.id },
    { id: 1, version: ref.version },
    { id: ref.id, version: " 1.0.0" },
    { id: "bad id", version: ref.version },
  ]) {
    const outcome = await api.validateNavigationEffectsPolicy(ref, JSON.stringify(policy));
    assert.equal(outcome.valid, false);
    assert.equal(outcome.code, "policy-identity-invalid");
  }
});

test("id or version mismatch is distinct from content digest drift", async () => {
  const identityMismatch = await api.validateNavigationEffectsPolicy(
    ref,
    JSON.stringify({ id: ref.id, version: "2.0.0", constraints: {} }),
  );
  assert.equal(identityMismatch.valid, false);
  assert.equal(identityMismatch.code, "policy-identity-mismatch");
  assert.equal(identityMismatch.canonicalDigest, null);

  const drift = await api.validateNavigationEffectsPolicy(
    ref,
    JSON.stringify({ id: ref.id, version: ref.version, constraints: { automatic: true, roots: ["MOCs"] } }),
  );
  assert.equal(drift.valid, false);
  assert.equal(drift.code, "policy-digest-mismatch");
  assert.equal(drift.expectedDigest, digest);
  assert.match(drift.canonicalDigest, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(drift.canonicalDigest, digest);
});

test("policy validation bundle remains pure and browser-safe", async () => {
  const inputs = Object.keys(bundled.metafile.inputs).map((path) => path.replaceAll("\\", "/"));
  assert.equal(inputs.some((path) => /(?:^|\/)(?:node:)?(?:fs|path|http|https|crypto)(?:$|\/)/u.test(path)), false);
  assert.doesNotMatch(bundled.outputFiles[0].text, /node:(?:fs|path|http|https|crypto)/u);
});
