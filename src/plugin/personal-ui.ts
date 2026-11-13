/**
 * Personal Notes (0.9.5) — the Librarian web page.
 *
 * One self-contained HTML document, served by the Agent API at /ui on the same
 * port as REST and MCP. It calls /librarian, so the browser does exactly the
 * same hybrid search an agent gets: by words always, and by meaning when the
 * user has turned semantic search on. No language model runs and no tokens are
 * spent. The access token stays in sessionStorage and is sent as a
 * header; it is never put in a URL. No external assets, no CDN, no inline
 * script from anywhere but this string.
 */
export const PERSONAL_UI_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kosmos Librarian</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; margin: 0; padding: 24px; max-width: 900px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { margin: 0 0 20px; opacity: .7; font-size: 14px; }
  form { display: flex; gap: 8px; margin-bottom: 8px; }
  input[type=search] { flex: 1; padding: 10px 12px; font-size: 16px; border: 1px solid #8888; border-radius: 8px; background: transparent; color: inherit; }
  button { padding: 10px 16px; font-size: 16px; border-radius: 8px; border: 1px solid #8888; background: #8881; color: inherit; cursor: pointer; }
  button[disabled] { opacity: .5; cursor: progress; }
  #status { font-size: 13px; opacity: .7; min-height: 1.4em; margin: 8px 0; }
  #token { display: none; gap: 8px; margin: 8px 0 16px; }
  #token input { flex: 1; padding: 8px 10px; border: 1px solid #8888; border-radius: 8px; background: transparent; color: inherit; }
  pre#brief { white-space: pre-wrap; word-wrap: break-word; font: 14px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; border: 1px solid #8884; border-radius: 10px; padding: 16px; margin: 0; }
  .err { color: #c0392b; }
</style>
</head>
<body>
<h1>Kosmos Librarian</h1>
<p class="sub">Ask a question in plain language. Hybrid search over the notes this connection may read: word forms, names, phrases, steps and links, and — when semantic search is on in Kosmos-Oden — notes that say the same thing in other words. No AI assistant is involved and nothing leaves this computer.</p>
<form id="ask">
  <input id="q" type="search" autocomplete="off" placeholder="How do I request a new laptop?" aria-label="Question">
  <button id="go" type="submit">Ask</button>
</form>
<div id="token">
  <input id="tok" type="password" autocomplete="off" placeholder="Access token" aria-label="Access token">
  <button id="save" type="button">Use token</button>
</div>
<div id="status" role="status"></div>
<pre id="brief" hidden></pre>
<script>
(function () {
  var q = document.getElementById('q');
  var go = document.getElementById('go');
  var status = document.getElementById('status');
  var brief = document.getElementById('brief');
  var tokenRow = document.getElementById('token');
  var tok = document.getElementById('tok');

  function headers() {
    var t = sessionStorage.getItem('kosmosToken');
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  function showToken() { tokenRow.style.display = 'flex'; tok.focus(); }

  document.getElementById('save').addEventListener('click', function () {
    var v = tok.value.trim();
    if (!v) { showToken(); return; }
    sessionStorage.setItem('kosmosToken', v);
    tokenRow.style.display = 'none';
    ask();
  });

  function ask() {
    var question = q.value.trim();
    if (!question) { q.focus(); return; }
    go.disabled = true;
    status.className = '';
    status.textContent = 'Searching…';
    brief.hidden = true;
    var url = '/librarian?question=' + encodeURIComponent(question) + '&format=both';
    fetch(url, { headers: headers(), cache: 'no-store' }).then(function (r) {
      if (r.status === 401) { status.textContent = 'An access token is needed.'; showToken(); return null; }
      if (!r.ok) { return r.text().then(function (t) { throw new Error(t.slice(0, 300) || ('HTTP ' + r.status)); }); }
      return r.json();
    }).then(function (data) {
      if (!data) return;
      if (data.error) { status.className = 'err'; status.textContent = String(data.message || data.error); return; }
      var c = data.coverage || {};
      var s = data.semantic || {};
      var how = s.state === 'ready' || s.state === 'partial' ? 'by words and by meaning' : 'by words only';
      status.textContent = (data.total || 0) + ' notes found ' + how + ' · confidence ' + (data.confidence || 'none') +
        ' · examined ' + (c.searched || 0) + (c.omitted ? ' · skipped ' + c.omitted : '') +
        (data.corrections && data.corrections.length ? ' · read as ' + data.corrections.map(function (x) { return x.from + ' → ' + x.to; }).join(', ') : '');
      brief.textContent = data.brief || 'No brief in this response.';
      brief.hidden = false;
    }).catch(function (e) {
      status.className = 'err';
      status.textContent = e && e.message ? e.message : 'Search failed.';
    }).then(function () { go.disabled = false; });
  }

  document.getElementById('ask').addEventListener('submit', function (e) { e.preventDefault(); ask(); });
  q.focus();
})();
</script>
</body>
</html>
`;