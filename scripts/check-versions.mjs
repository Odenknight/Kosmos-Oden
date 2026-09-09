/** Version synchronization check (§29): one source of truth, everything else must match. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

// Kosmos-Oden's own version source of truth — distinct from the gkos-engine
// dependency's own version (that package has its own release lifecycle).
const VERSION_TS = "src/kosmos-version.ts";
const versionTs = read(VERSION_TS);
const m = /KOSMOS_VERSION\s*=\s*"([^"]+)"/.exec(versionTs);
if (!m) { console.error(`check-versions: KOSMOS_VERSION not found in ${VERSION_TS}`); process.exit(1); }
const version = m[1];

const pkg = JSON.parse(read("package.json"));
const manifest = JSON.parse(read("manifest.json"));
const versions = JSON.parse(read("versions.json"));

const problems = [];
if (pkg.version !== version) problems.push(`package.json version ${pkg.version} != ${version}`);
if (manifest.version !== version) problems.push(`manifest.json version ${manifest.version} != ${version}`);
if (!versions[version]) problems.push(`versions.json is missing an entry for ${version}`);
if (versions[version] && versions[version] !== manifest.minAppVersion) {
  problems.push(`versions.json[${version}] (${versions[version]}) != manifest minAppVersion (${manifest.minAppVersion})`);
}

// The gkos-engine LIBRARY version must never be hard-coded in source. It is
// agent-facing (MCP tool descriptions, the initialize `instructions` string,
// settings copy), so a stale literal silently misreports the engine to every
// connected agent — which is exactly what happened when v2.1.1 literals
// survived the upgrade to the 2.2.0 line. Import ENGINE_VERSION instead.
//
// Deliberately NOT matched: "GKOS-Engine 2.1" without a patch component, which
// names the Navigation/profile contract generation. That is versioned
// separately from the library release.
const ENGINE_LITERAL = /GKOS-Engine\s+v\d+\.\d+\.\d+/g;
const walk = (dir) => readdirSync(dir).flatMap((entry) => {
  const full = join(dir, entry);
  return statSync(full).isDirectory() ? walk(full) : [full];
});
for (const file of walk(resolve(root, "src")).filter((f) => /\.tsx?$/.test(f))) {
  const text = readFileSync(file, "utf8");
  for (const hit of text.match(ENGINE_LITERAL) ?? []) {
    const rel = file.slice(resolve(root).length + 1).split(sep).join("/");
    problems.push(`${rel} hard-codes "${hit}"; import ENGINE_VERSION from gkos-engine instead`);
  }
}

if (problems.length) {
  for (const p of problems) console.error("check-versions:", p);
  process.exit(1);
}
console.log(`check-versions: OK — everything agrees on v${version}; no hard-coded GKOS-Engine library version in src/`);
