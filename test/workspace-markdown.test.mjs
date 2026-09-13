import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWorkspaceMarkdown } from '../dist/kosmos-workspace-markdown.mjs';

test('Notes preview renders Markdown structure without a host or network loader',()=>{
  const html=renderWorkspaceMarkdown('# Heading\n\n**Bold** and _emphasis_\n\n- one\n- two\n\n```js\nconst x = 1;\n```');
  for(const fragment of ['<h1>Heading</h1>','<strong>Bold</strong>','<em>emphasis</em>','<ul>','<code class="language-js">']) assert.ok(html.includes(fragment));
});

test('HTML, embeds and resource URLs cannot become active preview elements',()=>{
  const source='<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n<iframe src="https://example.invalid"></iframe>\n\n![alt](https://example.invalid/track)\n\n![[Hidden.md]]\n\n[external](https://example.invalid)\n\n[local](Hidden.md)';
  const html=renderWorkspaceMarkdown(source);
  assert.doesNotMatch(html,/<(?:script|img|iframe|a|object|embed|svg)\b/i);
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('![[Hidden.md]]'));
  assert.ok(html.includes('<span class="kosmos-notes-link">external</span>'));
});

test('unsafe and encoded URL schemes remain inert',()=>{
  for(const target of ['javascript:alert(1)','data:text/html;base64,PHNjcmlwdD4=','vbscript:msgbox(1)','file:///C:/secret','javascript&#58;alert(1)','https://safe.invalid']) {
    const html=renderWorkspaceMarkdown(`[label](${target})\n\n![alt](${target})`);
    assert.doesNotMatch(html,/<a\b|<img\b|\shref=|\ssrc=/i);
  }
  assert.throws(()=>renderWorkspaceMarkdown('x'.repeat(200001)),/PREVIEW_BUDGET/);
});
