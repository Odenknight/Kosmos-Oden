import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { stagePortable } from "../scripts/portable-package.mjs";

test("portable alpha stages exact bound bytes and preserves prior output on refusal", () => {
  const parent = resolve(tmpdir()), root = mkdtempSync(resolve(parent, "kosmos-portable-"));
  try {
    for (const name of ["kosmos-oden-stand-alone.html", "LICENSE", "THIRD-PARTY-NOTICES.md"])
      writeFileSync(resolve(root, name), `synthetic:${name}\n`);
    writeFileSync(resolve(root, "package.json"), '{"version":"0.0.0"}');
    writeFileSync(resolve(root, "package-lock.json"), '{}');
    const hash = bytes => createHash("sha256").update(bytes).digest("hex");
    mkdirSync(resolve(root, "dist"));
    const viewer = readFileSync(resolve(root, "kosmos-oden-stand-alone.html"));
    const inventory = { schemaVersion: 1, artifact: "kosmos-oden-stand-alone.html",
      artifactSha256: hash(viewer), artifactBytes: viewer.length, lockfileSha256: hash(Buffer.from('{}')),
      completeSbom: false, pageInputObservation: "post-build",
      metafile: { inputs: { "synthetic.js": { bytes: 1 } }, outputs: { "synthetic.js": { bytes: 1 } } } };
    const saveInventory = value => writeFileSync(resolve(root, "dist/standalone-build-inputs.json"), JSON.stringify(value) + "\n");
    saveInventory(inventory);
    const bytes = Buffer.from("synthetic non-executable sidecar\n");
    const digest = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(resolve(root, "candidate.exe"), bytes);
    const manifest = { schema: 1, version: "2.2.0", commit: "a".repeat(40),
      os: "windows", arch: "x86_64", bytes: bytes.length, sha256: digest };
    const saveManifest = value => writeFileSync(resolve(root, "candidate.json"), JSON.stringify(value, null, 2) + "\n");
    saveManifest(manifest);
    const args = ["--portable", "--sidecar=windows-x64=candidate.exe", "--sidecar-manifest=windows-x64=candidate.json"];
    for (const change of [{ ...manifest, arch: "aarch64" }, { ...manifest, sha256: "b".repeat(64) },
      { ...manifest, bytes: bytes.length + 1 }]) {
      saveManifest(change);
      assert.throws(() => stagePortable(root, args));
      assert.equal(existsSync(resolve(root, "release/portable-alpha")), false);
    }
    saveManifest(manifest);
    for (const change of [{ ...inventory, artifactSha256: "0".repeat(64) },
      { ...inventory, lockfileSha256: "0".repeat(64) }, { ...inventory, completeSbom: true },
      { ...inventory, metafile: { inputs: {}, outputs: {} } }]) {
      saveInventory(change);
      assert.throws(() => stagePortable(root, args));
      assert.equal(existsSync(resolve(root, "release/portable-alpha")), false);
    }
    saveInventory(inventory);
    for (const invalid of [[...args, "--unknown"], [...args, args[1]], ["--portable", args[1]]]) {
      assert.throws(() => stagePortable(root, invalid));
      assert.equal(existsSync(resolve(root, "release/portable-alpha")), false);
    }
    assert.equal(stagePortable(root, args), 2, "strict mode reports incomplete target coverage");
    const output = resolve(root, "release/portable-alpha");
    const report = readFileSync(resolve(output, "PORTABLE-ALPHA-MANIFEST.json"));
    const parsed = JSON.parse(report);
    assert.equal(parsed.productionReady, false);
    assert.equal(parsed.targets.filter(t => t.status === "missing-sidecar").length, 3);
    const target = resolve(output, "windows-x64/Kosmos-Oden-Standalone");
    assert.deepEqual(readFileSync(resolve(target, "gkos-agent.exe")), bytes);
    assert.ok(readFileSync(resolve(target, "SHA256SUMS"), "utf8").includes(`${digest}  gkos-agent.exe\n`));
    assert.equal(JSON.parse(readFileSync(resolve(target, "BUILD-INFO.json"))).runtimeQualified, false);
    const inventoryBytes = readFileSync(resolve(root, "dist/standalone-build-inputs.json"));
    assert.deepEqual(readFileSync(resolve(target, "standalone-build-inputs.json")), inventoryBytes);
    assert.equal(JSON.parse(readFileSync(resolve(target, "BUILD-INFO.json"))).standaloneInventorySha256, hash(inventoryBytes));
    assert.ok(readFileSync(resolve(target, "SHA256SUMS"), "utf8").includes(`${hash(inventoryBytes)}  standalone-build-inputs.json\n`));
    assert.throws(() => stagePortable(root, [...args, "--allow-incomplete"]));
    assert.deepEqual(readFileSync(resolve(output, "PORTABLE-ALPHA-MANIFEST.json")), report);
    assert.equal(stagePortable(root, [...args, "--allow-incomplete", "--output=second-alpha"]), 0);
    mkdirSync(resolve(root, "scripts"));
    for (const name of ["package-release.mjs", "portable-package.mjs"])
      copyFileSync(new URL(`../scripts/${name}`, import.meta.url), resolve(root, "scripts", name));
    const cli = spawnSync(process.execPath, [resolve(root, "scripts/package-release.mjs"), ...args,
      "--allow-incomplete", "--output=cli-alpha"], { cwd: root, windowsHide: true, timeout: 10_000 });
    assert.ifError(cli.error);
    assert.equal(cli.status, 0, cli.stderr.toString());
    assert.equal(JSON.parse(readFileSync(resolve(root, "cli-alpha/PORTABLE-ALPHA-MANIFEST.json"))).productionReady, false);
  } finally {
    assert.equal(dirname(resolve(root)), parent);
    assert.ok(root.startsWith(resolve(parent, "kosmos-portable-")));
    rmSync(root, { recursive: true, force: true });
  }
});
