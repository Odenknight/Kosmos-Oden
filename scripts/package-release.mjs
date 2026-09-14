/**
 * Assemble a clean, verifiable release directory (Doc1 §3.9, Doc2 §3).
 *
 * Copies only the intended artifacts into release/, writes BUILD-INFO.json
 * (provenance) and SHA256SUMS (integrity). Runs after `npm run build`.
 *
 *   node scripts/package-release.mjs
 *
 * In GitHub Actions, commit/tag/runner metadata is read from the environment;
 * locally it falls back to `git` and best-effort values. Volatile metadata
 * (build time) lives ONLY here, never in main.js, so executable artifacts stay
 * byte-reproducible (Doc2 §4.5).
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--portable")) {
  try {
    const { stagePortable } = await import("./portable-package.mjs");
    process.exitCode = stagePortable(resolve(dirname(fileURLToPath(import.meta.url)), ".."), process.argv.slice(2));
  } catch (error) {
    console.error(`package-release: ${error.message}`);
    process.exitCode = error.exitCode ?? 1;
  }
  process.exit();
}

if (process.argv.length !== 2) {
  console.error("package-release: unsupported arguments; this command currently packages the plugin release only");
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = resolve(root, "release");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const ARTIFACTS = ["manifest.json", "main.js", "styles.css", "versions.json", "kosmos-oden-stand-alone.html", "kosmos-mcp-stdio.mjs", "docs/REVIEW-0.8.3.md", "LICENSE", "THIRD-PARTY-NOTICES.md"];

function git(cmd, fallback = "") {
  try { return execSync(`git ${cmd}`, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return fallback; }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

// Read the complete input set before changing the previous release. A missing
// build artifact must not destroy a usable package or its historical receipt.
const artifactBytes = new Map();
for (const f of ARTIFACTS) {
  try { artifactBytes.set(f, readFileSync(resolve(root, f))); }
  catch { console.error(`package-release: missing or unreadable artifact ${f} — run npm run build first`); process.exit(1); }
}

// Build beside the destination. Never erase the previous package, including
// portable artifacts that may have been staged inside it.
let previous = null;
try { previous = lstatSync(rel); }
catch (error) { if (error.code !== "ENOENT") throw error; }
if (previous && (!previous.isDirectory() || previous.isSymbolicLink())) {
  throw new Error("release must be a regular directory, not a link or file");
}
const staged = mkdtempSync(resolve(root, ".release-stage-"));

for (const f of ARTIFACTS) {
  mkdirSync(dirname(resolve(staged, f)), { recursive: true });
  writeFileSync(resolve(staged, f), artifactBytes.get(f));
}

const lockHash = (() => {
  try { return sha256(resolve(root, "package-lock.json")); } catch { return null; }
})();

const buildInfo = {
  schemaVersion: 1,
  project: "kosmos-oden",
  version: pkg.version,
  repository: "https://github.com/Odenknight/Kosmos-Oden",
  gitCommit: process.env.GITHUB_SHA || git("rev-parse HEAD"),
  gitTag: process.env.GITHUB_REF_NAME || git("describe --tags --exact-match", ""),
  workflow: process.env.GITHUB_WORKFLOW || null,
  runId: process.env.GITHUB_RUN_ID || null,
  nodeVersion: process.version,
  lockfileSha256: lockHash,
  sourceTreeDirty: git("status --porcelain") !== "",
  buildTimeUtc: new Date().toISOString(),
};
writeFileSync(resolve(staged, "BUILD-INFO.json"), JSON.stringify(buildInfo, null, 2) + "\n");

// SHA256SUMS over every file EXCEPT the sums file itself, sorted for determinism.
const sumFiles = [...ARTIFACTS, "BUILD-INFO.json"].sort();
const sums = sumFiles.map((f) => `${sha256(resolve(staged, f))}  ${f}`).join("\n") + "\n";
writeFileSync(resolve(staged, "SHA256SUMS"), sums);

let backup = null;
if (previous) {
  backup = resolve(mkdtempSync(resolve(root, ".release-history-")), "release");
  renameSync(rel, backup);
  console.log(`package-release: previous package retained at ${backup}`);
}
try { renameSync(staged, rel); }
catch (error) {
  // A handled promotion failure restores the prior location. A process crash
  // between renames leaves the complete old package in the printed backup.
  if (backup && !existsSync(rel)) renameSync(backup, rel);
  throw error;
}

console.log(`package-release: staged ${sumFiles.length} files in release/`);
console.log(`  commit ${buildInfo.gitCommit || "(unknown)"}${buildInfo.sourceTreeDirty ? " (dirty tree)" : ""}`);
for (const line of sums.trim().split("\n")) console.log("  " + line);
