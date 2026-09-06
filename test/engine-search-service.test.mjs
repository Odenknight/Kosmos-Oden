import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { EngineSearchClient } from "../dist/kosmos-engine-search.mjs";

test("retrieval client searches the actual installed Engine desktop service", { timeout: 45000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "kosmos-search-service-"));
  await mkdir(join(root, "notes"));
  await writeFile(join(root, "notes", "example.md"), "---\ngkx_version: " + JSON.stringify("2.3") + "\nuid: 01990ac0-0000-7000-8000-000000000002\ntitle: Orchard\ntype: semantic\nepistemic_state: observation\nauthorship_origin: authored\nsensitivity: public\ncreated_at: 2026-09-06T00:00:00Z\nupdated_at: 2026-09-06T00:00:00Z\n---\n# Orchard\n\nThe orchard contains apricot trees.\n");
  const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening"); const port = probe.address().port; await new Promise(done => probe.close(done));
  const stateRoot = await mkdtemp(join(tmpdir(), "kosmos-search-status-"));
  const state = join(stateRoot, "desktop-agent.status.json");
  const child = spawn(process.execPath, [resolve("node_modules/gkos-engine/dist/gkos-desktop-agent.mjs"), "--notes", root, "--status-file", state, "--port", String(port)], { windowsHide: true, stdio: "ignore", env: { ...process.env, GKOS_CODEX_MCP_ENABLED: "1" } });
  const exited = once(child, "exit");
  let client;
  try {
    let token;
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error("Synthetic Engine service exited before readiness.");
      try { token = (await readFile(join(stateRoot, "desktop-agent.mcp.token"), "utf8")).trim(); if (token) break; } catch {}
      await new Promise(done => setTimeout(done, 100));
    }
    assert.ok(token, "Engine did not create the synthetic MCP credential");
    let ready = false;
    while (Date.now() < deadline) {
      client = new EngineSearchClient(`http://127.0.0.1:${port}`, token);
      try { await client.connect(); ready = true; break; } catch { await client.close(); await new Promise(done => setTimeout(done, 200)); }
    }
    assert.equal(ready, true, "Actual service retrieval was not ready");
    const page = await client.search("apricot");
    assert.ok(page.items.some(hit => hit.canonical_path === "notes/example.md" && hit.citation.verified));
    const denied = new EngineSearchClient(`http://127.0.0.1:${port}`, "a".repeat(64));
    await assert.rejects(denied.connect()); await denied.close();
  } finally {
    await client?.close(); child.kill(); await exited;
  }
});
