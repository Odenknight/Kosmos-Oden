import { test, expect } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

// The fixture's one-use token is entered through the ordinary connection form.
test.use({ trace: "off" });

test("the packaged Engine serves the Kosmos release and renders its own vault", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "kosmos-engine-pair-"));
  const vault = join(root, "notes");
  const state = join(root, "state");
  const note = "# Paired release\n";
  const childArgs = [
    resolve("node_modules/gkos-engine/bin/gkos-menu.mjs"), "--vault", vault, "--state-dir", state,
    "open-kosmos-oden", "--no-open",
  ];
  let stop: (() => Promise<void>) | undefined;
  try {
    await mkdir(vault);
    await writeFile(join(vault, "Paired release.md"), note);
    const socket = createServer();
    socket.listen(0, "127.0.0.1");
    await once(socket, "listening");
    const address = socket.address();
    if (!address || typeof address === "string") throw new Error("Expected a loopback TCP port");
    await new Promise<void>((done, reject) => socket.close(err => err ? reject(err) : done()));
    const api = `http://127.0.0.1:${address.port}`;
    const args = [...childArgs, "--port", String(address.port)];
    const { data } = JSON.parse(execFileSync(process.execPath, [...args, "--print", "--json"], { encoding: "utf8" }));
    expect(resolve(data.tokenFile).startsWith(resolve(state) + sep)).toBe(true);
    const child = spawn(process.execPath, args, { stdio: "ignore" });
    const closed = once(child, "close");
    stop = async () => { child.kill(); await closed; };

    await expect.poll(async () => {
      if (child.exitCode !== null) throw new Error(`Engine exited with ${child.exitCode}`);
      return fetch(api).then(res => res.status, () => 0);
    }, { timeout: 15_000 }).toBe(200);
    const viewer = await request.get(api);
    const built = await readFile("kosmos-oden-stand-alone.html");
    expect((await viewer.body()).equals(built), "Engine must serve the exact Kosmos standalone HTML").toBe(true);
    expect((await request.get(api + "/graph")).status()).toBe(401);

    await page.goto(api + "/?api=" + encodeURIComponent(api));
    await expect.poll(() => access(data.tokenFile).then(() => true, () => false)).toBe(true);
    const token = (await readFile(data.tokenFile, "utf8")).trim();
    await page.getByLabel("Bearer token").fill(token);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Graph JSON", exact: true }).click();
    const graph = JSON.parse(await readFile((await (await download).path())!, "utf8"));
    expect(graph.nodes.filter((n: { kind: string }) => n.kind === "file").map((n: { path: string }) => n.path)).toEqual(["Paired release.md"]);
    await expect.poll(() => page.evaluate(() => (window as any).__kosmosRenderStats?.frames ?? 0)).toBeGreaterThan(1);
    expect(await readFile(join(vault, "Paired release.md"), "utf8")).toBe(note);
  } finally {
    try { await stop?.(); } finally { await rm(root, { recursive: true, force: true, maxRetries: 5 }); }
  }
});
