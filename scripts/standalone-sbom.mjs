import { createHash } from "node:crypto";

// Package declarations and post-build observations, not complete source closure.
export function standaloneSbom(inventoryBytes) {
  const fail = () => { throw new Error("invalid standalone SBOM inputs"); };
  if (!Buffer.isBuffer(inventoryBytes)) fail();
  const inventory = JSON.parse(inventoryBytes.toString("utf8"));
  if (!inventoryBytes.equals(Buffer.from(JSON.stringify(inventory, null, 2) + "\n"))) fail();
  const observed = inventory.componentInputs;
  if (inventory.schemaVersion !== 1 || inventory.completeSbom !== false
    || inventory.artifact !== "kosmos-oden-stand-alone.html" || !/^[a-f0-9]{64}$/.test(inventory.artifactSha256)
    || observed?.completeSbom !== false || observed.observation !== "post-build"
    || !Array.isArray(observed.components) || !observed.components.length
    || !Array.isArray(observed.inputs) || !observed.inputs.length) fail();
  const owners = new Set(), paths = new Set();
  const byOwner = new Map();
  for (const input of observed.inputs) {
    if (typeof input?.packagePath !== "string") fail();
    if (!byOwner.has(input.packagePath)) byOwner.set(input.packagePath, []);
    byOwner.get(input.packagePath).push(input);
  }
  const components = observed.components.map((component, index) => {
    if (typeof component.packagePath !== "string" || owners.has(component.packagePath)
      || typeof component.name !== "string" || !component.name
      || typeof component.version !== "string" || !component.version
      || !/^[a-f0-9]{64}$/.test(component.packageManifestSha256)
      || !Array.isArray(component.documents)
      || (component.declaredLicense !== null && typeof component.declaredLicense !== "string")) fail();
    owners.add(component.packagePath);
    const inputs = byOwner.get(component.packagePath) ?? [];
    if (!inputs.length) fail();
    for (const input of inputs) {
      if (typeof input.path !== "string" || !input.path || paths.has(input.path)
        || !Number.isSafeInteger(input.bytes) || input.bytes < 0
        || !Number.isSafeInteger(input.bytesInOutput) || input.bytesInOutput < 1
        || !/^[a-f0-9]{64}$/.test(input.sha256)) fail();
      paths.add(input.path);
    }
    return {
      type: "library", "bom-ref": `package-${index}`, name: component.name, version: component.version,
      // Only these observed declarations have been mapped to SPDX IDs here.
      ...(["MIT", "Apache-2.0"].includes(component.declaredLicense)
        ? { licenses: [{ license: { id: component.declaredLicense } }] } : {}),
      description: "Observed contributing package; license values are declarations, not independent adjudication.",
      properties: [
        { name: "kosmos:declaredLicense", value: component.declaredLicense ?? "unavailable" },
        { name: "kosmos:packageManifestSha256", value: component.packageManifestSha256 },
        { name: "kosmos:observedInputs", value: JSON.stringify(inputs) },
        { name: "kosmos:observedLicenseDocuments", value: JSON.stringify(component.documents) },
      ],
    };
  });
  if (paths.size !== observed.inputs.length) fail();
  const ref = `viewer-${inventory.artifactSha256}`;
  return Buffer.from(JSON.stringify({
    $schema: "http://cyclonedx.org/schema/bom-1.5.schema.json", bomFormat: "CycloneDX", specVersion: "1.5", version: 1,
    metadata: { component: { type: "application", "bom-ref": ref, name: inventory.artifact,
      hashes: [{ alg: "SHA-256", content: inventory.artifactSha256 }],
      properties: [
        { name: "kosmos:standaloneInventorySha256", value: createHash("sha256").update(inventoryBytes).digest("hex") },
        { name: "kosmos:observation", value: "post-build" },
      ],
    } },
    components, dependencies: [{ ref, dependsOn: components.map(component => component["bom-ref"]) }],
    compositions: [{ aggregate: "incomplete", assemblies: [ref, ...components.map(component => component["bom-ref"])], dependencies: [ref] }],
  }, null, 2) + "\n");
}
