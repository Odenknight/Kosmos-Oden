#!/usr/bin/env node
/**
 * MCP client capture listener — what does your client actually send?
 *
 * Purpose: settle, before merging PR #49 and building a release candidate,
 * whether the intended MCP client speaks the modern revision (2026-07-28)
 * that Kosmos-Oden's Agent API now requires. It answers one question:
 *
 *     Does this client send `params._meta` + the mirrored headers,
 *     or does it open with a legacy `initialize` handshake?
 *
 * This is a diagnostic harness, not product code and not part of the plugin.
 * It is deliberately NOT in scripts/ and is not wired into `npm run verify`.
 *
 * ---------------------------------------------------------------- usage ----
 *
 *   node _Claude-Code/mcp-client-capture.mjs                 # port 4817
 *   node _Claude-Code/mcp-client-capture.mjs --port 9000
 *   node _Claude-Code/mcp-client-capture.mjs --strict        # reject like Kosmos does
 *
 * Then point the client at it instead of the real server:
 *
 *   HTTP client   →  http://127.0.0.1:4817/mcp   (any token; it is not checked)
 *   stdio client  →  KOSMOS_MCP_URL=http://127.0.0.1:4817/mcp \
 *                    KOSMOS_MCP_TOKEN=anything node kosmos-mcp-stdio.mjs
 *
 * Drive the client normally — connect, list tools, read a note. Then Ctrl-C
 * here for the verdict. A transcript is written to
 * `_Claude-Code/mcp-client-capture-<timestamp>.json`.
 *
 * ------------------------------------------------------------ two modes ----
 *
 * DEFAULT (accommodating). Answers both eras so the client keeps talking and
 * you see its whole opening sequence — legacy `initialize` gets a legacy reply
 * and a session id, modern requests get modern replies. This maximises what
 * you learn from one run. It is NOT what Kosmos does.
 *
 * --strict. Applies the same metadata validation `KosmosAgentServer` applies,
 * so you see the errors the real server would return and how the client
 * surfaces them to a user. Use this second, after you know the era.
 *
 * ------------------------------------------------------------- secrets -----
 *
 * Credential headers are never written to disk or printed. Any value seen in
 * an Authorization / x-api-key / cookie header is recorded only as its length
 * and a short SHA-256 prefix, and is scrubbed from every captured body before
 * the transcript is written. Binds to loopback unless --host says otherwise.
 */

import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ args -- */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};

const PORT = Number(opt("port", 4817));
const HOST = String(opt("host", "127.0.0.1"));
const STRICT = flag("strict");
const HERE = dirname(fileURLToPath(import.meta.url));

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`refusing to start: --port ${opt("port", "")} is not a valid port`);
  process.exit(2);
}

/* ------------------------------------------- the contract we are testing -- */

const MODERN_VERSION = "2026-07-28";
const META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CLIENT_INFO = "io.modelcontextprotocol/clientInfo";
const META_CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";
/** Methods whose `Mcp-Name` header mirrors a body field, and which field. */
const NAME_SOURCE = { "tools/call": "name", "resources/read": "uri", "prompts/get": "name" };

const CREDENTIAL_HEADERS = new Set(["authorization", "x-api-key", "cookie", "proxy-authorization", "x-auth-token"]);

/* --------------------------------------------------------------- secrets -- */

/** Every credential value seen, so it can be scrubbed from captured bodies. */
const seenSecrets = new Set();

const fingerprint = (value) =>
  `${value.length} chars, sha256:${createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12)}`;

/** Redact a credential header to scheme + fingerprint, never the value. */
function redactHeader(name, raw) {
  const value = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "");
  if (!CREDENTIAL_HEADERS.has(name)) return value;
  const m = /^(\S+)\s+(.+)$/.exec(value);
  const [scheme, secret] = m ? [m[1], m[2]] : ["", value];
  if (secret) seenSecrets.add(secret);
  if (value) seenSecrets.add(value);
  return secret ? `<${scheme ? scheme + " " : ""}redacted: ${fingerprint(secret)}>` : "<empty>";
}

/** Remove any credential value that leaked into a body before we store it. */
function scrub(text) {
  let out = String(text ?? "");
  for (const secret of seenSecrets) if (secret.length >= 8) out = out.split(secret).join("[REDACTED]");
  return out;
}

/* -------------------------------------------------------------- analysis -- */

/** Decode the spec's `=?base64?<b64>?=` sentinel, or null if malformed. */
function decodeSentinel(raw) {
  if (!(raw.startsWith("=?base64?") && raw.endsWith("?=") && raw.length >= 11)) return raw;
  const b64 = raw.slice(9, -2);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return null;
  try {
    const buf = Buffer.from(b64, "base64");
    if (buf.toString("base64").replace(/=+$/, "") !== b64.replace(/=+$/, "")) return null;
    return buf.toString("utf8");
  } catch { return null; }
}

/**
 * Apply the same checks `KosmosAgentServer.validateRequestMetadata` applies.
 * Returns { era, conforms, problems[], notes[] }. `problems` are the reasons
 * the real server would reject this request; `notes` are observations.
 */
function analyse(headers, parsed) {
  const problems = [];
  const notes = [];
  const header = (k) => {
    const v = headers[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  };

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { era: "unknown", conforms: false, problems: ["body is not a JSON-RPC object"], notes };
  }

  const method = typeof parsed.method === "string" ? parsed.method : undefined;
  const meta = parsed?.params?._meta;
  const hasModernMeta = !!meta && typeof meta === "object" && typeof meta[META_PROTOCOL_VERSION] === "string";

  /* ---- era signals, reported whatever the outcome ---- */
  if (method === "initialize") notes.push("sends `initialize` — the legacy handshake, removed in 2026-07-28");
  if (method === "notifications/initialized") notes.push("sends `notifications/initialized` — legacy lifecycle");
  if (header("mcp-session-id") !== undefined) notes.push("sends `Mcp-Session-Id` — legacy protocol session");
  if (header("last-event-id") !== undefined) notes.push("sends `Last-Event-ID` — legacy resumable GET stream");
  if (typeof parsed?.params?.protocolVersion === "string") {
    notes.push(`declares protocolVersion in params (legacy position): ${parsed.params.protocolVersion}`);
  }
  if (hasModernMeta) notes.push(`carries modern _meta protocolVersion: ${meta[META_PROTOCOL_VERSION]}`);

  const era = hasModernMeta ? "modern" : (method === "initialize" || header("mcp-session-id") !== undefined) ? "legacy" : "indeterminate";

  const isNotification = parsed.id === undefined;
  if (isNotification) {
    notes.push("notification (no id) — this transport exempts these from metadata validation");
    return { era, conforms: true, exempt: true, problems, notes };
  }

  /* ---- the checks the real server performs, in its order ---- */
  const protocolHeader = header("mcp-protocol-version");
  if (protocolHeader !== undefined) notes.push(`\`MCP-Protocol-Version\` header: ${protocolHeader}`);
  if (protocolHeader === undefined) problems.push("missing `MCP-Protocol-Version` header (-32020 HeaderMismatch)");

  const protocolBody = meta && typeof meta === "object" ? meta[META_PROTOCOL_VERSION] : undefined;
  if (typeof protocolBody !== "string") {
    problems.push(`missing/invalid params._meta["${META_PROTOCOL_VERSION}"] (-32602)`);
  } else if (protocolHeader !== undefined && protocolHeader !== protocolBody) {
    problems.push(`header/body protocol version disagree: '${protocolHeader}' vs '${protocolBody}' (-32020)`);
  } else if (protocolBody !== MODERN_VERSION) {
    problems.push(`unsupported protocol version '${protocolBody}'; server supports ${MODERN_VERSION} only (-32022)`);
  }

  const methodHeader = header("mcp-method");
  if (methodHeader === undefined) problems.push("missing `Mcp-Method` header (-32020)");
  else if (methodHeader !== method) problems.push(`\`Mcp-Method\` header '${methodHeader}' does not match body method '${method}' (-32020)`);

  const nameField = method && Object.hasOwn(NAME_SOURCE, method) ? NAME_SOURCE[method] : undefined;
  const nameHeaderRaw = header("mcp-name");
  if (nameField) {
    if (nameHeaderRaw === undefined) {
      problems.push(`missing \`Mcp-Name\` header, required for ${method} (-32020)`);
    } else {
      const decoded = decodeSentinel(nameHeaderRaw);
      if (decoded === null) problems.push("`Mcp-Name` header is not valid Base64-sentinel encoding (-32020)");
      else {
        if (decoded !== nameHeaderRaw) notes.push(`\`Mcp-Name\` used the Base64 sentinel; decodes to '${decoded}'`);
        const bodyValue = parsed?.params?.[nameField];
        if (typeof bodyValue !== "string" || decoded !== bodyValue) {
          problems.push(`\`Mcp-Name\` '${decoded}' does not match params.${nameField} '${String(bodyValue)}' (-32020)`);
        }
      }
    }
  } else if (nameHeaderRaw !== undefined) {
    problems.push(`\`Mcp-Name\` header must not be sent for ${String(method)} (-32020)`);
  }

  const capabilities = meta && typeof meta === "object" ? meta[META_CLIENT_CAPABILITIES] : undefined;
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) {
    problems.push(`missing/invalid params._meta["${META_CLIENT_CAPABILITIES}"] — required object (-32602)`);
  }

  const info = meta && typeof meta === "object" ? meta[META_CLIENT_INFO] : undefined;
  const legacyInfo = parsed?.params?.clientInfo;
  if (info === undefined && legacyInfo && typeof legacyInfo === "object") {
    notes.push(`identity sent in the legacy position params.clientInfo (${String(legacyInfo.name)} ${String(legacyInfo.version)}); this revision reads _meta only`);
  } else if (info === undefined) {
    notes.push("no clientInfo — optional, but without it the server groups this caller by User-Agent only");
  } else if (!info || typeof info !== "object" || Array.isArray(info) || typeof info.name !== "string" || typeof info.version !== "string") {
    problems.push("clientInfo present but lacks string name and version (-32602)");
  } else {
    notes.push(`clientInfo: ${info.name} ${info.version}`);
  }

  return { era, conforms: problems.length === 0, problems, notes };
}

/* -------------------------------------------------------------- replies -- */

const serverInfo = { name: "mcp-client-capture", title: "MCP client capture listener", version: "1.0.0" };

/** Accommodating replies: keep the client talking so we see its full opening. */
function accommodatingReply(parsed, sessionId) {
  const id = parsed?.id;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  switch (parsed?.method) {
    case "initialize":
      return ok({
        protocolVersion: typeof parsed?.params?.protocolVersion === "string" ? parsed.params.protocolVersion : "2025-11-25",
        capabilities: { tools: { listChanged: false } },
        serverInfo,
        instructions: "Capture listener. Nothing here is a real vault; every tool returns a placeholder.",
      });
    case "server/discover":
      return ok({
        resultType: "complete",
        supportedVersions: [MODERN_VERSION],
        capabilities: { tools: { listChanged: false } },
        _meta: { [META_SERVER_INFO]: serverInfo },
        instructions: "Capture listener. Nothing here is a real vault.",
      });
    case "ping":
      return ok({ resultType: "complete" });
    case "tools/list":
      return ok({
        resultType: "complete",
        tools: [{
          name: "get_note",
          description: "Placeholder tool. Call it so the capture can observe a tools/call request.",
          inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
        }],
      });
    case "tools/call":
      return ok({ resultType: "complete", content: [{ type: "text", text: "capture listener placeholder result" }], isError: false });
    case "resources/list":
      return ok({ resultType: "complete", resources: [] });
    case "prompts/list":
      return ok({ resultType: "complete", prompts: [] });
    default:
      return { jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: `Method not found: ${String(parsed?.method)}` } };
  }
}

/** Strict replies: the errors the real Kosmos server would return. */
function strictReply(parsed, verdict) {
  const id = parsed?.id ?? null;
  if (!verdict.conforms) {
    // The real server returns on its FIRST failed check and `problems` is built
    // in that same order, so take problems[0] — scanning for a code would report
    // a later failure than the one that would actually have stopped the request.
    const first = verdict.problems[0];
    const code = Number(/\((-\d{5})\b/.exec(first)?.[1] ?? -32020);
    const prefix = code === -32602 ? "Invalid params: " : code === -32022 ? "" : "Header mismatch: ";
    const message = code === -32022 ? "Unsupported protocol version" : prefix + first;
    const data = code === -32022 ? { supported: [MODERN_VERSION] } : undefined;
    const suffix = parsed?.method === "initialize" ? `; supported protocol versions: ${MODERN_VERSION}` : "";
    return { status: 400, body: { jsonrpc: "2.0", id, error: { code, message: message + suffix, ...(data ? { data } : {}) } } };
  }
  if (parsed?.method === "initialize") {
    return { status: 404, body: { jsonrpc: "2.0", id, error: {
      code: -32601,
      message: `Method not found: initialize. This server implements modern MCP only; supported protocol versions: ${MODERN_VERSION}.`,
      data: { supported: [MODERN_VERSION] },
    } } };
  }
  const reply = accommodatingReply(parsed);
  return { status: reply.error?.code === -32601 ? 404 : 200, body: reply };
}

/* ------------------------------------------------------------- transcript -- */

const startedAt = new Date();
const transcript = {
  tool: "mcp-client-capture",
  started_utc: startedAt.toISOString(),
  mode: STRICT ? "strict" : "accommodating",
  endpoint: `http://${HOST}:${PORT}/mcp`,
  contract_under_test: { modern_version: MODERN_VERSION, source: "src/plugin/agent-server.ts validateRequestMetadata (PR #49)" },
  scope: "Observes what a client sends. Not a conformance certification, and not a test of the real Kosmos server.",
  requests: [],
};

let seq = 0;
let sessionId = "";

/* ---------------------------------------------------------------- server -- */

const server = http.createServer(async (req, res) => {
  const chunks = [];
  let bytes = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 4 * 1024 * 1024) { tooLarge = true; break; }
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k] = redactHeader(k, v);

  let parsed;
  let parseError;
  try { parsed = rawBody ? JSON.parse(rawBody) : undefined; }
  catch (e) { parseError = e.message; }

  const n = ++seq;
  const entry = {
    seq: n,
    at_utc: new Date().toISOString(),
    http: { method: req.method, url: req.url, bytes },
    headers,
    body: parsed !== undefined ? JSON.parse(scrub(JSON.stringify(parsed))) : scrub(rawBody).slice(0, 4000) || null,
    ...(parseError ? { parse_error: parseError } : {}),
    ...(tooLarge ? { truncated: "body exceeded 4 MiB and was not fully read" } : {}),
  };

  /* ---- non-POST: record what the client tried and answer as Kosmos does ---- */
  if (req.method !== "POST") {
    entry.verdict = { era: "legacy", conforms: false, problems: [`${req.method} on the MCP endpoint; this revision removed the GET stream and DELETE termination (405)`], notes: [] };
    transcript.requests.push(entry);
    report(entry);
    res.writeHead(405, { Allow: "POST", "Cache-Control": "no-store" });
    res.end();
    return;
  }

  const verdict = analyse(req.headers, parsed);
  entry.verdict = verdict;
  transcript.requests.push(entry);
  report(entry);

  const isNotification = parsed && typeof parsed === "object" && parsed.id === undefined;
  if (isNotification) { res.writeHead(202, { "Cache-Control": "no-store" }); res.end(); return; }

  if (STRICT) {
    const { status, body } = strictReply(parsed, verdict);
    respond(res, status, body);
    return;
  }

  if (parsed?.method === "initialize" && !sessionId) sessionId = randomUUID();
  respond(res, 200, accommodatingReply(parsed, sessionId), parsed?.method === "initialize" ? { "Mcp-Session-Id": sessionId } : undefined);
});

function respond(res, status, body, extra) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(extra ?? {}) });
  res.end(JSON.stringify(body));
}

/* ------------------------------------------------------------- reporting -- */

const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", DIM = "\x1b[2m", RESET = "\x1b[0m";

function report(entry) {
  const v = entry.verdict;
  const badge = v.exempt ? `${DIM}EXEMPT  ${RESET}` : v.conforms ? `${GREEN}CONFORMS${RESET}` : `${RED}REJECTED${RESET}`;
  const label = entry.body?.method ? String(entry.body.method) : `${entry.http.method} ${entry.http.url}`;
  console.log(`\n[${entry.seq}] ${badge}  ${label}  ${DIM}era: ${v.era}${RESET}`);
  for (const p of v.problems) console.log(`      ${RED}x${RESET} ${p}`);
  for (const note of v.notes) console.log(`      ${DIM}- ${note}${RESET}`);
}

function summarise() {
  const reqs = transcript.requests;
  transcript.ended_utc = new Date().toISOString();

  console.log(`\n${"=".repeat(72)}`);
  if (reqs.length === 0) {
    console.log("No requests captured. The client never reached this listener.");
    console.log("Check that it is pointed at the endpoint above and that it actually attempted a connection.");
    transcript.verdict = "no-requests";
  } else {
    const eras = new Set(reqs.map((r) => r.verdict.era));
    // Notifications are exempt from metadata validation, so counting them as
    // "accepted" would flatter the result. Judge on the requests that are judged.
    const judged = reqs.filter((r) => !r.verdict.exempt);
    const conforming = judged.filter((r) => r.verdict.conforms).length;
    const anyModern = reqs.some((r) => r.verdict.era === "modern");
    const anyLegacy = reqs.some((r) => r.verdict.era === "legacy");

    console.log(`Captured ${reqs.length} request(s); of the ${judged.length} subject to metadata validation, ${conforming} would be accepted by Kosmos as of PR #49.`);
    console.log(`Eras observed: ${[...eras].join(", ")}`);
    console.log("");

    if (anyModern && judged.length > 0 && conforming === judged.length) {
      transcript.verdict = "modern-conforming";
      console.log(`${GREEN}VERDICT: this client speaks modern MCP and every captured request conforms.${RESET}`);
      console.log("PR #49's transport is compatible with it. Proceed with the release candidate.");
    } else if (anyModern) {
      transcript.verdict = "modern-nonconforming";
      console.log(`${YELLOW}VERDICT: this client carries modern _meta, but some requests would be rejected.${RESET}`);
      console.log("These are fixable integration problems rather than an era mismatch. The");
      console.log("per-request problems above name the exact field or header at fault.");
    } else if (anyLegacy) {
      transcript.verdict = "legacy";
      console.log(`${RED}VERDICT: this client speaks LEGACY MCP. It cannot connect to Kosmos as of PR #49.${RESET}`);
      console.log("");
      console.log("This is not an integration bug and cannot be fixed in the server or the");
      console.log("bundled stdio adapter — the adapter deliberately does not synthesize `_meta`");
      console.log("a client did not send. The only remedies are:");
      console.log("  1. upgrade or replace the client with one that speaks 2026-07-28; or");
      console.log("  2. build a translating shim, which is new scope and runs against the");
      console.log("     modern-only direction of 2026-09-09.");
      console.log("");
      console.log("Decide which before spending the release-candidate window.");
    } else {
      transcript.verdict = "indeterminate";
      console.log(`${YELLOW}VERDICT: indeterminate — no clear era signal in what was captured.${RESET}`);
      console.log("The client connected but sent nothing that identifies its revision. Drive it");
      console.log("further (list tools, read a note) and capture again.");
    }
  }

  const path = resolve(HERE, `mcp-client-capture-${startedAt.toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(path, scrub(JSON.stringify(transcript, null, 2)) + "\n", "utf8");
  console.log(`\nTranscript: ${path}`);
  console.log(`${DIM}Credential values were never written; they appear only as length + SHA-256 prefix.${RESET}`);
  console.log("=".repeat(72));
}

/* ----------------------------------------------------------------- start -- */

server.listen(PORT, HOST, () => {
  console.log(`MCP client capture listening on http://${HOST}:${PORT}/mcp   ${DIM}(${STRICT ? "strict" : "accommodating"} mode)${RESET}`);
  if (HOST !== "127.0.0.1" && HOST !== "localhost" && HOST !== "::1") {
    console.log(`${YELLOW}WARNING: bound to ${HOST}, not loopback. Anything on that network can post to this listener.${RESET}`);
  }
  console.log(`${DIM}Any bearer token is accepted; nothing here is authenticated and no vault is exposed.${RESET}`);
  console.log(`${DIM}Point the client here, exercise it, then Ctrl-C for the verdict.${RESET}`);
});

server.on("error", (e) => {
  console.error(`\nlisten failed: ${e.message}`);
  if (e.code === "EADDRINUSE") console.error(`port ${PORT} is busy — pass --port <n> to pick another.`);
  process.exit(1);
});

let closing = false;
/** Summarise first, then tear down: a keep-alive socket must never be able to
 *  hold the close callback open and cost you the transcript. */
function shutdown() {
  if (closing) return;
  closing = true;
  summarise();
  try { server.closeAllConnections?.(); } catch { /* older runtimes */ }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  try { process.on(signal, shutdown); } catch { /* not all signals exist on all platforms */ }
}

// Unattended capture: stop on a timer instead of Ctrl-C, for scripted runs.
const SECONDS = Number(opt("seconds", 0));
if (SECONDS > 0) {
  console.log(`${DIM}Stopping automatically after ${SECONDS}s.${RESET}`);
  setTimeout(shutdown, SECONDS * 1000);
}
