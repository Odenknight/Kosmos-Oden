import { colorForArea } from "gkos-engine";
import { validateVaultRelativePath } from "gkos-engine/navigation-effects";

export function validReadableGraph(value: any): boolean {
  const text = (s: unknown) => typeof s === "string" && s.length <= 4096;
  if (!value || !text(value.builtAt) || !Array.isArray(value.nodes) || !Array.isArray(value.links) || value.nodes.length > 20_000 || value.links.length > 100_000) return false;
  const ids = new Set<string>(), paths = new Set<string>();
  let units = value.builtAt.length;
  for (const node of value.nodes) {
    if (!node || !text(node.id) || !node.id || ids.has(node.id) || !text(node.path) || !validateVaultRelativePath(node.path).valid || paths.has(node.path) ||
      !text(node.title) || !text(node.area) || !text(node.type) || !Array.isArray(node.tags) || node.tags.length > 1000 || !node.tags.every(text) ||
      (node.timestamp != null && (!text(node.timestamp) || !Number.isFinite(Date.parse(node.timestamp))))) return false;
    ids.add(node.id); paths.add(node.path);
    units += node.id.length + node.path.length + node.title.length + node.area.length + node.type.length + node.tags.reduce((n: number, tag: string) => n + tag.length, 0) + (node.timestamp?.length ?? 0);
    if (units > 8_000_000) return false;
  }
  for (const link of value.links) {
    if (!link || !ids.has(link.source) || !ids.has(link.target) || !["wikilink", "semantic", "lineage"].includes(link.kind)) return false;
    units += link.source.length + link.target.length + link.kind.length;
    if (units > 8_000_000) return false;
  }
  return true;
}

/** Presentation-only projection of qGraph's already filtered summaries. No raw
 * Engine node or inferred governance data crosses this boundary. */
export function readableSpatialGraph(source: { builtAt: string; nodes: any[]; links: any[] }) {
  if (source.nodes.length > 20_000 || source.links.length > 100_000) throw new Error("WORKSPACE_SPATIAL_BUDGET");
  const nodes = source.nodes.map(note => ({
    id: note.id, kind: "file", path: note.path, label: note.title,
    area: note.area, depth: note.path.split("/").length - 1,
    tags: [...note.tags], aliases: [], type: note.type,
    color: colorForArea(note.area), validAt: note.timestamp ?? undefined,
    outgoing: 0, incoming: 0,
  }));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const links = source.links.map((link, index) => {
    const from = byId.get(link.source), to = byId.get(link.target);
    if (!from || !to) throw new Error("WORKSPACE_SPATIAL_ENDPOINT");
    from.outgoing++; to.incoming++;
    return { id: `readable-link:${index}`, source: link.source, target: link.target, kind: link.kind };
  });
  return {
    nodes, links, areas: [...new Set(nodes.map(node => node.area))].sort(),
    tags: [...new Set(nodes.flatMap(node => node.tags))].sort(),
    types: [...new Set(nodes.map(node => node.type))].sort(), statuses: [],
    stats: { indexedAt: source.builtAt, files: nodes.length, links: links.length },
    __workspaceScope: "readable-notes", __governanceProjection: "unavailable",
  };
}

