/**
 * Enforce kosmos-invariants.yml against the source and built artifacts
 * (Engineering Assurance Guide §6.4). Fails CI on any drift between the
 * declared policy and the code that is supposed to implement it.
 *
 * No YAML dependency: a tiny scalar reader handles this flat policy file.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");
const problems = [];
const must = (cond, msg) => { if (!cond) problems.push(msg); };

/* ---- minimal YAML scalar reader (2-space indent, `key: value`) ---- */
function parsePolicy(text) {
  const rootObj = {};
  const stack = [{ indent: -1, obj: rootObj }];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").replace(/\s+$/, "");
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const listItem = /^\s*-\s+(.*)$/.exec(line);
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (listItem) {
      if (!Array.isArray(parent.__list)) parent.__list = [];
      parent.__list.push(unquote(listItem[1].trim()));
      continue;
    }
    const m = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const key = m[1];
    const val = m[2];
    if (val === "") {
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      parent[key] = coerce(unquote(val));
    }
  }
  return rootObj;
}
const unquote = (s) => s.replace(/^["']/, "").replace(/["']$/, "");
const coerce = (s) => (s === "true" ? true : s === "false" ? false : /^\d+$/.test(s) ? Number(s) : s);

/** Strip // line and /* block *​/ comments so "absence" checks don't match prose. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const policy = parsePolicy(read("kosmos-invariants.yml"));

/* ---- security invariants against src/plugin/agent-server.ts ---- */
const server = read("src/plugin/agent-server.ts");
const serverCode = stripComments(server); // for absence checks
const sec = policy.security || {};

must(/agentEnabled:\s*false/.test(server), "DEFAULT_AGENT_SETTINGS.agentEnabled must be false");
must(/agentBindMode:\s*"localhost"/.test(server), "default bind mode must be localhost");
must(/agentRequireToken:\s*true/.test(server), "default agentRequireToken must be true");
must(/agentAllowQueryToken:\s*false/.test(server), "default agentAllowQueryToken must be false (query tokens off by default)");
must(new RegExp(`agentSensitivityCeiling:\\s*"${sec.default_agent_sensitivity_ceiling}"`).test(server), "default agent sensitivity ceiling must match policy");
must(sec.default_unlabeled_sensitivity === "secret", "policy: default_unlabeled_sensitivity must be secret (fail closed)");
must(/defaultSensitivity:\s*FAIL_CLOSED_SENSITIVITY_DEFAULT/.test(server), "DEFAULT_AGENT_SETTINGS.defaultSensitivity must be the engine fail-closed default (secret)");
/* ---- Personal Notes profile boundary (0.9.0) ---- */
const personalSettings = read("src/personal-notes/settings.ts");
must(sec.personal_notes_default_folders_empty === true && /includeFolders:\s*\[\],/.test(personalSettings) && /autoStart:\s*false/.test(personalSettings), "Personal Notes must share no folders and not autostart by default");
must(/activeProfile:\s*"existing"/.test(server), "DEFAULT_AGENT_SETTINGS.activeProfile must be the existing profile");
must(sec.personal_fails_closed_without_runtime === true && /if \(this\.personalActive\(\) && !this\.personal\)/.test(server), "the Personal profile must fail closed when its runtime is absent");
must(/if \(this\.personalActive\(\)\) return personalToolDefs\(\)/.test(server) && /if \(this\.personalActive\(\)\) \{ await this\.personalRest\(/.test(server), "the Personal profile must serve only the Personal tools and REST routes");
must(/if \(!this\.personalActive\(\)\) return this\.settings\.agentToken;/.test(server), "the persisted agentToken must be used only by the existing profile");
must(sec.personal_rewrites_default_sensitivity === false && !/enablePersonalNotes|disablePersonalNotes|PERSONAL_NOTES_UNLABELED_SENSITIVITY|personalNotesPriorDefaultSensitivity/.test(serverCode + stripComments(read("src/plugin/main.ts"))), "profile switching must never rewrite the saved defaultSensitivity");
must(sec.mcp_legacy_requires_setting === true && /return this\.settings\.agentLegacyMcp !== false;/.test(server) && /if \(!this\.acceptsOlderMcp\(\)\)/.test(server) && /agentLegacyMcp:\s*true/.test(server), "legacy MCP must be gated by acceptsOlderMcp(), default on unless explicitly false");
const compat = read("src/plugin/mcp-compat.ts");
must(sec.mcp_native_sse_transport === false && !/["'`]\/(sse|messages)["'`]/.test(stripComments(server + compat)), "the deprecated HTTP+SSE /sse + /messages transport must not be served");
must(/http: \[MODERN_MCP_PROTOCOL_VERSION, \.\.\.NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS\]/.test(compat) && !/NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS = \[[^\]]*2024-11-05/.test(compat), "native /mcp must not advertise the stdio-only 2024-11-05 revision");
must(!/["'`]Mcp-Session-Id["'`]\s*:/.test(stripComments(compat)), "the legacy adapter must not issue an Mcp-Session-Id header");
must(sec.mcp_legacy_sessions === false && !/["'`]Mcp-Session-Id["'`]\s*:/.test(serverCode), "the server must not issue an Mcp-Session-Id header in either era");
must(read("src/plugin/mcp-compat.ts").includes(`MODERN_MCP_PROTOCOL_VERSION = "${sec.mcp_latest_protocol}"`) && /SUPPORTED_MCP_PROTOCOL_VERSIONS/.test(server), "latest MCP revision must match policy");
must(sec.query_tokens_default_enabled === false, "policy: query_tokens_default_enabled must be false");
must(/lanNeedsAuthButHasNone/.test(server) && /LAN mode requires an auth token/.test(server), "server must refuse to start LAN mode without a token");
must(sec.personal_query_tokens_allowed === false && /agentAllowQueryToken && !this\.personalActive\(\) && this\.effectiveBindMode\(\) !== "lan"/.test(server), "query-token auth must be gated out of LAN mode and the Personal connection");
must(new RegExp(`MAX_BODY_BYTES\\s*=\\s*${sec.max_request_bytes / (1024 * 1024)} \\* 1024 \\* 1024`).test(server) || /4 \* 1024 \* 1024/.test(server), "MAX_BODY_BYTES must equal the policy's max_request_bytes");
must(/getRandomValues/.test(server) && /new Uint8Array\(32\)/.test(server), "token must use crypto.getRandomValues with 32 bytes");
must(!/Math\.random\s*\(/.test(serverCode), "no Math.random() may appear in the Agent API server");
must(/hostAllowed/.test(server), "Host validation must be present");
must(/originAllowed/.test(server), "Origin validation must be present");
must(/timingSafeEqual/.test(server), "token comparison must be constant-time");

/* ---- timeout ordering: the operation deadline must fire before the socket
 *      timeout, or Node destroys a stalled connection with no status line and
 *      no body. Both literals are READ FROM SOURCE and compared; hard-coding
 *      the pair here would rot the moment either constant moved, which is the
 *      defect class that left the stdio DELETE guard inert. ---- */
if (sec.operation_deadline_precedes_socket_timeout === true) {
  const num = (m) => (m ? Number(m[1].replace(/_/g, "")) : NaN);
  const socketMs = num(/REQUEST_TIMEOUT_MS\s*=\s*([0-9_]+)/.exec(server));
  const operationMs = num(/operationTimeoutMs\s*=\s*([0-9_]+)/.exec(server));
  must(Number.isFinite(socketMs), "socket timeout (REQUEST_TIMEOUT_MS) not found in agent-server.ts");
  must(Number.isFinite(operationMs), "operation deadline (operationTimeoutMs) not found in agent-server.ts");
  if (Number.isFinite(socketMs) && Number.isFinite(operationMs)) {
    must(
      operationMs < socketMs,
      `operation deadline (${operationMs}ms) must be strictly less than the socket timeout (${socketMs}ms); ` +
      "otherwise a stalled request is killed by the socket before the deadline can answer, " +
      "and the client receives no status line and no body",
    );
  }
}
const gkxParser = read("node_modules/gkos-engine/src/gkx-parser.ts");
must(sec.invalid_sensitivity_fails_closed_as === "secret" && /return typeof v === "string" && v\.trim\(\) \? "secret"/.test(gkxParser), "invalid explicit sensitivity must fail closed as secret");
const gkx23 = read("node_modules/gkos-engine/src/gkx23.ts");
must(sec.invalid_v23_sensitivity_fails_closed_as === "secret" && /effectiveSensitivity = "secret"/.test(gkx23), "invalid v2.3 sensitivity must fail closed as secret");
must(/GET only \(read-only API\)/.test(server) && !/\bcase "\/write"|app\.post\(|writeFile/.test(server), "Agent API must expose no write routes");

const projectionPolicy = policy.gkx23_projection || {};
must(projectionPolicy.profile === "validating-projection" && /GKX23_PROFILE/.test(gkx23), "GKX 2.3 must identify the validating projection profile");
must(projectionPolicy.full_gkos_claimed === false && /conformanceClaim: "reader-and-deterministic-assessor"/.test(gkx23), "GKX 2.3 must not claim full GKOS conformance");
must(projectionPolicy.proposed_values_effective_without_approval === false && /origins\.authored, origins\.derived, origins\.approved/.test(gkx23), "proposed GKX values must not enter effective state");
must(projectionPolicy.scores_are_truth === false && /documentation-and-support-quality-not-truth/.test(gkx23), "assessment must disclaim truth scoring");
must(projectionPolicy.policy_hash_required === true && /hash: "sha256:[0-9a-f]{64}"/.test(gkx23), "GKX 2.3 policy must carry a SHA-256 hash");
must(projectionPolicy.remote_schema_updates_enabled === false && /remoteUpdatesEnabled: false/.test(server), "remote schema updates must remain disabled");

/* ---- build invariants ---- */
const pkg = JSON.parse(read("package.json"));
must(existsSync(resolve(root, policy.build.lockfile_required)), `${policy.build.lockfile_required} must exist`);
const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
must(!Object.values(allDeps).some((v) => v === "latest"), "no dependency may use \"latest\"");
must(pkg.engines && pkg.engines.node, "package.json must declare engines.node");

/* ---- renderer invariants ---- */
const main = read("src/plugin/main.ts");
const mainCode = stripComments(main);
must(/setAttribute\("sandbox"/.test(mainCode), "plugin iframe must set a sandbox attribute");
must(!/allow-same-origin/.test(mainCode), "iframe sandbox must NOT include allow-same-origin");
const protocol = read("src/plugin/protocol.ts");
must(/KOSMOS_PROTOCOL_VERSION/.test(protocol) && /validateHostMessage/.test(protocol), "host↔renderer protocol must be versioned and validated");

/* ---- GKX migration invariants ---- */
const migrationCore = read("node_modules/gkos-engine/src/gkx-migration.ts");
const migrationHost = read("src/plugin/gkx-migration.ts");
const migrationCode = stripComments(migrationCore + "\n" + migrationHost);
const mig = policy.gkx_migration || {};
must(mig.audit_before_apply === true && /createGkxMigrationPlan/.test(migrationCore) && /GkxMigrationPreviewModal/.test(migrationHost), "GKX writes must be preceded by an explicit audit preview");
must(mig.plan_hash === "sha256" && /subtle\.digest\("SHA-256"/.test(migrationCore) && /verifyGkxMigrationPlan/.test(migrationHost), "GKX apply must verify and bind to a SHA-256 plan");
must(mig.byte_exact_backup === true && /readBinary/.test(migrationHost) && /writeBinary/.test(migrationHost), "GKX migration must make byte-exact binary backups");
must(mig.source_match_before_write === true && /current !== entry\.originalContent/.test(migrationHost), "GKX migration must skip sources changed after the plan");
must(mig.body_preserved === true && /fm\.body/.test(migrationCore), "GKX migration must preserve the human-authored body");
must(mig.llm_required === false && mig.network_dispatch_allowed === false && !/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(migrationCode), "GKX migration must remain LLM-free and make no network dispatch");

/* ---- semantic search (0.9.5) ---- */
const sem = policy.semantic || {};
const semDir = "src/semantic";
const semFiles = readdirSync(resolve(root, semDir)).filter((f) => f.endsWith(".ts")).map((f) => `${semDir}/${f}`);
const NETWORK = /\bfetch\s*\(|\brequestUrl\s*\(|XMLHttpRequest|WebSocket|EventSource|\bimportScripts\s*\(|sendBeacon/;
must(sem.default_enabled === false && /return \{ enabled: false, modelId: DEFAULT_MODEL_ID/.test(read(`${semDir}/settings.ts`)), "semantic search must be off by default");
const licences = sem.allowed_model_licenses?.__list || [];
const catalogSrc = read(`${semDir}/catalog.ts`);
must(licences.join(",") === "MIT,Apache-2.0" && /ALLOWED_MODEL_LICENSES = \["MIT", "Apache-2\.0"\] as const/.test(catalogSrc), "the model catalog must allow exactly MIT and Apache-2.0");
for (const m of catalogSrc.matchAll(/^\s*license:\s*"([^"]+)"/gm)) must(licences.includes(m[1]), `catalog model licence ${m[1]} is not MIT or Apache-2.0`);
for (const f of [...semFiles, "src/ui/semantic-settings.ts", "src/personal-notes/librarian.ts"]) {
  must(!NETWORK.test(stripComments(read(f))), `${f} must make no network request (only src/plugin/semantic-host.ts may download a model file)`);
}
const semHost = stripComments(read("src/plugin/semantic-host.ts"));
must(sem.network_call_sites === 1 && (semHost.match(/\bfetch\s*\(/g) || []).length === 1 && (semHost.match(/\brequestUrl\s*\(/g) || []).length === 1
  && (semHost.match(/Downloader = async/g) || []).length === 1, "semantic-host.ts must download in exactly one function (one stream request and its one fallback)");
must(typeof sem.model_host === "string" && semHost.includes(`const MODEL_HOST = "${sem.model_host}";`) && /if \(!url\.startsWith\(MODEL_HOST\)\) throw/.test(semHost)
  && catalogSrc.includes(`const HF = "${String(sem.model_host).replace(/\/$/, "")}";`), "model downloads must be confined to the declared model host");
must(!/credentials:\s*"(include|same-origin)"|Authorization|agentToken/.test(semHost), "a model download must carry no credential");
must(sem.worker_network === false && /numThreads = 1/.test(read(`${semDir}/embedder.ts`)) && /wasmBinary/.test(read(`${semDir}/embedder.ts`)),
  "the embedding worker must run from bytes it carries or is given (no runtime fetched, no threads)");
const schema = /const DDL = `([\s\S]*?)`;/.exec(read(`${semDir}/store.ts`))?.[1] ?? "";
must(sem.index_stores_note_text === false && /CREATE TABLE chunks/.test(schema) && (schema.match(/\bTEXT\b/g) || []).length === 4 && /path TEXT NOT NULL UNIQUE/.test(schema) && /content_key TEXT NOT NULL/.test(schema) && /key TEXT PRIMARY KEY, value TEXT NOT NULL/.test(schema),
  "the semantic index must not store note text");
const queryService = read("src/personal-notes/query-service.ts");
must(sem.widens_read_scope === false && /found\.filter\(\(c\) => allowed\.has\(c\.path\)\)/.test(queryService) && /!visible\.has\(hit\.path\)/.test(queryService) && /only notes in this requester's pool count/.test(read("src/personal-notes/librarian.ts")),
  "semantic candidates must be filtered to the requester's readable notes");
if (sem.catalog_pinned_and_hashed === true) {
  if (existsSync(resolve(root, "dist/kosmos-semantic.mjs"))) {
    const built = await import(pathToFileURL(resolve(root, "dist/kosmos-semantic.mjs")).href);
    for (const problem of built.validateCatalog()) problems.push(`model catalog: ${problem}`);
    must(built.MODEL_CATALOG.length >= 1, "the model catalog is empty");
  } else {
    problems.push("dist/kosmos-semantic.mjs missing — run npm run build");
  }
} else {
  problems.push("policy: semantic.catalog_pinned_and_hashed must be true");
}

/* ---- standalone invariants (artifact must exist and be self-contained) ---- */
if (existsSync(resolve(root, "kosmos-oden-stand-alone.html"))) {
  const html = read("kosmos-oden-stand-alone.html");
  must(!/<script[^>]+src=/i.test(html), "standalone must not load external scripts");
  must(!/url\(\s*['"]?https?:/i.test(html), "standalone must not reference remote CSS urls");
} else {
  problems.push("kosmos-oden-stand-alone.html missing — run npm run build");
}

/* ---- release forbidden files must never be tracked ---- */
for (const pat of (policy.release?.forbidden_files?.__list) || []) {
  if (pat.includes("*")) continue; // glob patterns checked at package time
  if (existsSync(resolve(root, pat))) {
    // data.json is gitignored working data; only fail if it would be committed.
    if (pat === "data.json") continue;
    problems.push(`forbidden file present in repo: ${pat}`);
  }
}

if (problems.length) {
  console.error("check-invariants: FAILED");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("check-invariants: OK — source and artifacts satisfy kosmos-invariants.yml");
