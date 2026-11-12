/**
 * Real-Obsidian smoke trial for the installable archive.
 *
 * Installs the packaged plugin into a throwaway vault, starts a separate
 * Obsidian instance (its own --user-data-dir, so the user's own Obsidian,
 * vaults and settings are not touched), drives it over the Chromium DevTools
 * protocol and checks what the Node test suite can only simulate: the plugin
 * loads, the search worker runs from its Blob URL, reads and search write
 * nothing, optional tags patch only what was selected, and the connection
 * answers real HTTP on both MCP eras and refuses notes outside the shared
 * folders.
 *
 *   node scripts/obsidian-smoke.mjs --zip release/kosmos-oden-0.9.0-alpha.1.zip
 *        [--obsidian "C:\\Program Files\\Obsidian\\Obsidian.exe"] [--port 48231]
 *        [--app-asar <obsidian-x.y.z.asar>] [--hold <seconds>]
 *        [--importer-dir <folder with the Importer release files>]
 *        [--allow-older-app] [--keep]
 *
 * --allow-older-app lowers minAppVersion in the throwaway copy only, so the
 * trial can run on an Obsidian older than the release requires. The report
 * then says so: it is runtime evidence, not qualification of the minimum.
 * This is not an Importer trial and not a second-machine trial.
 */
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { chromium } from "@playwright/test";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);
const zip = arg("zip");
if (!zip) { console.error("usage: node scripts/obsidian-smoke.mjs --zip <archive> [--obsidian <exe>] [--port <n>] [--allow-older-app] [--keep]"); process.exit(2); }
const obsidianExe = arg("obsidian", process.platform === "win32" ? "C:\\Program Files\\Obsidian\\Obsidian.exe" : "obsidian");
const apiPort = Number(arg("port", "48231"));
const debugPort = apiPort + 1;

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail: String(detail) }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- throwaway vault ---- */
const tmp = mkdtempSync(join(os.tmpdir(), "kosmos-smoke-"));
const vault = join(tmp, "vault"), userData = join(tmp, "user-data"), unpack = join(tmp, "unpack");
const pluginDir = join(vault, ".obsidian", "plugins", "kosmos-oden");
for (const d of [userData, unpack, pluginDir, join(vault, "Notes"), join(vault, "Private"), join(vault, "Tag")]) mkdirSync(d, { recursive: true });
execFileSync("tar", ["-xf", resolve(zip), "-C", unpack]);
for (const f of readdirSync(join(unpack, "kosmos-oden"))) writeFileSync(join(pluginDir, f), readFileSync(join(unpack, "kosmos-oden", f)));
const manifestPath = join(pluginDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const requiredApp = manifest.minAppVersion;

const note = (rel, text) => writeFileSync(join(vault, rel), text);
note("Notes/plain.md", "A plain note with no properties block.\nIt mentions the heliotrope canary sentence.\n");
note("Notes/long.md", "# Long\n\n" + "filler words here. ".repeat(13000) + "\nThe tail sentence says quasarfinch at the very end.\n");
note("Notes/Mixed.md", "---\ntitle: Mixed case\n---\nİSTANBUL MixedCASE excerpt check.\n");
note("Private/secret.md", "This note is not shared. zebrafinch-secret\n");
note("Tag/crlf.md", "---\r\nkeep: \"as written\"  # comment stays\r\n---\r\nBody line one.\r\nBody line two.\r\n");
note("Tag/plain.md", "No properties here.\n");
note("Tag/broken.md", "---\nkey: [unclosed\nkey: again\n---\nBody of a note with broken properties.\n");
writeFileSync(join(vault, ".obsidian", "community-plugins.json"), JSON.stringify(["kosmos-oden"]));
// Optional: a folder holding the Obsidian Importer release files (main.js, manifest.json, styles.css).
const importerDir = arg("importer-dir");
if (importerDir) {
  const target = join(vault, ".obsidian", "plugins", "obsidian-importer");
  mkdirSync(target, { recursive: true });
  for (const f of readdirSync(importerDir)) copyFileSync(join(importerDir, f), join(target, f));
}
writeFileSync(join(userData, "obsidian.json"), JSON.stringify({ vaults: { kosmossmoke: { path: vault, ts: Date.now(), open: true } } }));
// Obsidian updates itself by dropping obsidian-<version>.asar into its user-data
// folder; the installer on disk can be older. Copy the newest one (read-only
// use) so the throwaway instance runs the app version the user actually runs.
const asarDir = process.platform === "win32" && process.env.APPDATA ? join(process.env.APPDATA, "obsidian") : null;
const numeric = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const appAsar = arg("app-asar", asarDir && existsSync(asarDir) ? readdirSync(asarDir).filter((f) => /^obsidian-[\d.]+\.asar$/.test(f)).sort(numeric).map((f) => join(asarDir, f)).pop() : undefined);
if (appAsar) copyFileSync(appAsar, join(userData, basename(appAsar)));

const hashTree = (dir) => {
  const out = {};
  const walk = (d) => { for (const name of readdirSync(d)) { const p = join(d, name); if (name === ".obsidian" || name === ".gkx") continue; statSync(p).isDirectory() ? walk(p) : (out[relative(dir, p).replace(/\\/g, "/")] = createHash("sha256").update(readFileSync(p)).digest("hex")); } };
  walk(dir);
  return out;
};

const request = (path, { method = "GET", token, headers = {}, body, host = "127.0.0.1" } = {}) => new Promise((resolveReq) => {
  const req = http.request({ host, port: apiPort, path, method, timeout: 5000, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json", Accept: "application/json, text/event-stream" } : {}), ...headers } }, (res) => {
    let text = ""; res.on("data", (c) => (text += c)); res.on("end", () => { let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ } resolveReq({ status: res.statusCode, json, text }); });
  });
  req.on("timeout", () => req.destroy(new Error("timeout")));
  req.on("error", (e) => resolveReq({ status: 0, json: null, text: String(e.code || e.message) }));
  req.end(body ? JSON.stringify(body) : undefined);
});

let child = null, browser = null, exitCode = 1;
try {
  /* ---- launch and attach ---- */
  child = spawn(obsidianExe, [`--user-data-dir=${userData}`, `--remote-debugging-port=${debugPort}`], { stdio: "ignore" });
  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(1000);
    try {
      browser ??= await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
      for (const ctx of browser.contexts()) for (const p of ctx.pages()) if (await p.evaluate(() => typeof window.app !== "undefined" && !!window.app.vault).catch(() => false)) page = p;
    } catch { /* not listening yet */ }
  }
  if (!page) throw new Error("Obsidian did not open the throwaway vault within 60 s");
  // The window title carries the app version; the user agent only carries the installer's.
  const versions = await page.evaluate(() => {
    let ipc; try { ipc = window.require("electron").ipcRenderer.sendSync("version"); } catch { /* not exposed */ }
    return { ipc: typeof ipc === "string" ? ipc : undefined, title: (document.title.match(/Obsidian v([\d.]+)/) || [])[1], installer: (navigator.userAgent.match(/obsidian\/([\d.]+)/i) || [])[1] };
  });
  const appVersion = versions.ipc || versions.title || versions.installer || "unknown";
  console.log(`app version: ipc ${versions.ipc ?? "?"}, title ${versions.title ?? "?"}, installer ${versions.installer ?? "?"}`);
  const older = appVersion.localeCompare(requiredApp, undefined, { numeric: true }) < 0;
  console.log(`Obsidian ${appVersion}; plugin ${manifest.version} requires ${requiredApp}`);
  if (older && !flag("allow-older-app")) throw new Error(`Obsidian ${appVersion} is older than the required ${requiredApp}. Update Obsidian, or pass --allow-older-app for runtime evidence only.`);
  if (older) {
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, minAppVersion: appVersion }, null, 2));
    await page.evaluate(() => window.app.plugins.loadManifests?.());
  }

  // Trust the throwaway vault's plugins (this instance and vault only).
  await page.evaluate(async () => {
    const plugins = window.app.plugins;
    if (plugins.isEnabled && !plugins.isEnabled()) await plugins.setEnable(true);
    if (!plugins.plugins["kosmos-oden"]) await plugins.enablePluginAndSave("kosmos-oden");
  });
  for (const b of await page.$$("button")) if (/trust author/i.test((await b.textContent()) || "")) await b.click().catch(() => {});
  await page.waitForFunction(() => !!window.app.plugins.plugins["kosmos-oden"], null, { timeout: 30000 });
  check("plugin loads from the installed archive", true, `Obsidian ${appVersion}${older ? ` (below required ${requiredApp}; gate lowered in the throwaway copy)` : ""}`);

  // `fn` is one of this script's own source literals; the argument travels as data, never as code.
  const P = (fn, a) => page.evaluate(([source, arg]) => (0, eval)(`(${source})`)(window.app.plugins.plugins["kosmos-oden"], arg), [fn, a ?? null]);
  await page.waitForFunction(() => window.app.workspace.layoutReady, null, { timeout: 30000 });

  /* ---- profile, search, no-write ---- */
  check("fresh install opens in the Personal profile with nothing shared", (await P("(p) => { const s = p.settings(); return s.activeProfile === 'personal' && s.personalNotes.includeFolders.length === 0; }")));
  check("connection is off on a fresh install", (await P("(p) => p.connection().state")) === "stopped");
  const before = hashTree(vault);
  let status = null;
  for (let i = 0; i < 60; i++) { status = await P("(p) => p.searchStatus()"); if (status.state === "ready" || status.state === "partial" || status.state === "failed") break; await sleep(500); }
  check("search worker runs from its Blob URL inside Obsidian", status.state === "ready", JSON.stringify(status));
  const tail = await P("(p) => p.search('quasarfinch').then((r) => ({ total: r.total, path: r.hits[0]?.path, excerpt: r.hits[0]?.excerpt }))");
  check("search finds text after 200,000 characters", tail.path === "Notes/long.md", JSON.stringify(tail));
  const mixed = await P("(p) => p.search('mixedcase excerpt').then((r) => r.hits[0]?.excerpt || '')");
  check("excerpt keeps the original capitalization", mixed.includes("İSTANBUL MixedCASE"), mixed);
  const bad = await P("(p) => p.search('\"unclosed').then(() => 'accepted', (e) => e.code || String(e))");
  check("an unclosed quote is rejected, not rewritten", bad === "invalid_query", bad);
  await P("(p) => p.openPersonalSearch()");
  check("Search my notes view opens", await P("(p) => window.app.workspace.getLeavesOfType('kosmos-oden-notes-search').length === 1"));

  /* ---- sharing and connection ---- */
  const saved = await P("(p) => p.updatePersonalNotes((d) => { d.includeFolders = ['Notes']; })");
  check("shared folder saved", saved.saved === true && (await P("(p) => p.sharedNoteCount()")) === 3, JSON.stringify(saved));
  const rejected = await P("(p) => p.updatePersonalNotes((d) => { d.excludeFolders = ['../outside']; })");
  check("a traversal folder entry is rejected and nothing is saved", rejected.saved === false && rejected.rejected.length === 1);
  await P("(p, port) => { p.agentSettings.agentPort = port; return p.saveAgentSettings(); }", apiPort);
  const conn = await P("(p) => p.connect()");
  check("Connect resolves on a really listening server", conn.state === "running", JSON.stringify({ state: conn.state, error: conn.error }));
  const token = await P("(p) => p.connectionToken()");
  const selfTest = await P("(p, port) => p.testConnection('http://127.0.0.1:' + port)", apiPort);
  check("Test connection passes every step over real HTTP", selfTest.ok, selfTest.steps.map((s) => `${s.name}:${s.ok ? "ok" : "FAIL"}`).join(" ") + ` ${selfTest.protocolVersion}`);
  check("persisted settings hold no token", !readFileSync(join(pluginDir, "data.json"), "utf8").includes(token));

  check("no token → 401", (await request("/overview")).status === 401);
  check("wrong token → 401", (await request("/overview", { token: token + "x" })).status === 401);
  check("unapproved Host → refused", [400, 403, 421].includes((await request("/overview", { token, headers: { Host: "evil.example" } })).status));
  const shared = await request("/note?path=Notes/plain.md", { token });
  check("shared note reads exactly over REST", shared.status === 200 && shared.json?.content === readFileSync(join(vault, "Notes/plain.md"), "utf8"));
  const hidden = await request("/note?path=Private/secret.md", { token }), missing = await request("/note?path=Notes/nope.md", { token });
  check("unshared and missing notes return the same not-found", hidden.status === 404 && missing.status === 404 && hidden.text.replace(/secret|nope|Private|Notes/g, "") === missing.text.replace(/secret|nope|Private|Notes/g, ""), `${hidden.status}/${missing.status}`);
  const leak = await request("/notes?query=zebrafinch-secret", { token });
  check("search over REST does not return an unshared note", leak.status === 200 && leak.json?.total === 0, `total ${leak.json?.total}`);
  check("existing-profile route is not served in the Personal profile", (await request("/graph", { token })).status === 404);

  // Desktop Obsidian resolves "file:<absolute path>" to any file on disk. Even with
  // the whole vault shared, such a path must not reach an excluded note.
  await P("(p) => p.updatePersonalNotes((d) => { d.includeFolders = ['/']; d.excludeFolders = ['Private']; })");
  const escape = await request(`/note?path=${encodeURIComponent("file:" + join(vault, "Private", "secret.md").replace(/\\/g, "/"))}`, { token });
  check("a file: path cannot reach an excluded note", escape.status !== 200 && !escape.text.includes("zebrafinch"), `status ${escape.status}`);
  await P("(p) => p.updatePersonalNotes((d) => { d.includeFolders = ['Notes']; d.excludeFolders = []; })");

  let long = "", offset = 0, hash, pages = 0;
  for (;;) {
    const r = await request(`/note?path=Notes/long.md&offset_chars=${offset}&limit_chars=64000${hash ? `&expected_hash=${hash}` : ""}`, { token });
    if (r.status !== 200) { long = `status ${r.status} ${r.text.slice(0, 120)}`; break; }
    long += r.json.content; hash = r.json.content_hash; pages++;
    if (!r.json.truncated) break;
    offset = r.json.next_offset_chars;
  }
  check("paged read reconstructs a long note byte for byte", long === readFileSync(join(vault, "Notes/long.md"), "utf8"), `${pages} pages`);

  const legacyInit = await request("/mcp", { method: "POST", token, body: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "obsidian-smoke", version: "1" } } } });
  check("older MCP (2025-06-18) initialize negotiates the requested revision", legacyInit.json?.result?.protocolVersion === "2025-06-18", legacyInit.text.slice(0, 120));
  const legacyTools = await request("/mcp", { method: "POST", token, headers: { "MCP-Protocol-Version": "2025-06-18" }, body: { jsonrpc: "2.0", id: 2, method: "tools/list" } });
  const names = (legacyTools.json?.result?.tools || []).map((t) => t.name).sort().join(",");
  check("older MCP lists exactly the five Personal tools", names === "get_lineage,get_note,get_related,search_notes,vault_overview", names);

  /* ---- optional: hold the connection open for a real client application ---- */
  const hold = Number(arg("hold", "0"));
  if (hold > 0) {
    const url = `http://127.0.0.1:${apiPort}/mcp`;
    writeFileSync(join(tmp, "client-http.json"), JSON.stringify({ mcpServers: { "kosmos-oden": { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2));
    writeFileSync(join(tmp, "client-stdio.json"), JSON.stringify({ mcpServers: { "kosmos-oden": { command: "node", args: [join(pluginDir, "kosmos-mcp-stdio.mjs")], env: { KOSMOS_MCP_URL: url, KOSMOS_MCP_TOKEN: token } } } }, null, 2));
    console.log(`HOLD ${hold}s  client configs in ${tmp} (throwaway token; deleted with the vault)`);
    await sleep(hold * 1000);
    const clients = await P("(p) => [...p.agentApi.sessions.values()].map((s) => ({ name: s.name, protocolVersion: s.protocolVersion }))");
    console.log("CLIENTS " + JSON.stringify(clients));
    results.push({ name: "client applications seen during the hold", ok: true, detail: JSON.stringify(clients) });
  }

  /* ---- bind address, from this computer only (not a second-machine test) ---- */
  const lan = (await P("(p) => p.reachableAddresses()"))[0];
  if (lan) {
    check("This computer only: not listening on the LAN address", (await request("/overview", { token, host: lan })).status === 0);
    await P("(p) => p.updatePersonalNotes((d) => { d.connection = { ...d.connection, bindMode: 'lan' }; })");
    for (let i = 0; i < 20 && (await P("(p) => p.connection().state")) !== "running"; i++) await sleep(250);
    check("Local network: answers on this computer's own LAN address", (await request("/overview", { token, host: lan })).status === 200);
    check("Local network: loopback still works", (await request("/overview", { token })).status === 200);
    check("Local network: a token is still required", (await request("/overview", { host: lan })).status === 401);
    await P("(p) => p.updatePersonalNotes((d) => { d.connection = { ...d.connection, bindMode: 'localhost' }; })");
    for (let i = 0; i < 20 && (await P("(p) => p.connection().state")) !== "running"; i++) await sleep(250);
    check("back to This computer only: LAN address closed again", (await request("/overview", { token, host: lan })).status === 0);
  } else console.log("SKIP  bind-address checks: this computer reports no LAN address");

  /* ---- no-write, then optional tags ---- */
  const afterReads = hashTree(vault);
  check("tags off: load, index, search, connect and agent reads changed no file", JSON.stringify(before) === JSON.stringify(afterReads));

  await P("(p) => p.updatePersonalNotes((d) => { d.tagging = { ...d.tagging, enabled: true, folders: ['Tag'], timestamps: true, uniqueIds: true }; })");
  const plan = await P("(p) => p.previewTagging().then((plan) => JSON.parse(JSON.stringify(plan)))");
  check("preview writes nothing", JSON.stringify(hashTree(vault)) === JSON.stringify(afterReads));
  const applied = await P("(p) => p.previewTagging().then((plan) => p.applyTagging(plan)).then((r) => ({ written: r.written.map((w) => w.path ?? w), skipped: r.skipped.map((s) => s.path ?? s), failed: r.failed.length }))");
  const crlf = readFileSync(join(vault, "Tag/crlf.md"), "utf8"), plain = readFileSync(join(vault, "Tag/plain.md"), "utf8");
  check("apply adds uid and time stamps and keeps body, comment and CRLF", /\r\nuid: /.test(crlf) && crlf.includes("keep: \"as written\"  # comment stays\r\n") && crlf.endsWith("---\r\nBody line one.\r\nBody line two.\r\n") && !/[^\r]\n/.test(crlf), JSON.stringify(applied));
  const plainKeys = (plain.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "").split("\n").map((line) => line.split(":")[0]).sort().join(",");
  check("a note with no properties gets only the selected fields", plainKeys === "created_at,uid,updated_at" && plain.endsWith("\n---\nNo properties here.\n"), plainKeys);
  check("a note with broken properties is left untouched (Obsidian's YAML parser or the scanner refuses it)", createHash("sha256").update(readFileSync(join(vault, "Tag/broken.md"))).digest("hex") === before["Tag/broken.md"]);
  const afterApply = hashTree(vault);
  check("only notes in the tagging folder changed", Object.keys(afterApply).every((k) => k.startsWith("Tag/") || afterApply[k] === before[k]));
  await sleep(1500);
  const again = await P("(p) => p.previewTagging().then((plan) => p.applyTagging(plan)).then((r) => r.written.length)");
  check("applying again changes nothing (no new uid, no stamp churn)", again === 0 && JSON.stringify(hashTree(vault)) === JSON.stringify(afterApply), `plan notes first run: ${plan.notes?.length ?? "?"}`);

  /* ---- lifecycle ---- */
  await P("(p) => p.rotateToken()");
  check("rotated token: the old one is refused at once", (await request("/overview", { token })).status === 401);
  await P("(p) => p.disconnect()");
  check("Disconnect: nothing answers", (await request("/overview", { token })).status === 0);
  if (importerDir) {
    // The Importer itself is not exercised: this only proves Kosmos finds it and can open it.
    await page.evaluate(async () => { await window.app.plugins.loadManifests(); await window.app.plugins.enablePluginAndSave("obsidian-importer"); });
    const imp = await P("(p) => p.importer()");
    check("Importer is detected with its version", imp.state === "enabled" && /^\d+\.\d+\.\d+$/.test(imp.version || ""), JSON.stringify(imp));
    // Record every window that appears, so a window that opens and closes is still seen.
    await page.evaluate(() => {
      window.__smokeModals = [];
      new MutationObserver((records) => { for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && (n.matches?.(".modal-container, .modal") || n.querySelector?.(".modal"))) setTimeout(() => window.__smokeModals.push((n.textContent || "").slice(0, 80)), 50); }).observe(document.body, { childList: true, subtree: true });
    });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error") pageErrors.push(m.text().slice(0, 160)); });
    const opened = await P("(p) => p.openImporter('Import')");
    await page.waitForFunction(() => window.__smokeModals.some((t) => /import/i.test(t)), null, { timeout: 8000 }).catch(() => {});
    if (pageErrors.length) console.log("PAGE ERRORS " + JSON.stringify(pageErrors));
    const modal = await page.evaluate(() => window.__smokeModals.join(" | "));
    const still = await page.evaluate(() => document.querySelectorAll(".modal").length);
    const commands = await page.evaluate(() => Object.keys(window.app.commands.commands).filter((id) => /import/i.test(id)).join(","));
    check("Open Importer opens the Importer window through its command", opened === true && /import/i.test(modal), `returned ${opened}; windows seen "${modal}"; open now ${still}; commands ${commands}`);
    check("the import folder is held back from automatic time stamps until marked finished", (await P("(p) => p.pendingImportFolders()")).includes("Import"));
    await page.keyboard.press("Escape");
  } else check("Importer absent is reported, not thrown", ["missing", "unknown"].includes((await P("(p) => p.importer().state"))));
  await page.evaluate(() => window.app.plugins.disablePlugin("kosmos-oden"));
  check("plugin unloads cleanly", await page.evaluate(() => !window.app.plugins.plugins["kosmos-oden"]));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed on Obsidian ${appVersion}${older ? ` (required ${requiredApp}: runtime evidence only)` : ""}`);
  writeFileSync(resolve("release", "OBSIDIAN-SMOKE.json"), JSON.stringify({ obsidian: appVersion, requiredApp, gateLowered: older, plugin: manifest.version, archive: zip, archiveSha256: createHash("sha256").update(readFileSync(resolve(zip))).digest("hex"), platform: `${process.platform} ${os.release()}`, results }, null, 2) + "\n");
  exitCode = failed.length ? 1 : 0;
} catch (e) {
  console.error("obsidian-smoke: " + (e?.stack || e));
} finally {
  await browser?.close().catch(() => {});
  if (child?.pid) { try { process.platform === "win32" ? execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }) : child.kill(); } catch { /* already gone */ } }
  if (!flag("keep")) { await sleep(1500); try { rmSync(tmp, { recursive: true, force: true }); } catch { console.error(`left ${tmp} (still locked)`); } } else console.log(`kept ${tmp}`);
}
process.exit(exitCode);
