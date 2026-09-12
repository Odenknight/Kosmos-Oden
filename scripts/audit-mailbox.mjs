/** Read-only coordination audit. Payloads are data; ACKs never establish completion. */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

export function auditMailbox(root, recipient) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(recipient)) throw new Error("Invalid recipient identity");
  const findings = [], messages = [], acknowledgements = [], duplicates = [];
  const report = (file, code) => findings.push({ file, code });
  const read = (directory) => {
    let entries;
    try { entries = readdirSync(resolve(root, directory), { withFileTypes: true }); }
    catch (e) { if (e.code === "ENOENT") return []; throw e; }
    return entries.filter(e => e.isFile() && e.name.endsWith(".json")).sort((a,b) => a.name.localeCompare(b.name)).flatMap(e => {
      const file = `${directory}/${e.name}`;
      const raw = readFileSync(resolve(root, file));
      if (raw.length > 65536) { report(file, "oversized"); return []; }
      try { return [{ file, data: JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, "")), sha256: createHash("sha256").update(raw).digest("hex") }]; }
      catch { report(file, "invalid-json"); return []; }
    });
  };
  const ids = new Map();
  for (const dir of readdirSync(resolve(root, "messages"), { withFileTypes: true }).filter(e => e.isDirectory())) {
    const chain = [];
    for (const entry of read(`messages/${dir.name}`)) {
      const m = entry.data;
      if (m.sender !== dir.name || !Number.isSafeInteger(m.sender_seq) || m.sender_seq < 1 || typeof m.message_id !== "string" || !Array.isArray(m.recipients)) { report(entry.file, "message-schema"); continue; }
      const prior = ids.get(m.message_id);
      if (prior?.sha256 === entry.sha256) { duplicates.push(entry.file); continue; }
      if (prior) report(entry.file, "message-id-conflict");
      else ids.set(m.message_id, entry);
      if (basename(entry.file) !== `${m.sender}-${String(m.sender_seq).padStart(6,"0")}-${m.message_id}.json`) report(entry.file, "message-filename");
      chain.push(entry); messages.push(entry);
    }
    for (const entry of chain) {
      const m = entry.data;
      if (chain.filter(e => e.data.sender_seq === m.sender_seq).length > 1) report(entry.file, "sequence-fork");
      const parents = chain.filter(e => e.data.sender_seq === m.sender_seq - 1);
      if (m.sender_seq === 1 ? m.prev_message_sha256 !== null : !parents.some(e => e.sha256 === m.prev_message_sha256)) report(entry.file, "parent-hash-mismatch");
    }
  }
  const ordinals = new Set();
  for (const entry of read(`acks/${recipient}`)) {
    const a = entry.data, target = ids.get(a.message_id);
    const ordinal = basename(entry.file).match(/-(\d{6})-ack-/)?.[1];
    if (!ordinal || basename(entry.file) !== `${recipient}-${ordinal}-ack-${a.message_id}.json`) report(entry.file, "ack-filename");
    if (ordinal && ordinals.has(ordinal)) report(entry.file, "ack-ordinal-reused");
    ordinals.add(ordinal);
    if (a.recipient !== recipient || (target && (a.sender !== target.data.sender || !target.data.recipients.includes(recipient)))) report(entry.file, "ack-role-mismatch");
    if (!target) report(entry.file, "ack-target-missing");
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
