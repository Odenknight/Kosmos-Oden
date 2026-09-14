import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("lockfile guard requires permission for the exact active Engine specifier", () => {
  const root = mkdtempSync(join(tmpdir(), "kosmos-lock-permission-"));
  mkdirSync(join(root, "scripts"));
  copyFileSync(new URL("../scripts/check-lockfile-sha.mjs", import.meta.url), join(root, "scripts/check-lockfile-sha.mjs"));
  copyFileSync(new URL("../package-lock.json", import.meta.url), join(root, "package-lock.json"));
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const specifier = pkg.dependencies["gkos-engine"];
  for (const [allowScripts, accepted] of [[undefined, false], [{}, false], [{ [specifier]: false }, false],
    [{ [specifier]: "true" }, false], [{ "github:Odenknight/GKOS-Engine#old": true }, false], [{ [specifier]: true }, true]]) {
    writeFileSync(join(root, "package.json"), JSON.stringify({ ...pkg, allowScripts }));
    const result = spawnSync(process.execPath, [join(root, "scripts/check-lockfile-sha.mjs")], { encoding: "utf8" });
    assert.equal(result.error, undefined);
    assert.equal(result.status, accepted ? 0 : 1, result.stderr);
    if (!accepted) assert.match(result.stderr, /matching allowScripts entry/);
  }
});
