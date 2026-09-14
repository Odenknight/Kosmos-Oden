import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

test("unsupported packaging requests and missing artifacts preserve the previous release", () => {
  const parent = resolve(tmpdir());
  const root = mkdtempSync(resolve(parent, "kosmos-packaging-refusal-"));
  try {
    mkdirSync(resolve(root, "scripts"));
    mkdirSync(resolve(root, "release"));
    copyFileSync(new URL("../scripts/package-release.mjs", import.meta.url), resolve(root, "scripts/package-release.mjs"));
    copyFileSync(new URL("../scripts/portable-package.mjs", import.meta.url), resolve(root, "scripts/portable-package.mjs"));
    writeFileSync(resolve(root, "package.json"), JSON.stringify({ name: "synthetic", version: "0.0.0" }));
    const marker = resolve(root, "release", "existing-receipt.json");
    const bytes = Buffer.from('{"retain":"historical evidence"}\n');
    for (const args of [["--portable", "--unknown"], ["--unknown"], ["--sidecar=windows-x64=synthetic.exe"], []]) {
      writeFileSync(marker, bytes);
      const result = spawnSync(process.execPath, [resolve(root, "scripts/package-release.mjs"), ...args],
        { cwd: root, windowsHide: true, timeout: 10_000 });
      assert.ifError(result.error);
      assert.equal(result.status, args.length ? 2 : 1);
      assert.deepEqual(readFileSync(marker), bytes);
    }
    const artifacts = ["manifest.json", "main.js", "styles.css", "versions.json",
      "kosmos-oden-stand-alone.html", "kosmos-mcp-stdio.mjs", "effects-inspection-host.cjs", "docs/REVIEW-0.8.3.md",
      "LICENSE", "THIRD-PARTY-NOTICES.md", "ACKNOWLEDGMENTS.md"];
    for (const name of artifacts.filter(name => name !== "ACKNOWLEDGMENTS.md")) {
      mkdirSync(dirname(resolve(root, name)), { recursive: true });
      writeFileSync(resolve(root, name), `synthetic:${name}\n`);
    }
    const missingAcknowledgment = spawnSync(process.execPath, [resolve(root, "scripts/package-release.mjs")],
      { cwd: root, windowsHide: true, timeout: 10_000 });
    assert.equal(missingAcknowledgment.status, 1);
    assert.match(missingAcknowledgment.stderr.toString(), /ACKNOWLEDGMENTS.md/);
    assert.deepEqual(readFileSync(marker), bytes);
    writeFileSync(resolve(root, "ACKNOWLEDGMENTS.md"), "synthetic:ACKNOWLEDGMENTS.md\n");
    mkdirSync(resolve(root, "release/portable-alpha"));
    writeFileSync(resolve(root, "release/portable-alpha/receipt.json"), bytes);
    // Inject filesystem failures in the real child process, without adding
    // test switches or alternate production packaging paths.
    for (const failure of ["write", "promote"]) {
      const hook = resolve(root, `fail-${failure}.mjs`);
      writeFileSync(hook, `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { basename } from 'node:path';
const write = fs.writeFileSync, rename = fs.renameSync;
fs.writeFileSync = function(path, ...args) {
  if (${JSON.stringify(failure)} === 'write' && String(path).includes('.release-stage-') && basename(path) === 'styles.css') throw new Error('synthetic staging failure');
  return write.call(this, path, ...args);
};
fs.renameSync = function(from, to) {
  if (${JSON.stringify(failure)} === 'promote' && basename(from).startsWith('.release-stage-') && basename(to) === 'release') throw new Error('synthetic promotion failure');
  return rename.call(this, from, to);
};
syncBuiltinESMExports();
`);
      const failed = spawnSync(process.execPath, ["--import", pathToFileURL(hook).href, resolve(root, "scripts/package-release.mjs")],
        { cwd: root, windowsHide: true, timeout: 10_000 });
      assert.ifError(failed.error);
      assert.equal(failed.status, 1);
      assert.match(failed.stderr.toString(), /synthetic (staging|promotion) failure/);
      assert.deepEqual(readFileSync(marker), bytes);
      assert.deepEqual(readFileSync(resolve(root, "release/portable-alpha/receipt.json")), bytes);
    }
    const packaged = spawnSync(process.execPath, [resolve(root, "scripts/package-release.mjs")],
      { cwd: root, windowsHide: true, timeout: 10_000 });
    assert.ifError(packaged.error);
    assert.equal(packaged.status, 0);
    const backups = readdirSync(root).filter(name => name.startsWith(".release-history-")
      && existsSync(resolve(root, name, "release/existing-receipt.json")));
    assert.equal(backups.length, 1);
    assert.deepEqual(readFileSync(resolve(root, backups[0], "release/existing-receipt.json")), bytes);
    assert.deepEqual(readFileSync(resolve(root, backups[0], "release/portable-alpha/receipt.json")), bytes);
    const sums = readFileSync(resolve(root, "release/SHA256SUMS"), "utf8");
    for (const name of artifacts) {
      const expected = readFileSync(resolve(root, name));
      assert.deepEqual(readFileSync(resolve(root, "release", name)), expected);
      assert.ok(sums.split("\n").includes(`${createHash("sha256").update(expected).digest("hex")}  ${name}`));
    }
  } finally {
    assert.equal(dirname(resolve(root)), parent);
    assert.ok(root.startsWith(resolve(parent, "kosmos-packaging-refusal-")));
    rmSync(root, { recursive: true, force: true });
  }
});
