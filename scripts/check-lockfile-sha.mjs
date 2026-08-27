/**
 * Lockfile SHA guard.
 *
 * npm ci will silently keep a stale git dependency when package-lock.json's
 * `resolved` field points at a mutable ref (a `#vX.Y.Z` tag string or a branch
 * name) instead of an immutable 40-hex commit SHA. This script fails CI if any
 * `resolved` git+ URL in package-lock.json ends in a non-40-hex ref, so the bug
 * cannot regress.
 *
 * Dependency-free; Node 18+.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = resolve(root, "package-lock.json");

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const packages = lock.packages ?? {};
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const problems = [];
let gitDeps = 0;

for (const [name, entry] of Object.entries(packages)) {
  const resolved = entry?.resolved;
  if (typeof resolved !== "string" || !resolved.startsWith("git+")) continue;
  gitDeps++;
  const hash = resolved.indexOf("#");
  const ref = hash === -1 ? "" : resolved.slice(hash + 1);
  if (!/^[0-9a-f]{40}$/.test(ref)) {
    problems.push(`${name || "(root)"}: resolved ref "${ref || "(none)"}" is not a 40-hex SHA — ${resolved}`);
  }
}

if (problems.length) {
  console.error("check-lockfile-sha: FAIL — git dependencies not pinned to a commit SHA:");
  for (const p of problems) console.error("  " + p);
  console.error("Fix: run `npm install <name>@<declared-spec>` to force re-resolution to a SHA.");
  process.exit(1);
}

const lockRoot = packages[""];
if (lock.version !== packageJson.version || lockRoot?.version !== packageJson.version) {
  console.error(
    `check-lockfile-sha: FAIL — package version ${packageJson.version} does not match lock top-level=${lock.version} root=${lockRoot?.version ?? "missing"}`,
  );
  process.exit(1);
}

for (const group of ["dependencies", "devDependencies"]) {
  for (const [name, specifier] of Object.entries(packageJson[group] ?? {})) {
    if (lockRoot?.[group]?.[name] !== specifier) {
      console.error(
        `check-lockfile-sha: FAIL — package-lock root ${group}.${name} does not match package.json`,
      );
      process.exit(1);
    }
  }
}

const engine = packages["node_modules/gkos-engine"];
if (
  engine?.version !== "2.1.2"
  || !String(engine.resolved ?? "").endsWith("#41172b91970aac869c161f4842e3526a62fd1fd9")
) {
  console.error("check-lockfile-sha: FAIL — gkos-engine is not bound to development-only Effects commit 41172b91970a");
  process.exit(1);
}

console.log(`check-lockfile-sha: OK — ${gitDeps} git dependenc${gitDeps === 1 ? "y" : "ies"} pinned to 40-hex commit SHAs; development-only gkos-engine 2.1.2 @ 41172b91970a.`);
