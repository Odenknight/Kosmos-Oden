import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";

const TARGETS = {
  "debian-x64": ["linux", "x86_64", "gkos-agent"],
  "windows-x64": ["windows", "x86_64", "gkos-agent.exe"],
  "macos-arm64": ["macos", "aarch64", "gkos-agent"],
  "macos-x64": ["macos", "x86_64", "gkos-agent"],
};
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const reject = message => { throw Object.assign(new Error(message), { exitCode: 2 }); };
function regular(path, maximum) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum) reject("invalid portable input file");
  const bytes = readFileSync(path);
  if (bytes.length !== stat.size) reject("portable input changed while reading");
  return bytes;
}

export function stagePortable(root, argv) {
  const sidecars = new Map(), manifests = new Map(), flags = new Set();
  let output = resolve(root, "release/portable-alpha");
  for (const arg of argv) {
    if (["--portable", "--allow-incomplete"].includes(arg)) {
      if (flags.has(arg)) reject("duplicate portable flag");
      flags.add(arg);
    } else if (arg.startsWith("--output=")) {
      if (flags.has("output") || !arg.slice(9)) reject("invalid portable output");
      flags.add("output"); output = resolve(root, arg.slice(9));
    } else {
      const match = /^(--sidecar|--sidecar-manifest)=([^=]+)=(.+)$/.exec(arg);
      if (!match || !Object.hasOwn(TARGETS, match[2])) reject("unknown portable argument or target");
      const map = match[1] === "--sidecar" ? sidecars : manifests;
      if (map.has(match[2])) reject("duplicate portable target binding");
      map.set(match[2], resolve(root, match[3]));
    }
  }
  if (!flags.has("--portable")) reject("portable mode required");
  if (existsSync(output)) reject("portable output already exists; choose a new --output directory");
  for (const target of new Set([...sidecars.keys(), ...manifests.keys()])) {
    if (!sidecars.has(target) || !manifests.has(target)) reject("sidecar and sidecar-manifest must be supplied together");
  }
  const inputs = new Map();
  for (const [target, path] of sidecars) {
    const manifestBytes = regular(manifests.get(target), 8192);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const keys = ["schema", "version", "commit", "os", "arch", "bytes", "sha256"];
    if (!manifest || Array.isArray(manifest) || Object.keys(manifest).length !== keys.length
      || keys.some(key => !Object.hasOwn(manifest, key))
      || manifest.schema !== 1 || typeof manifest.version !== "string"
      || !/^[A-Za-z0-9.+-]{1,64}$/.test(manifest.version)
      || !/^[a-f0-9]{40}$/.test(manifest.commit) || !/^[a-f0-9]{64}$/.test(manifest.sha256)
      || manifest.os !== TARGETS[target][0] || manifest.arch !== TARGETS[target][1]
      || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > 1_073_741_824) reject("invalid sidecar manifest or target binding");
    // Canonical JSON admission also rejects duplicate keys and ambiguous input
    // spellings before this manifest can be installed beside a binary.
    if (manifestBytes.toString("utf8") !== JSON.stringify(manifest, null, 2) + "\n") reject("sidecar manifest must be canonical two-space JSON with a final LF");
    const bytes = regular(path, 1_073_741_824);
    if (bytes.length !== manifest.bytes || sha(bytes) !== manifest.sha256) reject("sidecar bytes do not match the supplied manifest");
    inputs.set(target, { bytes, manifest, manifestBytes });
  }
  const common = new Map([
    ["kosmos-oden-stand-alone.html", regular(resolve(root, "kosmos-oden-stand-alone.html"), 128 * 1024 * 1024)],
    ["LICENSES/Apache-2.0.txt", regular(resolve(root, "LICENSE"), 1024 * 1024)],
    ["THIRD-PARTY-NOTICES.md", regular(resolve(root, "THIRD-PARTY-NOTICES.md"), 1024 * 1024)],
  ]);
  const pkg = JSON.parse(regular(resolve(root, "package.json"), 1024 * 1024));
  const lock = regular(resolve(root, "package-lock.json"), 16 * 1024 * 1024);
  const inventoryBytes = regular(resolve(root, "dist/standalone-build-inputs.json"), 16 * 1024 * 1024);
  const inventory = JSON.parse(inventoryBytes.toString("utf8"));
  const viewer = common.get("kosmos-oden-stand-alone.html");
  if (inventory?.schemaVersion !== 1 || inventory.artifact !== "kosmos-oden-stand-alone.html"
    || inventory.artifactSha256 !== sha(viewer) || inventory.artifactBytes !== viewer.length
    || inventory.lockfileSha256 !== sha(lock) || inventory.completeSbom !== false
    || inventory.pageInputObservation !== "post-build"
    || !inventory.metafile?.inputs || !inventory.metafile?.outputs
    || Array.isArray(inventory.metafile.inputs) || Array.isArray(inventory.metafile.outputs)
    || Object.keys(inventory.metafile.inputs).length === 0 || Object.keys(inventory.metafile.outputs).length === 0) {
    reject("standalone input inventory does not match the staged viewer and lockfile");
  }
  common.set("standalone-build-inputs.json", inventoryBytes);
  const targets = [];
  // Never remove a previous package. A failure leaves its new directory as
  // incomplete evidence, without a completion manifest.
  mkdirSync(dirname(output), { recursive: true });
  mkdirSync(output);
  for (const [target, [, , binary]] of Object.entries(TARGETS)) {
    const input = inputs.get(target);
    if (!input) { targets.push({ target, status: "missing-sidecar" }); continue; }
    const directory = `${target}/Kosmos-Oden-Standalone`, folder = resolve(output, directory);
    const payload = new Map(common);
    payload.set(binary, input.bytes);
    payload.set("sidecar-release.json", input.manifestBytes);
    payload.set("START.md", Buffer.from(`# Kosmos-Oden Standalone: internal alpha\n\nOpen kosmos-oden-stand-alone.html for offline folder mode.\nThe supplied sidecar bytes match their manifest. Runtime behavior is not qualified by this package.\nDo not place credentials in URLs or process arguments.\n`));
    payload.set("BUILD-INFO.json", Buffer.from(JSON.stringify({ schemaVersion: 1,
      version: pkg.version, target, releaseStatus: "internal-alpha", productionReady: false,
      runtimeQualified: false, sidecar: input.manifest, viewerSha256: sha(common.get("kosmos-oden-stand-alone.html")),
      sidecarManifestSha256: sha(input.manifestBytes), lockfileSha256: sha(lock),
      standaloneInventorySha256: sha(inventoryBytes) }, null, 2) + "\n"));
    for (const [name, bytes] of payload) {
      const destination = resolve(folder, name);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, bytes, { flag: "wx" });
    }
    if (target !== "windows-x64") chmodSync(resolve(folder, binary), 0o755);
    const sums = [...payload].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([name, bytes]) => `${sha(bytes)}  ${name}`).join("\n") + "\n";
    writeFileSync(resolve(folder, "SHA256SUMS"), sums, { flag: "wx" });
    targets.push({ target, status: "staged-internal-alpha", directory, sidecarSha256: sha(input.bytes) });
  }
  writeFileSync(resolve(output, "SBOM-INPUT.json"), JSON.stringify({ schemaVersion: 1,
    completeSbom: false, npmLockSha256: sha(lock), standaloneInventorySha256: sha(inventoryBytes),
    artifacts: targets }, null, 2) + "\n", { flag: "wx" });
  const report = { schemaVersion: 1, productionReady: false, releaseStatus: "internal-alpha", targets,
    blockers: ["native runtime qualification remains open", "complete sidecar and viewer SBOM remains open",
      "signed installers and macOS notarization remain open"] };
  writeFileSync(resolve(output, "PORTABLE-ALPHA-MANIFEST.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, stagedTargets: inputs.size, productionReady: false }));
  return inputs.size < Object.keys(TARGETS).length && !flags.has("--allow-incomplete") ? 2 : 0;
}
