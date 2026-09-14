import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { observeStandaloneInputs } from "../scripts/standalone-component-inputs.mjs";

test("component observations bind contributing files and nearest package declarations", () => {
  const root = mkdtempSync(join(tmpdir(), "kosmos-components-"));
  try {
    const put = (path, data) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), data); };
    put("package.json", JSON.stringify({ name: "app", version: "1" }));
    put("src/app.js", "app");
    const nested = "node_modules/outer/node_modules/@scope/inner";
    put(nested + "/package.json", JSON.stringify({ name: "@scope/inner", version: "2", license: "MIT" }));
    put(nested + "/LICENSE", "retained license");
    put(nested + "/index.js", "lib");
    const inputs = { "src/app.js": { bytes: 3 }, [nested + "/index.js"]: { bytes: 3 } };
    const metadata = { inputs, outputs: { "out.js": { imports: [], inputs: Object.fromEntries(Object.keys(inputs).map(path => [path, { bytesInOutput: 2 }])) } } };
    const observed = observeStandaloneInputs(root, metadata);
    assert.equal(observed.completeSbom, false);
    assert.deepEqual(observed.components.map(c => c.name), ["app", "@scope/inner"]);
    assert.equal(observed.inputs[1].packagePath, nested);
    assert.equal(observed.components[1].documents[0].sha256, createHash("sha256").update("retained license").digest("hex"));
    assert.equal(observed.inputs[0].sha256, createHash("sha256").update("app").digest("hex"));
    metadata.outputs["out.js"].imports.push({ path: "external" });
    assert.throws(() => observeStandaloneInputs(root, metadata));
    metadata.outputs["out.js"].imports = [];
    put("src/app.js", "changed length");
    assert.throws(() => observeStandaloneInputs(root, metadata));
    put("src/app.js", "app");
    metadata.outputs["out.js"].inputs["../escape"] = { bytesInOutput: 1 };
    assert.throws(() => observeStandaloneInputs(root, metadata));
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  }
});


test("Engine pre-bundle observations require matching producer bytes and confined source inputs", () => {
  const root = mkdtempSync(join(tmpdir(), "kosmos-prebundle-"));
  try {
    const put = (path, data) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), data); };
    const hash = value => createHash("sha256").update(value).digest("hex");
    const prefix = "node_modules/gkos-engine/";
    const manifest = JSON.stringify({ name: "gkos-engine", version: "2.2.0" });
    put(prefix + "package.json", manifest);
    put(prefix + "dist/engine.mjs", "bundle");
    put(prefix + "src/index.ts", "source");
    const inventory = {
      schemaVersion: 1, scope: "javascript-bundles-only", completeSbom: false,
      packageManifestSha256: hash(manifest),
      artifacts: [{ path: "dist/engine.mjs", bytes: 6, sha256: hash("bundle"), compilations: [0] }],
      compilations: [{ bytes: 6, sha256: hash("bundle"), metafile: {
        inputs: { "src/index.ts": { bytes: 6 } }, outputs: { "index.js": { imports: [] } },
      } }],
    };
    const metadata = { inputs: { [prefix + "dist/engine.mjs"]: { bytes: 6 } },
      outputs: { "out.js": { imports: [], inputs: { [prefix + "dist/engine.mjs"]: { bytesInOutput: 2 } } } } };
    const save = () => put(prefix + "dist/bundle-inputs.json", JSON.stringify(inventory));
    save();
    const observed = observeStandaloneInputs(root, metadata);
    assert.equal(observed.inputs[0].prebundle.sourceInputs[0].sha256, hash("source"));
    assert.equal(observed.completeSbom, false);
    inventory.artifacts[0].sha256 = hash("stale"); save();
    assert.throws(() => observeStandaloneInputs(root, metadata));
    inventory.artifacts[0].sha256 = hash("bundle");
    inventory.artifacts.push(inventory.artifacts[0]); save();
    assert.throws(() => observeStandaloneInputs(root, metadata));
    inventory.artifacts.pop();
    inventory.compilations[0].metafile.inputs = { "src/../../escape": { bytes: 6 } }; save();
    assert.throws(() => observeStandaloneInputs(root, metadata));
    inventory.compilations[0].metafile.inputs = { "src/index.ts": { bytes: 6 } };
    inventory.compilations[0].metafile.outputs["index.js"].imports.push({ path: "external" }); save();
    assert.throws(() => observeStandaloneInputs(root, metadata));
    inventory.compilations[0].metafile.outputs["index.js"].imports = []; save();
    put(prefix + "src/index.ts", "longer source");
    assert.throws(() => observeStandaloneInputs(root, metadata));
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  }
});
