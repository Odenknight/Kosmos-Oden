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
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { crc32, deflateRawSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

rmSync(rel, { recursive: true, force: true });
mkdirSync(rel, { recursive: true });

for (const f of ARTIFACTS) {
  mkdirSync(dirname(resolve(rel, f)), { recursive: true });
  try { copyFileSync(resolve(root, f), resolve(rel, f)); }
  catch (e) { console.error(`package-release: missing artifact ${f} — run npm run build first`); process.exit(1); }
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
writeFileSync(resolve(rel, "BUILD-INFO.json"), JSON.stringify(buildInfo, null, 2) + "\n");

// SHA256SUMS over every file EXCEPT the sums file itself, sorted for determinism.
const sumFiles = [...ARTIFACTS, "BUILD-INFO.json"].sort();
const sums = sumFiles.map((f) => `${sha256(resolve(rel, f))}  ${f}`).join("\n") + "\n";
writeFileSync(resolve(rel, "SHA256SUMS"), sums);

console.log(`package-release: staged ${sumFiles.length} files in release/`);
console.log(`  commit ${buildInfo.gitCommit || "(unknown)"}${buildInfo.sourceTreeDirty ? " (dirty tree)" : ""}`);
for (const line of sums.trim().split("\n")) console.log("  " + line);

/* ---- installable archive -------------------------------------------------
 * kosmos-oden-<version>[-<label>].zip: a `kosmos-oden/` plugin directory that
 * unzips straight into <vault>/.obsidian/plugins/, plus docs, licenses,
 * BUILD-INFO.json and SHA256SUMS. The manifest version stays <version>; the
 * label only names the archive. Clear RELEASE_LABEL for a stable release
 * (or pass --label=). Never contains node_modules, data.json, credentials,
 * notes or caches: every entry is listed explicitly below.
 */
const labelArg = process.argv.find((a) => a.startsWith("--label="));
const RELEASE_LABEL = labelArg ? labelArg.slice("--label=".length) : "alpha.1";
const PLUGIN_FILES = ["manifest.json", "main.js", "styles.css", "kosmos-mcp-stdio.mjs"];
const versionDocs = `docs/v${pkg.version}`;
const REQUIRED_DOCS = ["ALPHA-INSTALL.md", "ALPHA-TEST.md", "KNOWN-LIMITATIONS.md", "MCP-COMPATIBILITY.md", "BUILD-PROGRESS.md"];
const docFiles = existsSync(resolve(root, versionDocs))
  ? readdirSync(resolve(root, versionDocs)).filter((f) => f.endsWith(".md")).sort()
  : [];
const missingDocs = REQUIRED_DOCS.filter((f) => !docFiles.includes(f));
if (missingDocs.length) {
  console.error(`package-release: ${versionDocs}/ is missing ${missingDocs.join(", ")}`);
  process.exit(1);
}

const entries = [
  ...PLUGIN_FILES.map((f) => ({ name: `kosmos-oden/${f}`, data: readFileSync(resolve(root, f)) })),
  ...docFiles.map((f) => ({ name: `docs/${f}`, data: readFileSync(resolve(root, versionDocs, f)) })),
  { name: "LICENSE", data: readFileSync(resolve(root, "LICENSE")) },
  { name: "THIRD-PARTY-NOTICES.md", data: readFileSync(resolve(root, "THIRD-PARTY-NOTICES.md")) },
  { name: "BUILD-INFO.json", data: readFileSync(resolve(rel, "BUILD-INFO.json")) },
];
const digest = (buf) => createHash("sha256").update(buf).digest("hex");
entries.push({ name: "SHA256SUMS", data: Buffer.from(entries.map((e) => `${digest(e.data)}  ${e.name}`).join("\n") + "\n") });

/** Minimal deterministic ZIP (deflate, fixed 1980-01-01 timestamps, UTF-8 names). */
function zip(files) {
  const chunks = [], central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const packed = deflateRawSync(data, { level: 9 });
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(0, 10); head.writeUInt16LE(0x0021, 12);
    head.writeUInt32LE(crc32(data), 14); head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4);
    head.copy(dir, 6, 4, 30);                 // version needed .. extra length
    dir.writeUInt32LE(offset, 42);            // comment/disk/attribute fields stay zero
    chunks.push(head, nameBuf, packed);
    central.push(dir, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

const zipName = `kosmos-oden-${pkg.version}${RELEASE_LABEL ? `-${RELEASE_LABEL}` : ""}.zip`;
const archive = zip(entries);
writeFileSync(resolve(rel, zipName), archive);
writeFileSync(resolve(rel, `${zipName}.sha256`), `${digest(archive)}  ${zipName}\n`);
console.log(`package-release: wrote release/${zipName} (${entries.length} entries, ${(archive.length / 1024).toFixed(0)} KB)`);
console.log(`  sha256 ${digest(archive)}`);
