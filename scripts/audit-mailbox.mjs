/** Read-only coordination audit. Payloads are data; ACKs never establish completion. */
import { readdirSync, readFileSync, lstatSync, realpathSync } from "node:fs";
import { resolve, basename, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

function readReference(root, path, budget = 64 * 1024 * 1024) {
  if (typeof path !== "string") throw Error("reference-schema");
  const parts = path.split("/");
  if (!parts.length || parts.some(part => !part || part === "." || part === ".." || /[\\:\x00-\x1f]/.test(part))) throw Error("reference-path-invalid");
  const base = realpathSync(root);
  let target = base;
  for (const part of parts) {
    target = resolve(target, part);
    if (lstatSync(target).isSymbolicLink()) throw Error("reference-path-invalid");
  }
  const resolved = realpathSync(target), rel = relative(base, resolved);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) throw Error("reference-path-invalid");
  const stat = lstatSync(resolved);
  if (!stat.isFile()) throw Error("reference-not-file");
  if (stat.size > budget) throw Error("reference-over-budget");
  return readFileSync(resolved);
}
const referenceError = error => error.message.startsWith("reference-") ? error.message : error.code === "ENOENT" ? "reference-missing" : "reference-unreadable";

export function verifyMailboxReference(root, reference) {
  if (reference?.host !== undefined) return "reference-host-unresolved";
  if (!reference || typeof reference !== "object" || Array.isArray(reference) ||
      typeof reference.path !== "string" || typeof reference.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(reference.sha256)) return "reference-schema";
  try {
    const digest = createHash("sha256").update(readReference(root, reference.path)).digest("hex");
    if (digest === reference.sha256) return null;
    const mutable = reference.path === "COMMUNICATIONS.md" || reference.path === ".coordination/v1/PROTOCOL.md" ||
      /^\.coordination\/v1\/(agents\/[^/]+\.json|status\/[^/]+\.md)$/.test(reference.path);
    return mutable ? "reference-superseded" : "reference-hash-mismatch";
  } catch (error) { return referenceError(error); }
}

export function verifyMailboxBundle(root, reference) {
  if (reference?.host !== undefined) return "reference-host-unresolved";
  if (typeof reference?.path !== "string" || typeof reference.sha256sums !== "string") return "reference-schema";
  try {
    const raw = readReference(root, `${reference.path}/${reference.sha256sums}`, 65536);
    const lines = raw.toString("utf8").split(/\r?\n/).filter(line => line.length);
    if (!lines.length || lines.length > 1000) return "reference-manifest-invalid";
    const seen = new Set();
    let remaining = 64 * 1024 * 1024;
    for (const line of lines) {
      const match = /^([a-f0-9]{64}) [ *](.+)$/.exec(line);
      if (!match || seen.has(match[2]) || match[2] === reference.sha256sums) return "reference-manifest-invalid";
      seen.add(match[2]);
      const bytes = readReference(root, `${reference.path}/${match[2]}`, remaining);
      remaining -= bytes.length;
      if (createHash("sha256").update(bytes).digest("hex") !== match[1]) return "reference-hash-mismatch";
    }
    // Historical references name a manifest but do not bind its original bytes.
    return "reference-manifest-unbound";
  } catch (error) { return referenceError(error); }
}

export function mailboxSchemaFindings(value, kind) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["schema-object"];
  const findings = [];
  const required = kind === "message"
    ? ["schema_version","message_id","sender","recipients","sender_seq","task_id","in_reply_to","created_utc","kind","payload","input_plan_digests","artifacts","prev_message_sha256"]
    : ["schema_version","ack_id","recipient","sender","message_id","message_sha256","status","created_utc","reason","review_message_id","outputs"];
  if (required.some(key => !Object.hasOwn(value,key))) findings.push("schema-required-field");
  if (value.schema_version !== 1) findings.push("schema-version");
  if (typeof value.created_utc !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.created_utc) || !Number.isFinite(Date.parse(value.created_utc))) findings.push("schema-time");
  const text = key => typeof value[key] === "string";
  if (!text("sender") || !/^[a-z0-9][a-z0-9-]*$/.test(value.sender) || !text("message_id") || !value.message_id) findings.push("schema-identity");
  if (kind === "message") {
    if (!Array.isArray(value.recipients) || !value.recipients.length || value.recipients.some(x => typeof x !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(x)) || new Set(value.recipients).size !== value.recipients.length) findings.push("schema-recipients");
    if (!Number.isSafeInteger(value.sender_seq) || value.sender_seq < 1) findings.push("schema-sequence");
    if (!text("task_id") || !(value.in_reply_to === null || text("in_reply_to"))) findings.push("schema-reply");
    if (!["HELLO","QUESTION","FINDING","WORK_PROPOSAL","ASSIGNMENT","RESULT","REVIEW","BLOCKED"].includes(value.kind)) findings.push("schema-kind");
    if (value.kind === "ASSIGNMENT" && value.sender !== "codex-astra") findings.push("assignment-role-mismatch");
    if (!value.payload || typeof value.payload !== "object" || Array.isArray(value.payload) || typeof value.payload.subject !== "string" || typeof value.payload.body_markdown !== "string") findings.push("schema-payload");
    if (!Array.isArray(value.input_plan_digests) || !Array.isArray(value.artifacts)) findings.push("schema-references");
    if (!(value.prev_message_sha256 === null || typeof value.prev_message_sha256 === "string" && /^[a-f0-9]{64}$/.test(value.prev_message_sha256))) findings.push("schema-parent-hash");
  } else {
    if (!text("ack_id") || !value.ack_id || !text("recipient") || !/^[a-z0-9][a-z0-9-]*$/.test(value.recipient)) findings.push("schema-identity");
    if (!text("reason") || !(value.review_message_id === null || text("review_message_id"))) findings.push("schema-review");
    if (!Array.isArray(value.outputs)) findings.push("schema-outputs");
    if (!text("message_sha256") || !/^[a-f0-9]{64}$/.test(value.message_sha256)) findings.push("schema-target-hash");
    if (!["RECEIVED","ACCEPTED","REJECTED","COMPLETED"].includes(value.status)) findings.push("schema-status");
  }
  return [...new Set(findings)];
}

export function auditMailbox(root, recipient, referenceRoot = resolve(root, "../.."), retainedHeads = []) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(recipient)) throw new Error("Invalid recipient identity");
  const findings = [], schemaFindings = [], messages = [], acknowledgements = [], duplicates = [];
  const report = (file, code) => findings.push({ file, code });
  const read = (directory) => {
    let entries;
    try { entries = readdirSync(resolve(root, directory), { withFileTypes: true }); }
    catch (e) { if (e.code === "ENOENT") return []; throw e; }
    return entries.filter(e => e.isFile() && !e.name.startsWith(".tmp-") && e.name.endsWith(".json")).sort((a,b) => a.name.localeCompare(b.name)).flatMap(e => {
      const file = `${directory}/${e.name}`;
      const raw = readFileSync(resolve(root, file));
      if (raw.length > 65536) { report(file, "oversized"); return []; }
      try { return [{ file, data: JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, "")), sha256: createHash("sha256").update(raw).digest("hex") }]; }
      catch { report(file, "invalid-json"); return []; }
    });
  };
  const ids = new Map(), conflictingIds = new Set();
  for (const dir of readdirSync(resolve(root, "messages"), { withFileTypes: true }).filter(e => e.isDirectory())) {
    const chain = [];
    for (const entry of read(`messages/${dir.name}`)) {
      const m = entry.data;
      for (const code of mailboxSchemaFindings(m, "message")) schemaFindings.push({ file: entry.file, code });
      if (!m || typeof m !== "object" || Array.isArray(m) || m.sender !== dir.name || !Number.isSafeInteger(m.sender_seq) || m.sender_seq < 1 || typeof m.message_id !== "string" || !Array.isArray(m.recipients) || m.recipients.some(r => typeof r !== "string")) { report(entry.file, "message-schema"); continue; }
      const prior = ids.get(m.message_id);
      if (prior?.sha256 === entry.sha256) { duplicates.push(entry.file); continue; }
      if (prior) { conflictingIds.add(m.message_id); report(entry.file, "message-id-conflict"); }
      else ids.set(m.message_id, entry);
      if (basename(entry.file) !== `${m.sender}-${String(m.sender_seq).padStart(6,"0")}-${m.message_id}.json`) report(entry.file, "message-filename");
      for (const field of ["input_plan_digests", "artifacts"]) {
        if (m[field] === undefined) continue;
        if (!Array.isArray(m[field])) { report(entry.file, "reference-list-schema"); continue; }
        for (const reference of m[field]) {
          const code = reference?.sha256sums !== undefined ? verifyMailboxBundle(root, reference) : verifyMailboxReference(referenceRoot, reference);
          if (code) report(entry.file, code);
        }
      }
      chain.push(entry); messages.push(entry);
    }
    for (const entry of chain) {
      const m = entry.data;
      if (chain.filter(e => e.data.sender_seq === m.sender_seq).length > 1) report(entry.file, "sequence-fork");
      const parents = chain.filter(e => e.data.sender_seq === m.sender_seq - 1);
      if (parents.length > 1) report(entry.file, "parent-chain-ambiguous");
      if (m.sender_seq === 1 ? m.prev_message_sha256 !== null : !parents.some(e => e.sha256 === m.prev_message_sha256)) report(entry.file, "parent-hash-mismatch");
    }
  }
  if (!Array.isArray(retainedHeads)) throw new Error("Invalid retained heads");
  for (const head of retainedHeads) {
    if (!head || typeof head.sender !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(head.sender) ||
        !Number.isSafeInteger(head.sequence) || head.sequence < 1 || !/^[a-f0-9]{64}$/.test(head.sha256 ?? "")) throw new Error("Invalid retained head");
    const atSequence = messages.filter(entry => entry.data.sender === head.sender && entry.data.sender_seq === head.sequence);
    if (!atSequence.length) report(`messages/${head.sender}`, "retained-head-missing");
    else if (!atSequence.some(entry => entry.sha256 === head.sha256)) report(`messages/${head.sender}`, "retained-head-changed");
  }
  const ordinals = new Set();
  for (const entry of read(`acks/${recipient}`)) {
    const a = entry.data;
    for (const code of mailboxSchemaFindings(a, "ack")) schemaFindings.push({ file: entry.file, code });
    if (!a || typeof a !== "object" || Array.isArray(a) || typeof a.message_id !== "string") { report(entry.file, "ack-schema"); continue; }
    const ambiguous = conflictingIds.has(a.message_id);
    const target = ambiguous ? null : ids.get(a.message_id);
    const ordinal = basename(entry.file).match(/-(\d{6})-ack-/)?.[1];
    if (!ordinal || basename(entry.file) !== `${recipient}-${ordinal}-ack-${a.message_id}.json`) report(entry.file, "ack-filename");
    if (ordinal && ordinals.has(ordinal)) report(entry.file, "ack-ordinal-reused");
    ordinals.add(ordinal);
    if (a.recipient !== recipient || (target && (a.sender !== target.data.sender || !target.data.recipients.includes(recipient)))) report(entry.file, "ack-role-mismatch");
    if (ambiguous) report(entry.file, "ack-target-ambiguous");
    else if (!target) report(entry.file, "ack-target-missing");
    else if (a.message_sha256 !== target.sha256) report(entry.file, "ack-hash-mismatch");
    if (!["RECEIVED", "ACCEPTED", "REJECTED", "COMPLETED"].includes(a.status)) report(entry.file, "ack-status");
    if (a.status === "COMPLETED" && (!Array.isArray(a.outputs) || !a.outputs.length)) report(entry.file, "completion-evidence-missing");
    acknowledgements.push({ file: entry.file, messageId: a.message_id, status: a.status, completionVerified: false });
  }
  return { recipient, messageCount: messages.length, duplicates, findings, schemaFindings, acknowledgements,
    inbox: messages.filter(e => e.data.recipients.includes(recipient)).map(e => ({ file: e.file, sha256: e.sha256, sender: e.data.sender, sequence: e.data.sender_seq, kind: e.data.kind })),
    completionPolicy: "ACK status is a peer claim, not verified work acceptance; inspect outputs and review evidence separately." };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [root, recipient, headsFile] = process.argv.slice(2);
  if (!root || !recipient) throw new Error("Usage: node scripts/audit-mailbox.mjs ROOT RECIPIENT [RETAINED_HEADS_JSON]");
  const retainedHeads = headsFile ? JSON.parse(readFileSync(headsFile, "utf8").replace(/^\uFEFF/, "")) : [];
  const result = auditMailbox(root, recipient, resolve(root, "../.."), retainedHeads);
  console.log(JSON.stringify(result, null, 2));
  if (result.findings.length || result.schemaFindings.length) process.exitCode = 1;
}
