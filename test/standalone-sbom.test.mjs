import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { standaloneSbom } from "../scripts/standalone-sbom.mjs";

test("viewer SBOM binds observed inputs without claiming complete dependencies or licenses", () => {
  const input = { path: "src/app.ts", packagePath: "", bytes: 3, bytesInOutput: 2, sha256: "a".repeat(64) };
  const component = { packagePath: "", name: "app", version: "1", declaredLicense: "MIT", packageManifestSha256: "b".repeat(64), documents: [] };
  const inventory = { schemaVersion: 1, completeSbom: false, artifact: "kosmos-oden-stand-alone.html", artifactSha256: "c".repeat(64),
    componentInputs: { completeSbom: false, observation: "post-build", components: [component], inputs: [input] } };
  const encode = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
  const bytes = encode(inventory), generated = standaloneSbom(bytes), bom = JSON.parse(generated);
  assert.deepEqual(standaloneSbom(bytes), generated);
  assert.equal(bom.metadata.component.properties[0].value, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(bom.dependencies, [{ ref: bom.metadata.component["bom-ref"], dependsOn: [bom.components[0]["bom-ref"]] }]);
  assert.equal(bom.compositions[0].aggregate, "incomplete");
  assert.deepEqual(JSON.parse(bom.components[0].properties.find(p => p.name === "kosmos:observedInputs").value), [input]);
  for (const change of [
    { ...inventory, completeSbom: true },
    { ...inventory, componentInputs: { ...inventory.componentInputs, components: [component, component] } },
    { ...inventory, componentInputs: { ...inventory.componentInputs, inputs: [input, input] } },
    { ...inventory, componentInputs: { ...inventory.componentInputs, inputs: [input, { ...input, path: "orphan.ts", packagePath: "missing" }] } },
  ]) assert.throws(() => standaloneSbom(encode(change)), /invalid standalone SBOM inputs/);
  assert.throws(() => standaloneSbom(Buffer.from(JSON.stringify(inventory))), /invalid standalone SBOM inputs/);
  const unknown = structuredClone(inventory);
  unknown.componentInputs.components[0].declaredLicense = "unmapped declaration";
  const unknownBom = JSON.parse(standaloneSbom(encode(unknown)));
  assert.equal(unknownBom.components[0].licenses, undefined);
  assert.equal(unknownBom.components[0].properties[0].value, "unmapped declaration");
});
