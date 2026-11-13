/**
 * Personal Notes (0.9.0) — optional supersession lineage adapter.
 *
 * Pure. Works on partial Personal metadata (no GKX envelope needed) and is
 * kept apart from governed GKX validation. Only explicit declarations count:
 * an authored `supersedes` on the replacement note, or an authored
 * `superseded_by` on the older note. Matching titles, later timestamps,
 * shared tags or similarity are never evidence.
 *
 * Callers pass only the notes the requester may see; nothing outside `notes`
 * ever appears as a node, edge endpoint or derived reference. A declaration
 * whose target resolves outside `notes` is reported as plain "unresolved",
 * so hidden paths do not leak.
 */
import { PERSONAL_LIMITS, PersonalError } from "./types";
import type { LineageEdge, LineageInputNote, LineageNode, LineageUnresolved, LineageView } from "./types";

/** Resolve a link text written in `fromPath`. null = unresolved; "ambiguous" = several targets. */
export type LineageResolve = (linkText: string, fromPath: string) => string | null | "ambiguous";

/** Wrap a link text as a wikilink unless it already is one. */
export function asWikilink(linkText: string): string {
  const text = String(linkText ?? "").trim();
  if (!text) return "";
  return /^\[\[.*\]\]$/.test(text) ? text : `[[${text}]]`;
}

/** Return the `supersedes` list with `link` added once. Existing entries are kept as written. */
export function mergeSupersedes(existing: unknown, link: string): string[] {
  const current = Array.isArray(existing)
    ? existing.filter((item) => typeof item === "string" && item.trim()).map((item) => String(item))
    : typeof existing === "string" && existing.trim() ? [existing] : [];
  const wanted = asWikilink(link);
  if (!wanted) return current;
  const key = (value: string) => asWikilink(value).toLowerCase();
  if (current.some((item) => key(item) === key(wanted))) return current;
  return [...current, wanted];
}

/** Link path inside a declaration: "[[Plans/Old#H|alias]]" -> "Plans/Old". Empty when nothing usable. */
export function lineageLinkText(declared: string): string {
  let text = String(declared ?? "").trim();
  const wiki = /^\[\[([\s\S]*)\]\]$/.exec(text);
  if (wiki) text = wiki[1];
  return text.split("|")[0].split("#")[0].trim();
}

interface Graph {
  byPath: Map<string, LineageInputNote>;
  edges: LineageEdge[];
  unresolved: LineageUnresolved[];
  contradictions: { path: string; detail: string }[];
}

function resolveDeclared(declared: string, from: string, resolve: LineageResolve, byPath: Map<string, LineageInputNote>):
  { path: string } | { reason: LineageUnresolved["reason"] } {
  const text = lineageLinkText(declared);
  if (!text) return { reason: "unresolved" };
  const target = resolve(text, from);
  if (target === "ambiguous") return { reason: "ambiguous" };
  if (target == null || !byPath.has(target)) return { reason: "unresolved" };
  if (target === from) return { reason: "self" };
  return { path: target };
}

function strings(list: unknown): string[] {
  return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function buildGraph(notes: readonly LineageInputNote[], resolve: LineageResolve): Graph {
  const byPath = new Map<string, LineageInputNote>();
  for (const note of notes) if (note && typeof note.path === "string" && !byPath.has(note.path)) byPath.set(note.path, note);
  const edges = new Map<string, LineageEdge>();
  const unresolved: LineageUnresolved[] = [];
  const reverseOnly: LineageEdge[] = [];
  for (const note of byPath.values()) {
    for (const declared of strings(note.supersedes)) {
      const r = resolveDeclared(declared, note.path, resolve, byPath);
      if ("reason" in r) { unresolved.push({ from: note.path, declared, reason: r.reason }); continue; }
      edges.set(`${note.path}\0${r.path}`, { from: note.path, to: r.path, source: "declared" });
    }
  }
  for (const note of byPath.values()) {
    for (const declared of strings(note.supersededBy)) {
      const r = resolveDeclared(declared, note.path, resolve, byPath);
      if ("reason" in r) { unresolved.push({ from: note.path, declared, reason: r.reason }); continue; }
      const key = `${r.path}\0${note.path}`;
      if (!edges.has(key)) {
        const edge: LineageEdge = { from: r.path, to: note.path, source: "reverse" };
        edges.set(key, edge);
        reverseOnly.push(edge);
      }
    }
  }
  const contradictions: { path: string; detail: string }[] = [];
  for (const edge of reverseOnly) {
    if (edges.has(`${edge.to}\0${edge.from}`)) {
      contradictions.push({ path: edge.to, detail: `superseded_by names ${edge.from}, but a supersedes declaration points the other way` });
    }
  }
  const sortedEdges = [...edges.values()].sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to));
  unresolved.sort((a, b) => cmp(a.from, b.from) || cmp(a.declared, b.declared));
  contradictions.sort((a, b) => cmp(a.path, b.path));
  return { byPath, edges: sortedEdges, unresolved, contradictions };
}

/** Strongly connected components with more than one member (cycles), iterative Tarjan. */
function findCycles(nodes: string[], out: Map<string, string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  let next = 0;
  for (const root of nodes) {
    if (index.has(root)) continue;
    const work: Array<{ v: string; i: number }> = [{ v: root, i: 0 }];
    index.set(root, next); low.set(root, next); next++; stack.push(root); onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const succ = out.get(frame.v) ?? [];
      if (frame.i < succ.length) {
        const w = succ[frame.i++];
        if (!index.has(w)) {
          index.set(w, next); low.set(w, next); next++; stack.push(w); onStack.add(w);
          work.push({ v: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.v, Math.min(low.get(frame.v)!, index.get(w)!));
        }
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].v;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.v)!));
      }
      if (low.get(frame.v) === index.get(frame.v)) {
        const scc: string[] = [];
        let w: string;
        do { w = stack.pop()!; onStack.delete(w); scc.push(w); } while (w !== frame.v);
        if (scc.length > 1) cycles.push(scc.sort(cmp));
      }
    }
  }
  return cycles.sort((a, b) => cmp(a[0], b[0]));
}

function fnv1a(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function invalid(message: string): PersonalError {
  return new PersonalError("invalid_argument", message);
}

/**
 * Bounded lineage around `focus`. Nodes are the focus's connected component
 * (through declared and reverse edges), ordered by distance from the focus
 * then path. Each page carries the edges, unresolved declarations and
 * contradictions whose source note is on that page, the heads on that page,
 * and every cycle whose first (smallest) path is on that page. A focus not in
 * `notes` yields an empty view; the caller reports not_found.
 */
export function lineageView(
  notes: readonly LineageInputNote[],
  resolve: (linkText: string, fromPath: string) => string | null | "ambiguous",
  opts: { focus: string; limit?: number; cursor?: string | null },
): LineageView {
  const limit = opts.limit ?? PERSONAL_LIMITS.lineageDefaultNodes;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > PERSONAL_LIMITS.lineageMaxNodes) {
    throw invalid(`limit must be an integer from 1 to ${PERSONAL_LIMITS.lineageMaxNodes}`);
  }
  const empty: LineageView = { nodes: [], edges: [], heads: [], unresolved: [], cycles: [], contradictions: [], truncated: false, nextCursor: null };
  const graph = buildGraph(notes, resolve);
  if (!graph.byPath.has(opts.focus)) {
    if (opts.cursor != null) throw invalid("cursor does not match this lineage");
    return empty;
  }

  const out = new Map<string, string[]>();
  const into = new Map<string, string[]>();
  for (const e of graph.edges) {
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e.to);
    (into.get(e.to) ?? into.set(e.to, []).get(e.to)!).push(e.from);
  }
  const dist = new Map<string, number>([[opts.focus, 0]]);
  const queue = [opts.focus];
  for (let i = 0; i < queue.length; i++) {
    const v = queue[i];
    for (const w of [...(out.get(v) ?? []), ...(into.get(v) ?? [])].sort(cmp)) {
      if (!dist.has(w)) { dist.set(w, dist.get(v)! + 1); queue.push(w); }
    }
  }
  const ordered = [...dist.keys()].sort((a, b) => dist.get(a)! - dist.get(b)! || cmp(a, b));
  const fingerprint = fnv1a(`${opts.focus}\0${ordered.join("\0")}`);

  let offset = 0;
  if (opts.cursor != null) {
    const m = typeof opts.cursor === "string" ? /^lv1\.([0-9a-z]{1,10})\.([0-9a-f]{8})$/.exec(opts.cursor) : null;
    offset = m ? parseInt(m[1], 36) : NaN;
    if (!m || m[2] !== fingerprint || !Number.isSafeInteger(offset) || offset < 1 || offset >= ordered.length) {
      throw invalid("cursor is invalid or the lineage changed; start again without a cursor");
    }
  }
  const page = ordered.slice(offset, offset + limit);
  const onPage = new Set(page);
  const end = offset + page.length;

  const component = new Set(ordered);
  const cycles = findCycles(ordered, out).filter((c) => c.every((p) => component.has(p)) && onPage.has(c[0]));
  const nodes: LineageNode[] = page.map((path) => {
    const note = graph.byPath.get(path)!;
    const node: LineageNode = {
      path,
      supersededBy: [...(into.get(path) ?? [])].sort(cmp),
      supersedes: [...(out.get(path) ?? [])].sort(cmp),
    };
    if (typeof note.uid === "string") node.uid = note.uid;
    if (typeof note.updatedAt === "string") node.updatedAt = note.updatedAt;
    return node;
  });
  return {
    nodes,
    edges: graph.edges.filter((e) => onPage.has(e.from)),
    heads: page.filter((p) => !(into.get(p)?.length)),
    unresolved: graph.unresolved.filter((u) => onPage.has(u.from)),
    cycles,
    contradictions: graph.contradictions.filter((c) => onPage.has(c.path)),
    truncated: end < ordered.length,
    nextCursor: end < ordered.length ? `lv1.${end.toString(36)}.${fingerprint}` : null,
  };
}

export type SupersedesRejection = "empty" | "unknown_replacement" | "self" | "ambiguous" | "unresolved" | "cycle";

export type SupersedesCheck =
  | { ok: true; target: string; link: string; alreadyDeclared: boolean }
  | { ok: false; reason: SupersedesRejection; detail: string };

/**
 * Validate "replacement supersedes target" for the picker preview. Only an
 * explicit, uniquely resolved, visible target that does not close a cycle is
 * accepted. `link` is the wikilink to write on the replacement note.
 */
export function checkSupersedesProposal(
  replacementPath: string,
  targetLinkText: string,
  notes: readonly LineageInputNote[],
  resolve: LineageResolve,
): SupersedesCheck {
  const graph = buildGraph(notes, resolve);
  if (!graph.byPath.has(replacementPath)) return { ok: false, reason: "unknown_replacement", detail: "the replacement note is not available" };
  const text = lineageLinkText(targetLinkText);
  if (!text) return { ok: false, reason: "empty", detail: "choose the older note this one supersedes" };
  const r = resolveDeclared(targetLinkText, replacementPath, resolve, graph.byPath);
  if ("reason" in r) {
    const detail = r.reason === "self" ? "a note cannot supersede itself"
      : r.reason === "ambiguous" ? "more than one note matches; use the full path"
      : "no matching note was found";
    return { ok: false, reason: r.reason, detail };
  }
  const target = r.path;
  const alreadyDeclared = graph.edges.some((e) => e.from === replacementPath && e.to === target && e.source === "declared");
  if (!alreadyDeclared) {
    const out = new Map<string, string[]>();
    for (const e of graph.edges) (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e.to);
    const seen = new Set<string>([target]);
    const stack = [target];
    while (stack.length) {
      const v = stack.pop()!;
      if (v === replacementPath) return { ok: false, reason: "cycle", detail: "the chosen note already supersedes this note (directly or indirectly)" };
      for (const w of out.get(v) ?? []) if (!seen.has(w)) { seen.add(w); stack.push(w); }
    }
  }
  return { ok: true, target, link: asWikilink(targetLinkText), alreadyDeclared };
}
