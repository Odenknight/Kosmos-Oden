import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { auditMailbox, verifyMailboxReference, verifyMailboxBundle } from "../scripts/audit-mailbox.mjs";

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
  put("messages/alice", "invalid.json", null);
  put("acks/bob", "invalid.json", null);
  const malformed = auditMailbox(root, "bob").findings.map(f => f.code);
  assert.ok(malformed.includes("message-schema"));
  assert.ok(malformed.includes("ack-schema"));
  assert.throws(() => auditMailbox(root, "../carol"), /Invalid recipient/);
});


test("conflicting message IDs and forked parents remain explicit at ACK resolution", () => {
  const root = mkdtempSync(join(tmpdir(), "kosmos-mailbox-conflict-"));
  const put = (dir, name, data) => {
    mkdirSync(join(root, dir), { recursive: true });
    const raw = JSON.stringify(data); writeFileSync(join(root, dir, name), raw);
    return createHash("sha256").update(raw).digest("hex");
  };
  const first = {sender:"alice",recipients:["bob"],sender_seq:1,message_id:"same",prev_message_sha256:null,kind:"RESULT"};
  const hash = put("messages/alice", "alice-000001-same.json", first);
  put("messages/alice", "alice-000001-other.json", {...first,message_id:"other"});
  put("messages/alice", "alice-000002-next.json", {...first,sender_seq:2,message_id:"next",prev_message_sha256:hash});
  put("messages/carol", "carol-000001-same.json", {...first,sender:"carol"});
  put("acks/bob", "bob-000001-ack-same.json", {recipient:"bob",sender:"alice",message_id:"same",message_sha256:hash,status:"RECEIVED"});
  put("acks/bob", "bob-000001-ack-next.json", {recipient:"bob",sender:"alice",message_id:"next",message_sha256:"bad",status:"RECEIVED"});
  const result = auditMailbox(root,"bob");
  assert.ok(result.findings.some(x=>x.code==="ack-target-ambiguous" && x.file.endsWith("ack-same.json")));
  assert.equal(result.findings.some(x=>["ack-target-missing","ack-hash-mismatch","ack-role-mismatch"].includes(x.code) && x.file.endsWith("ack-same.json")), false);
  assert.ok(result.findings.some(x=>x.code==="parent-chain-ambiguous" && x.file.endsWith("next.json")));
  assert.ok(result.findings.some(x=>x.code==="ack-ordinal-reused"));
  assert.ok(result.acknowledgements.every(x=>x.completionVerified===false));
});


test("unpublished temporary files are ignored while malformed delivered files remain findings", () => {
  const root = mkdtempSync(join(tmpdir(), "kosmos-mailbox-interrupted-"));
  for (const dir of ["messages/alice", "acks/bob"]) {
    mkdirSync(join(root,dir),{recursive:true});
    writeFileSync(join(root,dir,".tmp-interrupted.json"), "{partial");
  }
  assert.deepEqual(auditMailbox(root,"bob").findings, []);
  writeFileSync(join(root,"messages/alice","published.json"), "{partial");
  const result = auditMailbox(root,"bob");
  assert.deepEqual(result.findings, [{file:"messages/alice/published.json",code:"invalid-json"}]);
  assert.equal(readFileSync(join(root,"messages/alice/.tmp-interrupted.json"),"utf8"),"{partial");
});


test("file references hash raw bytes, confine paths, and distinguish superseded mutable files", () => {
  const root = mkdtempSync(join(tmpdir(), "kosmos-mailbox-refs-"));
  const raw = Buffer.from("\ufeffretained\r\n", "utf8");
  writeFileSync(join(root,"source.md"),raw);
  const sha256 = createHash("sha256").update(raw).digest("hex");
  assert.equal(verifyMailboxReference(root,{path:"source.md",sha256}),null);
  for (const path of ["../source.md","/source.md","C:/source.md","folder/../source.md","folder\\source.md"])
    assert.equal(verifyMailboxReference(root,{path,sha256}),"reference-path-invalid");
  assert.equal(verifyMailboxReference(root,{path:"source.md",sha256:"0".repeat(64)}),"reference-hash-mismatch");
  assert.equal(verifyMailboxReference(root,{path:"missing.md",sha256}),"reference-missing");
  writeFileSync(join(root,"COMMUNICATIONS.md"),"new revision");
  assert.equal(verifyMailboxReference(root,{path:"COMMUNICATIONS.md",sha256}),"reference-superseded");
  assert.equal(verifyMailboxReference(root,{path:"bundle",sha256sums:"SHA256SUMS"}),"reference-schema");
});


test("bundle verification checks members without claiming an unbound manifest authentic", () => {
  const root = mkdtempSync(join(tmpdir(), "kosmos-mailbox-bundle-"));
  mkdirSync(join(root,"artifacts/alice"),{recursive:true});
  writeFileSync(join(root,"artifacts/alice/note.md"),"retained");
  const hash=createHash("sha256").update("retained").digest("hex");
  const manifest=join(root,"artifacts/alice/SHA256SUMS");
  const ref={path:"artifacts/alice",sha256sums:"SHA256SUMS"};
  writeFileSync(manifest,`${hash} *note.md\n`);
  assert.equal(verifyMailboxBundle(root,ref),"reference-manifest-unbound");
  assert.equal(verifyMailboxBundle(root,{...ref,host:"another-host"}),"reference-host-unresolved");
  writeFileSync(join(root,"artifacts/alice/note.md"),"changed");
  assert.equal(verifyMailboxBundle(root,ref),"reference-hash-mismatch");
  writeFileSync(manifest,`${hash}  ../../outside.md\n`);
  assert.equal(verifyMailboxBundle(root,ref),"reference-path-invalid");
  writeFileSync(manifest,`${hash}  note.md\n${hash}  note.md\n`);
  writeFileSync(join(root,"artifacts/alice/note.md"),"retained");
  assert.equal(verifyMailboxBundle(root,ref),"reference-manifest-invalid");
});
