/**
 * Personal Notes (0.9.0) — "Connect my AI".
 *
 * Explains what connecting means, edits the Folders shared with agents,
 * starts/stops the Personal connection through the plugin host, and offers
 * Quick Connect configuration plus a real connection test. Every action goes
 * through PersonalPluginHost; nothing here reads plugin internals.
 */
import { Modal, Notice, Platform, Setting, TFolder } from "obsidian";
import type { ConnectionTestResult, PersonalConnectionStatus, PersonalPluginHost } from "../personal-notes/plugin-host";
import { PERSONAL_WHOLE_VAULT, normalizeFolder, type RejectedFolder } from "../personal-notes/scope";
import { CONNECT_FACTS } from "../personal-notes/guides";
import { initialQuickConnectState, quickConnectBaseUrl, renderQuickConnect, type QuickConnectSource, type QuickConnectState } from "./quick-connect";

const REASONS: Record<string, string> = {
  absolute: "starts with /. Write the folder as it appears in the vault, for example Journal/Private",
  drive: "is a path on the computer, not a folder in the vault",
  unc: "is a network path, not a folder in the vault",
  backslash: "uses \\. Use / between folder names",
  dot_segment: "contains . or .., which is not allowed",
  empty_segment: "contains an empty folder name (// or a trailing /)",
  nul: "contains characters that are not allowed",
  control_character: "contains characters that are not allowed",
  malformed_encoding: "contains characters that are not allowed",
  not_string: "is not a folder name",
  empty: "is empty",
  too_many: "is one folder too many (the limit is 200)",
  not_a_list: "is not a list of folders",
};

/** Plain-language line for a folder the plugin refused to save. */
export function describeRejectedFolder(r: RejectedFolder): string {
  return `“${String(r.value)}” was not saved: it ${REASONS[r.reason] ?? "is not a valid folder"}.`;
}

/** Turn the "Never share" text into entries; invalid lines are kept so the plugin reports them. */
export function parseFolderLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => normalizeFolder(line) || line);
}

/** What the current selection means, in words. Empty when it shares something. */
export function selectionWarning(include: readonly string[], exclude: readonly string[]): string {
  if (exclude.includes(PERSONAL_WHOLE_VAULT)) return "“/” in Never share excludes everything: assistants can read no notes at all.";
  if (!include.length) return "No folders are shared: assistants can read no notes until you choose some.";
  return "";
}

export class ConnectAiModal extends Modal {
  private wholeVault: boolean;
  private chosen: Set<string>;
  private excludedText: string;
  private qc: QuickConnectState;
  private foldersEl!: HTMLElement;
  private connectionEl!: HTMLElement;
  private quickEl!: HTMLElement;
  private testEl!: HTMLElement;
  private warningEl: HTMLElement | null = null;
  private connectionMessage = "";

  constructor(private host: PersonalPluginHost) {
    super(host.app);
    const pn = host.settings().personalNotes;
    this.wholeVault = pn.includeFolders.includes(PERSONAL_WHOLE_VAULT);
    this.chosen = new Set(pn.includeFolders.filter((f) => f !== PERSONAL_WHOLE_VAULT));
    this.excludedText = pn.excludeFolders.join("\n");
    this.qc = initialQuickConnectState(this.quickSource());
  }

  onOpen(): void { this.render(); }
  onClose(): void { this.contentEl.empty(); }

  private render(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass("kosmos-personal-modal");
    el.createEl("h2", { text: "Connect my AI" });
    const facts = el.createEl("ul", { cls: "kosmos-personal-facts" });
    for (const fact of CONNECT_FACTS) facts.createEl("li", { text: fact });
    if (!Platform.isDesktopApp) {
      el.createEl("p", { cls: "kosmos-personal-warning", text: "Connecting an assistant needs Obsidian on a desktop computer. It is not available on phones and tablets. Search my notes still works here." });
      return;
    }
    el.createEl("h3", { text: "Folders shared with agents" });
    this.foldersEl = el.createDiv();
    el.createEl("h3", { text: "Connection" });
    this.connectionEl = el.createDiv();
    el.createEl("h3", { text: "Quick Connect" });
    this.quickEl = el.createDiv();
    el.createEl("h3", { text: "Test connection" });
    this.testEl = el.createDiv();
    this.renderFolders();
    this.renderConnection();
    this.renderQuick();
    this.renderTest(null);
  }

  /* ---------------------------------------------------------------- folders */

  private topFolders(): string[] {
    try {
      return this.app.vault.getRoot().children
        .filter((child): child is TFolder => child instanceof TFolder && !child.name.startsWith("."))
        .map((child) => child.path)
        .sort((a, b) => a.localeCompare(b));
    } catch { return []; }
  }

  private renderFolders(rejected: RejectedFolder[] = [], saved = false): void {
    const el = this.foldersEl;
    el.empty();
    el.createEl("p", { cls: "setting-item-description", text: "Only these folders can be read by an assistant. Your own search always covers the whole vault." });
    new Setting(el).setName("Whole vault").setDesc("Share every note except the folders under Never share.")
      .addToggle((t) => t.setValue(this.wholeVault).onChange((v) => { this.wholeVault = v; this.renderFolders(); }));
    if (!this.wholeVault) {
      const folders = this.topFolders();
      if (!folders.length) el.createEl("p", { cls: "setting-item-description", text: "This vault has no folders. Turn on Whole vault to share notes at the top level." });
      const toggle = (folder: string, desc?: string) => {
        const s = new Setting(el).setName(folder);
        if (desc) s.setDesc(desc);
        s.addToggle((t) => t.setValue(this.chosen.has(folder)).onChange((v) => { if (v) this.chosen.add(folder); else this.chosen.delete(folder); this.updateWarning(); }));
      };
      for (const folder of folders) toggle(folder);
      for (const folder of [...this.chosen].filter((f) => !folders.includes(f)).sort()) toggle(folder, "Chosen earlier.");
    }
    new Setting(el).setName("Never share").setDesc("One folder per line, for example Journal or Import/Private. These always win over shared folders.")
      .addTextArea((t) => {
        t.setValue(this.excludedText).onChange((v) => { this.excludedText = v; this.updateWarning(); });
        t.inputEl.setAttribute("aria-label", "Folders never shared, one per line");
      });
    this.warningEl = el.createEl("p", { cls: "kosmos-personal-warning kosmos-selection-warning" });
    this.warningEl.setAttribute("role", "status");
    this.updateWarning();
    for (const r of rejected) el.createEl("p", { cls: "kosmos-personal-warning", text: describeRejectedFolder(r) });
    if (saved) {
      const count = this.safeCount();
      el.createEl("p", { cls: "kosmos-personal-result", text: count === null ? "Saved." : `Saved. Assistants can read ${count} ${count === 1 ? "note" : "notes"} right now.` });
    }
    new Setting(el).addButton((b) => b.setButtonText("Save shared folders").setCta().onClick(() => void this.saveFolders()));
  }

  private include(): string[] { return this.wholeVault ? [PERSONAL_WHOLE_VAULT] : [...this.chosen].sort(); }

  private updateWarning(): void {
    this.warningEl?.setText(selectionWarning(this.include(), parseFolderLines(this.excludedText)));
  }

  private safeCount(): number | null {
    try { return this.host.sharedNoteCount(); } catch { return null; }
  }

  private async saveFolders(): Promise<void> {
    const include = this.include();
    const exclude = parseFolderLines(this.excludedText);
    try {
      const result = await this.host.updatePersonalNotes((d) => { d.includeFolders = include; d.excludeFolders = exclude; });
      this.renderFolders(result.rejected, result.saved);
    } catch (error: any) {
      new Notice(`Kosmos-Oden: could not save the shared folders: ${String(error?.message || error)}`);
    }
  }

  /* ------------------------------------------------------------- connection */

  private statusText(st: PersonalConnectionStatus): string {
    const where = st.bindMode === "lan" ? "this computer and your local network" : "this computer only";
    switch (st.state) {
      case "running": return `Connected. Reachable from ${where}, port ${st.port}.`;
      case "starting": return "Starting…";
      case "error": return `Not connected: ${st.error || "the connection could not start"}.`;
      case "unavailable": return `Not available: ${st.error || "this needs desktop Obsidian"}.`;
      default: return "Not connected. Assistants cannot read anything.";
    }
  }

  private renderConnection(): void {
    const el = this.connectionEl;
    el.empty();
    const st = this.host.connection();
    const line = el.createEl("p", { cls: "kosmos-personal-result", text: this.statusText(st) });
    line.setAttribute("role", "status");
    if (this.connectionMessage) el.createEl("p", { cls: "setting-item-description", text: this.connectionMessage });
    const count = this.safeCount();
    if (count !== null) el.createEl("p", { cls: "setting-item-description", text: `Notes an assistant can read now: ${count}.` });

    const controls = new Setting(el).setName("Connection controls");
    if (st.state === "running") controls.addButton((b) => b.setButtonText("Disconnect").onClick(() => void this.act(() => this.host.disconnect(), "Disconnected. Assistants can no longer connect.")));
    else controls.addButton((b) => b.setButtonText("Connect").setCta().setDisabled(st.state === "starting").onClick(() => void this.connect()));
    controls.addButton((b) => b.setButtonText("Rotate token").setWarning().onClick(() => void this.act(() => this.host.rotateToken(), "A new access key was made. Copy the configuration again for every assistant; the old key no longer works.")));

    new Setting(el).setName("Start when Obsidian opens").setDesc("Off by default. Applies to this device only; another device needs its own Connect.")
      .addToggle((t) => t.setValue(st.autoStart).onChange((v) => void this.act(() => this.host.setAutoStart(v), "")));

    const conn = this.host.settings().personalNotes.connection;
    new Setting(el).setName("Network access")
      .setDesc("This computer only is the safe choice. Local network lets an assistant on another computer in your home or office connect; the access key is always required. Plain HTTP is not encrypted.")
      .addDropdown((d) => d.addOption("localhost", "This computer only").addOption("lan", "Local network")
        .setValue(conn.bindMode).onChange((v) => void this.update((draft) => { draft.connection.bindMode = v === "lan" ? "lan" : "localhost"; })));

    const p = this.host.mcpProtocols();
    const stdioOnly = p.stdio.filter((v) => !p.http.includes(v));
    const older = conn.acceptOlderMcp
      ? `On. Direct HTTP accepts MCP ${p.http.join(", ")}. The stdio bridge accepts ${p.stdio.join(", ")}${stdioOnly.length ? `; ${stdioOnly.join(", ")} works only through the bridge` : ""}.`
      : `Off. Only MCP ${p.http.join(", ")} is accepted.`;
    new Setting(el).setName("Accept older MCP clients").setDesc(older)
      .addToggle((t) => t.setValue(conn.acceptOlderMcp).onChange((v) => void this.update((draft) => { draft.connection.acceptOlderMcp = v; })));
  }

  private async connect(): Promise<void> {
    this.connectionMessage = "Starting…";
    this.renderConnection();
    try {
      const st = await this.host.connect();
      this.connectionMessage = st.state === "running" ? "" : this.statusText(st);
    } catch (error: any) {
      this.connectionMessage = `Not connected: ${String(error?.message || error)}`;
    }
    this.renderConnection();
    this.renderQuick();
  }

  private async act(fn: () => Promise<void>, message: string): Promise<void> {
    try {
      await fn();
      this.connectionMessage = message;
    } catch (error: any) {
      this.connectionMessage = `That did not work: ${String(error?.message || error)}`;
    }
    this.renderConnection();
    this.renderQuick();
  }

  private async update(change: Parameters<PersonalPluginHost["updatePersonalNotes"]>[0]): Promise<void> {
    try {
      const r = await this.host.updatePersonalNotes(change);
      this.connectionMessage = r.saved ? "" : "The change was not saved.";
    } catch (error: any) {
      this.connectionMessage = `The change was not saved: ${String(error?.message || error)}`;
    }
    this.renderConnection();
    this.renderQuick();
  }

  /* ---------------------------------------------------------- quick connect */

  private quickSource(): QuickConnectSource {
    const s = this.host.settings();
    const host = this.host;
    let addresses: string[] = [];
    try { addresses = host.reachableAddresses(); } catch { addresses = []; }
    let bridge = "";
    try { bridge = host.bridgePath(); } catch { bridge = ""; }
    return {
      port: s.port,
      token: () => { try { return host.connection().hasToken ? host.connectionToken() : ""; } catch { return ""; } },
      localBridgePath: bridge,
      thisComputerOs: Platform.isWin ? "windows" : "posix",
      addresses,
      advertisedBaseUrl: s.personalNotes.connection.advertisedBaseUrl,
      saveAdvertisedBaseUrl: async (value) => { await host.updatePersonalNotes((d) => { d.connection.advertisedBaseUrl = value; }); },
      bindMode: s.personalNotes.connection.bindMode,
      protocols: host.mcpProtocols(),
    };
  }

  private renderQuick(): void {
    const el = this.quickEl;
    if (!this.host.connection().hasToken) {
      el.empty();
      el.createEl("p", { cls: "setting-item-description", text: "Press Connect first. It creates the access key the configuration needs." });
      return;
    }
    renderQuickConnect(el, this.quickSource(), this.qc, () => this.renderTest(null));
  }

  /* ------------------------------------------------------------------- test */

  private renderTest(result: ConnectionTestResult | null, error = ""): void {
    const el = this.testEl;
    el.empty();
    const src = this.quickSource();
    const base = quickConnectBaseUrl(src, this.qc);
    new Setting(el).setName("Test connection")
      .setDesc(`Connects to ${base ? `${base}/mcp` : "the chosen address"} from this computer, the way an assistant would: key, MCP opening, tool list, a search and a read.`)
      .addButton((b) => b.setButtonText("Test connection").setDisabled(!base).onClick(() => void this.runTest(base!)));
    el.createEl("p", { cls: "setting-item-description", text: "A test from this computer cannot prove that another computer's firewall or network route reaches this one. Run the health check on the other computer as well." });
    if (error) el.createEl("p", { cls: "kosmos-personal-warning", text: error });
    if (!result) return;
    const summary = el.createEl("p", { cls: "kosmos-personal-result", text: result.ok ? "The connection works." : "The connection test failed." });
    summary.setAttribute("role", "status");
    el.createEl("p", { cls: "setting-item-description", text: `Address ${result.baseUrl} · ${result.transport === "streamable-http" ? "Streamable HTTP" : result.transport} · MCP ${result.protocolVersion ?? "not negotiated"}` });
    const list = el.createEl("ol", { cls: "kosmos-test-steps" });
    for (const step of result.steps) {
      const li = list.createEl("li", { cls: step.ok ? "is-ok" : "is-failed", text: `${STEP_NAMES[step.name] ?? step.name}: ${step.ok ? "passed" : "failed"} — ${step.detail}` });
      li.setAttribute("data-step", step.name);
    }
  }

  private async runTest(baseUrl: string): Promise<void> {
    if (this.host.connection().state !== "running") { this.renderTest(null, "Press Connect first; there is nothing to test while the connection is off."); return; }
    this.renderTest(null, "Testing…");
    try {
      this.renderTest(await this.host.testConnection(baseUrl));
    } catch (error: any) {
      this.renderTest(null, `The test could not run: ${String(error?.message || error)}`);
    }
  }
}

const STEP_NAMES: Record<string, string> = {
  authenticate: "Access key",
  open: "MCP opening",
  list_tools: "Tool list",
  search: "Search",
  read: "Read a note",
};
