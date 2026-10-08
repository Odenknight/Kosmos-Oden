import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseMarkdownFile, buildGraph, ENGINE_VERSION} from '../../.review-main/node_modules/gkos-engine/dist/gkos-engine.mjs';
const root=path.resolve('.coordination/v1/artifacts/jeffrey/tag-fixtures-v1');
const expected=JSON.parse(fs.readFileSync(path.join(root,'expected.json'),'utf8'));
const rows=[];
for(const group of ['expected_inline_tags','expected_frontmatter_tags','expected_non_tags','qualify_before_implementation']) {
 for(const r of expected[group]) {
  const raw=fs.readFileSync(path.join(root,'notes',r.note),'utf8');
  const literal=r.literal ?? r.as_written ?? '#'+r.original;
  const actual=raw.slice(r.span.offset,r.span.offset+r.span.length);
  const prefix=raw.slice(0,r.span.offset);
  const line=prefix.split('\n').length,col=r.span.offset-prefix.lastIndexOf('\n');
  rows.push({group,note:r.note,literal,actual,span:r.span,actualLine:line,actualCol:col,pass:actual===literal&&line===r.span.line&&col===r.span.col});
 }
}
const parser=fs.readdirSync(path.join(root,'notes')).map(note=>{
 const parsed=parseMarkdownFile(fs.readFileSync(path.join(root,'notes',note),'utf8'));
 return {note,tags:parsed.tags,expectedFrontmatter:expected.expected_frontmatter_tags.filter(r=>r.note===note).map(r=>r.normalized_key),inlineExpected:expected.expected_inline_tags.filter(r=>r.note===note).length};
});
const result={engineVersion:ENGINE_VERSION,engineBundleSha256:crypto.createHash('sha256').update(fs.readFileSync('.review-main/node_modules/gkos-engine/dist/gkos-engine.mjs')).digest('hex'),coordinateStanding:'Existing .review-main dependency installation receipt resolves Engine 650eab4a6752227cae336d7556a57826c22a0d5a; bundle hash recorded, no fresh npm ci',spanUnits:'Audit uses JS UTF-16 code units; fixture prose claims bytes without an explicit unit contract',rows:rows.length,failed:rows.filter(r=>!r.pass),parser};
fs.writeFileSync('_Claude-Code/codex-review-20260909/fixture-audit.json',JSON.stringify(result,null,2)+'\n');
const g=buildGraph([{relativePath:'gkx-labels.md',content:fs.readFileSync(path.join(root,'notes/gkx-labels.md'),'utf8'),size:1000,mtimeMs:0}],[],0);
const projection=g.nodes.find(n=>n.path==='gkx-labels.md').gkx.projection;
fs.writeFileSync('_Claude-Code/codex-review-20260909/label-fixture-audit.json',JSON.stringify({authoredLabels:projection.authored.labels,effectiveLabels:projection.effective.labels,diagnosticCodes:projection.diagnostics.map(d=>d.code)},null,2)+'\n');
console.log(JSON.stringify(result,null,2));
