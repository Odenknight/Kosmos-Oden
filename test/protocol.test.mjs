/** Host↔renderer protocol validation tests (Doc1 §3.4, Doc2 §5.7). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  KOSMOS_PROTOCOL,
  KOSMOS_PROTOCOL_VERSION,
  validateHostMessage,
  validateRendererMessage,
  validateRendererOpenMessage,
  wrap,
} from "../dist/kosmos-protocol.mjs";

test('readable acknowledgements have bounded IDs and enumerated errors',()=>{
  assert.equal(validateRendererMessage(wrap('readable-state',{generation:1,selectedId:null,error:null})).ok,true);
  for(const payload of [{generation:0,selectedId:null,error:null},{generation:1,selectedId:'x'.repeat(4097),error:null},{generation:1,selectedId:null,error:'raw provider error'}]) assert.equal(validateRendererMessage(wrap('readable-state',payload)).ok,false);
});

test('renderer selection intent requires a bounded ID or explicit clear and positive integral generation',()=>{
  assert.equal(validateRendererMessage(wrap('readable-selection',{generation:2,id:null})).ok,true);
  assert.equal(validateRendererMessage(wrap('readable-selection',{generation:2,id:'file:Note.md'})).ok,true);
  for(const payload of [{generation:0,id:'x'},{generation:1.5,id:'x'},{generation:1,id:''},{generation:1,id:'x'.repeat(4097)},{generation:1,id:42}]) {
    assert.equal(validateRendererMessage(wrap('readable-selection',payload)).ok,false);
  }
});

test('readable selection requires a valid generation and bounded ID',()=>{
  assert.equal(validateHostMessage(wrap('select-readable-note',{generation:2,id:'file:Note.md'})).ok,true);
  for(const payload of [{generation:0,id:'x'},{generation:1.5,id:'x'},{generation:1,id:''},{generation:1,id:'x'.repeat(4097)}]) assert.equal(validateHostMessage(wrap('select-readable-note',payload)).ok,false);
});

test('readable graph validates scope payload bounds, paths, endpoints and generation', () => {
  const graph={builtAt:'2026-09-13',nodes:[{id:'file:A.md',path:'A.md',title:'A',area:'Vault',type:'note',tags:[],timestamp:null}],links:[]};
  const valid=()=>wrap('readable-graph',{generation:1,graph:structuredClone(graph)});
  assert.equal(validateHostMessage(valid()).ok,true);
  const large=valid();
  large.payload.graph.nodes[0].tags=Array(800).fill('x'.repeat(4096));
  assert.equal(validateHostMessage(large).ok,true);
  large.payload.graph.nodes=Array.from({length:3},(_,i)=>({...large.payload.graph.nodes[0],id:`file:${i}.md`,path:`${i}.md`}));
  assert.equal(validateHostMessage(large).ok,false);
  for(const mutate of [
    m=>{m.payload.generation=0;}, m=>{m.payload.generation=1.5;},
    m=>{m.payload.graph.nodes[0].path='../private.md';},
    m=>{m.payload.graph.nodes.push({...m.payload.graph.nodes[0]});},
    m=>{m.payload.graph.links.push({source:'file:A.md',target:'missing',kind:'wikilink'});},
    m=>{m.payload.graph.nodes[0].tags=['x'.repeat(4097)];},
    m=>{m.payload.graph.nodes[0].timestamp='invalid';},
  ]) {const message=valid();mutate(message);assert.equal(validateHostMessage(message).ok,false);}
});

test("legacy renderer opens receive the same path and envelope checks",()=>{
  for(const [legacy,current] of [["kosmos:open","open-note"],["kosmos:folder","open-folder"]]) {
    const accepted=validateRendererOpenMessage({type:legacy,path:"Notes/Readable.md"});
    assert.equal(accepted.ok,true);assert.equal(accepted.message.type,current);
    for(const path of ["../secret.md","/etc/passwd","C:\\Windows\\secret.md","sub/../../secret.md","", "https://example.test", "obsidian:open", "C:relative.md", "Notes/\u0000bad.md"]) {
      assert.equal(validateRendererOpenMessage({type:legacy,path}).ok,false,path);
      assert.equal(validateRendererOpenMessage(wrap(current,{path})).ok,false,path);
    }
    assert.equal(validateRendererOpenMessage({protocol:"foreign",type:legacy,path:"Notes/Readable.md"}).ok,false);
    assert.equal(validateRendererOpenMessage({version:999,type:legacy,path:"Notes/Readable.md"}).ok,false);
  }
  assert.equal(validateRendererOpenMessage(wrap("open-note",{path:"Notes/Readable.md"})).ok,true);
});

test("wrap produces a versioned envelope", () => {
  const m = wrap("vault-snapshot", { files: [] });
  assert.equal(m.protocol, KOSMOS_PROTOCOL);
  assert.equal(m.version, KOSMOS_PROTOCOL_VERSION);
  assert.equal(m.type, "vault-snapshot");
});

test("valid snapshot accepted", () => {
  const r = validateHostMessage(wrap("vault-snapshot", {
    files: [{ relativePath: "Notes/A.md", content: "hi" }], folders: ["Notes"], attachments: [],
  }));
  assert.equal(r.ok, true);
});

test("snapshot and delta accept only boolean Navigation feature state", () => {
  assert.equal(validateHostMessage(wrap("vault-snapshot", { files: [], navigationEnabled: true })).ok, true);
  assert.equal(validateHostMessage(wrap("vault-delta", { changed: [], navigationEnabled: false })).ok, true);
  assert.match(validateHostMessage(wrap("vault-snapshot", { files: [], navigationEnabled: "yes" })).reason, /must be a boolean/);
  assert.match(validateHostMessage(wrap("vault-delta", { changed: [], navigationEnabled: 1 })).reason, /must be a boolean/);
});

test("valid delta accepted", () => {
  const r = validateHostMessage(wrap("vault-delta", {
    changed: [{ relativePath: "A.md", content: "x" }], removed: ["B.md"], renames: [{ from: "C.md", to: "D.md" }],
  }));
  assert.equal(r.ok, true);
});

test("foreign messages ignored silently (no reason)", () => {
  assert.deepEqual(validateHostMessage(null), { ok: false });
  assert.deepEqual(validateHostMessage({ type: "kosmos:files" }), { ok: false });
  assert.deepEqual(validateHostMessage({ protocol: "something-else", version: 1 }), { ok: false });
});

test("unknown protocol version rejected with a reason", () => {
  const r = validateHostMessage({ protocol: KOSMOS_PROTOCOL, version: 999, type: "vault-snapshot", payload: { files: [] } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /unsupported protocol version/);
});

test("unknown message type rejected with a reason", () => {
  const r = validateHostMessage(wrap("do-evil", {}));
  assert.equal(r.ok, false);
  assert.match(r.reason, /unsupported message type/);
});

test("path traversal / absolute paths rejected in snapshots", () => {
  for (const bad of ["../secret.md", "/etc/passwd.md", "C:\\Windows\\x.md", "sub/../../x.md"]) {
    const r = validateHostMessage(wrap("vault-snapshot", { files: [{ relativePath: bad, content: "x" }] }));
    assert.equal(r.ok, false, `should reject ${bad}`);
    assert.match(r.reason, /malformed or unsafe path/);
  }
});

test("path traversal rejected in delta removed/renames", () => {
  assert.equal(validateHostMessage(wrap("vault-delta", { removed: ["../x.md"] })).ok, false);
  assert.equal(validateHostMessage(wrap("vault-delta", { renames: [{ from: "a.md", to: "/abs.md" }] })).ok, false);
});

test("malformed payloads rejected", () => {
  assert.match(validateHostMessage(wrap("vault-snapshot", { files: "nope" })).reason, /must be an array/);
  assert.match(validateHostMessage({ protocol: KOSMOS_PROTOCOL, version: 1, type: "vault-snapshot" }).reason, /missing payload/);
});

test("visibility (host->renderer): boolean accepted, non-boolean rejected", () => {
  assert.equal(validateHostMessage(wrap("visibility", { visible: false })).ok, true);
  assert.equal(validateHostMessage(wrap("visibility", { visible: true })).ok, true);
  const bad = validateHostMessage(wrap("visibility", { visible: "yes" }));
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /must be a boolean/);
});

test("agent-traversal (host->renderer): valid accepted, unsafe paths rejected", () => {
  const ok = validateHostMessage(wrap("agent-traversal", { paths: ["Ideas/Engine v2.md"], tool: "get_note", agent: "Hermes", agentId: "agent:hermes" }));
  assert.equal(ok.ok, true);
  const bad = validateHostMessage(wrap("agent-traversal", { paths: ["../secret.md"], tool: "get_note" }));
  assert.equal(bad.ok, false);
  const noTool = validateHostMessage(wrap("agent-traversal", { paths: ["a.md"], tool: 5 }));
  assert.equal(noTool.ok, false);
  const badAgentId = validateHostMessage(wrap("agent-traversal", { paths: ["a.md"], tool: "get_note", agentId: 5 }));
  assert.equal(badAgentId.ok, false);
});

test("renderer->host: open-note and open-folder accepted; unsafe/foreign rejected", () => {
  assert.equal(validateRendererMessage(wrap("open-note", { path: "Ideas/Engine v2.md", label: "Engine v2" })).ok, true);
  assert.equal(validateRendererMessage(wrap("open-folder", { path: "Ideas" })).ok, true);
  assert.equal(validateRendererMessage(wrap("open-folder", { path: "../etc" })).ok, false);
  assert.deepEqual(validateRendererMessage({ type: "kosmos:open", path: "a.md" }), { ok: false }); // not ours
  assert.match(validateRendererMessage(wrap("delete-everything", {})).reason, /unsupported message type/);
});
