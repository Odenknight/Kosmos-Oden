/**
 * Schema/implementation agreement for tools/call argument validation.
 *
 * Regression guard for the `uid` selector defect: `selectionSchema` advertised
 * `anyOf: [path] | [title] | [uid]` for eleven tools, but a parallel
 * hand-maintained allowlist inside validateToolArgs gave get_note, get_lineage
 * and get_related only `["path", "title"]`. A client that followed the
 * advertised schema and sent `uid` got `-32602 Unexpected argument: uid`.
 *
 * Every assertion below is derived from what tools/list actually advertises,
 * not from a list maintained here, so a newly added tool or selector cannot
 * drift out of coverage.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { buildGraph, stripFrontmatter } from "../dist/kosmos-core.mjs";
import {
  KosmosAgentServer,
  MODERN_MCP_PROTOCOL_VERSION,
  MCP_META_PROTOCOL_VERSION,
  MCP_META_CLIENT_INFO,
  MCP_META_CLIENT_CAPABILITIES,
  MCP_NAME_SOURCE,
} from "../dist/kosmos-agent-server.mjs";

const UID = "01a08553-1d97-79a2-aee1-190f94acdad7";
const FILES = [
  { relativePath: "Home.md", content: "# Home\n[[Engine v2]]" },
  {
    relativePath: "Ideas/Engine v2.md",
    content: `---\ntype: idea\ntimestamp: 2026-03-01T00:00:00Z\nsensitivity: internal\nuid: ${UID}\n---\nNew engine.`,
  },
];
const TOKEN = "test-token-1234567890";

function fixtureProvider() {
  const graph = buildGraph(FILES, ["Ideas"], undefined, { defaultSensitivity: "internal" });
  const contents = new Map(FILES.map((f) => [f.relativePath, stripFrontmatter(f.content)]));
  return {
    getGraph: async () => graph,
    getNoteContent: async (p) => contents.get(p) ?? null,
    vaultName: () => "TestVault",
    lanAddresses: () => [],
  };
}

function request(port, { method = "GET", path = "/", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers, setHost: !headers.Host }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, json: () => JSON.parse(data || "null") }));
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

function startServer() {
  const server = new KosmosAgentServer(http, {
    schemaVersion: 3,
    agentEnabled: true,
    agentPort: 0,
    agentToken: TOKEN,
    agentRequireToken: true,
    agentBindMode: "localhost",
    agentSensitivityCeiling: "internal",
    defaultSensitivity: "secret",
    agentGraphNamespace: "testnamespace",
    agentAllowQueryToken: false,
  }, fixtureProvider());
  return new Promise((resolve) => {
    server.start();
    server.server.on("listening", () => resolve({ server, port: server.server.address().port }));
  });
}

/** A type-correct placeholder for one advertised property, from its schema. */
const placeholder = (schema) => (schema?.type === "integer" ? (schema.minimum ?? 1) : "placeholder");

test("tools/call argument validation agrees with the advertised inputSchema", async (t) => {
  const { server, port } = await startServer();
  t.after(() => server.stop());

  // Modern MCP: no handshake, no session. Every request declares its own
  // protocol version and client identity in params._meta, and the transport
  // mirrors selected body fields into headers the server validates against the
  // body. This helper implements that client behaviour, so the test can never
  // pass by omitting a header the server requires.
  let nextId = 1;
  const mcp = async (method, params = {}, overrides = {}) => {
    const body = {
      jsonrpc: "2.0",
      id: nextId++,
      method,
      params: {
        ...params,
        _meta: {
          [MCP_META_PROTOCOL_VERSION]: MODERN_MCP_PROTOCOL_VERSION,
          [MCP_META_CLIENT_INFO]: { name: "selector-schema-test", version: "1.0.0" },
          [MCP_META_CLIENT_CAPABILITIES]: {},
        },
      },
    };
    const headers = {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": MODERN_MCP_PROTOCOL_VERSION,
      "Mcp-Method": method,
    };
    const nameField = MCP_NAME_SOURCE[method];
    if (nameField && typeof params[nameField] === "string") headers["Mcp-Name"] = params[nameField];
    return request(port, { method: "POST", path: "/mcp", headers: { ...headers, ...overrides }, body: JSON.stringify(body) });
  };

  const tools = (await mcp("tools/list")).json().result.tools;
  assert.ok(tools.length > 0, "tools/list returned no tools");

  const call = async (name, args) => (await mcp("tools/call", { name, arguments: args })).json();

  /** Minimum arguments that satisfy a tool's `required` and `anyOf` clauses. */
  const baseArgs = (tool) => {
    const props = tool.inputSchema.properties ?? {};
    const args = {};
    for (const key of tool.inputSchema.required ?? []) args[key] = placeholder(props[key]);
    const anyOf = tool.inputSchema.anyOf ?? [];
    if (anyOf.length && !anyOf.some((clause) => (clause.required ?? []).every((k) => k in args))) {
      for (const key of anyOf[0].required ?? []) args[key] = placeholder(props[key]);
    }
    return args;
  };

  await t.test("every advertised property is accepted by the tool that advertises it", async () => {
    for (const tool of tools) {
      for (const [key, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
        const args = { ...baseArgs(tool), [key]: placeholder(schema) };
        const res = await call(tool.name, args);
        assert.doesNotMatch(
          res.error?.message ?? "",
          new RegExp(`Unexpected argument: ${key}$`),
          `${tool.name} advertises "${key}" but rejected it as an unexpected argument`,
        );
      }
    }
  });

  const uidTools = tools.filter((x) => "uid" in (x.inputSchema.properties ?? {})).map((x) => x.name);

  await t.test("the tools that advertise a uid selector are the selection-schema tools", () => {
    // Pinned because these three are the ones that regressed; the rest of the
    // coverage below is whatever tools/list advertises.
    for (const name of ["get_note", "get_lineage", "get_related"]) {
      assert.ok(uidTools.includes(name), `${name} no longer advertises a uid selector`);
    }
    assert.equal(uidTools.length, 11, "selection-schema tool count changed; confirm the new tool accepts uid");
  });

  await t.test("every tool advertising a uid selector resolves a real uid", async () => {
    for (const name of uidTools) {
      const res = await call(name, { uid: UID });
      assert.equal(res.error, undefined, `${name} rejected uid selector: ${res.error?.message}`);
      const payload = res.result.structuredContent ?? JSON.parse(res.result.content[0].text);
      assert.equal(payload.error, undefined, `${name} could not resolve uid ${UID}: ${payload.error}`);
    }
  });

  await t.test("a uid selector and a path selector resolve to the same note", async () => {
    const byUid = await call("get_note", { uid: UID });
    const byPath = await call("get_note", { path: "Ideas/Engine v2.md" });
    assert.deepEqual(byUid.result.structuredContent, byPath.result.structuredContent);
  });

  await t.test("an unadvertised argument is still rejected", async () => {
    const res = await call("get_note", { path: "Ideas/Engine v2.md", nope: "x" });
    assert.match(res.error.message, /Unexpected argument: nope/);
  });
});
