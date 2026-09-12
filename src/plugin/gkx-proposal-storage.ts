import type { App } from "obsidian";
import type { ProposalStorageAdapter } from "./gkx-proposals";
import { nodeRequire } from "./vault-provider";

/** Desktop-only audit storage. Hard-link publication cannot replace an existing
 * record. This is not a qualified durable MOC host or a source-note writer. */
export function proposalStorageAdapter(app: App): ProposalStorageAdapter {
  const fs = nodeRequire("node:fs")?.promises;
  const paths = nodeRequire("node:path");
  const base = (app.vault.adapter as any).getBasePath?.();
  if (!fs || !paths || typeof base !== "string") throw new Error("Exclusive proposal storage requires the desktop filesystem host");
  const root = paths.resolve(base);
  const within = (parent: string, child: string) => {
    const relative = paths.relative(parent, child);
    return relative === "" || (!relative.startsWith(".." + paths.sep) && relative !== ".." && !paths.isAbsolute(relative));
  };
  async function checked(relative: string): Promise<string> {
    if (!/^\.gkx(?:\/(?:proposals|decisions)(?:\/[a-zA-Z0-9._-]+)?)?$/.test(relative)) throw new Error("Invalid proposal storage path");
    const absolute = paths.resolve(root, relative);
    if (!within(root, absolute)) throw new Error("Proposal path escapes vault");
    const canonicalRoot = await fs.realpath(root);
    let parent = absolute;
    while (true) {
      try {
        const canonical = await fs.realpath(parent);
        if (!within(canonicalRoot, canonical)) throw new Error("Proposal storage link escapes vault");
        return absolute;
      } catch (error: any) {
        if (error.code !== "ENOENT") throw error;
        if (parent === root) throw error;
        parent = paths.dirname(parent);
      }
    }
  }
  return {
    async exists(path) { try { await fs.stat(await checked(path)); return true; } catch (e: any) { if (e.code === "ENOENT") return false; throw e; } },
    async read(path) { return fs.readFile(await checked(path), "utf8"); },
    async write(path, content) {
      if (!path.endsWith(".tmp")) throw new Error("Only temporary audit records may be written");
      const file = await fs.open(await checked(path), "wx");
      try { await file.writeFile(content, "utf8"); await file.sync(); } finally { await file.close(); }
    },
    async rename(from, to) {
      if (!from.endsWith(".tmp") || !to.endsWith(".yaml") || paths.dirname(from) !== paths.dirname(to)) throw new Error("Invalid audit publication");
      const source = await checked(from), destination = await checked(to);
      // link is atomic and fails with EEXIST. Rename could overwrite a record
      // created by another process after the caller's existence check.
      await fs.link(source, destination);
      await fs.unlink(source);
    },
    async remove(path) { if (!path.endsWith(".tmp")) throw new Error("Published audit records cannot be removed"); await fs.unlink(await checked(path)); },
    async mkdir(path) { await fs.mkdir(await checked(path)); },
  };
}
