// src/plugin/protocol.ts
var KOSMOS_PROTOCOL = "vault-kosmos";
var KOSMOS_PROTOCOL_VERSION = 1;
function wrap(type, payload) {
  return { protocol: KOSMOS_PROTOCOL, version: KOSMOS_PROTOCOL_VERSION, type, payload };
}
var isStr = (v) => typeof v === "string";
var isArr = (v) => Array.isArray(v);
var safePath = (p) => isStr(p) && p.length > 0 && p.length < 4096 && !/(^|[\\/])\.\.([\\/]|$)/.test(p) && !/^([a-zA-Z]:[\\/]|[\\/])/.test(p);
function validateHostMessage(data) {
  if (!data || typeof data !== "object") return { ok: false };
  const m = data;
  if (m.protocol !== KOSMOS_PROTOCOL) return { ok: false };
  if (m.version !== KOSMOS_PROTOCOL_VERSION) return { ok: false, reason: `unsupported protocol version ${String(m.version)} (this renderer speaks v${KOSMOS_PROTOCOL_VERSION})` };
  const p = m.payload;
  if (!p || typeof p !== "object") return { ok: false, reason: "missing payload" };
  if (m.type === "vault-snapshot") {
    if (!isArr(p.files)) return { ok: false, reason: "vault-snapshot payload.files must be an array" };
    for (const f of p.files) {
      if (!f || !safePath(f.relativePath) || !isStr(f.content)) return { ok: false, reason: "vault-snapshot file entry malformed or unsafe path" };
    }
    if (p.folders != null && !isArr(p.folders)) return { ok: false, reason: "folders must be an array" };
    if (p.attachments != null && !isArr(p.attachments)) return { ok: false, reason: "attachments must be an array" };
    return { ok: true, message: m };
  }
  if (m.type === "vault-delta") {
    if (p.changed != null) {
      if (!isArr(p.changed)) return { ok: false, reason: "delta.changed must be an array" };
      for (const f of p.changed) if (!f || !safePath(f.relativePath) || !isStr(f.content)) return { ok: false, reason: "delta changed entry malformed or unsafe path" };
    }
    if (p.removed != null && (!isArr(p.removed) || p.removed.some((x) => !safePath(x)))) return { ok: false, reason: "delta.removed must be safe paths" };
    if (p.renames != null) {
      if (!isArr(p.renames)) return { ok: false, reason: "delta.renames must be an array" };
      for (const r of p.renames) if (!r || !safePath(r.from) || !safePath(r.to)) return { ok: false, reason: "delta rename entry malformed or unsafe path" };
    }
    return { ok: true, message: m };
  }
  if (m.type === "agent-traversal") {
    if (!isArr(p.paths) || p.paths.some((x) => !safePath(x))) return { ok: false, reason: "agent-traversal payload.paths must be safe paths" };
    if (!isStr(p.tool)) return { ok: false, reason: "agent-traversal payload.tool must be a string" };
    return { ok: true, message: m };
  }
  return { ok: false, reason: `unsupported message type ${String(m.type)}` };
}
function validateRendererMessage(data) {
  if (!data || typeof data !== "object") return { ok: false };
  const m = data;
  if (m.protocol !== KOSMOS_PROTOCOL) return { ok: false };
  if (m.version !== KOSMOS_PROTOCOL_VERSION) return { ok: false, reason: `unsupported protocol version ${String(m.version)} (this host speaks v${KOSMOS_PROTOCOL_VERSION})` };
  const p = m.payload;
  if (!p || typeof p !== "object") return { ok: false, reason: "missing payload" };
  if (m.type === "open-note" || m.type === "open-folder") {
    if (!safePath(p.path)) return { ok: false, reason: `${String(m.type)} payload.path malformed or unsafe` };
    return { ok: true, message: m };
  }
  return { ok: false, reason: `unsupported message type ${String(m.type)}` };
}
export {
  KOSMOS_PROTOCOL,
  KOSMOS_PROTOCOL_VERSION,
  validateHostMessage,
  validateRendererMessage,
  wrap
};
