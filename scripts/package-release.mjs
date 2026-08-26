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
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = resolve(root, "release");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const PORTABLE_TARGETS = Object.freeze({
  "debian-x64": { sourceName: "gkos-agent-x86_64-unknown-linux-gnu", installedName: "gkos-agent" },
  "windows-x64": { sourceName: "gkos-agent-x86_64-pc-windows-msvc.exe", installedName: "gkos-agent.exe" },
  "macos-arm64": { sourceName: "gkos-agent-aarch64-apple-darwin", installedName: "gkos-agent" },
  "macos-x64": { sourceName: "gkos-agent-x86_64-apple-darwin", installedName: "gkos-agent" },
});

const ARTIFACTS = ["manifest.json", "main.js", "styles.css", "versions.json", "kosmos-oden-stand-alone.html", "kosmos-mcp-stdio.mjs"];

function git(cmd, fallback = "") {
  try { return execSync(`git ${cmd}`, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return fallback; }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha1(path) {
  return createHash("sha1").update(readFileSync(path)).digest("hex");
}

function portableSidecars(argv) {
  const selected = new Map();
  for (const argument of argv) {
    if (!argument.startsWith("--sidecar=")) continue;
    const binding = argument.slice("--sidecar=".length);
    const separator = binding.indexOf("=");
    if (separator < 1) throw new Error(`invalid --sidecar binding: ${argument}`);
    const target = binding.slice(0, separator);
    const path = resolve(root, binding.slice(separator + 1));
    if (!PORTABLE_TARGETS[target]) throw new Error(`unknown portable target: ${target}`);
    if (selected.has(target)) throw new Error(`duplicate portable target: ${target}`);
    selected.set(target, path);
  }
  return selected;
}

function spdxDocument(target, files, namespaceDigest) {
  const dependencies = Object.entries({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, version], index) => ({
      SPDXID: `SPDXRef-Dependency-${index + 1}`,
      name,
      versionInfo: version,
      downloadLocation: "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: "NOASSERTION",
      licenseDeclared: "NOASSERTION",
      copyrightText: "NOASSERTION",
    }));
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `Kosmos-Oden-Standalone-${target}`,
    documentNamespace: `https://github.com/Odenknight/Kosmos-Oden/sbom/${namespaceDigest}`,
    creationInfo: {
      created: new Date(git("show -s --format=%cI HEAD", "1970-01-01T00:00:00Z")).toISOString(),
      creators: ["Tool: scripts/package-release.mjs"],
    },
    packages: [{
      SPDXID: "SPDXRef-Kosmos-Oden-Standalone",
      name: "Kosmos-Oden-Standalone",
      versionInfo: pkg.version,
      downloadLocation: "NOASSERTION",
      filesAnalyzed: true,
      verificationCode: {
        packageVerificationCodeValue: createHash("sha1").update(files.map((file) => file.sha1).sort().join("")).digest("hex"),
      },
      licenseConcluded: "Apache-2.0",
      licenseDeclared: "Apache-2.0",
      copyrightText: "NOASSERTION",
    }, ...dependencies],
    files: files.map((file, index) => ({
      SPDXID: `SPDXRef-File-${index + 1}`,
      fileName: `./${file.name}`,
      checksums: [
        { algorithm: "SHA1", checksumValue: file.sha1 },
        { algorithm: "SHA256", checksumValue: file.sha256 },
      ],
      licenseConcluded: "NOASSERTION",
      copyrightText: "NOASSERTION",
    })),
    relationships: [
      { spdxElementId: "SPDXRef-DOCUMENT", relationshipType: "DESCRIBES", relatedSpdxElement: "SPDXRef-Kosmos-Oden-Standalone" },
      ...files.map((_, index) => ({ spdxElementId: "SPDXRef-Kosmos-Oden-Standalone", relationshipType: "CONTAINS", relatedSpdxElement: `SPDXRef-File-${index + 1}` })),
      ...dependencies.map((dependency) => ({ spdxElementId: "SPDXRef-Kosmos-Oden-Standalone", relationshipType: "DEPENDS_ON", relatedSpdxElement: dependency.SPDXID })),
    ],
  };
}

function buildPortableAlpha(argv) {
  const allowIncomplete = argv.includes("--allow-incomplete");
  const selected = portableSidecars(argv);
  const portableRoot = resolve(rel, "portable-alpha");
  const viewer = resolve(root, "kosmos-oden-stand-alone.html");
  if (!existsSync(viewer)) throw new Error("missing kosmos-oden-stand-alone.html; run npm run build:standalone first");
  rmSync(portableRoot, { recursive: true, force: true });
  mkdirSync(portableRoot, { recursive: true });

  const targets = [];
  const blockers = [];
  for (const [target, definition] of Object.entries(PORTABLE_TARGETS)) {
    const explicit = selected.get(target);
    const conventional = resolve(root, "artifacts", definition.sourceName);
    const source = explicit || conventional;
    if (!existsSync(source)) {
      blockers.push(`missing ${target} sidecar (${definition.sourceName})`);
      targets.push({ target, status: "missing-sidecar", expectedArtifact: definition.sourceName });
      continue;
    }
    const packageRoot = resolve(portableRoot, target, "Kosmos-Oden-Standalone");
    mkdirSync(resolve(packageRoot, "LICENSES"), { recursive: true });
    const copies = [
      [viewer, "kosmos-oden-stand-alone.html"],
      [source, definition.installedName],
      [resolve(root, "LICENSE"), "LICENSES/Apache-2.0.txt"],
      [resolve(root, "THIRD-PARTY-NOTICES.md"), "THIRD-PARTY-NOTICES.md"],
    ];
    for (const [from, to] of copies) copyFileSync(from, resolve(packageRoot, to));
    writeFileSync(resolve(packageRoot, "START.md"), `# Kosmos-Oden Standalone — internal alpha\n\nOpen \`kosmos-oden-stand-alone.html\` for offline folder or snapshot mode.\n\nFor the local service, create a private application-state directory and run:\n\n\`\`\`text\n${definition.installedName} --notes <absolute-corpus-path> --status-file <private-state-path>/desktop-agent.status.json --port 4814\n\`\`\`\n\nThen use **Connect to Local Engine** and paste the viewer credential from the generated owner-protected token file into the password field. The credential must never be put in a URL or command argument. Keep the service on loopback; use an SSH tunnel for a remote Debian host.\n\nThis unsigned internal-alpha staging directory is not a production installer.\n`);

    const payloadNames = copies.map(([, to]) => to).concat("START.md").sort();
    const payload = payloadNames.map((name) => ({ name, sha1: sha1(resolve(packageRoot, name)), sha256: sha256(resolve(packageRoot, name)) }));
    const namespaceDigest = createHash("sha256").update(payload.map((item) => `${item.sha256} ${item.name}`).join("\n")).digest("hex");
    const buildInfo = {
      schemaVersion: 1,
      product: "Kosmos-Oden Standalone",
      releaseStatus: "internal-alpha",
      version: pkg.version,
      target,
      gitCommit: process.env.GITHUB_SHA || git("rev-parse HEAD"),
      sourceTreeDirty: git("status --porcelain") !== "",
      viewerSha256: sha256(viewer),
      sidecarSourceName: basename(source),
      sidecarSha256: sha256(source),
      signed: false,
      notarized: false,
    };
    writeFileSync(resolve(packageRoot, "BUILD-INFO.json"), JSON.stringify(buildInfo, null, 2) + "\n");
    const withBuildInfo = payload.concat({ name: "BUILD-INFO.json", sha1: sha1(resolve(packageRoot, "BUILD-INFO.json")), sha256: sha256(resolve(packageRoot, "BUILD-INFO.json")) });
    writeFileSync(resolve(packageRoot, "SBOM.spdx.json"), JSON.stringify(spdxDocument(target, withBuildInfo, namespaceDigest), null, 2) + "\n");
    const checksummed = withBuildInfo.concat({ name: "SBOM.spdx.json", sha256: sha256(resolve(packageRoot, "SBOM.spdx.json")) }).sort((a, b) => a.name.localeCompare(b.name));
    writeFileSync(resolve(packageRoot, "SHA256SUMS"), checksummed.map((item) => `${item.sha256}  ${item.name}`).join("\n") + "\n");
    targets.push({ target, status: "staged-internal-alpha", directory: `${target}/Kosmos-Oden-Standalone`, sidecarSha256: buildInfo.sidecarSha256 });
  }

  const manifest = {
    schemaVersion: 1,
    releaseStatus: "internal-alpha",
    productionReady: false,
    targets,
    blockers: [
      ...blockers,
      "native installers are not built or signed",
      "production desktop branding and icon assets are not approved",
      "macOS artifacts are not notarized",
      "cross-platform smoke tests are not recorded by this host",
    ],
  };
  writeFileSync(resolve(portableRoot, "PORTABLE-ALPHA-MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(resolve(portableRoot, "SBOM-INPUT.json"), JSON.stringify({
    schemaVersion: 1,
    npmLock: { path: "package-lock.json", sha256: sha256(resolve(root, "package-lock.json")) },
    cargoLock: existsSync(resolve(root, "src-tauri", "Cargo.lock"))
      ? { path: "src-tauri/Cargo.lock", sha256: sha256(resolve(root, "src-tauri", "Cargo.lock")) }
      : null,
    artifacts: targets,
  }, null, 2) + "\n");
  console.log(`package-release: staged ${targets.filter((item) => item.status === "staged-internal-alpha").length}/${targets.length} portable alpha targets`);
  for (const blocker of manifest.blockers) console.log(`  BLOCKER: ${blocker}`);
  if (blockers.length && !allowIncomplete) process.exitCode = 2;
}

if (process.argv.includes("--portable")) {
  try {
    buildPortableAlpha(process.argv.slice(2));
  } catch (error) {
    console.error(`package-release: ${error.message}`);
    process.exitCode = 1;
  }
  process.exit();
}

rmSync(rel, { recursive: true, force: true });
mkdirSync(rel, { recursive: true });

for (const f of ARTIFACTS) {
  try { copyFileSync(resolve(root, f), resolve(rel, f)); }
  catch (e) { console.error(`package-release: missing artifact ${f} — run npm run build first`); process.exit(1); }
}

const lockHash = (() => {
  try { return sha256(resolve(root, "package-lock.json")); } catch { return null; }
})();

const buildInfo = {
  schemaVersion: 1,
  project: "vault-kosmos",
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
