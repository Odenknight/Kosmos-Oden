/** Release artifact checks (§28): existence, self-containment, version agreement. */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

function must(cond, msg) { if (!cond) problems.push(msg); }

// main.js exists and is a plausible plugin bundle
must(existsSync(resolve(root, "main.js")), "main.js is missing (run npm run build)");
if (existsSync(resolve(root, "main.js"))) {
  const mainJs = readFileSync(resolve(root, "main.js"), "utf8");
  must(statSync(resolve(root, "main.js")).size > 100_000, "main.js suspiciously small");
  must(mainJs.includes("kosmos-oden-view"), "main.js does not register the Kosmos view");
  // Backward-compatibility literals. These name data already written by
  // shipped builds (saved workspace leaves, stored WebDAV secrets), so a
  // rename sweep must never collapse them into the current names.
  must(mainJs.includes("vault-kosmos-view"), "main.js lost the legacy view-type alias; a saved workspace would drop its Kosmos pane");
  must(mainJs.includes("vault-kosmos-nextcloud-"), "main.js lost the legacy Nextcloud secret key; stored WebDAV credentials would not migrate");
}

// kosmos-oden-stand-alone.html exists, single-file, no external runtime deps
const standalonePath = resolve(root, "kosmos-oden-stand-alone.html");
must(existsSync(standalonePath), "kosmos-oden-stand-alone.html is missing (run npm run build:standalone)");
if (existsSync(standalonePath)) {
  const html = readFileSync(standalonePath, "utf8");
  must(html.length > 400_000, "kosmos-oden-stand-alone.html suspiciously small");
  must(!/<script[^>]+src=/i.test(html), "kosmos-oden-stand-alone.html loads an external script");
  must(!/<link[^>]+href=/i.test(html), "kosmos-oden-stand-alone.html loads an external stylesheet");
  must(!/url\(\s*['"]?https?:/i.test(html), "kosmos-oden-stand-alone.html references a remote CSS url()");
  must(html.includes("showDirectoryPicker"), "standalone is missing the persistent folder picker");
  must(html.includes("webkitdirectory"), "standalone is missing the snapshot fallback");
}

// stdio compatibility adapter ships beside the Obsidian plugin artifacts
const stdioAdapter = resolve(root, "kosmos-mcp-stdio.mjs");
must(existsSync(stdioAdapter), "kosmos-mcp-stdio.mjs is missing");
if (existsSync(stdioAdapter)) {
  const source = readFileSync(stdioAdapter, "utf8");
  // Modern MCP (2026-07-28): the adapter mirrors body fields into headers and
  // holds no session. The session assertion these replaced was true only of the
  // legacy era; the negative check below now guards against reintroducing it.
  must(source.includes("MCP-Protocol-Version"), "stdio adapter does not mirror the MCP protocol-version header");
  must(source.includes("Mcp-Method"), "stdio adapter does not mirror the Mcp-Method header");
  must(source.includes("Mcp-Name"), "stdio adapter does not mirror the Mcp-Name header");
  must(!source.includes("Mcp-Session-Id"), "stdio adapter reintroduced the removed MCP session header");
  must(!/method:s*"DELETE"/.test(source), "stdio adapter reintroduced session termination, removed in this revision");
}

// version agreement between built artifacts and manifest/package
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
must(pkg.version === manifest.version, `package (${pkg.version}) and manifest (${manifest.version}) versions differ`);
if (existsSync(standalonePath)) {
  const html = readFileSync(standalonePath, "utf8");
  must(html.includes(`Kosmos-Oden ${pkg.version}`), "standalone artifact was built from a different version");
}
const versions = JSON.parse(readFileSync(resolve(root, "versions.json"), "utf8"));
must(!!versions[pkg.version], `versions.json has no entry for ${pkg.version}`);

if (problems.length) {
  for (const p of problems) console.error("check-artifacts:", p);
  process.exit(1);
}
console.log("check-artifacts: OK — plugin, standalone, and stdio adapter artifacts are present and version-consistent");
