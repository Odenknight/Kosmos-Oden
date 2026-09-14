import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Post-build observations, not authenticated provenance or license adjudication.
export function observeStandaloneInputs(root, metafile) {
  const fail = () => { throw new Error("invalid standalone component input"); };
  function read(path) {
    if (typeof path !== "string" || !path || path.includes("\\")
      || path.split("/").some(part => !part || part === "." || part === ".." || part.includes(":"))) fail();
    let current = root;
    for (const part of path.split("/")) {
      current = resolve(current, part);
      if (lstatSync(current).isSymbolicLink()) fail();
    }
    const stat = lstatSync(current);
    if (!stat.isFile() || stat.size > 128 * 1024 * 1024) fail();
    const bytes = readFileSync(current);
    if (bytes.length !== stat.size) fail();
    return bytes;
  }
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  const outputs = Object.values(metafile.outputs);
  if (outputs.length !== 1 || outputs[0].imports.length !== 0) fail();
  const components = new Map();
  const inputs = [];
  for (const [path, contribution] of Object.entries(outputs[0].inputs)) {
    if (!Number.isSafeInteger(contribution.bytesInOutput) || contribution.bytesInOutput < 0) fail();
    if (contribution.bytesInOutput === 0) continue;
    const bytes = read(path);
    if (bytes.length !== metafile.inputs[path]?.bytes) fail();
    // The last node_modules segment owns nested dependencies, including scopes.
    const match = /^((?:.*\/)?node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(path);
    const packagePath = match ? match[1] : "";
    if (!match && !path.startsWith("src/")) fail();
    if (!components.has(packagePath)) {
      const prefix = packagePath ? packagePath + "/" : "";
      const manifestBytes = read(prefix + "package.json");
      const manifest = JSON.parse(manifestBytes.toString("utf8"));
      if (typeof manifest.name !== "string" || !manifest.name
        || typeof manifest.version !== "string" || !manifest.version) fail();
      const documents = [];
      for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt", "NOTICE", "NOTICE.md", "THIRD-PARTY-NOTICES.md", "TRADEMARKS.md", "ACKNOWLEDGMENTS.md"]) {
        const path = prefix + name;
        if (existsSync(resolve(root, path))) {
          const data = read(path);
          documents.push({ path, bytes: data.length, sha256: hash(data) });
        }
      }
      components.set(packagePath, {
        packagePath, name: manifest.name, version: manifest.version,
        declaredLicense: typeof manifest.license === "string" ? manifest.license : null,
        packageManifestSha256: hash(manifestBytes), documents,
      });
    }
    inputs.push({ path, packagePath, bytes: bytes.length, sha256: hash(bytes), bytesInOutput: contribution.bytesInOutput });
  }
  if (!inputs.length) fail();
  return {
    observation: "post-build", completeSbom: false,
    scope: "Direct contributing files and package declarations; nested pre-bundle closure and license completeness are not established",
    inputs, components: [...components.values()],
  };
}
