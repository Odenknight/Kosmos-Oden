// src/core/version.ts
var KOSMOS_VERSION = "0.5.5";
var KOSMOS_NAME = "kosmos-oden";

// src/core/paths.ts
var toPosixPath = (s) => s.replace(/\\/g, "/").replace(/\/+/g, "/");
var normalizeVaultRelative = (s) => toPosixPath(s).replace(/^\/+/, "").replace(/^\.\//, "");
function areaFromPath(p) {
  const n = normalizeVaultRelative(p);
  if (!n || n === ".") return "Vault";
  return n.split("/")[0] || "Vault";
}
function areaFromFilePath(p) {
  const n = normalizeVaultRelative(p);
  if (!n || n === ".") return "Vault";
  return n.includes("/") ? areaFromPath(n) : "Root";
}
function extensionFromPath(p) {
  const m = /\.([^./\\]+)$/.exec(p);
  return m ? m[1].toLowerCase() : void 0;
}
function withoutExtension(p) {
  const n = normalizeVaultRelative(p);
  const m = /\.[^./]+$/.exec(n);
  return m ? n.slice(0, -m[0].length) : n;
}
function basenameWithoutExtension(p) {
  const n = withoutExtension(p);
  const i = n.lastIndexOf("/");
  return i >= 0 ? n.slice(i + 1) : n;
}
function vaultDepth(p) {
  const n = normalizeVaultRelative(p);
  if (!n || n === ".") return 0;
  return n.split("/").filter(Boolean).length;
}
var DEFAULT_IGNORED_DIRS = [".obsidian", ".git", "node_modules", ".trash"];
function shouldIgnoreVaultPath(p, ignoredDirs = DEFAULT_IGNORED_DIRS) {
  const n = normalizeVaultRelative(p);
  if (n.endsWith(".DS_Store")) return true;
  for (const dir of ignoredDirs) {
    if (n === dir || n.startsWith(dir + "/") || n.includes("/" + dir + "/")) return true;
  }
  return false;
}
var posixDirname = (p) => {
  const n = normalizeVaultRelative(p);
  const i = n.lastIndexOf("/");
  return i <= 0 ? i === 0 ? "/" : "." : n.slice(0, i);
};
var posixBasename = (p) => {
  const n = normalizeVaultRelative(p);
  const i = n.lastIndexOf("/");
  return i >= 0 ? n.slice(i + 1) : n;
};
var posixJoin = (a, b) => normalizeVaultRelative(`${a}/${b}`);
var ATTACHMENT_EXTENSIONS = /* @__PURE__ */ new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "avif",
  "svg",
  "tif",
  "tiff",
  "pdf",
  "mp4",
  "mov",
  "webm",
  "mkv",
  "avi",
  "m4v",
  "mp3",
  "wav",
  "ogg",
  "m4a",
  "flac",
  "aac",
  "zip",
  "rar",
  "7z",
  "gz",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "tsv",
  "json",
  "canvas",
  "excalidraw",
  "psd",
  "ai",
  "fig",
  "heic"
]);
var NOTE_EXTENSIONS = /* @__PURE__ */ new Set(["md", "markdown"]);
function isNotePath(p) {
  const ext = extensionFromPath(p);
  return !!ext && NOTE_EXTENSIONS.has(ext);
}
function isAttachmentPath(p) {
  const ext = extensionFromPath(p);
  return !!ext && ext !== "md" && ext !== "markdown" && ATTACHMENT_EXTENSIONS.has(ext);
}
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function hashUnit(v) {
  return hashString(v) / 4294967295;
}
function contentHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + ":" + s.length.toString(36);
}

// src/core/colors.ts
var preferredAreaPalette = /* @__PURE__ */ new Map([
  ["00_System", "#65a7ff"],
  ["01_Dashboard", "#f4d35e"],
  ["10_Inbox", "#ff6b6b"],
  ["20_Wissen", "#b38cff"],
  ["30_Quellen", "#2dd4bf"],
  ["40_Projekte", "#60d394"],
  ["50_Codex", "#ff8bd1"],
  ["51_Claude", "#f9a03f"],
  ["52_ChatGPT", "#7dd3fc"],
  ["60_Organisation", "#a3e635"],
  ["70_Outputs", "#fb7185"],
  ["90_Archiv", "#94a3b8"],
  ["Vault", "#f8fafc"],
  ["Root", "#dbeafe"],
  ["Unresolved", "#ffb86b"]
]);
var generatedAreaPalette = [
  "#65a7ff",
  "#f4d35e",
  "#ff6b6b",
  "#b38cff",
  "#2dd4bf",
  "#60d394",
  "#ff8bd1",
  "#f9a03f",
  "#7dd3fc",
  "#a3e635",
  "#fb7185",
  "#c084fc",
  "#38bdf8",
  "#34d399",
  "#facc15",
  "#818cf8",
  "#fb923c",
  "#22d3ee"
];
function colorForArea(area) {
  const pref = preferredAreaPalette.get(area);
  if (pref) return pref;
  const h = hashString(area || "Vault");
  const base = generatedAreaPalette[h % generatedAreaPalette.length];
  const rot = Math.floor(h / generatedAreaPalette.length) % 7;
  return rotateHex(base, (rot - 3) * 6);
}
function rotateHex(hex, deg) {
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToHex((h + deg + 360) % 360, s, l);
}
function rgbToHsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(h / 60 % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((ch) => Math.round((ch + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

// src/core/markdown.ts
var unquote = (s) => s.replace(/^['"]/, "").replace(/['"]$/, "");
function parseFrontmatter(raw) {
  if (raw.charCodeAt(0) === 65279) raw = raw.slice(1);
  if (!raw.startsWith("---")) return { data: {}, content: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { data: {}, content: raw };
  const header = raw.slice(3, end).replace(/^\r?\n/, "");
  const content = raw.slice(end + 4).replace(/^\r?\n/, "");
  const data = {};
  try {
    const lines = header.split(/\r?\n/).map((l) => l.replace(/\r$/, ""));
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const m = /^([A-Za-z0-9_-]+):\s?(.*)$/.exec(line);
      if (!m) continue;
      const key = m[1];
      const rest = m[2].replace(/\s+#.*$/, "").trim();
      if (rest === "" || rest === "|" || rest === ">") {
        const items = [];
        let j = i + 1;
        while (j < lines.length) {
          const ln = lines[j];
          const li = /^\s*-\s+(.*)$/.exec(ln);
          if (li) {
            items.push(unquote(li[1].trim()));
            j++;
            continue;
          }
          if (/^\s+\S/.test(ln) && rest !== "") {
            items.push(ln.trim());
            j++;
            continue;
          }
          break;
        }
        data[key] = items.length ? items : "";
        i = j - 1;
      } else if (rest.startsWith("[") && rest.endsWith("]")) {
        data[key] = rest.slice(1, -1).split(",").map((s) => unquote(s.trim())).filter(Boolean);
      } else {
        data[key] = unquote(rest);
      }
    }
  } catch {
    return { data: {}, content: raw };
  }
  return { data, content };
}
var RELATION_PROPERTIES = ["related", "depends_on", "blocks", "initiative", "project", "repo", "source"];
var isExternal = (t) => /^(https?:|file:|mailto:|tel:|obsidian:|data:|#)/i.test(t);
var looksLikeLocalRef = (v) => {
  const t = v.trim();
  return Boolean(t) && !isExternal(t) && t.length < 180;
};
function parseWikiLinks(md) {
  const out = [];
  const re = /!?\[\[([^\]]+)\]\]/g;
  let m;
  while (m = re.exec(md)) {
    const inner = m[1].trim();
    const [targetPart, aliasPart] = inner.split("|");
    const [target, heading] = targetPart.split("#");
    const clean = target.trim();
    if (!clean) continue;
    out.push({ kind: "wikilink", target: clean, raw: m[0], alias: aliasPart?.trim(), heading: heading?.trim() });
  }
  return out;
}
function parseMarkdownLinks(md) {
  const out = [];
  const re = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;
  let m;
  while (m = re.exec(md)) {
    const rawT = m[1].trim();
    if (!rawT || isExternal(rawT)) continue;
    const [target, heading] = rawT.split("#");
    let clean;
    try {
      clean = decodeURIComponent(target.trim()).replace(/^<|>$/g, "");
    } catch {
      clean = target.trim().replace(/^<|>$/g, "");
    }
    if (!clean) continue;
    out.push({ kind: "markdown", target: clean, raw: m[0], heading: heading?.trim() });
  }
  return out;
}
function collectStringValues(v) {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(collectStringValues);
  if (v && typeof v === "object") return Object.values(v).flatMap(collectStringValues);
  return [];
}
function normalizeStringList(v) {
  return collectStringValues(v).flatMap((i) => i.split(",")).map((i) => i.trim()).filter(Boolean);
}
function normalizeTags(v) {
  return normalizeStringList(v).map((t) => t.replace(/^#/, ""));
}
function extractPropertyLinks(data) {
  const out = [];
  for (const key of RELATION_PROPERTIES) {
    for (const cand of collectStringValues(data[key])) {
      const wiki = parseWikiLinks(cand).map((l) => ({ ...l, kind: "property" }));
      if (wiki.length) out.push(...wiki);
      else if (looksLikeLocalRef(cand)) out.push({ kind: "property", target: cand, raw: cand });
    }
  }
  return out;
}
function parseMarkdownFile(raw) {
  const { data, content } = parseFrontmatter(raw);
  const links = [...parseWikiLinks(content), ...parseMarkdownLinks(content), ...extractPropertyLinks(data)];
  return { data, content, links, tags: normalizeTags(data.tags), aliases: normalizeStringList(data.aliases) };
}

// src/core/okf.ts
function parseOkfPlus(data, content) {
  const related = [];
  const m = content.match(/^\s*\*\*Related:?\*\*\s*(.+)$/mi);
  if (m) for (const w of parseWikiLinks(m[1])) related.push(w.target);
  const has = data.type != null || data.timestamp != null || data.supersedes != null || data.superseded_by != null || data.supersededBy != null || data.resource != null || related.length > 0;
  if (!has) return null;
  return {
    type: typeof data.type === "string" ? data.type : void 0,
    title: typeof data.title === "string" ? data.title : void 0,
    timestamp: typeof data.timestamp === "string" ? data.timestamp : void 0,
    resource: typeof data.resource === "string" ? data.resource : void 0,
    supersedes: normalizeStringList(data.supersedes),
    supersededBy: normalizeStringList(
      data.superseded_by ?? data.supersededBy
    ),
    related
  };
}
function parseOkfTimestamp(okf) {
  if (!okf || typeof okf.timestamp !== "string") return null;
  const t = Date.parse(okf.timestamp);
  return Number.isNaN(t) ? null : t;
}

// src/core/resolver.ts
function createResolver() {
  return {
    byPath: /* @__PURE__ */ new Map(),
    byPathNoExt: /* @__PURE__ */ new Map(),
    byBasename: /* @__PURE__ */ new Map(),
    byAlias: /* @__PURE__ */ new Map(),
    ambiguous: /* @__PURE__ */ new Set()
  };
}
function pushMulti(map, key, val) {
  const cur = map.get(key) ?? [];
  cur.push(val);
  map.set(key, cur);
}
function addFileToResolver(idx, relPath, nodeId, aliases = []) {
  const n = normalizeVaultRelative(relPath);
  idx.byPath.set(n.toLowerCase(), nodeId);
  idx.byPathNoExt.set(withoutExtension(n).toLowerCase(), nodeId);
  pushMulti(idx.byBasename, basenameWithoutExtension(n).toLowerCase(), nodeId);
  for (const a of aliases) pushMulti(idx.byAlias, a.trim().toLowerCase(), nodeId);
}
function cleanTarget(t) {
  return normalizeVaultRelative(
    toPosixPath(t).replace(/^<|>$/g, "").split("#")[0].split("|")[0].trim()
  );
}
var unresolvedId = (t) => `unresolved:${cleanTarget(t).toLowerCase()}`;
function pickCandidate(idx, key, c) {
  if (!c || !c.length) return void 0;
  const uniq2 = [...new Set(c)];
  if (uniq2.length > 1) idx.ambiguous.add(key);
  return uniq2.sort()[0];
}
function resolveLinkTarget(idx, sourcePath, target) {
  const nt = cleanTarget(target);
  if (!nt) return void 0;
  const direct = nt.toLowerCase();
  const dir = posixDirname(normalizeVaultRelative(sourcePath));
  const rel = dir && dir !== "." ? posixJoin(dir, nt).toLowerCase() : direct;
  const base = posixBasename(withoutExtension(direct));
  return idx.byPath.get(direct) ?? idx.byPath.get(rel) ?? idx.byPathNoExt.get(direct) ?? idx.byPathNoExt.get(rel) ?? pickCandidate(idx, direct, idx.byAlias.get(direct)) ?? pickCandidate(idx, base, idx.byBasename.get(base));
}
function resolveTitleRef(idx, ref) {
  const k = String(ref || "").trim().toLowerCase();
  if (!k) return { ambiguous: false };
  const direct = idx.byPath.get(k) ?? idx.byPathNoExt.get(k);
  if (direct) return { id: direct, ambiguous: false };
  const byBase = idx.byBasename.get(k);
  if (byBase && byBase.length) {
    const uniq2 = [...new Set(byBase)];
    return { id: uniq2.sort()[0], ambiguous: uniq2.length > 1 };
  }
  const byAlias = idx.byAlias.get(k);
  if (byAlias && byAlias.length) {
    const uniq2 = [...new Set(byAlias)];
    return { id: uniq2.sort()[0], ambiguous: uniq2.length > 1 };
  }
  return { ambiguous: false };
}

// src/core/lineage.ts
function normalizeLineage(inputs, resolveRef) {
  const warnings = [];
  const edgeKeys = /* @__PURE__ */ new Set();
  const edges = [];
  const byId = new Map(inputs.map((n) => [n.id, n]));
  const addEdge = (newer, older, declaredBy, field) => {
    if (newer === older) {
      warnings.push({
        code: "self-supersession",
        nodeId: declaredBy.id,
        message: `"${declaredBy.label}" declares itself in ${field}; ignored`
      });
      return;
    }
    const key = `${newer}${older}`;
    if (edgeKeys.has(key)) {
      return;
    }
    edgeKeys.add(key);
    edges.push({ newer, older });
  };
  for (const n of inputs) {
    const seenHere = /* @__PURE__ */ new Set();
    for (const ref of n.declaredSupersedes) {
      const r = resolveRef(ref);
      if (r.ambiguous) {
        warnings.push({
          code: "ambiguous-resolution",
          nodeId: n.id,
          message: `"${n.label}" supersedes "${ref}" which matches multiple notes; using deterministic first match`
        });
      }
      if (!r.id) {
        warnings.push({
          code: "unresolved-target",
          nodeId: n.id,
          message: `"${n.label}" supersedes "${ref}" which does not resolve to a note`
        });
        continue;
      }
      const dupKey = `s${r.id}`;
      if (seenHere.has(dupKey)) {
        warnings.push({
          code: "duplicate-declaration",
          nodeId: n.id,
          message: `"${n.label}" declares supersedes "${ref}" more than once`
        });
      }
      seenHere.add(dupKey);
      addEdge(n.id, r.id, n, "supersedes");
    }
    for (const ref of n.declaredSupersededBy) {
      const r = resolveRef(ref);
      if (r.ambiguous) {
        warnings.push({
          code: "ambiguous-resolution",
          nodeId: n.id,
          message: `"${n.label}" superseded_by "${ref}" matches multiple notes; using deterministic first match`
        });
      }
      if (!r.id) {
        warnings.push({
          code: "unresolved-target",
          nodeId: n.id,
          message: `"${n.label}" superseded_by "${ref}" does not resolve to a note`
        });
        continue;
      }
      const dupKey = `b${r.id}`;
      if (seenHere.has(dupKey)) {
        warnings.push({
          code: "duplicate-declaration",
          nodeId: n.id,
          message: `"${n.label}" declares superseded_by "${ref}" more than once`
        });
      }
      seenHere.add(dupKey);
      addEdge(r.id, n.id, n, "superseded_by");
    }
  }
  const adj = /* @__PURE__ */ new Map();
  for (const e of edges) {
    const a = adj.get(e.newer) ?? [];
    a.push(e.older);
    adj.set(e.newer, a);
  }
  const state = /* @__PURE__ */ new Map();
  const cyclic = /* @__PURE__ */ new Set();
  let cycles = 0;
  for (const start of adj.keys()) {
    if (state.get(start)) continue;
    const stack = [{ id: start, i: 0 }];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const next = (adj.get(top.id) ?? [])[top.i++];
      if (next === void 0) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      const st = state.get(next) ?? 0;
      if (st === 0) {
        state.set(next, 1);
        stack.push({ id: next, i: 0 });
      } else if (st === 1) {
        cycles++;
        cyclic.add(next);
        cyclic.add(top.id);
        const name = byId.get(next)?.label ?? next;
        warnings.push({
          code: "cycle",
          nodeId: next,
          message: `lineage cycle detected through "${name}"`
        });
      }
    }
  }
  const supersedes = /* @__PURE__ */ new Map();
  const supersededBy = /* @__PURE__ */ new Map();
  const members = /* @__PURE__ */ new Set();
  for (const e of edges) {
    members.add(e.newer);
    members.add(e.older);
    const s = supersedes.get(e.newer) ?? [];
    s.push(e.older);
    supersedes.set(e.newer, s);
    const b = supersededBy.get(e.older) ?? [];
    b.push(e.newer);
    supersededBy.set(e.older, b);
  }
  for (const [older, newers] of supersededBy) {
    if (newers.length > 1) {
      const name = byId.get(older)?.label ?? older;
      warnings.push({
        code: "multiple-successors",
        nodeId: older,
        message: `"${name}" has ${newers.length} direct successors; invalid_at uses the earliest`
      });
    }
    const on = byId.get(older);
    if (!on || on.validAtMs == null) continue;
    for (const newer of newers) {
      const nn = byId.get(newer);
      if (nn && nn.validAtMs != null && nn.validAtMs < on.validAtMs) {
        warnings.push({
          code: "successor-before-predecessor",
          nodeId: newer,
          message: `"${nn.label}" supersedes "${on.label}" but carries an earlier timestamp`
        });
      }
    }
  }
  return { edges, supersedes, supersededBy, warnings, members, cycles };
}

// src/core/temporal.ts
function computeTemporalState(notes, lineage) {
  const validAt = new Map(notes.map((n) => [n.id, n.validAtMs]));
  const invalidAt = /* @__PURE__ */ new Map();
  const head = /* @__PURE__ */ new Map();
  let tmin = Infinity;
  let tmax = -Infinity;
  for (const n of notes) {
    const successors = lineage.supersededBy.get(n.id) ?? [];
    let inv = null;
    for (const s of successors) {
      const sv = validAt.get(s);
      if (sv != null && (inv == null || sv < inv)) inv = sv;
    }
    invalidAt.set(n.id, inv);
    head.set(n.id, lineage.members.has(n.id) && successors.length === 0);
    if (n.validAtMs < tmin) tmin = n.validAtMs;
    const hi = inv ?? n.validAtMs;
    if (hi > tmax) tmax = hi;
  }
  return {
    invalidAt,
    head,
    timeSpan: tmin < tmax ? { min: tmin, max: tmax } : null
  };
}
function projectAtTime(notes, atMs) {
  const notYetCreated = [];
  const valid = [];
  const superseded = [];
  for (const n of notes) {
    if (n.validAtMs > atMs) {
      notYetCreated.push(n.id);
    } else if (n.invalidAtMs != null && n.invalidAtMs <= atMs) {
      superseded.push(n.id);
    } else {
      valid.push(n.id);
    }
  }
  return { at: new Date(atMs).toISOString(), notYetCreated, valid, superseded };
}
function resolveValidAt(okfTimestampMs, createdTimeMs, modifiedTimeMs, nowMs) {
  if (okfTimestampMs != null) return okfTimestampMs;
  if (createdTimeMs != null && Number.isFinite(createdTimeMs)) return createdTimeMs;
  if (modifiedTimeMs != null && Number.isFinite(modifiedTimeMs)) return modifiedTimeMs;
  return nowMs;
}

// src/core/graph.ts
var fileNodeId = (rel) => `file:${normalizeVaultRelative(rel)}`;
var folderNodeId = (rel) => {
  const n = normalizeVaultRelative(rel);
  return n ? `folder:${n}` : "folder:.";
};
var PARSEABLE = /* @__PURE__ */ new Set(["md", "markdown", "base"]);
function parseSourceFile(f) {
  const ext = f.extension?.toLowerCase() ?? extensionFromPath(f.relativePath);
  const content = f.content ?? "";
  const parseable = !!ext && PARSEABLE.has(ext);
  const parsed = parseable ? parseMarkdownFile(content) : { data: {}, content: "", links: [], tags: [], aliases: [] };
  return {
    relativePath: normalizeVaultRelative(f.relativePath),
    ext,
    size: Number(f.size ?? content.length ?? 0),
    mtimeMs: f.modifiedTime,
    btimeMs: f.createdTime,
    firstSeenMs: Date.now(),
    hash: contentHash(content),
    parsed,
    okf: parseable ? parseOkfPlus(parsed.data, parsed.content) : null
  };
}
var asStr = (v) => typeof v === "string" ? v : void 0;
var uniq = (a) => [...new Set(a)].sort((x, y) => x.localeCompare(y));
function addFolder(nodes, rel, areaOverride) {
  const n = normalizeVaultRelative(rel);
  const id = folderNodeId(n);
  const area = areaOverride ?? areaFromPath(n);
  nodes.set(id, {
    id,
    kind: "folder",
    path: n,
    label: n ? posixBasename(n) : "Vault",
    area,
    depth: vaultDepth(n),
    tags: [],
    aliases: [],
    color: colorForArea(area),
    outgoing: 0,
    incoming: 0
  });
}
function makeFileNode(rec, now) {
  const area = areaFromFilePath(rec.relativePath);
  const ext = rec.ext;
  const label = posixBasename(ext ? rec.relativePath.slice(0, -(ext.length + 1)) : rec.relativePath);
  const okfTs = parseOkfTimestamp(rec.okf);
  const stableNow = rec.firstSeenMs ?? now;
  const validAtMs = resolveValidAt(okfTs, rec.btimeMs, rec.mtimeMs, stableNow);
  return {
    id: fileNodeId(rec.relativePath),
    kind: "file",
    path: rec.relativePath,
    label,
    area,
    depth: vaultDepth(rec.relativePath),
    extension: ext,
    size: rec.size,
    updatedAt: new Date(rec.mtimeMs ?? stableNow).toISOString(),
    createdAt: new Date(rec.btimeMs ?? rec.mtimeMs ?? stableNow).toISOString(),
    okf: rec.okf ? { ...rec.okf } : null,
    validAt: new Date(validAtMs).toISOString(),
    type: asStr(rec.parsed.data.type),
    status: asStr(rec.parsed.data.status),
    priority: asStr(rec.parsed.data.priority),
    tags: rec.parsed.tags,
    aliases: rec.parsed.aliases,
    color: colorForArea(area),
    outgoing: 0,
    incoming: 0
  };
}
function makeUnresolved(target) {
  const label = target.split("/").at(-1) ?? target;
  return {
    id: unresolvedId(target),
    kind: "unresolved",
    path: target,
    label,
    area: "Unresolved",
    depth: 1,
    tags: [],
    aliases: [],
    color: colorForArea("Unresolved"),
    outgoing: 0,
    incoming: 0,
    unresolved: true
  };
}
function parentOf(rel) {
  const p = posixDirname(normalizeVaultRelative(rel));
  return p === "." ? "" : p;
}
function childrenByParent(folders, records) {
  const map = /* @__PURE__ */ new Map();
  const add = (parent, id) => {
    const arr = map.get(parent);
    if (arr) arr.push(id);
    else map.set(parent, [id]);
  };
  for (const f of folders) add(parentOf(f), folderNodeId(f));
  for (const r of records) add(parentOf(r.relativePath), fileNodeId(r.relativePath));
  return map;
}
function applyCounts(nodes, links) {
  for (const l of links) {
    if (l.kind === "contains") continue;
    const s = nodes.get(l.source);
    const t = nodes.get(l.target);
    if (s) s.outgoing++;
    if (t) t.incoming++;
  }
}
function assembleGraph(records, folders, opts = {}) {
  const t0 = Date.now();
  const now = opts.now ?? t0;
  const nodes = /* @__PURE__ */ new Map();
  const links = [];
  const resolver = createResolver();
  addFolder(nodes, "", "Vault");
  for (const f of folders) addFolder(nodes, f);
  for (const rec of records) {
    const node = makeFileNode(rec, now);
    nodes.set(node.id, node);
    addFileToResolver(resolver, rec.relativePath, node.id, rec.parsed.aliases);
  }
  const children = childrenByParent(folders, records);
  for (const folder of ["", ...folders]) {
    const fid = folderNodeId(folder);
    for (const child of children.get(normalizeVaultRelative(folder)) ?? []) {
      links.push({ id: `contains:${fid}->${child}`, source: fid, target: child, kind: "contains" });
    }
  }
  for (const rec of records) {
    const sourceId = fileNodeId(rec.relativePath);
    for (const pl of rec.parsed.links) {
      const resolved = resolveLinkTarget(resolver, rec.relativePath, pl.target);
      const targetId = resolved ?? unresolvedId(pl.target);
      if (!resolved && !nodes.has(targetId)) nodes.set(targetId, makeUnresolved(pl.target));
      if (sourceId === targetId) continue;
      links.push({
        id: `${pl.kind}:${sourceId}->${targetId}:${links.length}`,
        source: sourceId,
        target: targetId,
        kind: pl.kind,
        label: pl.alias ?? pl.heading,
        sourcePath: rec.relativePath
      });
    }
  }
  const lineageInputs = [];
  for (const rec of records) {
    if (!rec.okf) continue;
    const id = fileNodeId(rec.relativePath);
    const node = nodes.get(id);
    if (!node) continue;
    lineageInputs.push({
      id,
      label: node.label,
      declaredSupersedes: rec.okf.supersedes,
      declaredSupersededBy: rec.okf.supersededBy,
      validAtMs: node.validAt ? Date.parse(node.validAt) : null
    });
  }
  const lineage = normalizeLineage(lineageInputs, (ref) => resolveTitleRef(resolver, ref));
  for (const e of lineage.edges) {
    links.push({
      id: `lineage:${e.older}->${e.newer}:${links.length}`,
      source: e.older,
      target: e.newer,
      kind: "lineage"
    });
  }
  const temporalInputs = lineageInputs.filter((li) => li.validAtMs != null).map((li) => ({ id: li.id, validAtMs: li.validAtMs }));
  const temporal = computeTemporalState(temporalInputs, lineage);
  for (const rec of records) {
    const id = fileNodeId(rec.relativePath);
    const node = nodes.get(id);
    if (!node || !node.okf) continue;
    node.okf.supersedesIds = lineage.supersedes.get(id) ?? [];
    node.okf.supersededByIds = lineage.supersededBy.get(id) ?? [];
    const inv = temporal.invalidAt.get(id) ?? null;
    node.okf.invalidAt = inv != null ? new Date(inv).toISOString() : null;
    node.okf.head = temporal.head.get(id) ?? false;
  }
  const linksBySource = /* @__PURE__ */ new Map();
  for (const l of links) {
    if (l.kind !== "wikilink") continue;
    const arr = linksBySource.get(l.source);
    if (arr) arr.push(l);
    else linksBySource.set(l.source, [l]);
  }
  for (const rec of records) {
    if (!rec.okf || !rec.okf.related.length) continue;
    const id = fileNodeId(rec.relativePath);
    const relIds = new Set(
      rec.okf.related.map((t) => resolveLinkTarget(resolver, rec.relativePath, t) ?? unresolvedId(t))
    );
    for (const l of linksBySource.get(id) ?? []) {
      if (relIds.has(l.target) && l.kind === "wikilink") {
        l.kind = "semantic";
        relIds.delete(l.target);
      }
    }
  }
  applyCounts(nodes, links);
  const list = [...nodes.values()].sort((a, b) => a.path.localeCompare(b.path));
  const linkedIds = /* @__PURE__ */ new Set();
  let wikilinks = 0, markdownLinks = 0, propertyLinks = 0;
  for (const l of links) {
    if (l.kind === "contains") continue;
    linkedIds.add(l.source);
    linkedIds.add(l.target);
    if (l.kind === "wikilink") wikilinks++;
    else if (l.kind === "markdown") markdownLinks++;
    else if (l.kind === "property") propertyLinks++;
  }
  const durationMs = Date.now() - t0;
  const diagnostics = {
    notes: records.length,
    folders: folders.length + 1,
    attachments: 0,
    // filled by callers that track attachment paths
    unresolvedLinks: list.filter((n) => n.kind === "unresolved").length,
    ambiguousLinks: resolver.ambiguous.size,
    lineageEdges: lineage.edges.length,
    lineageCycles: lineage.cycles,
    lineageWarnings: lineage.warnings.map((w) => `[${w.code}] ${w.message}`),
    residualCollisions: 0,
    // filled by the layout pass (§12)
    lastFullBuildMs: durationMs
  };
  opts.onDiagnostics?.(diagnostics);
  return {
    nodes: list,
    links,
    stats: {
      indexedAt: new Date(now).toISOString(),
      durationMs,
      files: records.length,
      folders: folders.length + 1,
      unresolved: diagnostics.unresolvedLinks,
      links: links.length,
      wikilinks,
      markdownLinks,
      propertyLinks,
      orphans: list.filter((n) => n.kind === "file" && !linkedIds.has(n.id)).length
    },
    areas: uniq(list.map((n) => n.area)),
    tags: uniq(list.flatMap((n) => n.tags)),
    statuses: uniq(list.map((n) => n.status).filter(Boolean)),
    types: uniq(list.map((n) => n.type).filter(Boolean)),
    diagnostics
  };
}
function buildGraph(files, folders, now) {
  const records = files.map(parseSourceFile);
  return assembleGraph(records, folders, { now });
}

// src/core/graphiti.ts
var slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vault";
function buildGraphitiEpisodes(graph, opts = {}) {
  const vault = opts.vault || "vault";
  const groupId = opts.groupId || slug(vault);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const label = (id) => byId.get(id)?.label ?? id;
  const out = [];
  for (const n of graph.nodes) {
    if (n.kind !== "file") continue;
    const okf = n.okf;
    const title = okf?.title || n.label;
    const ts = n.validAt ?? n.createdAt ?? (/* @__PURE__ */ new Date()).toISOString();
    const semantic = graph.links.filter((l) => l.kind === "semantic" && l.source === n.id).map((l) => label(l.target));
    out.push({
      name: title,
      episode_body: JSON.stringify({
        title,
        path: n.path,
        type: okf?.type || n.type || "note",
        tags: n.tags,
        timestamp: ts,
        // Canonical lineage projections (§13.1) — resolved note titles.
        supersedes: (okf?.supersedesIds ?? []).map(label),
        superseded_by: (okf?.supersededByIds ?? []).map(label),
        related: okf?.related ?? semantic,
        head: okf?.head ?? false,
        invalid_at: okf?.invalidAt ?? null,
        // Raw authored declarations, preserved verbatim.
        source_okf: {
          declared_supersedes: okf?.supersedes ?? [],
          declared_superseded_by: okf?.supersededBy ?? []
        },
        content: n.kind === "file" ? n.content ?? void 0 : void 0
      }),
      source: "json",
      source_description: `OKF+ note \xB7 vault "${vault}" \xB7 ${n.path}`,
      reference_time: ts,
      group_id: groupId
    });
  }
  out.sort((a, b) => a.reference_time.localeCompare(b.reference_time));
  return out;
}
function buildGraphitiEpisodesWithContent(graph, contents, opts = {}) {
  const episodes = buildGraphitiEpisodes(graph, opts);
  for (const e of episodes) {
    try {
      const body = JSON.parse(e.episode_body);
      const c = contents.get(body.path);
      if (c != null) {
        body.content = c;
        e.episode_body = JSON.stringify(body);
      }
    } catch {
    }
  }
  return episodes;
}
function stripFrontmatter(raw) {
  return raw.replace(/^---[\s\S]*?---\s*/, "");
}

// src/core/incremental.ts
var STRUCTURAL_REBUILD_MIN = 500;
var STRUCTURAL_REBUILD_FRACTION = 0.25;
function signatureOf(graph) {
  const nodes = /* @__PURE__ */ new Set();
  for (const n of graph.nodes) nodes.add(n.id);
  const links = /* @__PURE__ */ new Set();
  for (const l of graph.links) links.add(`${l.source}${l.target}${l.kind}`);
  return { nodes, links };
}
function setsDiffer(a, b) {
  if (a.size !== b.size) return true;
  for (const x of a) if (!b.has(x)) return true;
  return false;
}
var KosmosIndex = class {
  constructor() {
    this.records = /* @__PURE__ */ new Map();
    this.folders = [];
    this.attachments = [];
    this.prevSig = null;
    this.prevNodeMeta = /* @__PURE__ */ new Map();
    this.graph = null;
    /** Cumulative number of parseSourceFile calls (test/benchmark observability). */
    this.parseCount = 0;
  }
  get noteCount() {
    return this.records.size;
  }
  getAttachments() {
    return this.attachments.slice();
  }
  getFolders() {
    return this.folders.slice();
  }
  /** Raw note contents are NOT retained; expose cached records for exporters. */
  getRecords() {
    return this.records;
  }
  /** Full load: parse everything, assemble, remember signature. */
  setFiles(files, folders = [], attachments = []) {
    const t0 = Date.now();
    this.records.clear();
    for (const f of files) {
      const rec = parseSourceFile(f);
      this.parseCount++;
      this.records.set(rec.relativePath, rec);
    }
    this.folders = folders.slice();
    this.attachments = attachments.slice();
    const graph = this.assemble();
    graph.diagnostics.lastFullBuildMs = Date.now() - t0;
    this.prevSig = signatureOf(graph);
    this.prevNodeMeta = this.metaOf(graph);
    const delta = {
      addedNodes: graph.nodes.map((n) => n.id),
      removedNodes: [],
      changedNodes: [],
      topologyChanged: true,
      reparsed: files.length,
      fullRebuild: true
    };
    return { graph, delta };
  }
  /** Incremental update: parse only genuinely-changed content. */
  applyChanges(changes) {
    const t0 = Date.now();
    const changed = changes.changed ?? [];
    const removed = changes.removed ?? [];
    const renames = changes.renames ?? [];
    const touched = removed.length + changed.length + renames.length;
    const structural = touched > Math.max(STRUCTURAL_REBUILD_MIN, this.records.size * STRUCTURAL_REBUILD_FRACTION);
    let reparsed = 0;
    for (const r of renames) {
      const from = normalizeVaultRelative(r.from);
      const to = normalizeVaultRelative(r.to);
      const rec = this.records.get(from);
      if (rec) {
        this.records.delete(from);
        this.records.set(to, { ...rec, relativePath: to });
      }
    }
    for (const p of removed) this.records.delete(normalizeVaultRelative(p));
    for (const f of changed) {
      const path = normalizeVaultRelative(f.relativePath);
      const prev = this.records.get(path);
      if (prev && f.content != null && prev.hash === contentHash(f.content)) continue;
      const rec = parseSourceFile(f);
      this.parseCount++;
      reparsed++;
      this.records.set(path, rec);
    }
    if (changes.folders) this.folders = changes.folders.slice();
    if (changes.attachments) this.attachments = changes.attachments.slice();
    const graph = this.assemble();
    graph.diagnostics.lastIncrementalUpdateMs = Date.now() - t0;
    const sig = signatureOf(graph);
    const meta = this.metaOf(graph);
    const prevSig = this.prevSig;
    const addedNodes = [];
    const removedNodes = [];
    const changedNodes = [];
    if (prevSig) {
      for (const id of sig.nodes) if (!prevSig.nodes.has(id)) addedNodes.push(id);
      for (const id of prevSig.nodes) if (!sig.nodes.has(id)) removedNodes.push(id);
      for (const [id, m] of meta) {
        if (prevSig.nodes.has(id) && sig.nodes.has(id) && this.prevNodeMeta.get(id) !== m) {
          changedNodes.push(id);
        }
      }
    }
    const topologyChanged = !prevSig || setsDiffer(prevSig.links, sig.links) || addedNodes.length > 0 || removedNodes.length > 0;
    this.prevSig = sig;
    this.prevNodeMeta = meta;
    return {
      graph,
      delta: {
        addedNodes,
        removedNodes,
        changedNodes,
        topologyChanged,
        reparsed,
        fullRebuild: structural
      }
    };
  }
  getDiagnostics() {
    return this.graph?.diagnostics ?? null;
  }
  metaOf(graph) {
    const meta = /* @__PURE__ */ new Map();
    for (const n of graph.nodes) {
      meta.set(
        n.id,
        `${n.label}${n.status ?? ""}${n.type ?? ""}${n.tags.join(",")}${n.aliases.join(",")}${n.validAt ?? ""}${n.okf?.invalidAt ?? ""}${n.okf?.head ? 1 : 0}`
      );
    }
    return meta;
  }
  assemble() {
    const graph = assembleGraph([...this.records.values()], this.folders);
    graph.diagnostics.attachments = this.attachments.length;
    this.graph = graph;
    return graph;
  }
};

// src/core/demo.ts
var demoAreas = [
  { path: "00_Atlas", label: "Atlas", color: "#7dd3fc", tags: ["map", "structure"], notes: ["Knowledge Constellation", "Navigation Principles", "Concept Cartography", "Open Questions", "Semantic Landmarks", "Routes and Tours", "Depth Cues", "Graph Vocabulary"] },
  { path: "10_Research", label: "Research", color: "#a78bfa", tags: ["research", "signal"], notes: ["Literature Radar", "AI Interface Notes", "Spatial Computing", "Local First Systems", "Cognitive Load", "Human Attention", "Pattern Library", "Insight Pipeline"] },
  { path: "20_Projects", label: "Projects", color: "#34d399", tags: ["project", "active"], notes: ["Vault Kosmos", "Learning Studio", "Publishing Engine", "Workshop Planner", "Knowledge Garden", "Presentation Route Alpha", "Review Dashboard", "Automation Console"] },
  { path: "30_Sources", label: "Sources", color: "#fbbf24", tags: ["source", "reference"], notes: ["Obsidian Graph", "Three Dimensional UI", "Local Data Ethics", "Graph Layout Notes", "WebGL Performance", "File Watchers", "Navigation Research", "Interface Atmosphere"] },
  { path: "40_Writing", label: "Writing", color: "#fb7185", tags: ["writing", "draft"], notes: ["Public Alpha Story", "Demo Walkthrough", "Design Notes", "Launch Checklist", "Field Report", "Narrative Arc", "Readme Draft", "Release Notes"] },
  { path: "50_People", label: "People", color: "#f472b6", tags: ["people", "context"], notes: ["Research Partners", "Workshop Audience", "Maintainers", "Learners", "Editors", "Decision Makers", "Power Users", "Future Contributors"] },
  { path: "60_Archive", label: "Archive", color: "#94a3b8", tags: ["archive", "history"], notes: ["Prototype Log", "Old Layouts", "Rejected Ideas", "Screenshot Notes", "Performance Traces", "Branch History", "Session Summaries", "Release Archive"] }
];
var unresolvedTargets = ["Future Knowledge Engine", "Immersive Presentation Mode", "Semantic Embeddings"];
function addLink(links, kind, source, target, label) {
  if (!source || !target || source === target) return;
  links.push({ id: `${kind}:${source}->${target}:${links.length}`, source, target, kind, label });
}
function applyDemoCounts(nodes, links) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const l of links) {
    if (l.kind === "contains") continue;
    const s = byId.get(l.source);
    const t = byId.get(l.target);
    if (s) s.outgoing++;
    if (t) t.incoming++;
  }
}
function createDemoVaultGraph(now = Date.now()) {
  const nodes = [];
  const links = [];
  nodes.push({ id: "folder:.", kind: "folder", path: "", label: "Demo Vault", area: "Vault", depth: 0, tags: [], aliases: [], color: "#e2e8f0", outgoing: 0, incoming: 0 });
  for (const a of demoAreas) {
    nodes.push({ id: `folder:${a.path}`, kind: "folder", path: a.path, label: a.label, area: a.path, depth: 1, tags: a.tags, aliases: [], color: a.color, outgoing: 0, incoming: 0 });
    links.push({ id: `contains:folder:.->folder:${a.path}`, source: "folder:.", target: `folder:${a.path}`, kind: "contains" });
  }
  let fi = 0;
  const byArea = /* @__PURE__ */ new Map();
  const all = [];
  for (const a of demoAreas) {
    const ids = [];
    for (const note of a.notes) {
      const path = `${a.path}/${note}.md`;
      const id = `file:${path}`;
      const createdAt = new Date(now - (demoAreas.length * 8 - fi) * 36 * 36e5).toISOString();
      const updatedAt = new Date(now - (fi % 13 + 1) * 18 * 6e4).toISOString();
      nodes.push({
        id,
        kind: "file",
        path,
        label: note,
        area: a.path,
        depth: 2,
        extension: "md",
        size: 1600 + fi * 137,
        createdAt,
        updatedAt,
        validAt: createdAt,
        type: fi % 5 === 0 ? "hub" : fi % 3 === 0 ? "note" : "brief",
        status: fi % 7 === 0 ? "active" : fi % 4 === 0 ? "draft" : "stable",
        priority: fi % 6 === 0 ? "high" : "normal",
        tags: [...a.tags, fi % 2 === 0 ? "demo" : "linked"],
        aliases: [],
        color: a.color,
        outgoing: 0,
        incoming: 0
      });
      links.push({ id: `contains:folder:${a.path}->${id}`, source: `folder:${a.path}`, target: id, kind: "contains" });
      ids.push(id);
      all.push(id);
      fi++;
    }
    byArea.set(a.path, ids);
  }
  for (const t of unresolvedTargets) {
    nodes.push({ id: `unresolved:${t}`, kind: "unresolved", path: t, label: t, area: "Unresolved", depth: 1, tags: ["open"], aliases: [], color: "#64748b", outgoing: 0, incoming: 0, unresolved: true });
  }
  for (const [ai, a] of demoAreas.entries()) {
    const ids = byArea.get(a.path) ?? [];
    const next = demoAreas[(ai + 1) % demoAreas.length];
    const nextIds = byArea.get(next.path) ?? [];
    const projectHub = byArea.get("20_Projects")?.[0];
    const atlasHub = byArea.get("00_Atlas")?.[0];
    ids.forEach((id, i) => {
      addLink(links, "wikilink", id, ids[(i + 1) % ids.length]);
      addLink(links, "wikilink", id, nextIds[i % nextIds.length]);
      if (i % 2 === 0 && projectHub && id !== projectHub) addLink(links, "property", id, projectHub, "initiative");
      if (i % 3 === 0 && atlasHub && id !== atlasHub) addLink(links, "markdown", id, atlasHub, "map");
      if (i === 2) addLink(links, "wikilink", id, `unresolved:${unresolvedTargets[ai % unresolvedTargets.length]}`);
    });
  }
  applyDemoCounts(nodes, links);
  const content = links.filter((l) => l.kind !== "contains");
  return {
    nodes,
    links,
    stats: {
      indexedAt: new Date(now).toISOString(),
      durationMs: 42,
      files: all.length,
      folders: demoAreas.length + 1,
      unresolved: unresolvedTargets.length,
      links: links.length,
      wikilinks: links.filter((l) => l.kind === "wikilink").length,
      markdownLinks: links.filter((l) => l.kind === "markdown").length,
      propertyLinks: links.filter((l) => l.kind === "property").length,
      orphans: nodes.filter((n) => n.kind === "file" && !content.some((l) => l.source === n.id || l.target === n.id)).length
    },
    areas: ["Vault", ...demoAreas.map((a) => a.path), "Unresolved"],
    tags: ["active", "archive", "context", "demo", "draft", "linked", "map", "project", "reference", "research", "signal", "source", "structure", "writing"],
    statuses: ["active", "draft", "stable"],
    types: ["brief", "hub", "note"],
    diagnostics: {
      notes: all.length,
      folders: demoAreas.length + 1,
      attachments: 0,
      unresolvedLinks: unresolvedTargets.length,
      ambiguousLinks: 0,
      lineageEdges: 0,
      lineageCycles: 0,
      lineageWarnings: [],
      residualCollisions: 0
    }
  };
}
function createDemoVaultEvents(now = Date.now()) {
  const paths = ["20_Projects/Vault Kosmos.md", "40_Writing/Public Alpha Story.md", "00_Atlas/Routes and Tours.md", "30_Sources/WebGL Performance.md", "10_Research/Spatial Computing.md", "50_People/Future Contributors.md", "20_Projects/Presentation Route Alpha.md", "40_Writing/Demo Walkthrough.md"];
  return paths.map((path, i) => ({
    id: `demo-event:${i}`,
    type: i % 3 === 0 ? "add" : "change",
    path,
    area: path.split("/")[0] ?? "Demo",
    extension: "md",
    at: new Date(now - (paths.length - i) * 54e3).toISOString(),
    message: i === paths.length - 1 ? "Demo focus pulse" : void 0
  }));
}
export {
  ATTACHMENT_EXTENSIONS,
  DEFAULT_IGNORED_DIRS,
  KOSMOS_NAME,
  KOSMOS_VERSION,
  KosmosIndex,
  NOTE_EXTENSIONS,
  RELATION_PROPERTIES,
  STRUCTURAL_REBUILD_FRACTION,
  STRUCTURAL_REBUILD_MIN,
  addFileToResolver,
  areaFromFilePath,
  areaFromPath,
  assembleGraph,
  basenameWithoutExtension,
  buildGraph,
  buildGraphitiEpisodes,
  buildGraphitiEpisodesWithContent,
  cleanTarget,
  collectStringValues,
  colorForArea,
  computeTemporalState,
  contentHash,
  createDemoVaultEvents,
  createDemoVaultGraph,
  createResolver,
  extensionFromPath,
  extractPropertyLinks,
  fileNodeId,
  folderNodeId,
  hashString,
  hashUnit,
  isAttachmentPath,
  isExternal,
  isNotePath,
  normalizeLineage,
  normalizeStringList,
  normalizeTags,
  normalizeVaultRelative,
  parseFrontmatter,
  parseMarkdownFile,
  parseMarkdownLinks,
  parseOkfPlus,
  parseOkfTimestamp,
  parseSourceFile,
  parseWikiLinks,
  posixBasename,
  posixDirname,
  posixJoin,
  projectAtTime,
  resolveLinkTarget,
  resolveTitleRef,
  resolveValidAt,
  shouldIgnoreVaultPath,
  stripFrontmatter,
  toPosixPath,
  unresolvedId,
  vaultDepth,
  withoutExtension
};
