// src/core/paths.ts
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

// src/renderer/cosmology.ts
var GOLDEN = 2.399963229728653;
var MANIFEST_NAMES = ["index", "home", "readme", "_index", "moc", "map", "overview", "dashboard", "start", "contents", "toc"];
var ROLE_R = { cluster: 3, galaxy: 2.3, star: 1.7, planet: 0.95, moon: 0.55, moonlet: 0.4, asteroid: 0.34, oort: 0.18, hidden: 0 };
var GAP_SYS = 0.8;
var GAP_AST = 0.9;
var GAP_GAL = 1.5;
var GAL_PACK = 0.6;
var SYS_PACK = 0.42;
var OORT_GAP = 0.7;
var MINSEP = 0.55;
function hStr(s) {
  let h = 2166136261 >>> 0;
  s = String(s);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function hUnit(s) {
  return hStr(s) % 1e5 / 1e5;
}
function baseName(p) {
  p = String(p || "").replace(/\/+$/, "");
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
}
function dirName(p) {
  p = String(p || "").replace(/\/+$/, "");
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}
function stripExt(name) {
  const i = name.lastIndexOf(".");
  return i <= 0 ? name : name.slice(0, i);
}
function extOf(p) {
  const b = baseName(p);
  const i = b.lastIndexOf(".");
  return i <= 0 ? "" : b.slice(i + 1).toLowerCase();
}
function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function len3(a) {
  return Math.hypot(a[0], a[1], a[2]);
}
function fib(n) {
  const out = [];
  if (n <= 0) return out;
  if (n === 1) return [[0, 0, 1]];
  for (let i = 0; i < n; i++) {
    const y = 1 - 2 * (i + 0.5) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const t = GOLDEN * i;
    out.push([r * Math.cos(t), y, r * Math.sin(t)]);
  }
  return out;
}
function minChord(units) {
  let m = Infinity;
  for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
    const a = units[i], b = units[j];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (d < m) m = d;
  }
  return isFinite(m) ? Math.max(m, 1e-3) : 1;
}
function buildCosmos(graph, opts = {}) {
  const attachSet = new Set((opts.attachments || []).map((p) => String(p)));
  const nodes = graph.nodes;
  const byId = /* @__PURE__ */ new Map();
  for (const n of nodes) byId.set(n.id, n);
  const adj = /* @__PURE__ */ new Map();
  const linkFrom = /* @__PURE__ */ new Map();
  const ensure = (m, k) => {
    let s = m.get(k);
    if (!s) {
      s = /* @__PURE__ */ new Set();
      m.set(k, s);
    }
    return s;
  };
  for (const l of graph.links || []) {
    if (l.kind === "contains") continue;
    if (!byId.has(l.source) || !byId.has(l.target)) continue;
    ensure(adj, l.source).add(l.target);
    ensure(adj, l.target).add(l.source);
    let lf = linkFrom.get(l.source);
    if (!lf) {
      lf = [];
      linkFrom.set(l.source, lf);
    }
    lf.push(l.target);
  }
  const deg = (id) => adj.get(id)?.size || 0;
  for (const n of nodes) {
    const isAttach = n.kind === "unresolved" && (ATTACHMENT_EXTENSIONS.has(extOf(n.path || n.label)) || attachSet.has(n.path)) || n.kind === "file" && ATTACHMENT_EXTENSIONS.has(n.extension || extOf(n.path));
    if (isAttach) {
      n.role = "oort";
      n.body = "oort";
    }
  }
  const fileNodes = nodes.filter((n) => n.kind === "file" && n.role !== "oort");
  const galaxyIds = [...new Set(fileNodes.map((n) => n.area).filter((a) => a && a !== "Root" && a !== "Unresolved" && a !== "Vault"))];
  const rankName = (name) => {
    const k = stripExt(baseName(name)).toLowerCase();
    const i = MANIFEST_NAMES.indexOf(k);
    return i < 0 ? 99 : i;
  };
  function pickManifest(candidates, folderName) {
    let best = null, bestScore = 1e9;
    for (const c of candidates) {
      const bn = stripExt(baseName(c.path)).toLowerCase();
      const score = folderName && bn === String(folderName).toLowerCase() ? -1 : rankName(c.path);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best && bestScore < 99 ? best : null;
  }
  const rootFiles = fileNodes.filter((n) => dirName(n.path) === "");
  let clusterNode = pickManifest(rootFiles, null);
  if (!clusterNode) clusterNode = byId.get("folder:.") || null;
  if (!clusterNode) {
    clusterNode = { id: "cosmos:cluster", kind: "folder", path: "", label: "Vault", area: "Vault", depth: 0, tags: [], aliases: [], color: "#f8fafc", outgoing: 0, incoming: 0 };
    nodes.push(clusterNode);
    byId.set(clusterNode.id, clusterNode);
    if (graph.nodeById) graph.nodeById.set(clusterNode.id, clusterNode);
  }
  clusterNode.role = "cluster";
  clusterNode.body = "cluster";
  clusterNode.galaxyId = "__cluster__";
  const clusterId = clusterNode.id;
  const galaxyCenter = /* @__PURE__ */ new Map();
  for (const A of galaxyIds) {
    const folderNode = byId.get("folder:" + A);
    const inFolder = fileNodes.filter((n) => dirName(n.path) === A);
    const manifest = pickManifest(inFolder, A);
    let center;
    if (manifest) {
      center = manifest;
      if (folderNode) {
        folderNode.role = "hidden";
        folderNode.body = "hidden";
      }
    } else if (folderNode) {
      center = folderNode;
    } else {
      center = { id: "cosmos:gal:" + A, kind: "folder", path: A, label: A, area: A, depth: 1, tags: [], aliases: [], color: "#cbd5e1", outgoing: 0, incoming: 0 };
      nodes.push(center);
      byId.set(center.id, center);
      if (graph.nodeById) graph.nodeById.set(center.id, center);
    }
    center.role = "galaxy";
    center.body = "galaxy";
    center.galaxyId = A;
    galaxyCenter.set(A, center.id);
  }
  for (const n of nodes) {
    if (n.kind === "folder" && n.role !== "galaxy" && n.role !== "cluster") {
      n.role = "hidden";
      n.body = "hidden";
    }
  }
  function classifyGalaxy(galId, centerId) {
    const isRoot = galId === "__root__";
    const members = fileNodes.filter((n) => n.id !== centerId && (isRoot ? dirName(n.path) === "" : n.area === galId) && n.role !== "oort");
    if (!members.length) return;
    const memberSet = new Set(members.map((n) => n.id));
    const centerNode = byId.get(centerId);
    const subManifest = (n) => {
      const d = dirName(n.path);
      return d && d !== galId && d !== "" && stripExt(baseName(n.path)).toLowerCase() === baseName(d).toLowerCase();
    };
    const degs = members.map((n) => deg(n.id)).sort((a, b) => b - a);
    const p70 = degs.length ? degs[Math.floor(degs.length * 0.3)] : 0;
    const thresh = Math.max(2, p70);
    const stars = /* @__PURE__ */ new Set();
    for (const n of members) if (subManifest(n)) stars.add(n.id);
    if (centerNode) {
      for (const t of adj.get(centerNode.id) || []) if (memberSet.has(t)) stars.add(t);
    }
    for (const n of members) if (deg(n.id) >= thresh) stars.add(n.id);
    const maxStars = Math.max(1, Math.ceil(Math.sqrt(members.length)) + members.filter(subManifest).length);
    if (stars.size > maxStars) {
      const keep = members.filter((n) => subManifest(n)).map((n) => n.id);
      const rest = [...stars].filter((id) => !keep.includes(id)).sort((a, b) => deg(b) - deg(a));
      stars.clear();
      for (const id of keep) stars.add(id);
      for (const id of rest) {
        if (stars.size >= maxStars) break;
        stars.add(id);
      }
    }
    if (stars.size === 0) {
      const top = [...members].sort((a, b) => deg(b.id) - deg(a.id))[0];
      if (top) stars.add(top.id);
    }
    const dist = /* @__PURE__ */ new Map(), parent = /* @__PURE__ */ new Map(), system = /* @__PURE__ */ new Map(), q = [];
    for (const id of stars) {
      dist.set(id, 0);
      parent.set(id, null);
      system.set(id, id);
      q.push(id);
    }
    for (let qi = 0; qi < q.length; qi++) {
      const u = q[qi];
      for (const v of adj.get(u) || []) {
        if (!memberSet.has(v) || dist.has(v)) continue;
        dist.set(v, dist.get(u) + 1);
        parent.set(v, u);
        system.set(v, system.get(u));
        q.push(v);
      }
    }
    for (const n of members) {
      if (stars.has(n.id)) {
        n.role = "star";
        n.body = "star";
        n.galaxyId = galId;
        n.systemId = n.id;
        n.parentId = null;
        continue;
      }
      const d = dist.get(n.id);
      if (d == null) {
        n.role = "asteroid";
        n.body = "asteroid";
        n.galaxyId = galId;
        n.systemId = null;
        n.parentId = null;
        continue;
      }
      n.role = d === 1 ? "planet" : d === 2 ? "moon" : "moonlet";
      n.body = n.role;
      n.galaxyId = galId;
      n.systemId = system.get(n.id);
      n.parentId = parent.get(n.id);
    }
  }
  for (const A of galaxyIds) classifyGalaxy(A, galaxyCenter.get(A));
  classifyGalaxy("__root__", clusterId);
  galaxyCenter.set("__root__", clusterId);
  for (const n of nodes) {
    if (n.kind === "unresolved" && n.role !== "oort") {
      let gal = "__root__";
      for (const v of adj.get(n.id) || []) {
        const o = byId.get(v);
        if (o && o.galaxyId && o.galaxyId !== "__cluster__") {
          gal = o.galaxyId;
          break;
        }
      }
      n.role = "asteroid";
      n.body = "asteroid";
      n.galaxyId = gal;
      n.systemId = null;
      n.parentId = null;
    }
  }
  for (const n of nodes) {
    if (n.role === "oort") {
      const hosts = [...adj.get(n.id) || []].filter((v) => {
        const o = byId.get(v);
        return o && o.role && o.role !== "oort";
      });
      n.hosts = hosts;
      n.hostId = hosts[0] || clusterId;
      const host = byId.get(n.hostId);
      n.galaxyId = host ? host.galaxyId || "__root__" : "__root__";
      n.systemId = host ? host.systemId || null : null;
    }
  }
  let maxDeg = 1;
  for (const n of nodes) maxDeg = Math.max(maxDeg, deg(n.id));
  for (const n of nodes) {
    const role = n.role || "hidden";
    let r = ROLE_R[role] != null ? ROLE_R[role] : ROLE_R.moonlet;
    if (role === "star" || role === "planet" || role === "moon") {
      const t = Math.min(1, deg(n.id) / maxDeg);
      r *= 0.82 + 0.55 * t;
    }
    n.__r = r;
    n.mass = r;
    if (!n.body) n.body = role;
  }
  const childrenByParent = /* @__PURE__ */ new Map();
  for (const n of nodes) {
    if (n.parentId) {
      let arr = childrenByParent.get(n.parentId);
      if (!arr) {
        arr = [];
        childrenByParent.set(n.parentId, arr);
      }
      arr.push(n);
    }
  }
  function moonDesc(id) {
    let c = 0;
    for (const k of childrenByParent.get(id) || []) {
      if (k.role === "moon" || k.role === "moonlet") {
        c++;
        c += moonDesc(k.id);
      }
    }
    return c;
  }
  const PCOL = { venus: "#e9d29a", earth: "#3f7fc9", mars: "#c25a38", minor: "#8f8077", gas: "#d8bd84" };
  for (const n of nodes) {
    if (n.role !== "planet") continue;
    const mc = moonDesc(n.id);
    n.__moons = mc;
    const pt = mc > 3 ? "gas" : mc === 0 ? "minor" : (() => {
      const h = hUnit(n.id + "pt");
      return h < 0.34 ? "venus" : h < 0.67 ? "earth" : "mars";
    })();
    n.__ptype = pt;
    n.__pcolor = PCOL[pt];
    n.__rings = pt === "gas";
  }
  const cosmosLinks = [];
  const visible = (id) => {
    const o = byId.get(id);
    return o && o.role && o.role !== "hidden";
  };
  for (const A of galaxyIds) {
    const c = galaxyCenter.get(A);
    if (visible(c)) cosmosLinks.push({ source: clusterId, target: c, cat: "clusterGalaxy" });
  }
  for (const t of linkFrom.get(clusterId) || []) if (visible(t)) cosmosLinks.push({ source: clusterId, target: t, cat: "clusterLink" });
  for (const n of nodes) {
    if (n.role === "star") {
      const c = galaxyCenter.get(n.galaxyId) || clusterId;
      if (c !== n.id) cosmosLinks.push({ source: c, target: n.id, cat: "galaxyStar" });
    } else if ((n.role === "planet" || n.role === "moon" || n.role === "moonlet") && n.parentId) {
      cosmosLinks.push({ source: n.parentId, target: n.id, cat: "chain" });
    } else if (n.role === "asteroid") {
      const c = galaxyCenter.get(n.galaxyId) || clusterId;
      cosmosLinks.push({ source: c, target: n.id, cat: "asteroidBind" });
    } else if (n.role === "oort") {
      for (const h of n.hosts && n.hosts.length ? n.hosts : [n.hostId]) if (visible(h)) cosmosLinks.push({ source: h, target: n.id, cat: "oort" });
    }
  }
  graph.clusterId = clusterId;
  graph.galaxies = galaxyIds.map((A) => ({ id: A, center: galaxyCenter.get(A) }));
  graph.galaxyCenter = galaxyCenter;
  let tmin = Infinity, tmax = -Infinity;
  for (const n of nodes) {
    if (n.okf) n.__ghost = !!n.okf.invalidAt;
    const tv = n.validAt ? Date.parse(n.validAt) : NaN;
    if (n.kind === "file" && !Number.isNaN(tv)) {
      if (tv < tmin) tmin = tv;
      if (tv > tmax) tmax = tv;
    }
    if (n.okf && n.okf.invalidAt) {
      const iv = Date.parse(n.okf.invalidAt);
      if (!Number.isNaN(iv) && iv > tmax) tmax = iv;
    }
  }
  graph.__timeSpan = tmin < tmax ? { min: tmin, max: tmax } : null;
  for (const l of graph.links) {
    if (l.kind === "lineage") {
      const a = byId.get(l.source), b2 = byId.get(l.target);
      if (a && b2 && a.role !== "hidden" && b2.role !== "hidden") cosmosLinks.push({ source: l.source, target: l.target, cat: "lineage" });
    }
  }
  graph.cosmosLinks = cosmosLinks;
  return graph;
}

// src/renderer/layout.ts
function layoutCosmos(graph) {
  const nodes = graph.nodes;
  const byId = /* @__PURE__ */ new Map();
  for (const n of nodes) byId.set(n.id, n);
  const clusterId = graph.clusterId;
  const galaxyCenter = graph.galaxyCenter || /* @__PURE__ */ new Map();
  const childrenOf = /* @__PURE__ */ new Map();
  for (const n of nodes) {
    if (n.parentId) {
      let arr = childrenOf.get(n.parentId);
      if (!arr) {
        arr = [];
        childrenOf.set(n.parentId, arr);
      }
      arr.push(n);
    }
  }
  const oortBySystem = /* @__PURE__ */ new Map();
  for (const n of nodes) {
    if (n.role === "oort") {
      const k = n.systemId || "gal:" + (n.galaxyId || "__root__");
      let arr = oortBySystem.get(k);
      if (!arr) {
        arr = [];
        oortBySystem.set(k, arr);
      }
      arr.push(n);
    }
  }
  function placeSystem(star) {
    const members = [star];
    star.__sys = [0, 0, 0];
    (function rec(p, depth) {
      const kids = childrenOf.get(p.id) || [];
      const base = p.__r + (depth === 1 ? 0.95 : depth === 2 ? 0.45 : 0.3);
      kids.forEach((c, i) => {
        const ang = GOLDEN * i + hUnit(c.id) * 6.283;
        const rr = base + i * (depth === 1 ? 0.42 : depth === 2 ? 0.26 : 0.17);
        const el = (hUnit(c.id + "e") - 0.5) * (depth === 1 ? 0.7 : 1.3);
        c.__sys = [p.__sys[0] + Math.cos(ang) * rr, p.__sys[1] + Math.sin(el) * rr, p.__sys[2] + Math.sin(ang) * rr];
        members.push(c);
        rec(c, depth + 1);
      });
    })(star, 1);
    let core = star.__r;
    for (const m of members) core = Math.max(core, len3(m.__sys) + m.__r);
    const oort = oortBySystem.get(star.id) || [];
    if (oort.length) {
      const u = fib(oort.length);
      const R = core + OORT_GAP;
      oort.forEach((o, i) => {
        o.__sys = [u[i][0] * R, u[i][1] * R, u[i][2] * R];
        members.push(o);
      });
      star.__extent = R + ROLE_R.oort + 1.5;
    } else star.__extent = core + 1.5;
    star.__members = members;
    return star.__extent;
  }
  function placeGalaxy(galId, centerNode) {
    const centerR = centerNode.__r || ROLE_R.galaxy;
    const stars = nodes.filter((n) => n.role === "star" && n.galaxyId === galId);
    let maxExt = centerR;
    const exts = stars.map((s) => ({ s, ext: placeSystem(s) }));
    for (const e of exts) maxExt = Math.max(maxExt, e.ext);
    if (stars.length) {
      const u = fib(stars.length);
      const mc = stars.length > 1 ? minChord(u) : 1;
      let Rs = stars.length > 1 ? (SYS_PACK * 2 * maxExt + GAP_SYS) / mc : maxExt + centerR + GAP_SYS;
      Rs = Math.max(Rs, centerR + ROLE_R.star + GAP_SYS, (2 * ROLE_R.star + MINSEP + 0.25) / mc);
      stars.forEach((s, i) => {
        const off = [u[i][0] * Rs, u[i][1] * Rs * 0.85, u[i][2] * Rs];
        for (const m of s.__members) m.__gal = add3(m.__sys, off);
      });
      centerNode.__galRs = Rs;
      centerNode.__galMaxExt = maxExt;
    }
    centerNode.__gal = [0, 0, 0];
    const ast = nodes.filter((n) => n.role === "asteroid" && n.galaxyId === galId);
    const baseR = (stars.length ? centerNode.__galRs + centerNode.__galMaxExt : centerR) + GAP_AST;
    if (ast.length) {
      const u = fib(ast.length);
      ast.forEach((a, i) => {
        const rr = baseR * (0.9 + 0.25 * hUnit(a.id + "r"));
        a.__gal = [u[i][0] * rr, u[i][1] * rr * 0.9, u[i][2] * rr];
      });
    }
    const goort = oortBySystem.get("gal:" + galId) || [];
    if (goort.length) {
      const u = fib(goort.length);
      const R = centerR + OORT_GAP;
      goort.forEach((o, i) => {
        o.__gal = [u[i][0] * R, u[i][1] * R, u[i][2] * R];
      });
    }
    let ext = centerR;
    for (const n of nodes) {
      if (n.galaxyId === galId && n.__gal) ext = Math.max(ext, len3(n.__gal) + n.__r);
    }
    centerNode.__extent = ext + 2;
    return centerNode.__extent;
  }
  const clusterNode = byId.get(clusterId);
  clusterNode.position = [0, 0, 0];
  const clusterR = clusterNode.__r || ROLE_R.cluster;
  const realGalaxies = (graph.galaxies || []).map((g) => byId.get(g.center)).filter(Boolean);
  const galExt = realGalaxies.map((g) => ({ g, ext: placeGalaxy(g.galaxyId, g) }));
  let maxGalExt = clusterR;
  for (const e of galExt) maxGalExt = Math.max(maxGalExt, e.ext);
  if (realGalaxies.length) {
    const u = fib(realGalaxies.length);
    const mc = realGalaxies.length > 1 ? minChord(u) : 1;
    let Rc = realGalaxies.length > 1 ? (GAL_PACK * 2 * maxGalExt + GAP_GAL) / mc : maxGalExt + clusterR + GAP_GAL;
    Rc = Math.max(Rc, clusterR + maxGalExt + GAP_GAL);
    realGalaxies.forEach((g, i) => {
      const off = [u[i][0] * Rc, u[i][1] * Rc * 0.6, u[i][2] * Rc];
      for (const n of nodes) {
        if (n.galaxyId === g.galaxyId && n.__gal) n.position = add3(n.__gal, off);
      }
    });
    graph.__clusterRingR = Rc;
  }
  placeGalaxy("__root__", clusterNode);
  for (const n of nodes) {
    if (n.galaxyId === "__root__" && n.__gal) n.position = n.__gal.slice();
  }
  clusterNode.position = [0, 0, 0];
  for (const n of nodes) {
    if (n.position) continue;
    if (n.role === "hidden") {
      n.position = [0, 0, 0];
      continue;
    }
    const a = hUnit(n.id) * 6.283, bb = hUnit(n.id + "b") * 3.14;
    const R = (graph.__clusterRingR || 80) * 1.1;
    n.position = [Math.cos(a) * Math.sin(bb) * R, Math.cos(bb) * R * 0.6, Math.sin(a) * Math.sin(bb) * R];
  }
  separateCosmos(graph);
  let residual = countIntersections(graph);
  if (residual > 0) {
    separateCosmos(graph, 8);
    residual = countIntersections(graph);
  }
  if (graph.diagnostics) graph.diagnostics.residualCollisions = residual;
  graph.__residualCollisions = residual;
  if (residual > 0 && typeof console !== "undefined") {
    console.debug(`Vault Kosmos layout: ${residual} residual body intersection(s) after corrective pass`);
  }
  const SPD = { galaxy: 5e-3, star: 0.02, asteroid: 0.03, oort: 0.012 };
  function parentIdOf(n) {
    if (n.role === "galaxy") return clusterId;
    if (n.role === "star") return galaxyCenter.get(n.galaxyId) || clusterId;
    if (n.role === "planet" || n.role === "moon" || n.role === "moonlet") return n.parentId || null;
    if (n.role === "asteroid") return galaxyCenter.get(n.galaxyId) || clusterId;
    if (n.role === "oort") return n.systemId || galaxyCenter.get(n.galaxyId) || clusterId;
    return null;
  }
  for (const n of nodes) {
    if (n.role === "hidden" || n.role === "cluster" || !n.position) continue;
    const pid = parentIdOf(n);
    const p = pid && byId.get(pid);
    if (!p || !p.position) continue;
    const ov = [n.position[0] - p.position[0], n.position[1] - p.position[1], n.position[2] - p.position[2]];
    const rxz = Math.hypot(ov[0], ov[2]) || 1e-3;
    let sp = n.role === "planet" ? 0.6 / (rxz + 1) : n.role === "moon" ? Math.min(0.45, 1 / (rxz + 0.5)) : n.role === "moonlet" ? Math.min(0.55, 1.2 / (rxz + 0.4)) : SPD[n.role] || 0;
    sp *= 0.85 + 0.3 * hUnit(n.id + "sp");
    n.__op = pid;
    n.__ov = ov;
    n.__os = sp;
  }
  graph.statsRef = graph.stats;
  return graph;
}
function countIntersections(graph) {
  const list = graph.nodes.filter((n2) => n2.role !== "hidden" && n2.position);
  const n = list.length;
  if (n < 2) return 0;
  let maxR = 0;
  for (const x of list) maxR = Math.max(maxR, x.__r || 0.5);
  const cell = 2 * maxR + 1;
  const key = (x, y, z) => x + "," + y + "," + z;
  const grid = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    const p = list[i].position;
    const gx = Math.floor(p[0] / cell), gy = Math.floor(p[1] / cell), gz = Math.floor(p[2] / cell);
    const k = key(gx, gy, gz);
    let a = grid.get(k);
    if (!a) {
      a = [];
      grid.set(k, a);
    }
    a.push(i);
    list[i].__gx = gx;
    list[i].__gy = gy;
    list[i].__gz = gz;
  }
  let count = 0;
  for (let i = 0; i < n; i++) {
    const a = list[i], ap = a.position, ar = a.__r || 0.5;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const arr = grid.get(key(a.__gx + dx, a.__gy + dy, a.__gz + dz));
      if (!arr) continue;
      for (const j of arr) {
        if (j <= i) continue;
        const b = list[j], bp = b.position, br = b.__r || 0.5;
        const ddx = bp[0] - ap[0], ddy = bp[1] - ap[1], ddz = bp[2] - ap[2];
        const need = ar + br;
        if (ddx * ddx + ddy * ddy + ddz * ddz < need * need) count++;
      }
    }
  }
  return count;
}
function separateCosmos(graph, iterations = 26) {
  const list = graph.nodes.filter((n2) => n2.role !== "hidden" && n2.position);
  const n = list.length;
  if (n < 2) return;
  const pinned = (nd) => {
    const r = nd.role;
    return r === "cluster" || r === "galaxy" || r === "star";
  };
  let maxR = 0;
  for (const x of list) maxR = Math.max(maxR, x.__r || 0.5);
  const cell = 2 * maxR + 2;
  const key = (x, y, z) => x + "," + y + "," + z;
  for (let it = 0; it < iterations; it++) {
    const grid = /* @__PURE__ */ new Map();
    for (let i = 0; i < n; i++) {
      const p = list[i].position;
      const gx = Math.floor(p[0] / cell), gy = Math.floor(p[1] / cell), gz = Math.floor(p[2] / cell);
      const k = key(gx, gy, gz);
      let a = grid.get(k);
      if (!a) {
        a = [];
        grid.set(k, a);
      }
      a.push(i);
      list[i].__gx = gx;
      list[i].__gy = gy;
      list[i].__gz = gz;
    }
    let moved = false;
    for (let i = 0; i < n; i++) {
      const a = list[i], ap = a.position, ar = a.__r || 0.5;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const arr = grid.get(key(a.__gx + dx, a.__gy + dy, a.__gz + dz));
        if (!arr) continue;
        for (const j of arr) {
          if (j <= i) continue;
          const b = list[j], bp = b.position, br = b.__r || 0.5;
          let ddx = bp[0] - ap[0], ddy = bp[1] - ap[1], ddz = bp[2] - ap[2];
          let d = Math.hypot(ddx, ddy, ddz);
          const need = ar + br + MINSEP;
          if (d >= need) continue;
          if (d === 0) {
            ddx = hUnit(a.id + b.id) - 0.5;
            ddy = hUnit(b.id + a.id) - 0.5;
            ddz = hUnit(a.id + "z" + b.id) - 0.5;
            d = Math.hypot(ddx, ddy, ddz) || 1;
          }
          const push = (need - d) / d;
          const ux = ddx * push, uy = ddy * push, uz = ddz * push;
          const ap_ = pinned(a), bp_ = pinned(b);
          if (ap_ && bp_) continue;
          if (ap_) {
            bp[0] += ux;
            bp[1] += uy;
            bp[2] += uz;
          } else if (bp_) {
            ap[0] -= ux;
            ap[1] -= uy;
            ap[2] -= uz;
          } else {
            ap[0] -= ux * 0.5;
            ap[1] -= uy * 0.5;
            ap[2] -= uz * 0.5;
            bp[0] += ux * 0.5;
            bp[1] += uy * 0.5;
            bp[2] += uz * 0.5;
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}
function positionCosmos(graph, opts) {
  return layoutCosmos(buildCosmos(graph, opts));
}
function nodeRadius(node) {
  if (node.kind === "folder") return node.depth === 0 ? 1.55 : 0.88;
  if (node.kind === "unresolved") return 0.26;
  const deg = node.incoming + node.outgoing;
  return 0.24 + Math.min(0.62, Math.sqrt(deg) * 0.075);
}
function layoutGraph(graph, focusIds = /* @__PURE__ */ new Set(), primaryId) {
  const areas = graph.areas.filter((a) => a !== "Vault" && a !== "Unresolved");
  const centers = /* @__PURE__ */ new Map();
  const shell = Math.max(30, areas.length * 3.7);
  const vspread = Math.max(16, areas.length * 1.8);
  areas.forEach((area, i) => {
    const angle = i * GOLDEN + hashUnit(area) * 0.9;
    const tier = (i % 5 - 2) / 2;
    const depth = (hashUnit(`${area}:depth`) - 0.5) * shell * 0.45;
    centers.set(area, [
      Math.cos(angle) * shell * (0.68 + hashUnit(`${area}:x`) * 0.28),
      tier * vspread + (hashUnit(`${area}:y`) - 0.5) * 10,
      Math.sin(angle) * shell * (0.68 + hashUnit(`${area}:z`) * 0.28) + depth
    ]);
  });
  const nodes = graph.nodes.map((node, i) => ({
    ...node,
    radius: nodeRadius(node),
    position: nodePosition(node, i, centers, graph.nodes.length, focusIds, primaryId)
  }));
  settle(nodes, graph.links, centers, primaryId, focusIds);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  classifyBodies(nodes, graph.links);
  attachMoons(nodes, graph.links, nodeById);
  return { ...graph, nodes, nodeById };
}
function nodePosition(node, index, centers, total, focusIds, primaryId) {
  if (node.id === "folder:.") return [0, 0, 0];
  if (primaryId === node.id) return [0, 22, 42];
  if (focusIds.has(node.id)) {
    const orbit = hashUnit(`${node.id}:focus`) * Math.PI * 2;
    const lane = index % 7 - 3;
    const r = 7 + hashUnit(`${node.id}:focus-radius`) * 16;
    return [Math.cos(orbit) * r, 18 + lane * 3.2 + hashUnit(`${node.id}:focus-y`) * 5, 28 + Math.sin(orbit) * r * 0.65];
  }
  if (node.kind === "unresolved") {
    const a = hashUnit(node.id) * Math.PI * 2, r = 56 + hashUnit(`${node.id}:r`) * 20;
    return [Math.cos(a) * r, -22 + hashUnit(`${node.id}:y`) * 44, Math.sin(a) * r];
  }
  const c = centers.get(node.area) ?? [0, 0, 0];
  const areaSeed = hashUnit(node.area), local = hashUnit(node.id);
  const angle = (local * Math.PI * 2 + areaSeed * Math.PI) % (Math.PI * 2);
  const vphase = Math.sin(local * Math.PI * 6 + node.depth);
  const lift = Math.min(18, node.depth * 2.35);
  const spread = node.kind === "folder" ? 7 + node.depth * 2.9 : 11 + Math.log(total) * 2.05;
  const radial = spread * Math.sqrt(hashUnit(`${node.id}:spread`));
  const zdrift = (hashUnit(`${node.id}:drift`) - 0.5) * spread * 1.25;
  const y = node.kind === "folder" ? c[1] + lift - 7 : c[1] + lift + vphase * 12 + (hashUnit(`${node.id}:y`) - 0.5) * 22;
  return [c[0] + Math.cos(angle) * radial, y, c[2] + Math.sin(angle) * radial + zdrift];
}
function isPinnedLegacy(n, primaryId, focusIds) {
  return n.id === "folder:." || n.id === primaryId || focusIds.has(n.id);
}
function settle(nodes, links, centers, primaryId, focusIds) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sample = links.filter((l) => {
    if (l.kind === "contains") return false;
    if (!byId.has(l.source) || !byId.has(l.target)) return false;
    if (l.source === primaryId || l.target === primaryId) return true;
    if (focusIds.has(l.source) || focusIds.has(l.target)) return true;
    const th = l.kind === "property" ? 0.42 : l.kind === "wikilink" ? 0.3 : 0.22;
    return hashUnit(`settle:${l.id}`) < th;
  });
  const iters = nodes.length > 900 ? 18 : 28;
  const scratch = /* @__PURE__ */ new Map();
  const addDelta = (id, x, y, z) => {
    const c = scratch.get(id);
    if (c) {
      c[0] += x;
      c[1] += y;
      c[2] += z;
    } else scratch.set(id, [x, y, z]);
  };
  for (let it = 0; it < iters; it++) {
    scratch.clear();
    for (const l of sample) {
      const s = byId.get(l.source), t = byId.get(l.target);
      if (!s || !t || isPinnedLegacy(s, primaryId, focusIds) || isPinnedLegacy(t, primaryId, focusIds)) continue;
      const dx = t.position[0] - s.position[0], dy = t.position[1] - s.position[1], dz = t.position[2] - s.position[2];
      const dist = Math.max(1e-3, Math.hypot(dx, dy, dz));
      const desired = l.kind === "property" ? 13 : l.kind === "wikilink" ? 16 : 19;
      const force = Math.max(-0.28, Math.min(0.28, (dist - desired) * 45e-4));
      const fx = dx / dist * force, fy = dy / dist * force * 0.72, fz = dz / dist * force;
      addDelta(s.id, fx, fy, fz);
      addDelta(t.id, -fx, -fy, -fz);
    }
    for (const n of nodes) {
      if (isPinnedLegacy(n, primaryId, focusIds)) continue;
      const c = centers.get(n.area);
      if (!c || n.kind === "unresolved") continue;
      const pull = n.kind === "folder" ? 0.018 : 6e-3;
      addDelta(n.id, (c[0] - n.position[0]) * pull, (c[1] + n.depth * 1.8 - n.position[1]) * pull * 0.6, (c[2] - n.position[2]) * pull);
    }
    for (const n of nodes) {
      const d = scratch.get(n.id);
      if (!d) continue;
      n.position = [n.position[0] + d[0], n.position[1] + d[1], n.position[2] + d[2]];
    }
  }
}
function degreeOf(n) {
  return (n.incoming || 0) + (n.outgoing || 0);
}
function classifyBodies(nodes, links) {
  const fileDegrees = nodes.filter((n) => n.kind === "file").map(degreeOf).sort((a, b) => a - b);
  const maxDeg = fileDegrees.at(-1) || 0;
  const p = (q) => fileDegrees.length ? fileDegrees[Math.min(fileDegrees.length - 1, Math.floor(q * fileDegrees.length))] : 0;
  const starCut = Math.max(7, p(0.94), Math.round(maxDeg * 0.72));
  const planetCut = Math.max(4, p(0.74));
  const moonCut = Math.max(2, p(0.42));
  const childCount = /* @__PURE__ */ new Map();
  for (const l of links) if (l.kind === "contains") childCount.set(l.source, (childCount.get(l.source) || 0) + 1);
  const folderChildren = nodes.filter((n) => n.kind === "folder").map((n) => childCount.get(n.id) || 0).sort((a, b) => a - b);
  const folderStarCut = Math.max(12, folderChildren.length ? folderChildren[Math.floor(0.9 * folderChildren.length)] : 0);
  for (const n of nodes) {
    const deg = degreeOf(n);
    if (n.kind === "unresolved") {
      n.body = "asteroid";
    } else if (n.kind === "folder") {
      if (n.depth === 0) n.body = "star";
      else n.body = (childCount.get(n.id) || 0) >= folderStarCut ? "star" : "planet";
    } else {
      if (deg === 0) n.body = "asteroid";
      else if (deg >= starCut) n.body = "star";
      else if (deg >= planetCut) n.body = "planet";
      else if (deg >= moonCut) n.body = "moon";
      else n.body = "moonlet";
    }
    n.mass = bodyMass(n, deg, childCount.get(n.id) || 0);
  }
}
function bodyMass(n, deg, children) {
  if (n.body === "star") return n.kind === "folder" ? 2.2 + Math.min(1.8, children * 0.05) : 1.4 + Math.min(1.6, Math.sqrt(deg) * 0.16);
  if (n.body === "planet") return n.kind === "folder" ? 1 + Math.min(0.9, children * 0.04) : 0.7 + Math.min(0.7, Math.sqrt(deg) * 0.12);
  if (n.body === "moon") return 0.42 + deg * 0.04;
  if (n.body === "moonlet") return 0.3;
  return 0.26;
}
function attachMoons(nodes, links, nodeById) {
  const neighbours = /* @__PURE__ */ new Map();
  const push = (k, v) => {
    let s = neighbours.get(k);
    if (!s) {
      s = /* @__PURE__ */ new Set();
      neighbours.set(k, s);
    }
    s.add(v);
  };
  for (const l of links) {
    if (l.kind === "contains") continue;
    push(l.source, l.target);
    push(l.target, l.source);
  }
  let orbitN = 0;
  for (const n of nodes) {
    if (n.body !== "moon" && n.body !== "moonlet") continue;
    const ns = neighbours.get(n.id);
    if (!ns || ns.size === 0) continue;
    let hub = null, best = -1;
    for (const id of ns) {
      const h = nodeById.get(id);
      if (!h) continue;
      if (h.body !== "star" && h.body !== "planet") continue;
      const m = h.mass || 0;
      if (m > best) {
        best = m;
        hub = h;
      }
    }
    if (!hub) continue;
    const k = `${n.id}:moonorbit`;
    const a = hashUnit(k) * Math.PI * 2;
    const inc = (hashUnit(k + ":inc") - 0.5) * 1.1;
    const dist = hub.mass * (n.body === "moonlet" ? 1.9 : 2.5) + 1.2 + hashUnit(k + ":d") * 1.4;
    const px = hub.position[0] + Math.cos(a) * dist;
    const py = hub.position[1] + Math.sin(inc) * dist * 0.6;
    const pz = hub.position[2] + Math.sin(a) * dist;
    n.position = [n.position[0] * 0.3 + px * 0.7, n.position[1] * 0.3 + py * 0.7, n.position[2] * 0.3 + pz * 0.7];
    n.orbitOf = hub.id;
    orbitN++;
  }
  return orbitN;
}
export {
  buildCosmos,
  countIntersections,
  layoutCosmos,
  layoutGraph,
  positionCosmos,
  separateCosmos
};
