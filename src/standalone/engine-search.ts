import { isLoopbackApiUrl, normalizeApiBase } from "./api-feed";
import { KOSMOS_VERSION } from "../kosmos-version";

const PROTOCOL = "2025-11-25";
const MAX_RESPONSE = 1_048_576;
export interface EngineSearchPage {
  items: Array<{ canonical_path: string; record_ref: string; chunk: { text: string }; citation: { verified: true; stale: false; source_digest: string; start_line: number; end_line: number } }>;
  page: { next_cursor: string | null; snapshot_id?: string };
  retrieval: unknown;
}

/** Separate MCP identity. Never receives or borrows the viewer credential. */
export class EngineSearchClient {
  private session: string | null = null;
  private id = 0;
  private ready = false;
  private controller = new AbortController();
  private endpoint: string;
  constructor(api: string, private token: string, private fetchImpl: typeof fetch = fetch) {
    if (!isLoopbackApiUrl(api) || !token.trim()) throw new Error("A loopback service and MCP credential are required.");
    this.endpoint = `${normalizeApiBase(api)}/mcp`;
  }
  private async request(method: string, params: unknown, notification = false): Promise<any> {
    const id = ++this.id;
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(30_000)]);
    try {
      const fetchRequest = this.fetchImpl;
      const response = await fetchRequest(this.endpoint, {
        method: "POST", redirect: "error", cache: "no-store", signal,
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", Accept: "application/json", "MCP-Protocol-Version": PROTOCOL, ...(this.session ? { "Mcp-Session-Id": this.session } : {}) },
        body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id, params }), method }),
      });
      if ([401, 403, 404].includes(response.status)) { this.ready = false; this.controller.abort(); throw new Error("Reconnect with an authorized MCP credential."); }
      if (!response.ok) throw new Error("Engine request failed.");
      if (notification) return;
      if (!response.headers.get("content-type")?.includes("application/json") || !response.body) throw new Error("Unsupported Engine response.");
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
      try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > MAX_RESPONSE) throw new Error("Engine result exceeds the supported size."); chunks.push(part.value); } }
      finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const message = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (message.jsonrpc !== "2.0" || message.id !== id || message.error) throw new Error("Engine refused this request. Reconnect or start a new search.");
      if (method === "initialize") {
        if (message.result?.protocolVersion !== PROTOCOL) throw new Error("Unsupported Engine protocol.");
        this.session = response.headers.get("Mcp-Session-Id");
        if (!this.session || !/^[A-Za-z0-9-]{1,128}$/.test(this.session)) throw new Error("Invalid Engine session.");
      }
      return message.result;
    } catch (error) {
      // Transport errors can contain URLs or request headers. Never reflect them.
      if (this.controller.signal.aborted) throw new Error("Search connection closed. Connect again to continue.");
      throw new Error("Engine search unavailable. Check the connection or start a new search.");
    }
  }
  async connect(): Promise<void> {
    await this.request("initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "kosmos-search", version: KOSMOS_VERSION } });
    await this.request("notifications/initialized", {}, true);
    const listed = await this.request("tools/list", {});
    if (!listed?.tools?.some((tool: any) => tool.name === "gkos_search") || !listed.tools.some((tool: any) => tool.name === "gkos_capabilities")) throw new Error("Engine search is not available for this identity.");
    const caps = await this.request("tools/call", { name: "gkos_capabilities", arguments: {} });
    if (caps?.isError || !caps?.structuredContent?.capabilities?.some((cap: any) => cap.capability_name === "note.fulltext.search" && cap.available === true)) throw new Error("Engine retrieval is not ready for this identity.");
    this.ready = true;
  }
  async search(query: string, cursor: string | null = null): Promise<EngineSearchPage> {
    if (!this.ready) throw new Error("Connect to Engine search first.");
    if (!query.trim() || query.length > 256) throw new Error("Enter a search of up to 256 characters.");
    const result = await this.request("tools/call", { name: "gkos_search", arguments: { query: query.trim(), cursor, limit: 20 } });
    const value = result?.structuredContent;
    if (result?.isError || value?.extension_version !== "observatory.mcp-retrieval.v0" || !Array.isArray(value.items) || value.items.length > 20 || !value.page || !(value.page.next_cursor === null || typeof value.page.next_cursor === "string")) throw new Error("Search refused or stale. Start a new search.");
    for (const hit of value.items) {
      if (typeof hit.canonical_path !== "string" || typeof hit.chunk?.text !== "string" || hit.citation?.verified !== true || hit.citation?.stale !== false || typeof hit.citation.source_digest !== "string") throw new Error("Engine returned an unverified citation.");
    }
    return value;
  }
  async close(): Promise<void> {
    this.ready = false; this.controller.abort();
    const token = this.token; this.token = "";
    if (!this.session) return;
    const session = this.session; this.session = null;
    const fetchRequest = this.fetchImpl;
    await fetchRequest(this.endpoint, { method: "DELETE", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3000), headers: { Authorization: `Bearer ${token}`, "Mcp-Session-Id": session, "MCP-Protocol-Version": PROTOCOL } }).catch(() => {});
  }
}
