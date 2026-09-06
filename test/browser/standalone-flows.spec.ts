import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDemoVaultGraph } from "gkos-engine";
import { build } from "esbuild";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

async function exportGraph(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Graph JSON", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("graph.json");
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}

test("Engine retrieval uses its separate credential and renders citation text safely", async ({ page }) => {
  const graph = createDemoVaultGraph(0);
  await page.route("http://127.0.0.1:4814/**", async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path !== "/mcp") {
      expect(request.headers().authorization).toBe("Bearer viewer-test");
      const ready = { available: true, configured: true, authorized: true, enabled: true, reason_codes: [] };
      return route.fulfill({ json: path === "/health" ? { notes_indexed: graph.stats.files } : path === "/graph" ? graph : { schema_version: 1, protocol: { id: "gkos-local-service", version: "1.0.0-draft.1" }, features: Object.fromEntries(["graph", "notes", "graphiti_episodes", "mcp", "events", "proposal_ingress", "navigation", "navigation_effects"].map(name => [name, { ...ready, enabled: name === "graph" }])) } });
    }
    expect(request.headers().authorization).toBe("Bearer mcp-test");
    if (request.method() === "DELETE") return route.fulfill({ status: 204 });
    const message = request.postDataJSON();
    if (message.method === "notifications/initialized") return route.fulfill({ status: 202 });
    let result;
    if (message.method === "initialize") result = { protocolVersion: "2025-11-25" };
    else if (message.method === "tools/list") result = { tools: [{ name: "gkos_search" }, { name: "gkos_capabilities" }] };
    else if (message.params.name === "gkos_capabilities") result = { structuredContent: { capabilities: [{ capability_name: "note.fulltext.search", available: true }] } };
    else result = { structuredContent: { extension_version: "observatory.mcp-retrieval.v0", items: [{ canonical_path: "notes/example.md", chunk: { text: "<img src=x onerror=alert(1)> apricot" }, citation: { verified: true, stale: false, source_digest: "sha256:test", start_line: 3, end_line: 4 } }], page: { next_cursor: null }, retrieval: {} } };
    return route.fulfill({ headers: { "Mcp-Session-Id": "test-session", "Access-Control-Expose-Headers": "Mcp-Session-Id" }, json: { jsonrpc: "2.0", id: message.id, result } });
  });
  await page.goto("/kosmos-oden-stand-alone.html?api=http://127.0.0.1:4814");
  await page.locator("#ko-token").fill("viewer-test"); await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Search with Engine" }).click();
  const dialog = page.getByRole("dialog", { name: "Engine retrieval" });
  await dialog.getByLabel("MCP credential").fill("mcp-test"); await dialog.getByRole("button", { name: "Connect search" }).click();
  await expect(dialog.getByRole("status")).toContainText("Connected.");
  await expect(dialog.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
  await expect(dialog.getByLabel("MCP credential")).toHaveValue("");
  await dialog.getByLabel("Search notes").fill("apricot"); await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog).toContainText("notes/example.md"); await expect(dialog).toContainText("Verified lines 3–4");
  expect(await dialog.locator("img").count()).toBe(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Search with Engine" }).click();
  await expect(dialog).not.toContainText("notes/example.md");
});

test("file URL imports actual Markdown and exports the displayed graph without network or source changes", async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), "kosmos-review-"));
  const content = "# Review note\n\nA source file that must remain unchanged.\n";
  try {
    await mkdir(join(root, "Research"));
    await writeFile(join(root, "Research", "Review.md"), content);
    const network: string[] = [];
    page.on("request", request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    await page.goto(pathToFileURL(resolve("kosmos-oden-stand-alone.html")).href);
    await page.locator('input[webkitdirectory]').setInputFiles(root);
    await expect(page.locator(".ko-status")).toContainText("Imported folder snapshot");
    const graph = await exportGraph(page);
    expect(graph.nodes.some((node: any) => node.path === "Research/Review.md")).toBe(true);
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Graphiti Episodes", exact: true }).click();
    expect((await pending).suggestedFilename()).toBe("graphiti-episodes.json");
    expect(await readFile(join(root, "Research", "Review.md"), "utf8")).toBe(content);
    expect(network).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("demo exports its rendered graph and hides content exports it cannot provide", async ({ page }) => {
  await page.goto("/kosmos-oden-stand-alone.html");
  await page.getByRole("button", { name: /Load Demo/ }).click();
  const graph = await exportGraph(page);
  expect(graph.nodes.length).toBeGreaterThan(0);
  expect(graph.nodes.some((node: any) => node.path === "10_Research/Spatial Computing.md")).toBe(true);
  await expect(page.getByRole("button", { name: "Export Graphiti Episodes", exact: true })).toHaveCount(0);
});

for (const mode of ["snapshot", "engine"] as const) {
  test(`${mode} exports the loaded graph rather than an empty local index`, async ({ page }) => {
    const graph = { ...createDemoVaultGraph(0), attachments: ["diagram.png"] };
    if (mode === "snapshot") {
      await page.route("**/graph.json", route => route.fulfill({ json: graph }));
      await page.goto("/kosmos-oden-stand-alone.html");
    } else {
      const ready = { available: true, configured: true, authorized: true, enabled: true, reason_codes: [] };
      const disabled = { ...ready, enabled: false };
      await page.route("http://127.0.0.1:4814/**", route => {
        const endpoint = new URL(route.request().url()).pathname;
        expect(route.request().headers().authorization).toBe("Bearer review-token");
        return route.fulfill({ json: endpoint === "/health" ? { notes_indexed: graph.stats.files } : endpoint === "/graph" ? graph : {
          schema_version: 1, protocol: { id: "gkos-local-service", version: "1.0.0-draft.1" },
          features: Object.fromEntries(["graph", "notes", "graphiti_episodes", "mcp", "events", "proposal_ingress", "navigation", "navigation_effects"].map(name => [name, name === "graph" ? ready : disabled])),
        } });
      });
      await page.goto("/kosmos-oden-stand-alone.html?api=http://127.0.0.1:4814");
      await page.locator("#ko-token").fill("review-token");
      await page.getByRole("button", { name: "Connect", exact: true }).click();
    }
    const exported = await exportGraph(page);
    expect(exported.nodes.map((node: any) => node.id)).toEqual(graph.nodes.map(node => node.id));
    expect(exported.attachments).toEqual(["diagram.png"]);
    await expect(page.getByRole("button", { name: "Export Graphiti Episodes", exact: true })).toHaveCount(0);
  });
}

test("expanded connection form is reachable on a short viewport and folder names stay text", async ({ page }) => {
  const bundle = await build({ entryPoints: ["src/standalone/ui.ts"], bundle: true, write: false, format: "iife", globalName: "ReviewUI" });
  await page.setViewportSize({ width: 390, height: 600 });
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    const handlers = new Proxy({}, { get: () => () => {} });
    (window as any).ReviewUI.createStandaloneUI(handlers).showStartup({
      canPicker: true, canReopen: true, reopenName: '<img src=x onerror="window.injected=true">', connectOpen: true,
    });
  });
  await expect(page.locator(".ko-card img")).toHaveCount(0);
  const box = await page.locator(".ko-card").boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(600);
  await page.locator("#ko-token").fill("local-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
});

test("local engine redirects fail visibly without contacting an external destination", async ({ page }) => {
  const external: string[] = [];
  await page.route("https://outside.invalid/**", route => { external.push(route.request().url()); return route.abort(); });
  // Real HTTP redirect: WebKit's route.fulfill cannot synthesize a 302.
  const server = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "authorization");
    response.setHeader("Access-Control-Allow-Private-Network", "true");
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
    response.writeHead(302, { location: "https://outside.invalid/health" }); response.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await page.goto(`/kosmos-oden-stand-alone.html?api=http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.locator("#ko-token").fill("review-token");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Could not reach the local GKOS Engine service");
    // Visibility alone doesn't detect an opaque overlay covering the error.
    expect(await alert.evaluate(el => {
      const box = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(box.left + 8, box.top + 8));
    })).toBe(true);
    expect(external).toEqual([]);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
