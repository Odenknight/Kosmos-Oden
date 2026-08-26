import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("desktop shell consumes the generated viewer through one secure IPC bridge", () => {
  execFileSync(process.execPath, ["scripts/prepare-desktop.mjs"], { cwd: root, stdio: "pipe" });
  const generated = read("src-tauri/generated/index.html");
  assert.match(generated, /data-kosmos-desktop-bridge/);
  assert.match(generated, /take_viewer_token/);
  assert.match(generated, /\?api=http%3A%2F%2F127\.0\.0\.1%3A4814/);
  assert.doesNotMatch(generated, /\?token=/);
  assert.equal((generated.match(/<!doctype html>/gi) || []).length, 1);
});

test("desktop shell keeps write authority absent and secrets out of process arguments", () => {
  const rust = read("src-tauri/src/sidecar.rs") + read("src-tauri/src/lib.rs");
  assert.doesNotMatch(rust, /navigation.effects|apply.managed.moc|automatic.creation/i);
  assert.match(rust, /\.arg\("--notes"\)/);
  assert.match(rust, /\.arg\("--status-file"\)/);
  assert.doesNotMatch(rust, /\.arg\("--token"\)|\.arg\(token\)|\?token=/);
  assert.match(rust, /RESTART_BACKOFF_MS: \[u64; 5\] = \[250, 500, 1_000, 2_000, 4_000\]/);
  assert.match(rust, /RunEvent::ExitRequested/);
  assert.match(rust, /pub fn shutdown\(&self\)/);
  assert.doesNotMatch(rust, /Arc::strong_count/);
  assert.doesNotMatch(read("src-tauri/src/lib.rs"), /derive\(Clone\)[\s\S]{0,80}struct DesktopState/);
  assert.match(read("src-tauri/.gitignore"), /^\/gen\/schemas\/$/m);
});

test("portable alpha stages supplied bytes and reports absent targets without fabrication", () => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "kosmos-sidecar-"));
  const fixture = resolve(fixtureRoot, "gkos-agent.exe");
  writeFileSync(fixture, "synthetic-sidecar-fixture\n");
  rmSync(resolve(root, "release", "portable-alpha"), { recursive: true, force: true });
  execFileSync(process.execPath, ["scripts/package-release.mjs", "--portable", "--allow-incomplete", `--sidecar=windows-x64=${fixture}`], { cwd: root, stdio: "pipe" });
  const manifest = JSON.parse(read("release/portable-alpha/PORTABLE-ALPHA-MANIFEST.json"));
  assert.equal(manifest.productionReady, false);
  assert.equal(manifest.targets.length, 4);
  assert.equal(manifest.targets.find((target) => target.target === "windows-x64").status, "staged-internal-alpha");
  assert.equal(manifest.targets.filter((target) => target.status === "missing-sidecar").length, 3);
  assert.ok(manifest.blockers.some((value) => value.includes("native installers")));
  assert.ok(existsSync(resolve(root, "release", "portable-alpha", "SBOM-INPUT.json")));
  assert.ok(existsSync(resolve(root, "release", "portable-alpha", "windows-x64", "Kosmos-Oden-Standalone", "SBOM.spdx.json")));
  const stagedSidecar = resolve(root, "release", "portable-alpha", "windows-x64", "Kosmos-Oden-Standalone", "gkos-agent.exe");
  assert.equal(readFileSync(stagedSidecar, "utf8"), "synthetic-sidecar-fixture\n");
  const expectedDigest = createHash("sha256").update(readFileSync(stagedSidecar)).digest("hex");
  assert.match(read("release/portable-alpha/windows-x64/Kosmos-Oden-Standalone/SHA256SUMS"), new RegExp(`^${expectedDigest}  gkos-agent\\.exe$`, "m"));

  const strict = spawnSync(process.execPath, ["scripts/package-release.mjs", "--portable"], { cwd: root });
  assert.equal(strict.status, 2);
  rmSync(fixtureRoot, { recursive: true, force: true });
});
