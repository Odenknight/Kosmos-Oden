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

export function auditMailbox(root, recipient, referenceRoot = resolve(root, "../..")) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(recipient)) throw new Error("Invalid recipient identity");
  const findings = [], messages = [], acknowledgements = [], duplicates = [];
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
  const ordinals = new Set();
  for (const entry of read(`acks/${recipient}`)) {
    const a = entry.data;
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
  return { recipient, messageCount: messages.length, duplicates, findings, acknowledgements,
    inbox: messages.filter(e => e.data.recipients.includes(recipient)).map(e => ({ file: e.file, sha256: e.sha256, sender: e.data.sender, sequence: e.data.sender_seq, kind: e.data.kind })),
    completionPolicy: "ACK status is a peer claim, not verified work acceptance; inspect outputs and review evidence separately." };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [root, recipient] = process.argv.slice(2);
  if (!root || !recipient) throw new Error("Usage: node scripts/audit-mailbox.mjs ROOT RECIPIENT");
  const result = auditMailbox(root, recipient);
  console.log(JSON.stringify(result, null, 2));
  if (result.findings.length) process.exitCode = 1;
}
