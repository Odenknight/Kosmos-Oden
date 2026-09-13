import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync(process.execPath, ["scripts/prepare-desktop.mjs"], { cwd: root, stdio: "pipe" });
const html = readFileSync(new URL("../src-tauri/generated/index.html", import.meta.url), "utf8");
const bridge = html.match(/<script data-kosmos-desktop-bridge>([\s\S]*?)<\/script>/)?.[1];
assert.ok(bridge, "generated native bridge missing");

function harness(invoke) {
  let ready, click;
  const navigations = [], status = { textContent: "" }, start = {};
  const bar = { style: {}, setAttribute() {}, querySelector: selector => selector.includes("role=") ? status : start,
    addEventListener: (_, handler) => { click = handler; } };
  vm.runInNewContext(bridge, {
    window: { __TAURI__: { core: { invoke } } },
    document: { createElement: () => bar, body: { appendChild() {} } },
    addEventListener: (_, handler) => { ready = handler; },
    location: { pathname: "/index.html", replace: url => navigations.push(url) },
    fetch: async () => ({ ok: true, json: async () => ({ state: "serving" }) }),
    AbortController, setTimeout, clearTimeout,
  });
  ready();
  return { click: action => click({ target: { dataset: { action } } }), navigations, status };
}

test("generated Start and Reconnect navigate only after native readiness", async () => {
  for (const action of ["start", "reconnect"]) {
    let release, requested;
    const tokenRequested = new Promise(resolve => { requested = resolve; });
    const h = harness(async command => {
      if (command === "take_viewer_token") { requested(); return new Promise(resolve => { release = resolve; }); }
      return { running: true };
    });
    const pending = h.click(action);
    await tokenRequested;
    assert.equal(h.navigations.length, 0);
    release("a".repeat(64));
    await pending;
    assert.deepEqual(h.navigations, ["/index.html?api=http%3A%2F%2F127.0.0.1%3A4814"]);
  }
});

test("generated Stop cancels late startup navigation and preserves stopped status", async () => {
  let release, requested;
  const tokenRequested = new Promise(resolve => { requested = resolve; });
  const h = harness(async command => {
    if (command === "take_viewer_token") { requested(); return new Promise(resolve => { release = resolve; }); }
    return { running: command !== "stop_sidecar" };
  });
  const pending = h.click("start");
  await tokenRequested;
  await h.click("stop");
  release("a".repeat(64));
  await pending;
  assert.equal(h.navigations.length, 0);
  assert.equal(h.status.textContent, "Engine stopped — offline folder mode");
});
