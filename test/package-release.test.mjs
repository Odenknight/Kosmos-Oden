import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
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
      "kosmos-oden-stand-alone.html", "kosmos-mcp-stdio.mjs", "docs/REVIEW-0.8.3.md",
      "LICENSE", "THIRD-PARTY-NOTICES.md"];
    for (const name of artifacts) {
      mkdirSync(dirname(resolve(root, name)), { recursive: true });
      writeFileSync(resolve(root, name), `synthetic:${name}\n`);
    }
    const packaged = spawnSync(process.execPath, [resolve(root, "scripts/package-release.mjs")],
      { cwd: root, windowsHide: true, timeout: 10_000 });
    assert.ifError(packaged.error);
    assert.equal(packaged.status, 0);
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
