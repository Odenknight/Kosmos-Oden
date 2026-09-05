import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/standalone/directory-monitor.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { DirectoryMonitor } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

for (const outcome of ["resolve", "reject"]) {
  test(`stopping a pending directory scan suppresses stale ${outcome} callbacks`, async () => {
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    globalThis.window = new EventTarget(); globalThis.document = new EventTarget();
    try {
      let finish;
      const callbacks = [];
      const initial = { files: [], folders: [], attachments: [], signatures: new Map(), scannedAt: 1, errors: [] };
      const source = { canRescan: true, scan: () => new Promise((resolve, reject) => { finish = outcome === "resolve" ? resolve : reject; }) };
      const monitor = new DirectoryMonitor(source, initial, {
        onDiff: () => callbacks.push("diff"), onScan: () => callbacks.push("scan"), onError: () => callbacks.push("error"),
      });
      const pending = monitor.scanNow("manual");
      monitor.stop();
      finish(outcome === "resolve" ? { ...initial, scannedAt: 2, errors: ["stale error"], signatures: new Map([["Old.md", "1:2"]]) } : new Error("old source disconnected"));
      assert.equal(await pending, null);
      assert.deepEqual(callbacks, []);
      assert.equal(monitor.lastSnapshot, initial);
      assert.equal(await monitor.scanNow("manual"), null);
    } finally { globalThis.window = previousWindow; globalThis.document = previousDocument; }
  });
}
