/**
 * Lockfile SHA guard.
 *
 * npm ci will silently keep a stale git dependency when package-lock.json's
 * `resolved` field points at a mutable ref (a `#vX.Y.Z` tag string or a branch
 * name) instead of an immutable 40-hex commit SHA. This script fails CI if any
 * `resolved` git+ URL in package-lock.json ends in a non-40-hex ref, so the bug
 * cannot regress. It also verifies that the lockfile root version and declared
 * dependencies match package.json, preventing stale root metadata from shipping.
 *
 * Dependency-free; Node 18+.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = resolve(root, "package-lock.json");
const packagePath = resolve(root, "package.json");

const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const packages = lock.packages ?? {};
const lockRoot = packages[""] ?? {};

const problems = [];
if (lock.version !== pkg.version) {
  problems.push(`lockfile version "${lock.version}" does not match package version "${pkg.version}"`);
}
if (lockRoot.version !== pkg.version) {
  problems.push(`lockfile root package version "${lockRoot.version}" does not match package version "${pkg.version}"`);
}
for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
  if (lockRoot.dependencies?.[name] !== spec) {
    problems.push(`lockfile root dependency ${name} "${lockRoot.dependencies?.[name]}" does not match package.json "${spec}"`);
  }
}
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
  console.error("check-lockfile-sha: FAIL — lockfile integrity problems:");
  for (const p of problems) console.error("  " + p);
  console.error("Fix: regenerate package-lock.json from the current package.json and verify git dependencies resolve to SHAs.");
  process.exit(1);
}

console.log(`check-lockfile-sha: OK — ${gitDeps} git dependenc${gitDeps === 1 ? "y" : "ies"} pinned to 40-hex commit SHAs.`);
