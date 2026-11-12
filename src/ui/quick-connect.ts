/**
 * Quick Connect block shared by the Connect window (Personal Notes) and the
 * settings tab (existing profile). All text comes from connectionConfig(), so
 * both places produce identical configuration.
 *
 * The chosen address is shown before anything is copied. The access key is
 * only ever placed on the clipboard, never rendered.
 */
import { Notice, Setting } from "obsidian";
import {
  CONNECT_TEMPLATES, connectionConfig, healthCheckCommand, resolveBaseUrl, BRIDGE_FILE_NAME,
  type AgentOs, type ConnectTarget, type ConnectTransport,
} from "../plugin/connect-snippets";

export interface QuickConnectSource {
  port: number;
  /** Current access key ("" when none exists yet). Read only when building text. */
  token(): string;
  /** Bridge path on THIS computer (used only for "This computer"). */
  localBridgePath: string;
  thisComputerOs: AgentOs;
  /** This computer's LAN/VPN addresses (never 0.0.0.0 or loopback). */
  addresses: string[];
  /** Saved client-reachable address for "Another computer" ("" when none). */
  advertisedBaseUrl: string;
  /** Persist a newly chosen valid address. Optional. */
  saveAdvertisedBaseUrl?(value: string): Promise<void>;
  bindMode: "localhost" | "lan";
  protocols: { http: string[]; stdio: string[] };
}

export interface QuickConnectState {
  target: ConnectTarget;
  transport: ConnectTransport;
  address: string;
  agentOs: AgentOs;
  remoteBridgePath: string;
}

export function initialQuickConnectState(src: QuickConnectSource): QuickConnectState {
  return {
    target: "this-computer",
    transport: "http",
    address: src.advertisedBaseUrl || src.addresses[0] || "",
    agentOs: src.thisComputerOs,
    remoteBridgePath: "",
  };
}

export function copyToClipboard(text: string, what: string): void {
  try {
    void navigator.clipboard.writeText(text).then(
      () => new Notice(`Kosmos-Oden: copied ${what}.`),
      () => new Notice("Kosmos-Oden: could not copy to the clipboard."),
    );
  } catch {
    new Notice("Kosmos-Oden: could not copy to the clipboard.");
  }
}

/** The base URL the current choices point at, or null when invalid. */
export function quickConnectBaseUrl(src: QuickConnectSource, state: QuickConnectState): string | null {
  const r = resolveBaseUrl(state.target, state.address, src.port);
  return "baseUrl" in r ? r.baseUrl : null;
}

/**
 * Render the Quick Connect block into `el`. Choice controls re-render the
 * block; typed text only refreshes the address line and copy rows, so a click
 * right after typing is never lost to a re-render.
 */
export function renderQuickConnect(el: HTMLElement, src: QuickConnectSource, state: QuickConnectState, onChange?: () => void): void {
  el.empty();
  const rerender = () => { renderQuickConnect(el, src, state, onChange); onChange?.(); };
  const remote = state.target === "another-computer";
  let refresh = () => {};

  new Setting(el).setName("Where does the assistant run?")
    .setDesc("This computer: the assistant runs here and uses 127.0.0.1, which keeps working when network access is on. Another computer: a different PC, server or container on your network or VPN.")
    .addDropdown((d) => d
      .addOption("this-computer", "This computer")
      .addOption("another-computer", "Another computer / agent server")
      .setValue(state.target)
      .onChange((v) => {
        state.target = v === "another-computer" ? "another-computer" : "this-computer";
        if (state.target === "this-computer") state.agentOs = src.thisComputerOs;
        rerender();
      }));

  if (remote) {
    if (src.bindMode !== "lan") {
      el.createEl("p", { cls: "kosmos-personal-warning", text: "Network access is set to This computer only, so other computers cannot connect yet. Choose Local network under Network access first." });
    }
    const choices = src.addresses;
    const custom = !choices.includes(state.address);
    new Setting(el).setName("Address of this computer")
      .setDesc(choices.length
        ? "Pick the network or VPN address the other computer can reach, or type a host name."
        : "No network address was found on this computer. Type a host name or VPN address the other computer can reach.")
      .addDropdown((d) => {
        for (const a of choices) d.addOption(a, a);
        d.addOption("__custom", "Type an address…");
        d.setValue(custom ? "__custom" : state.address).onChange((v) => {
          state.address = v === "__custom" ? "" : v;
          void save();
          rerender();
        });
      })
      .addText((t) => {
        t.setPlaceholder("192.0.2.10 or notes-pc.example.lan").setValue(custom ? state.address : "");
        t.inputEl.setAttribute("aria-label", "Address typed by hand");
        t.onChange((v) => { state.address = v.trim(); refresh(); });
        t.inputEl.addEventListener("blur", () => void save());
      });
    new Setting(el).setName("Assistant computer's system")
      .setDesc("Decides how copied commands and file paths are written.")
      .addDropdown((d) => d.addOption("posix", "Linux or macOS").addOption("windows", "Windows")
        .setValue(state.agentOs).onChange((v) => { state.agentOs = v === "windows" ? "windows" : "posix"; rerender(); }));
  }

  const httpRevs = src.protocols.http.join(", ") || "none";
  const stdioRevs = src.protocols.stdio.join(", ") || "none";
  new Setting(el).setName("Connection type")
    .setDesc(`Direct HTTP is simplest and needs nothing installed on the assistant's computer (MCP ${httpRevs}). The stdio bridge is for apps that only launch a local command; it needs Node.js where the assistant runs (MCP ${stdioRevs}).`)
    .addDropdown((d) => d.addOption("http", "Direct HTTP (recommended)").addOption("stdio", "stdio bridge")
      .setValue(state.transport).onChange((v) => { state.transport = v === "stdio" ? "stdio" : "http"; rerender(); }));

  if (remote && state.transport === "stdio") {
    new Setting(el).setName(`Path of ${BRIDGE_FILE_NAME} on the other computer`)
      .setDesc(`Copy ${BRIDGE_FILE_NAME} from this plugin's folder to the other computer, install Node.js there, and enter its full path on that computer. Its KOSMOS_MCP_URL will point at the address below.`)
      .addText((t) => {
        t.setPlaceholder(state.agentOs === "windows" ? "C:\\kosmos\\kosmos-mcp-stdio.mjs" : "/opt/kosmos/kosmos-mcp-stdio.mjs").setValue(state.remoteBridgePath);
        t.inputEl.setAttribute("aria-label", "Bridge path on the other computer");
        t.onChange((v) => { state.remoteBridgePath = v.trim(); refresh(); });
      });
  }

  if (remote) {
    const notes = el.createEl("ul", { cls: "kosmos-personal-facts" });
    notes.createEl("li", { text: "Plain http:// is not encrypted. Use it only on a network you trust. Over the internet or an untrusted network, use a VPN or an HTTPS reverse proxy and enter that address." });
    notes.createEl("li", { text: "Kosmos-Oden does not change your firewall or router. If the other computer cannot connect, allow this port in this computer's firewall for your local network only." });
  }

  const dynamic = el.createDiv({ cls: "kosmos-quick-connect-rows" });
  refresh = () => renderRows(dynamic, src, state);
  refresh();
  el.createEl("p", { cls: "setting-item-description", text: "Each copied configuration contains the access key for this vault. Treat it like a password. Browser-based or cloud-hosted assistants cannot reach 127.0.0.1 or a home-network address." });

  async function save(): Promise<void> {
    if (!src.saveAdvertisedBaseUrl || state.target !== "another-computer") return;
    const r = resolveBaseUrl("another-computer", state.address, src.port);
    if ("baseUrl" in r && r.baseUrl !== src.advertisedBaseUrl) {
      src.advertisedBaseUrl = r.baseUrl;
      try { await src.saveAdvertisedBaseUrl(r.baseUrl); } catch { /* kept for this window only */ }
    }
  }
}

function renderRows(el: HTMLElement, src: QuickConnectSource, state: QuickConnectState): void {
  el.empty();
  const remote = state.target === "another-computer";
  const base = resolveBaseUrl(state.target, state.address, src.port);
  const shown = el.createEl("p", { cls: "kosmos-quick-connect-endpoint" });
  shown.setAttribute("role", "status");
  if ("baseUrl" in base) shown.setText(`The assistant will connect to: ${base.baseUrl}/mcp`);
  else { shown.setText(base.error); shown.addClass("kosmos-personal-warning"); }

  const bridgePath = remote ? state.remoteBridgePath : src.localBridgePath;
  for (const template of CONNECT_TEMPLATES) {
    const build = () => connectionConfig({
      target: state.target, transport: state.transport, advertisedBaseUrl: state.address, port: src.port,
      token: src.token(), bridgePath, agentOs: state.agentOs, template: template.id,
      protocols: state.transport === "stdio" ? src.protocols.stdio : src.protocols.http,
    });
    const preview = build();
    new Setting(el).setName("error" in preview ? template.label : preview.label).setDesc("error" in preview ? preview.error : preview.hint)
      .addButton((b) => b.setButtonText("Copy configuration").setDisabled("error" in preview).onClick(() => {
        const r = build();
        if ("error" in r) new Notice(`Kosmos-Oden: ${r.error}`);
        else copyToClipboard(r.text, `the ${r.label} configuration for ${r.endpoint}`);
      }));
  }
  const healthInput = () => ({ target: state.target, advertisedBaseUrl: state.address, port: src.port, token: src.token(), agentOs: state.agentOs });
  const health = healthCheckCommand(healthInput());
  new Setting(el).setName("HTTP health check").setDesc("error" in health ? health.error : health.hint)
    .addButton((b) => b.setButtonText("Copy command").setDisabled("error" in health).onClick(() => {
      const r = healthCheckCommand(healthInput());
      if (!("error" in r)) copyToClipboard(r.text, `a health check for ${r.endpoint}`);
    }));
}
