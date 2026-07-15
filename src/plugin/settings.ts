/** Kosmos plugin — settings tab + Agent API setup guide (one source of truth). */
import { App, Notice, PluginSettingTab, Platform, Setting } from "obsidian";
import { KOSMOS_VERSION } from "../core/version";
import { LATEST_MCP_PROTOCOL_VERSION, makeToken, type AgentSettings } from "./agent-server";

export function installedBridgePath(app: App, plugin: any): string {
  try {
    const base = String((app.vault.adapter as any).getBasePath?.() || "").replace(/\\/g, "/");
    const dir = String(plugin?.manifest?.dir || `${app.vault.configDir}/plugins/${plugin?.manifest?.id || "vault-kosmos"}`).replace(/\\/g, "/");
    const pluginDir = /^[A-Za-z]:\//.test(dir) || dir.startsWith("/")
      ? dir.replace(/\/$/, "")
      : `${base ? base.replace(/\/$/, "") + "/" : ""}${dir.replace(/^\//, "")}`;
    return `${pluginDir}/kosmos-mcp-stdio.mjs`;
  } catch {
    return "<installed-plugin-directory>/kosmos-mcp-stdio.mjs";
  }
}

export function buildAgentGuide(port: string | number, token: string, bindMode = "localhost", lanUrls: string[] = [], bridgePath = "<installed-plugin-directory>/kosmos-mcp-stdio.mjs"): string {
  const URLB = `http://127.0.0.1:${port}`;
  const isLan = bindMode === "lan";
  const lanLine = isLan
    ? (lanUrls.length
      ? `**Network access: LAN/VLAN enabled.** Agents on other devices on your network can reach this vault at:\n\n${lanUrls.map((u) => "- \`" + u + "\`").join("\n")}\n\n⚠️ **Anyone on that subnet/VLAN who has the token below can read every note in this vault.** Only enable this on a network you trust (e.g. your home or a private office VLAN), keep the auth token on, and turn it back to Localhost-only in Settings when you don't need remote agents.`
      : `**Network access: LAN/VLAN enabled**, but no network interface was detected on this machine right now.`)
    : `**Network access: Localhost only** (default, recommended). Only this computer can reach the API. To let agents on other devices on your subnet/VLAN connect, go to Settings → Vault Kosmos → **Network access** → *Local network (LAN/VLAN)* — the settings page will then show you the exact address to give them.`;
  return `# Vault Kosmos — Agent API guide (v${KOSMOS_VERSION})

**Read-only · localhost by default · token-protected**

This plugin runs one standards-based MCP endpoint for Anthropic Claude Code, OpenAI Codex/ChatGPT desktop, Cursor, and other agent harnesses. It exposes a sensitivity-filtered **OKF+ temporal projection** plus paginated Graphiti episodes. Source notes and accepted semantic events remain authoritative; the Graphiti export is explicitly non-authoritative. Queries never modify notes.

## 1 · Turn it on (about 30 seconds)

1. Obsidian → **Settings → Community plugins → Vault Kosmos** (gear icon).
2. Toggle **Enable local Agent API** on. The status line should read **running**.
3. Your address is \`${URLB}\` and your token is \`${token}\` — both have **Copy** buttons in settings.

${lanLine}

Desktop only: Obsidian on iPhone/Android can't run local servers, so this feature is unavailable there (the 3D view still works on mobile). If a LAN agent can't connect, your OS firewall may be blocking inbound connections on this port.

## 2 · Connect an agent

### Claude Code (terminal) — native HTTP, no bridge
\`\`\`bash
claude mcp add --transport http --header "Authorization: Bearer ${token}" vault-kosmos "${URLB}/mcp"
\`\`\`

…or save this as \`.mcp.json\` where you run \`claude\` (no \`mcp-remote\` bridge needed):
\`\`\`json
{
  "mcpServers": {
    "vault-kosmos": {
      "type": "streamable-http",
      "url": "${URLB}/mcp",
      "headers": { "Authorization": "Bearer ${token}" }
    }
  }
}
\`\`\`

Then ask Claude Code things like *"use vault-kosmos to show the lineage of Engine v2"*.

### OpenAI Codex, ChatGPT desktop, and the Codex IDE extension
These products share Codex \`config.toml\`. Open **Settings → MCP servers → Add server** and choose **Streamable HTTP**, or add:

\`\`\`toml
[mcp_servers.vault-kosmos]
url = "${URLB}/mcp"
http_headers = { Authorization = "Bearer ${token}" }
\`\`\`

Restart the desktop app or IDE extension after saving. ChatGPT web cannot reach a localhost server; use the desktop Codex host for this local connector.

### Claude Desktop and other stdio-only MCP apps
The release includes a first-party stdio adapter (no \`mcp-remote\` package):

\`\`\`json
{
  "mcpServers": {
    "vault-kosmos": {
      "command": "node",
      "args": [${JSON.stringify(bridgePath)}],
      "env": {
        "KOSMOS_MCP_URL": "${URLB}/mcp",
        "KOSMOS_MCP_TOKEN": "${token}"
      }
    }
  }
}
\`\`\`

Restart the client after saving. Node.js 18+ is required for the adapter.

### Cursor / Windsurf / any Streamable-HTTP MCP client
Add a remote/HTTP MCP server with URL \`${URLB}/mcp\` and header \`Authorization: Bearer ${token}\`.

The endpoint negotiates MCP \`${LATEST_MCP_PROTOCOL_VERSION}\` and compatible earlier revisions. After initialization, clients must return \`Mcp-Session-Id\` and \`MCP-Protocol-Version\` on subsequent requests.

### No MCP? Plain HTTP works too
\`\`\`bash
curl -H "Authorization: Bearer ${token}" "${URLB}/health"
curl -H "Authorization: Bearer ${token}" "${URLB}/lineage?title=Engine%20v2"
curl -H "Authorization: Bearer ${token}" "${URLB}/at?time=2026-04-01"
\`\`\`

> \`?token=\` query authentication is deprecated and off by default; enable it in settings only if a client cannot send headers, and never in LAN mode.

## 3 · What agents can ask (MCP tools)

| Tool | What it gives an agent |
| --- | --- |
| \`vault_overview\` | Sensitivity-filtered projection statistics and diagnostics |
| \`search_notes\` | Lexical search over readable title/alias/tag/path values |
| \`get_note\` | Readable source content, OKF+ 2.2 metadata, lineage projection, and links |
| \`get_lineage\` | Readable supersession chain oldest → newest |
| \`get_related\` | Explicit \`related_to\`, legacy Related, wikilink, and backlink neighbors |
| \`graph_at_time\` | Temporal-validity snapshot: what was valid vs already superseded at time T |
| \`export_graphiti_episodes\` | Paginated Graphiti JSON episodes with stable UUIDs and no future-state leakage |

REST mirrors: \`/overview /diagnostics /graph /notes /note /lineage /related /at /episodes\` (see \`${URLB}/\`).

## 4 · Direct vs. indirect Graphiti

- **Direct (this server):** agents read a sensitivity-filtered OKF+ temporal projection live — no database, no LLM. Search is lexical, not embeddings.
- **Indirect (full Graphiti):** ingest the paginated/exported episodes for entity extraction and hybrid retrieval. Episodes are explicitly non-authoritative user-assertion projections; source notes and accepted semantic events remain authoritative. Graphiti's LLM may reconstruct different entities.

## 5 · Safety & troubleshooting

- Read-only by design; there are no write endpoints. The default sensitivity ceiling is \`internal\`; confidential/PHI reads require an explicit local policy choice. Request bodies are capped at 4 MiB (measured in bytes).
- **Localhost mode** (default): nothing outside this computer can reach it. The server also validates \`Host\` and \`Origin\` headers to block DNS-rebinding and cross-site requests.
- **LAN mode** (opt-in): any device on the same subnet/VLAN can reach it if it has the token — treat the token like a password.
- Tokens are generated from a cryptographically secure source (32 random bytes). **Regenerate** in settings invalidates old ones instantly.
- **401 unauthorized** → token missing/stale; re-copy from settings. **Port busy** → change the port in settings. **Tools not appearing** → restart the agent app after editing its config.
`;
}

export class KosmosSettingTab extends PluginSettingTab {
  plugin: any;
  constructor(app: App, plugin: any) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s: AgentSettings = this.plugin.agentSettings;
    containerEl.createEl("h2", { text: "Vault Kosmos — Agent API (HTTP + MCP)" });
    containerEl.createEl("p", { text: "Lets AI agents query this vault's OKF+ knowledge graph. Read-only, localhost-only by default, token-protected. Desktop only." });

    const status = containerEl.createEl("p");
    const refresh = () => {
      const running = this.plugin.agentApi?.status === "running";
      status.setText(`Status: ${this.plugin.agentApi?.status || "stopped"}${running ? ` · ${this.plugin.agentApi.url}` : ""}`);
    };
    refresh();

    new Setting(containerEl).setName("Enable local Agent API").setDesc(Platform.isDesktopApp ? "Start the server now and on every launch." : "Unavailable on mobile Obsidian.")
      .addToggle((t) => t.setValue(s.agentEnabled).setDisabled(!Platform.isDesktopApp).onChange(async (v) => {
        s.agentEnabled = v;
        await this.plugin.saveAgentSettings();
        if (v) this.plugin.startAgentApi(); else this.plugin.agentApi.stop();
        setTimeout(refresh, 150);
      }));

    new Setting(containerEl).setName("Port").setDesc("Default 4816. Change if busy; the server restarts automatically.")
      .addText((t) => t.setValue(String(s.agentPort)).onChange(async (v) => {
        const p = Math.floor(Number(v));
        if (!p || p < 1024 || p > 65535) return;
        s.agentPort = p;
        await this.plugin.saveAgentSettings();
        if (s.agentEnabled) { this.plugin.startAgentApi(); setTimeout(refresh, 150); }
      }));

    const netWarn = containerEl.createEl("p");
    const refreshNet = () => {
      if (s.agentBindMode === "lan") {
        const ips = this.plugin.agentLanUrls() as string[];
        netWarn.setText(ips.length ? `⚠️ Reachable on your local network at: ${ips.join(", ")} — anyone on this subnet/VLAN who has the token can read this vault.`
          : "⚠️ LAN mode is on, but no network interface was detected — check your connection.");
        netWarn.style.color = "var(--text-warning, #e0a30f)";
      } else {
        netWarn.setText("Reachable only from this computer (127.0.0.1).");
        netWarn.style.color = "var(--text-muted)";
      }
    };
    new Setting(containerEl).setName("Network access")
      .setDesc("Localhost only = this computer can reach it. Local network (LAN/VLAN) = other devices on the same network can reach it too — keep the auth token on if you enable this.")
      .addDropdown((d) => d.addOption("localhost", "Localhost only (this computer)").addOption("lan", "Local network (LAN/VLAN)")
        .setValue(s.agentBindMode).onChange(async (v: any) => {
          s.agentBindMode = v;
          await this.plugin.saveAgentSettings();
          if (s.agentEnabled) { this.plugin.startAgentApi(); setTimeout(() => { refresh(); refreshNet(); }, 150); } else refreshNet();
        }));
    refreshNet();

    new Setting(containerEl).setName("Require auth token").setDesc("Recommended. Agents must present the token below. Always required in LAN mode — the server refuses to bind to the network without it.")
      .addToggle((t) => t.setValue(s.agentRequireToken).onChange(async (v) => {
        s.agentRequireToken = v;
        await this.plugin.saveAgentSettings();
        if (s.agentEnabled) { this.plugin.startAgentApi(); setTimeout(refresh, 150); }
      }));

    new Setting(containerEl).setName("Allow ?token= query authentication")
      .setDesc("Deprecated and off by default. Query strings leak through browser history, proxy logs and screenshots. Header auth (Bearer / x-api-key) is preferred. Query tokens are always rejected in LAN mode.")
      .addToggle((t) => t.setValue(s.agentAllowQueryToken).onChange(async (v) => { s.agentAllowQueryToken = v; await this.plugin.saveAgentSettings(); }));

    new Setting(containerEl).setName("Auth token").setDesc(s.agentToken || "(none)")
      .addButton((b) => b.setButtonText("Copy").onClick(() => { navigator.clipboard.writeText(s.agentToken); new Notice("Token copied"); }))
      .addButton((b) => b.setButtonText("Regenerate").setWarning().onClick(async () => {
        try {
          s.agentToken = makeToken();
          await this.plugin.saveAgentSettings();
          new Notice("New token generated");
        } catch (e: any) {
          new Notice("Vault Kosmos: " + (e?.message || "token generation failed"));
        }
        this.display();
      }));

    new Setting(containerEl).setName("Agent sensitivity ceiling")
      .setDesc("OKF+ read boundary. Unlabeled legacy notes count as internal. Confidential and PHI stay hidden unless you explicitly raise this ceiling.")
      .addDropdown((d) => d
        .addOption("public", "Public only")
        .addOption("internal", "Internal (recommended)")
        .addOption("confidential", "Include confidential")
        .addOption("phi", "Include PHI (local policy required)")
        .setValue(s.agentSensitivityCeiling)
        .onChange(async (v: any) => { s.agentSensitivityCeiling = v; await this.plugin.saveAgentSettings(); }));

    containerEl.createEl("h3", { text: "OKF+ note formatting" });
    containerEl.createEl("p", {
      text: "Audit every Markdown note or explicitly upgrade every mechanically recoverable note to normative OKF+ 2.2. Both modes require a hash-bound dry-run preview, independent-backup confirmation, and byte-exact local backup. Upgrade-all preserves overridden legacy values in the migration plan and never forces ambiguous YAML or identity conflicts. No LLM or network connection is used.",
      cls: "setting-item-description",
    });
    new Setting(containerEl)
      .setName("Mark notes in OKF+ format")
      .setDesc("Safe scan leaves Google OKF notes alone. Upgrade-all converts recoverable legacy/2.1 notes and shows a deterministic confidence score plus every manual-review reason.")
      .addButton((b) => b.setButtonText("Safe scan").onClick(async () => {
        await this.plugin.markNotesInOkf("safe-onboarding");
      }))
      .addButton((b) => b.setButtonText("Upgrade all to 2.2").setCta().onClick(async () => {
        await this.plugin.markNotesInOkf("upgrade-all");
      }));

    containerEl.createEl("h4", { text: "Content-assisted enrichment proposals" });
    containerEl.createEl("p", { text: "Runs only after notes are OKF+ 2.2. Deterministic evidence selection proposes tags, descriptions, types, and explicit supersession candidates. An optional OpenAI-compatible local/cloud model may add schema-validated proposals. Governance authority fields are outside the model's schema, and no proposal writes frontmatter automatically.", cls: "setting-item-description" });
    new Setting(containerEl).setName("Second-pass provider").setDesc("Disabled means deterministic proposals only. Local endpoints must be loopback; cloud endpoints must use HTTPS.").addDropdown((d) => d.addOption("none", "Deterministic only").addOption("local", "Local LLM (loopback)").addOption("cloud", "Cloud LLM (HTTPS)").setValue(s.okfEnrichmentProvider).onChange(async (v: any) => { s.okfEnrichmentProvider = v; await this.plugin.saveAgentSettings(); this.display(); }));
    if (s.okfEnrichmentProvider !== "none") {
      new Setting(containerEl).setName("OpenAI-compatible endpoint").setDesc(s.okfEnrichmentProvider === "local" ? "Loopback only, for example Ollama /v1/chat/completions." : "HTTPS only. Confidential and PHI notes are always excluded.").addText((t) => t.setValue(s.okfEnrichmentEndpoint).onChange(async (v) => { s.okfEnrichmentEndpoint = v.trim(); await this.plugin.saveAgentSettings(); }));
      new Setting(containerEl).setName("Model").addText((t) => t.setValue(s.okfEnrichmentModel).onChange(async (v) => { s.okfEnrichmentModel = v.trim(); await this.plugin.saveAgentSettings(); }));
      new Setting(containerEl).setName("API key environment variable").setDesc("Variable name only; the secret is never stored in plugin settings. Optional for local endpoints, required for cloud.").addText((t) => t.setPlaceholder("OPENAI_API_KEY").setValue(s.okfEnrichmentApiKeyEnv).onChange(async (v) => { s.okfEnrichmentApiKeyEnv = v.trim(); await this.plugin.saveAgentSettings(); }));
      if (s.okfEnrichmentProvider === "cloud") new Setting(containerEl).setName("Cloud sensitivity ceiling").setDesc("Confidential and PHI are hard-blocked regardless of this setting.").addDropdown((d) => d.addOption("public", "Public only").addOption("internal", "Public + internal").setValue(s.okfEnrichmentCloudCeiling).onChange(async (v: any) => { s.okfEnrichmentCloudCeiling = v; await this.plugin.saveAgentSettings(); }));
    }
    new Setting(containerEl).setName("Per-run note cap").setDesc("Hard cap: 1–500. Processing is sequential; there are no automatic retries, and three consecutive provider errors stop the run.").addText((t) => t.setValue(String(s.okfEnrichmentMaxNotes)).onChange(async (v) => { s.okfEnrichmentMaxNotes = Math.max(1, Math.min(500, Number(v) || 25)); await this.plugin.saveAgentSettings(); }));
    new Setting(containerEl).setName("Evidence limits").setDesc("Objective prose-shaped selection only; this cannot guarantee that an author placed meaningful content early.").addText((t) => t.setPlaceholder("paragraphs").setValue(String(s.okfEnrichmentMaxParagraphs)).onChange(async (v) => { s.okfEnrichmentMaxParagraphs = Math.max(1, Math.min(8, Number(v) || 4)); await this.plugin.saveAgentSettings(); })).addText((t) => t.setPlaceholder("characters").setValue(String(s.okfEnrichmentMaxInputChars)).onChange(async (v) => { s.okfEnrichmentMaxInputChars = Math.max(400, Math.min(12000, Number(v) || 4000)); await this.plugin.saveAgentSettings(); }));
    new Setting(containerEl).setName("Run input budget").setDesc("Hard total evidence budget across the run: 4,000–250,000 characters.").addText((t) => t.setValue(String(s.okfEnrichmentMaxTotalInputChars)).onChange(async (v) => { s.okfEnrichmentMaxTotalInputChars = Math.max(4000, Math.min(250000, Number(v) || 50000)); await this.plugin.saveAgentSettings(); }));
    new Setting(containerEl).setName("Proposal cap").setDesc("Maximum schema-valid suggestions retained per note (1–24).").addText((t) => t.setValue(String(s.okfEnrichmentMaxSuggestions)).onChange(async (v) => { s.okfEnrichmentMaxSuggestions = Math.max(1, Math.min(24, Number(v) || 12)); await this.plugin.saveAgentSettings(); }));
    if (s.okfEnrichmentProvider !== "none") new Setting(containerEl).setName("Request timeout").setDesc("5–120 seconds per note; timed-out requests are not retried.").addText((t) => t.setValue(String(Math.round(s.okfEnrichmentTimeoutMs / 1000))).onChange(async (v) => { s.okfEnrichmentTimeoutMs = Math.max(5000, Math.min(120000, (Number(v) || 30) * 1000)); await this.plugin.saveAgentSettings(); }));
    new Setting(containerEl).setName("Build enrichment preview").setDesc("Selected evidence is bounded and treated as untrusted. LLM tools are disabled, temperature is zero, output is schema-validated, and proposals remain pending in .okf/review-queue.jsonl.").addButton((b) => b.setButtonText("Preview proposals").setCta().onClick(async () => { await this.plugin.proposeOkfEnrichment(); }));

    containerEl.createEl("h3", { text: "Quick connect — Anthropic, OpenAI, and universal MCP" });
    const url = () => {
      if (s.agentBindMode === "lan") {
        const ips = this.plugin.agentLanUrls() as string[];
        if (ips.length) return `http://${ips[0].replace(/^https?:\/\//, "").split(":")[0]}:${s.agentPort}`;
      }
      return `http://127.0.0.1:${s.agentPort}`;
    };
    if (s.agentBindMode === "lan") containerEl.createEl("p", { text: "Copy buttons below use your LAN address so remote agents can reach this vault.", cls: "setting-item-description" });
    const bridgePath = installedBridgePath(this.app, this.plugin);
    new Setting(containerEl).setName("Anthropic · Claude Code").setDesc("Copies a native Streamable HTTP command with header authentication.")
      .addButton((b) => b.setButtonText("Copy command").onClick(() => {
        navigator.clipboard.writeText(`claude mcp add --transport http --header "Authorization: Bearer ${s.agentToken}" vault-kosmos "${url()}/mcp"`);
        new Notice("Claude Code command copied — paste it in a terminal");
      }));
    new Setting(containerEl).setName("Anthropic · Claude project config").setDesc("Copies native HTTP .mcp.json for a Claude Code project.")
      .addButton((b) => b.setButtonText("Copy .mcp.json").onClick(() => {
        navigator.clipboard.writeText(JSON.stringify({ mcpServers: { "vault-kosmos": { type: "streamable-http", url: `${url()}/mcp`, headers: { Authorization: `Bearer ${s.agentToken}` } } } }, null, 2));
        new Notice(".mcp.json copied — save it next to where you run claude");
      }));
    new Setting(containerEl).setName("OpenAI · Codex / ChatGPT desktop").setDesc("Copies config.toml for the shared Codex MCP configuration.")
      .addButton((b) => b.setButtonText("Copy OpenAI config").onClick(() => {
        navigator.clipboard.writeText(`[mcp_servers.vault-kosmos]\nurl = "${url()}/mcp"\nhttp_headers = { Authorization = "Bearer ${s.agentToken}" }\n`);
        new Notice("OpenAI config.toml block copied");
      }));
    new Setting(containerEl).setName("Anthropic · Claude Desktop / stdio clients").setDesc("Copies stdio JSON using the bundled first-party adapter; no mcp-remote download.")
      .addButton((b) => b.setButtonText("Copy stdio config").onClick(() => {
        navigator.clipboard.writeText(JSON.stringify({ mcpServers: { "vault-kosmos": { command: "node", args: [bridgePath], env: { KOSMOS_MCP_URL: `${url()}/mcp`, KOSMOS_MCP_TOKEN: s.agentToken } } } }, null, 2));
        new Notice("STDIO connector config copied");
      }));
    new Setting(containerEl).setName("Any MCP harness").setDesc("Copies vendor-neutral Streamable HTTP connection details.")
      .addButton((b) => b.setButtonText("Copy universal config").onClick(() => {
        navigator.clipboard.writeText(JSON.stringify({ name: "vault-kosmos", transport: "streamable-http", url: `${url()}/mcp`, headers: { Authorization: `Bearer ${s.agentToken}` }, protocolVersion: LATEST_MCP_PROTOCOL_VERSION }, null, 2));
        new Notice("Universal MCP connection details copied");
      }));
    new Setting(containerEl).setName("Quick test").setDesc("Copies a cURL health check (header auth).")
      .addButton((b) => b.setButtonText("Copy cURL").onClick(() => {
        navigator.clipboard.writeText(`curl -H "Authorization: Bearer ${s.agentToken}" "${url()}/health"`);
        new Notice("cURL test copied");
      }));
    new Setting(containerEl).setName("Step-by-step guide").setDesc("Writes AGENT-API.md into your vault with YOUR address and token filled in.")
      .addButton((b) => b.setButtonText("Write guide to vault").setCta().onClick(async () => {
        await this.plugin.writeAgentGuide();
      }));
  }
}
