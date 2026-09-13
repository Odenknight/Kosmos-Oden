import { positionCosmos } from "../renderer/layout";
import { readableSpatialGraph } from "./spatial";

/** Static local layout: no animation loop, network, or whole-vault query. */
export function localNoteMap(doc: Document, note: any, related: any, select: (path: string) => void): HTMLElement {
  const section = doc.createElement("section"), heading = doc.createElement("h3");
  heading.textContent = "Local map"; section.append(heading);
  const brief = (n: any) => ({ id: n.id ?? `file:${n.path}`, path: n.path, title: n.title,
    area: n.area ?? "Vault", type: n.type ?? "note", tags: n.tags ?? [], timestamp: n.timestamp ?? null });
  const center = brief(note), nodes = new Map([[center.id, center]]), links: any[] = [];
  let truncated = false;
  for (const kind of ["outgoing", "backlinks", "semantic"] as const) for (const neighbor of related[kind] ?? []) {
    const node = brief(neighbor);
    if (!nodes.has(node.id) && nodes.size >= 33) { truncated = true; continue; }
    nodes.set(node.id, node);
    links.push({ source: kind === "backlinks" ? node.id : center.id, target: kind === "backlinks" ? center.id : node.id,
      kind: kind === "semantic" ? "semantic" : "wikilink" });
  }
  const graph = positionCosmos(readableSpatialGraph({ builtAt: "", nodes: [...nodes.values()], links }));
  const shown = graph.nodes.filter(n => nodes.has(n.id));
  const extent = Math.max(1, ...shown.flatMap(n => [Math.abs((n.position as number[])[0]), Math.abs((n.position as number[])[2])]));
  const xy = new Map(shown.map(n => [n.id, [180 + (n.position as number[])[0] / extent * 155, 180 + (n.position as number[])[2] / extent * 155]]));
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 360 360"); svg.setAttribute("aria-label", "Selected note and readable neighbors");
  svg.style.width = "100%"; svg.style.maxWidth = "360px";
  for (const link of links) {
    const from = xy.get(link.source)!, to = xy.get(link.target)!;
    const line = doc.createElementNS(svg.namespaceURI, "line");
    for (const [key, value] of Object.entries({ x1: from[0], y1: from[1], x2: to[0], y2: to[1], stroke: "currentColor", "stroke-opacity": 0.55 })) line.setAttribute(key, String(value));
    if (link.kind === "semantic") line.setAttribute("stroke-dasharray", "4 3");
    svg.append(line);
  }
  for (const node of shown) {
    const circle = doc.createElementNS("http://www.w3.org/2000/svg", "circle"), point = xy.get(node.id)!;
    for (const [key, value] of Object.entries({ cx: point[0], cy: point[1], r: node.id === center.id ? 9 : 6, fill: node.color, stroke: node.id === center.id ? "currentColor" : "transparent", "stroke-width": 3 })) circle.setAttribute(key, String(value));
    circle.setAttribute("role", "button"); circle.setAttribute("tabindex", "0"); circle.setAttribute("aria-label", `Inspect ${node.label}`);
    const title = doc.createElementNS(svg.namespaceURI, "title"); title.textContent = node.label; circle.append(title);
    circle.addEventListener("click", () => select(node.path));
    circle.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(node.path); } });
    svg.append(circle);
  }
  const legend = doc.createElement("p");
  legend.textContent = "Ring: selected note. Dashed lines: semantic links. Other lines: note links. Use the readable link lists below for names and direction." + (truncated ? " Map limited to 32 neighbors." : "");
  section.append(svg, legend); return section;
}
