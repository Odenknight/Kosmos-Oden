import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { buildVaultNavigationConfig } from "gkos-engine/navigation";
import { NodeManagedMocRuntime } from "gkos-engine/navigation-effects/node";

const digest = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
export const TARGET_NAME = "index.md";
export function validateFolder(folder) {
  if (typeof folder !== "string" || !folder || folder.includes("\\") || folder.includes(":") || folder.split("/").some(p => !p || p.startsWith(".") || p === "_archive" || /[<>"|?*]/.test(p))) throw new Error("Choose an ordinary subfolder using forward slashes.");
  return folder;
}

export async function createPrototypeHost({ root, folder, adoptionId, isEnabled, onCommitted = () => {} }) {
  validateFolder(folder);
  if (!/^[0-9a-f-]{36}$/.test(adoptionId)) throw new Error("Invalid adoption record.");
  const vaultRoot = await realpath(root);
  const target = `${folder}/${TARGET_NAME}`;
  const vaultId = `prototype:${digest(vaultRoot).slice(7, 31)}`;
  const policyRef = { id: "kosmos-copy-test", version: "1", digest: digest(JSON.stringify({ vaultId, folder, target, adoptionId, retention: "operator-confirmed-clear", sensitivity: "secret", ownership: "new-generated-target-only" })) };
  const config = await buildVaultNavigationConfig({ configId: "01990ac0-0000-7000-8000-000000000003", version: 1, vaultId, promotedMocNames: [TARGET_NAME.slice(0, -3)], createdAt: "2026-09-07T00:00:00.000Z", createdBy: `local-operator:${adoptionId}`, policy: policyRef });
  const expires = Date.now() + 2 * 60 * 60 * 1000;
  let captured = null;
  async function checked(path, directory = false) {
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const absolute = resolve(vaultRoot, ...parts.slice(0, i));
      const stat = await lstat(absolute);
      const actual = await realpath(absolute);
      const rel = relative(vaultRoot, actual);
      if (stat.isSymbolicLink() || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Linked or escaping paths are not supported.");
      if (i < parts.length && !stat.isDirectory()) throw new Error("Invalid folder.");
      if (i === parts.length && (directory ? !stat.isDirectory() : !stat.isFile())) throw new Error("Invalid source type.");
    }
    return resolve(vaultRoot, path);
  }
  async function sources() {
    const rows = []; let bytes = 0;
    // This prototype indexes direct children only. Scope is explicit and bounded.
    const dir = await checked(folder, true);
    const entries = (await readdir(dir)).sort();
    if (entries.length > 2000) throw new Error("Prototype folder limit is 2000 entries.");
    for (const name of entries) {
      if (!name.toLowerCase().endsWith(".md") || name === TARGET_NAME) continue;
      const path = `${folder}/${name}`;
      const absolute = await checked(path);
      const stat = await lstat(absolute);
      if (stat.size > 1024 * 1024) throw new Error("Prototype note limit is 1 MiB.");
      const content = await readFile(absolute, "utf8"); bytes += Buffer.byteLength(content);
      if (bytes > 32 * 1024 * 1024) throw new Error("Prototype folder limit is 32 MiB.");
      // No labels are rewritten or downgraded. Treat every selected source as secret.
      rows.push({ relativePath: path, title: name.slice(0, -3), content, sensitivity: "secret" });
    }
    return rows;
  }
  function active() { return isEnabled() && Date.now() < expires; }
  const runtime = new NodeManagedMocRuntime({
    vaultRoot, pathThreatModel: "cooperative-vault",
    snapshot: async () => {
      if (!active()) throw new Error("Prototype authorization paused or expired.");
      const rows = await sources(); captured = digest(JSON.stringify(rows));
      return { snapshot: { vaultId, sources: rows }, config, policyRef, allowedSensitivities: ["secret"], targets: [{ path: target, ownership: { targetPath: target, ownership: "fully-managed", creationAuthorized: true }, authority: { actor: { actorId: `local-operator:${adoptionId}`, actorType: "human" }, grantId: adoptionId, allowedRoot: folder, capability: "moc:apply", sensitivityCeiling: "secret", policyRef, expiresAt: new Date(expires).toISOString() } }] };
    },
    validatePreconditions: async plan => {
      if (!active() || plan.vaultId !== vaultId || plan.targetPath !== target || plan.authority.grantId !== adoptionId || plan.authority.allowedRoot !== folder || plan.authority.actor.actorId !== `local-operator:${adoptionId}` || plan.authority.capability !== "moc:apply" || plan.policyRef.digest !== policyRef.digest || plan.configDigest !== config.digest || plan.precondition.retentionHold !== "clear") return ["PROTOTYPE_AUTHORITY_DENIED"];
      if (!captured || digest(JSON.stringify(await sources())) !== captured) return ["PROTOTYPE_SOURCE_CHANGED"];
      return [];
    },
    onCommitted,
  });
  return { runtime, target, preview: async () => (await sources()).map(row => row.relativePath) };
}
