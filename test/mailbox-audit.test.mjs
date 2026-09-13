import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { auditMailbox, verifyMailboxReference, verifyMailboxBundle, mailboxSchemaFindings } from "../scripts/audit-mailbox.mjs";

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
  assert.ok(clean.schemaFindings.some(x=>x.code==="schema-required-field"), "minimal integrity fixtures must not be certified as complete protocol records");
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
  mkdirSync(join(root,".coordination/v1/artifacts"),{recursive:true});
  for (const path of [".coordination/v1/BOARD.md", ".coordination/v1/PROTOCOL-1.1.0.md", ".coordination/v1/artifacts/BOARD.md"]) {
    writeFileSync(join(root,path),"new revision");
    assert.equal(verifyMailboxReference(root,{path,sha256}),path === ".coordination/v1/BOARD.md" ? "reference-superseded" : "reference-hash-mismatch");
  }
  assert.equal(verifyMailboxReference(root,{path:"bundle",sha256sums:"SHA256SUMS"}),"reference-schema");
});

test("mailbox envelope reads enforce the exact 64 KiB boundary", () => {
  const root=mkdtempSync(join(tmpdir(),"kosmos-mailbox-size-"));
  mkdirSync(join(root,"messages/alice"),{recursive:true});
  const message=JSON.stringify({sender:"alice",recipients:["bob"],sender_seq:1,message_id:"sized",prev_message_sha256:null,kind:"RESULT"});
  const path=join(root,"messages/alice/alice-000001-sized.json");
  writeFileSync(path,message.padEnd(65536," "));
  assert.equal(auditMailbox(root,"bob").messageCount,1);
  writeFileSync(path,message.padEnd(65537," "));
  const report=auditMailbox(root,"bob");
  assert.equal(report.messageCount,0);
  assert.deepEqual(report.findings,[{file:"messages/alice/alice-000001-sized.json",code:"oversized"}]);
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
  const manifestHash=createHash("sha256").update(readFileSync(manifest)).digest("hex");
  assert.equal(verifyMailboxBundle(root,ref,manifestHash),null);
  assert.equal(verifyMailboxBundle(root,ref,"0".repeat(64)),"reference-manifest-hash-mismatch");
  assert.equal(verifyMailboxBundle(root,ref,"not-a-digest"),"reference-schema");
  assert.equal(verifyMailboxBundle(root,{...ref,host:"another-host"}),"reference-host-unresolved");
  writeFileSync(join(root,"artifacts/alice/note.md"),"changed");
  assert.equal(verifyMailboxBundle(root,ref,manifestHash),"reference-hash-mismatch");
  assert.equal(verifyMailboxBundle(root,ref),"reference-hash-mismatch");
  writeFileSync(manifest,`${hash}  ../../outside.md\n`);
  assert.equal(verifyMailboxBundle(root,ref),"reference-path-invalid");
  writeFileSync(manifest,`${hash}  note.md\n${hash}  note.md\n`);
  writeFileSync(join(root,"artifacts/alice/note.md"),"retained");
  assert.equal(verifyMailboxBundle(root,ref),"reference-manifest-invalid");
});


test("retained heads detect removed suffixes and rewritten observations without updating state", () => {
  const root = mkdtempSync(join(tmpdir(), "kosmos-mailbox-heads-"));
  mkdirSync(join(root,"messages/alice"),{recursive:true});
  const put = (sequence, previous) => {
    const raw=JSON.stringify({sender:"alice",recipients:["bob"],sender_seq:sequence,message_id:`m${sequence}`,prev_message_sha256:previous});
    const path=join(root,`messages/alice/alice-${String(sequence).padStart(6,"0")}-m${sequence}.json`);
    writeFileSync(path,raw);return {path,sha256:createHash("sha256").update(raw).digest("hex")};
  };
  const first=put(1,null),second=put(2,first.sha256);
  const heads=[{sender:"alice",sequence:2,sha256:second.sha256}];
  assert.deepEqual(auditMailbox(root,"bob",root,heads).findings,[]);
  writeFileSync(second.path,readFileSync(second.path,"utf8")+" ");
  assert.ok(auditMailbox(root,"bob",root,heads).findings.some(x=>x.code==="retained-head-changed"));
  unlinkSync(second.path);
  assert.ok(auditMailbox(root,"bob",root,heads).findings.some(x=>x.code==="retained-head-missing"));
  assert.equal(heads[0].sha256,second.sha256);
  assert.throws(()=>auditMailbox(root,"bob",root,[{sender:"../outside",sequence:2,sha256:second.sha256}]),/Invalid retained head/);
});


test("protocol schema checks missing fields, roles and ACK evidence shapes", () => {
  const message={schema_version:1,message_id:"m",sender:"alice",recipients:["bob"],sender_seq:1,task_id:"task",in_reply_to:null,created_utc:"2026-09-13T00:00:00Z",kind:"RESULT",payload:{subject:"Result",body_markdown:"Data"},input_plan_digests:[],artifacts:[],prev_message_sha256:null};
  assert.deepEqual(mailboxSchemaFindings(message,"message"),[]);
  assert.ok(mailboxSchemaFindings({...message,kind:"ASSIGNMENT"},"message").includes("assignment-role-mismatch"));
  assert.ok(mailboxSchemaFindings({...message,recipients:["bob","bob"]},"message").includes("schema-recipients"));
  assert.ok(mailboxSchemaFindings({...message,created_utc:"yesterday"},"message").includes("schema-time"));
  const incomplete={...message};delete incomplete.payload;
  assert.ok(mailboxSchemaFindings(incomplete,"message").includes("schema-required-field"));
  const ack={schema_version:1,ack_id:"a",sender:"alice",recipient:"bob",message_id:"m",message_sha256:"a".repeat(64),status:"RECEIVED",created_utc:message.created_utc,reason:"Received",review_message_id:null,outputs:[]};
  assert.deepEqual(mailboxSchemaFindings(ack,"ack"),[]);
  assert.ok(mailboxSchemaFindings({...ack,outputs:null},"ack").includes("schema-outputs"));
});


test("schema time rejects calendar rollover and accepts actual leap days", () => {
  for (const created_utc of ["2026-02-29T00:00:00Z","2026-02-30T00:00:00Z","1900-02-29T00:00:00Z","2026-04-31T00:00:00Z","2026-09-13T24:00:00Z","2026-09-13T00:00:00+24:00"])
    assert.ok(mailboxSchemaFindings({created_utc},"message").includes("schema-time"),created_utc);
  for (const created_utc of ["2000-02-29T00:00:00Z","2024-02-29T23:59:59.1234567Z","2026-09-13T00:00:00-04:00"])
    assert.equal(mailboxSchemaFindings({created_utc},"message").includes("schema-time"),false,created_utc);
});

test("ACK output hashes are checked without elevating completion status", () => {
  const root=mkdtempSync(join(tmpdir(),"kosmos-mailbox-output-"));
  mkdirSync(join(root,"messages"));mkdirSync(join(root,"acks/bob"),{recursive:true});
  writeFileSync(join(root,"result.md"),"output");
  const ack={recipient:"bob",sender:"alice",message_id:"m",status:"COMPLETED",outputs:[{path:"result.md",sha256:"0".repeat(64)}]};
  writeFileSync(join(root,"acks/bob/bob-000001-ack-m.json"),JSON.stringify(ack));
  const result=auditMailbox(root,"bob",root);
  assert.ok(result.findings.some(x=>x.code==="output-reference-hash-mismatch"));
  assert.equal(result.acknowledgements[0].completionVerified,false);
});
