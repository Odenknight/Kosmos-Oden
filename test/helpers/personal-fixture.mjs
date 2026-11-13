/**
 * In-memory Personal Notes fixture: a PersonalVaultSource, PersonalCorpus,
 * PersonalSearch and LineageBuilder that behave like the plugin's
 * implementations at the contract level, so the query service can be tested
 * without Obsidian.
 */
import { isKosmosOperationalPath } from "../../dist/kosmos-operational-paths.mjs";
import {
  PERSONAL_CONTRACT,
  PERSONAL_LIMITS,
  PersonalQueryService,
  PolicyGeneration,
  createPersonalReadPolicy,
  defaultPersonalNotesSettings,
  prepareDoc,
  indexDoc,
  LibrarianIndex,
  LIBRARIAN_LIMITS,
  runLibrarian,
} from "../../dist/kosmos-personal-notes.mjs";

export const RANK = Object.freeze({ public: 0, internal: 1, restricted: 2, confidential: 3, regulated: 4, phi: 5, secret: 6 });

const baseName = (path) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");

function defaultMeta(path) {
  return { title: baseName(path), aliases: [], tags: [], supersedes: [], supersededBy: [], links: [], attachments: [] };
}

/**
 * files: { [path]: string | { raw, meta?, symlinked?, omitted? } }
 * others: non-note files present in the vault (attachments).
 */
export function makeVault(files, { others = [] } = {}) {
  const notes = new Map();
  const set = (path, spec) => {
    const s = typeof spec === "string" ? { raw: spec } : spec;
    notes.set(path, { raw: s.raw, meta: { ...defaultMeta(path), ...(s.meta ?? {}) }, symlinked: !!s.symlinked, omitted: s.omitted, mtimeMs: s.mtimeMs ?? 1000 });
  };
  for (const [path, spec] of Object.entries(files)) set(path, spec);
  const otherFiles = new Set(others);
  const reads = [];
  /** Hook run inside readRaw before it resolves (to simulate edits/scope changes mid-request). */
  let onRead = null;

  const source = {
    listMarkdown: () => [...notes.keys()].sort().map((path) => source.stat(path)),
    stat(path) {
      const n = notes.get(path);
      return n ? { path, mtimeMs: n.mtimeMs, sizeBytes: new TextEncoder().encode(n.raw).length } : null;
    },
    async readRaw(path) {
      reads.push(path);
      const n = notes.get(path);
      if (!n) throw new Error("ENOENT");
      const raw = n.raw;
      if (onRead) await onRead(path);
      return raw;
    },
    meta: (path) => structuredClone(notes.get(path)?.meta ?? defaultMeta(path)),
    exists: (path) => notes.has(path) || otherFiles.has(path),
    resolveLink(linkText, fromPath) {
      if (notes.has(linkText)) return linkText;
      if (notes.has(`${linkText}.md`)) return `${linkText}.md`;
      const byName = [...notes.keys()].filter((p) => baseName(p) === linkText);
      if (byName.length > 1) return "ambiguous";
      return byName[0] ?? null;
    },
    physicallyContained: (path) => !notes.get(path)?.symlinked,
  };

  let revision = 1;
  const corpus = {
    get revision() { return revision; },
    state: "ready",
    get(path) {
      const n = notes.get(path);
      if (!n || n.omitted) return undefined;
      return { ...source.stat(path), raw: n.raw, meta: structuredClone(n.meta) };
    },
    paths: () => [...notes.keys()].filter((p) => !notes.get(p).omitted).sort(),
    omitted: () => [...notes.keys()].filter((p) => notes.get(p).omitted).sort().map((path) => ({ path, reason: notes.get(path).omitted })),
    pathsByUid: (uid) => corpus.paths().filter((p) => notes.get(p).meta.uid === uid),
  };

  /** Lexical stand-in honoring the contract: filter by allowedPaths before matching or counting. */
  const examined = [];
  const search = {
    async search(req) {
      const terms = req.query.toLowerCase().split(/\s+/).filter(Boolean);
      let hits = [];
      for (const path of corpus.paths()) {
        if (req.allowedPaths && !req.allowedPaths.has(path)) continue;
        examined.push(path);
        const n = corpus.get(path);
        const text = `${n.meta.title}\n${path}\n${n.raw}`.toLowerCase();
        if (req.tag && !n.meta.tags.some((t) => t.toLowerCase() === req.tag.toLowerCase())) continue;
        if (terms.every((t) => text.includes(t))) {
          hits.push({ path, title: n.meta.title, score: 1, matchedIn: ["body"], excerpt: n.raw.slice(0, 40), ...(n.meta.uid ? { uid: n.meta.uid } : {}) });
        }
      }
      const omitted = corpus.omitted().filter((o) => !req.allowedPaths || req.allowedPaths.has(o.path)).length;
      const total = hits.length;
      hits = hits.slice(0, req.limit ?? PERSONAL_LIMITS.defaultResults);
      return { contract: PERSONAL_CONTRACT, terms, total, hits, coverage: { state: corpus.state, searched: examined.length, omitted }, corpusRevision: revision };
    },
  };

  /**
   * The real Librarian over the fixture corpus: same module, same ranking.
   * Vectors are rebuilt when the fixture's revision moves (it is tiny).
   */
  const librarianIndex = new LibrarianIndex();
  const librarianEntries = new Map();
  let librarianRevision = -1;
  const rebuildLibrarian = () => {
    librarianIndex.clear();
    librarianEntries.clear();
    for (const path of corpus.paths()) {
      const note = corpus.get(path);
      if (!note) continue;
      const prepared = prepareDoc({ path, title: note.meta.title, aliases: note.meta.aliases, tags: note.meta.tags, raw: note.raw, ...(note.meta.uid ? { uid: note.meta.uid } : {}) });
      const vector = indexDoc(prepared, librarianIndex.vocab);
      librarianEntries.set(path, { prepared, vector });
      librarianIndex.add(vector);
    }
    librarianRevision = revision;
  };
  const librarian = {
    async librarian(req) {
      if (librarianRevision !== revision) rebuildLibrarian();
      const pool = [...librarianEntries.values()].filter((e) => !req.allowedPaths || req.allowedPaths.has(e.prepared.doc.path));
      const body = runLibrarian(req.question, pool, librarianIndex, { limit: req.limit ?? LIBRARIAN_LIMITS.defaultResults });
      const omitted = corpus.omitted().filter((o) => !req.allowedPaths || req.allowedPaths.has(o.path)).length;
      return { ...body, coverage: { state: corpus.state, searched: pool.length, omitted }, corpusRevision: revision };
    },
  };

  return {
    source, corpus, search, librarian, reads, examined,
    write(path, raw, meta) { set(path, { raw, meta: meta ?? notes.get(path)?.meta }); revision++; },
    remove(path) { notes.delete(path); revision++; },
    set onRead(fn) { onRead = fn; },
  };
}

/** Straightforward LineageBuilder used only to drive the service; resolves through the supplied callback. */
export function simpleLineage(notes, resolve, { focus }) {
  const nodes = notes.map((n) => ({ path: n.path, uid: n.uid, updatedAt: n.updatedAt, supersedes: [], supersededBy: [] }));
  const byPath = new Map(nodes.map((n) => [n.path, n]));
  const edges = [];
  const unresolved = [];
  for (const n of notes) {
    for (const declared of n.supersedes) {
      const target = resolve(declared, n.path);
      if (target === null || target === "ambiguous") { unresolved.push({ from: n.path, declared, reason: target === null ? "unresolved" : "ambiguous" }); continue; }
      edges.push({ from: n.path, to: target, source: "declared" });
      byPath.get(n.path).supersedes.push(target);
      byPath.get(target).supersededBy.push(n.path);
    }
  }
  const linked = new Set([focus, ...edges.flatMap((e) => [e.from, e.to])]);
  const kept = nodes.filter((n) => linked.has(n.path));
  return {
    nodes: kept, edges, heads: kept.filter((n) => n.supersededBy.length === 0).map((n) => n.path),
    unresolved: unresolved.filter((u) => linked.has(u.from)), cycles: [], contradictions: [], truncated: false, nextCursor: null,
  };
}

/** Service over a fixture vault with a mutable Personal policy. */
export function makeService(vault, settingsOverrides = {}, { ceiling = "internal", lineage = simpleLineage } = {}) {
  const generation = new PolicyGeneration();
  let settings = { ...defaultPersonalNotesSettings(), includeFolders: ["/"], ...settingsOverrides };
  let policy;
  const rebuild = () => { policy = createPersonalReadPolicy({ settings, generation: generation.current, configDir: ".obsidian", isOperationalPath: isKosmosOperationalPath }); };
  rebuild();
  const diagnostics = [];
  const service = new PersonalQueryService({
    source: vault.source,
    corpus: vault.corpus,
    search: vault.search,
    librarian: vault.librarian,
    policy: () => policy,
    sensitivityRank: RANK,
    ceiling: () => ceiling,
    lineage,
    protocols: () => ({ mcp: { "streamable-http": ["2026-07-28", "2025-11-25"] }, rest: ["/overview", "/notes", "/note", "/related", "/lineage"] }),
    onDiagnostic: (m) => diagnostics.push(m),
  });
  return {
    service, diagnostics,
    /** Change the shared selection the way the plugin does: bump, then rebuild. */
    setScope(next) { settings = { ...settings, ...next }; generation.bump(); rebuild(); },
  };
}
