/** Kosmos plugin — settings tab + Agent API setup guide (one source of truth). */
import { App, Notice, PluginSettingTab, Platform, Setting } from "obsidian";
import { KOSMOS_VERSION } from "../core/version";
import { makeToken, type AgentSettings } from "./agent-server";

export function buildAgentGuide(port: string | number, token: string, bindMode = "localhost", lanUrls: string[] = []): string {
  const URLB = `http://127.0.0.1:${port}`;
  const isLan = bindMode === "lan";
  const lanLine = isLan
    ? (lanUrls.length
      ? `**Network access: LAN/VLAN enabled.** Agents on other devices on your network can reach this vault at:\n\n${lanUrls.map((u) => "- \`" + u + "\`").join("\n")}\n\n⚠️ **Anyone on that subnet/VLAN who has the token below can read every note in this vault.** Only enable this on a network you trust (e.g. your home or a private office VLAN), keep the auth token on, and turn it back to Localhost-only in Settings when you don't need remote agents.`
      : `**Network access: LAN/VLAN enabled**, but no network interface was detected on this machine right now.`)
    : `**Network access: Localhost only** (default, recommended). Only this computer can reach the API. To let agents on other devices on your subnet/VLAN connect, go to Settings → Vault Kosmos → **Network access** → *Local network (LAN/VLAN)* — the settings page will then show you the exact address to give them.`;
  return `# Vault Kosmos — Agent API guide (v${KOSMOS_VERSION})

**Read-only · localhost by default · token-protected**

This plugin can run a small local server so AI agents (Claude Code, Claude Desktop, Cursor, custom harnesses) can query your vault's **OKF+ temporal knowledge graph** directly — canonical knowledge chains, point-in-time snapshots, semantic links, search, and a ready-to-ingest Graphiti export. Visualization and Agent API queries never modify existing notes; the only writes are the explicitly named export files you trigger yourself.

## 1 · Turn it on (about 30 seconds)

1. Obsidian → **Settings → Community plugins → Vault Kosmos** (gear icon).
2. Toggle **Enable local Agent API** on. The status line should read **running**.
3. Your address is \`${URLB}\` and your token is \`${token}\` — both have **Copy** buttons in settings.

${lanLine}

Desktop only: Obsidian on iPhone/Android can't run local servers, so this feature is unavailable there (the 3D view still works on mobile). If a LAN agent can't connect, your OS firewall may be blocking inbound connections on this port.

## 2 · Connect an agent

### Claude Code (terminal)
\`\`\`bash
claude mcp add --transport http vault-kosmos "${URLB}/mcp?token=${token}"
\`\`\`

Then ask Claude Code things like *"use vault-kosmos to show the lineage of Engine v2"*.

### Claude Desktop (and other stdio-only MCP apps)
Settings → Developer → **Edit Config**, then add (needs Node.js installed once, from nodejs.org):

\`\`\`json
{
  "mcpServers": {
    "vault-kosmos": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${URLB}/mcp?token=${token}"]
    }
  }
}
\`\`\`

Restart Claude Desktop; **vault-kosmos** appears under tools.

### Cursor / Windsurf / any Streamable-HTTP MCP client
Add a remote/HTTP MCP server with URL \`${URLB}/mcp\` and header \`Authorization: Bearer ${token}\` (or append \`?token=${token}\`).

### No MCP? Plain HTTP works too
\`\`\`bash
curl "${URLB}/health?token=${token}"
curl "${URLB}/lineage?title=Engine%20v2&token=${token}"
curl "${URLB}/at?time=2026-04-01&token=${token}"
\`\`\`

## 3 · What agents can ask (MCP tools)

| Tool | What it gives an agent |
| --- | --- |
| \`vault_overview\` | Sizes, areas, HEAD/superseded counts, lineage + semantic edge counts, diagnostics |
| \`search_notes\` | Lexical search (title/alias/tag/path) with OKF+ status on every hit |
| \`get_note\` | Full note content + canonical OKF+ lineage + outgoing links, backlinks, semantic links |
| \`get_lineage\` | The knowledge chain oldest → newest with **HEAD** marked (canonical, bidirectionally normalized) |
| \`get_related\` | Semantic (**Related:** footer), wikilink and backlink neighbors |
| \`graph_at_time\` | Temporal-validity snapshot: what was valid vs already superseded at time T |
| \`export_graphiti_episodes\` | The whole vault as Graphiti \`EpisodeType.json\` episodes, chronological |

REST mirrors: \`/overview /diagnostics /graph /notes /note /lineage /related /at /episodes\` (see \`${URLB}/\`).

## 4 · Direct vs. indirect Graphiti

- **Direct (this server):** agents read the OKF+ temporal graph live — no database, no LLM, instant. Search is honest lexical matching, not embeddings.
- **Indirect (full Graphiti):** call \`export_graphiti_episodes\` (or the palette command) and ingest with \`graphiti-ingest-sample.py\` into [getzep/graphiti](https://github.com/getzep/graphiti) (Python + Neo4j/FalkorDB + an LLM key) for entity extraction and hybrid semantic retrieval. Both paths share the same OKF+ source of truth. The export is Graphiti-ingestable; Graphiti's own LLM pipeline decides how it reconstructs entities, so an identical internal graph is not guaranteed.

## 5 · Safety & troubleshooting

- Read-only by design; there are no write endpoints. Request bodies are capped at 4 MiB (measured in bytes).
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

    new Setting(containerEl).setName("Require auth token").setDesc("Recommended. Agents must present the token below.")
      .addToggle((t) => t.setValue(s.agentRequireToken).onChange(async (v) => { s.agentRequireToken = v; await this.plugin.saveAgentSettings(); }));

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

    containerEl.createEl("h3", { text: "One-click agent setup" });
    const url = () => {
      if (s.agentBindMode === "lan") {
        const ips = this.plugin.agentLanUrls() as string[];
        if (ips.length) return `http://${ips[0].replace(/^https?:\/\//, "").split(":")[0]}:${s.agentPort}`;
      }
      return `http://127.0.0.1:${s.agentPort}`;
    };
    if (s.agentBindMode === "lan") containerEl.createEl("p", { text: "Copy buttons below use your LAN address so remote agents can reach this vault.", cls: "setting-item-description" });
    new Setting(containerEl).setName("Claude Code").setDesc("Copies a one-line terminal command.")
      .addButton((b) => b.setButtonText("Copy command").onClick(() => {
        navigator.clipboard.writeText(`claude mcp add --transport http vault-kosmos "${url()}/mcp?token=${s.agentToken}"`);
        new Notice("Claude Code command copied — paste it in a terminal");
      }));
    new Setting(containerEl).setName("Claude Desktop / stdio MCP apps").setDesc("Copies JSON for claude_desktop_config.json (uses npx mcp-remote; needs Node.js).")
      .addButton((b) => b.setButtonText("Copy config").onClick(() => {
        navigator.clipboard.writeText(JSON.stringify({ mcpServers: { "vault-kosmos": { command: "npx", args: ["-y", "mcp-remote", `${url()}/mcp?token=${s.agentToken}`] } } }, null, 2));
        new Notice("Claude Desktop config copied");
      }));
    new Setting(containerEl).setName("Quick test").setDesc("Copies a cURL health check.")
      .addButton((b) => b.setButtonText("Copy cURL").onClick(() => {
        navigator.clipboard.writeText(`curl "${url()}/health?token=${s.agentToken}"`);
        new Notice("cURL test copied");
      }));
    new Setting(containerEl).setName("Step-by-step guide").setDesc("Writes AGENT-API.md into your vault with YOUR address and token filled in.")
      .addButton((b) => b.setButtonText("Write guide to vault").setCta().onClick(async () => {
        await this.plugin.writeAgentGuide();
      }));
  }
}
