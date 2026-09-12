import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { auditMailbox } from "../scripts/audit-mailbox.mjs";

test("mailbox audit selects recipient and exposes forks, inverted roles and bad raw hashes", () => {
  const root = mkdtempSync(join(tmpdir(), "kosmos-mailbox-"));
  function put(dir, name, data) {
    mkdirSync(join(root, dir), { recursive: true });
    const path = join(root, dir, name), raw = JSON.stringify(data);
    writeFileSync(path, raw);
    return { path, raw, sha: createHash("sha256").update(raw).digest("hex") };
  }
  const m = { sender: "alice", recipients: ["bob", "carol"], sender_seq: 1, message_id: "first", prev_message_sha256: null, kind: "RESULT" };
  const first = put("messages/alice", "alice-000001-first.json", m);
  put("acks/bob", "bob-000001-ack-first.json", { recipient: "bob", sender: "alice", message_id: "first", message_sha256: first.sha, status: "ACCEPTED" });
  put("acks/carol", "carol-000001-ack-first.json", { recipient: "alice", sender: "carol", message_id: "first", message_sha256: "bad", status: "COMPLETED", outputs: [] });
  const clean = auditMailbox(root, "bob");
  assert.deepEqual(clean.findings, []);
  assert.equal(clean.acknowledgements.length, 1);
  assert.equal(clean.acknowledgements[0].completionVerified, false);
  const wrong = auditMailbox(root, "carol").findings.map(f => f.code);
  assert.ok(wrong.includes("ack-role-mismatch"));
  assert.ok(wrong.includes("ack-hash-mismatch"));
  assert.ok(wrong.includes("completion-evidence-missing"));
  put("messages/alice", "copy.json", m);
  put("messages/alice", "alice-000001-fork.json", { ...m, message_id: "fork" });
  put("messages/alice", "alice-000002-next.json", { ...m, message_id: "next", sender_seq: 2, prev_message_sha256: "wrong" });
  const broken = auditMailbox(root, "bob");
  assert.equal(broken.duplicates.length, 1);
  assert.ok(broken.findings.some(f => f.code === "sequence-fork"));
  assert.ok(broken.findings.some(f => f.code === "parent-hash-mismatch"));
  assert.equal(readFileSync(first.path, "utf8"), first.raw);
  assert.throws(() => auditMailbox(root, "../carol"), /Invalid recipient/);
});
