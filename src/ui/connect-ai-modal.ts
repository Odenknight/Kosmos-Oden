/**
 * Personal Notes (0.9.0) — "Connect my AI".
 *
 * One window that: explains what connecting means, lets the user choose which
 * folders an assistant may read, chooses who can reach the connection (this
 * computer or the local network), turns on the existing read-only Agent API,
 * counts the readable notes, and offers quick connect blocks.
 *
 * Obsidian imports are limited to names the test stubs export
 * (see test/source-events.test.mjs): Modal, Notice, Platform, Setting, TFolder.
 */
import { Modal, Notice, Platform, Setting, TFolder } from "obsidian";
import type { PersonalNotesHost } from "../personal-notes/host";
import { PERSONAL_WHOLE_VAULT, sanitizeFolderList } from "../personal-notes/scope";
import { CONNECT_FACTS } from "../personal-notes/guides";
import { buildConnectSnippets } from "../plugin/connect-snippets";

/** Must equal LATEST_MCP_PROTOCOL_VERSION in agent-server.ts (asserted by a test). */
export const CONNECT_MCP_PROTOCOL_VERSION = "2026-07-28";

export class ConnectAiModal extends Modal {
  private wholeVault: boolean;
  private chosen: Set<string>;
  private excludedText: string;
  private bindMode: "localhost" | "lan";
  private legacy: boolean;
  private resultEl: HTMLElement | null = null;
  private snippetsEl: HTMLElement | null = null;

  constructor(private host: PersonalNotesHost) {
    super(host.app);
    const pn = host.agentSettings.personalNotes;
    this.wholeVault = pn.includeFolders.includes(PERSONAL_WHOLE_VAULT);
    this.chosen = new Set(pn.includeFolders.filter((f) => f !== PERSONAL_WHOLE_VAULT));
    this.excludedText = pn.excludeFolders.join("\n");
    this.bindMode = pn.connection.bindMode === "lan" ? "lan" : "localhost";
    this.legacy = pn.connection.acceptOlderMcp !== false;
  }

  onOpen(): void { this.render(); }
  onClose(): void { this.contentEl.empty(); }

  private topFolders(): string[] {
    try {
      return this.app.vault.getRoot().children
        .filter((child) => child instanceof TFolder && !child.name.startsWith("."))
        .map((child) => child.path)
        .sort((a, b) => a.localeCompare(b));
    } catch (_) { return []; }
  }

  /** Address an assistant should use, given the saved network choice. */
  private baseUrl(): string {
    const s = this.host.agentSettings;
    if (s.personalNotes.connection.bindMode === "lan") {
      const lan = this.host.agentLanUrls();
      if (lan.length) return lan[0];
    }
    return `http://127.0.0.1:${s.agentPort}`;
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass("kosmos-personal-modal");
    el.createEl("h2", { text: "Connect my AI" });
    const facts = el.createEl("ul");
    for (const fact of CONNECT_FACTS) facts.createEl("li", { text: fact });

    if (!Platform.isDesktopApp) {
      el.createEl("p", { text: "Connecting an assistant needs Obsidian on a computer. It is not available on phones and tablets." });
      return;
    }

    el.createEl("h3", { text: "What may your assistant read?" });
    new Setting(el).setName("All my notes").setDesc("Everything in this vault except the folders you list under Never read.")
      .addToggle((t) => t.setValue(this.wholeVault).onChange((value) => { this.wholeVault = value; this.render(); }));

    if (!this.wholeVault) {
      const folders = this.topFolders();
      if (!folders.length) el.createEl("p", { text: "This vault has no folders. Turn on All my notes to share the notes at the top level.", cls: "setting-item-description" });
      for (const folder of folders) {
        new Setting(el).setName(folder)
          .addToggle((t) => t.setValue(this.chosen.has(folder)).onChange((value) => { if (value) this.chosen.add(folder); else this.chosen.delete(folder); }));
      }
      // Keep any previously saved folder that is not a top-level folder visible.
      for (const folder of [...this.chosen].filter((f) => !folders.includes(f)).sort()) {
        new Setting(el).setName(folder).setDesc("Saved earlier.")
          .addToggle((t) => t.setValue(true).onChange((value) => { if (value) this.chosen.add(folder); else this.chosen.delete(folder); }));
      }
    }

    new Setting(el).setName("Never read these folders").setDesc("One folder per line, for example Journal or Import/Private. These always win.")
      .addTextArea((t) => t.setValue(this.excludedText).onChange((value) => { this.excludedText = value; }));

    el.createEl("h3", { text: "Who can connect?" });
    new Setting(el).setName("Network access")
      .setDesc("This computer only is the safe choice. Local network lets an assistant on another device in your home or office connect. The private key is always required on the local network, and the traffic is not encrypted, so use it only on a network you trust.")
      .addDropdown((d) => d
        .addOption("localhost", "This computer only")
        .addOption("lan", "Local network (LAN)")
        .setValue(this.bindMode)
        .onChange((value) => { this.bindMode = value === "lan" ? "lan" : "localhost"; }));
    new Setting(el).setName("Accept older assistants")
      .setDesc("On by default. Lets assistants that use earlier MCP versions connect, as well as ones that use the newest version. Turn off to accept the newest version only.")
      .addToggle((t) => t.setValue(this.legacy).onChange((value) => { this.legacy = value; }));

    new Setting(el).setName("Turn on and check")
      .setDesc("Saves your choices, turns on the connection, and counts the notes your assistant can read.")
      .addButton((b) => b.setButtonText("Turn on and check").setCta().onClick(() => void this.apply()));

    this.resultEl = el.createEl("p", { cls: "kosmos-personal-result" });
    this.resultEl.setAttribute("role", "status");
    this.snippetsEl = el.createEl("div");
    if (this.host.agentSettings.agentEnabled && this.host.agentApi.status === "running") this.renderSnippets();
  }

  private async apply(): Promise<void> {
    const s = this.host.agentSettings;
    const include = this.wholeVault ? [PERSONAL_WHOLE_VAULT] : sanitizeFolderList([...this.chosen]);
    const exclude = sanitizeFolderList(this.excludedText.split(/\r?\n/)).filter((f) => f !== PERSONAL_WHOLE_VAULT);
    if (!include.length) { this.resultEl?.setText("Choose at least one folder, or turn on All my notes."); return; }
    this.resultEl?.setText("Turning on…");
    try {
      s.personalNotes.includeFolders = include;
      s.personalNotes.excludeFolders = exclude;
      s.personalNotes.connection.bindMode = this.bindMode;
      s.personalNotes.connection.acceptOlderMcp = this.legacy;
      s.agentEnabled = true;
      await this.host.saveAgentSettings();
      await this.host.setActiveProfile("personal");
      // start() stops a running server first, so this also applies a changed
      // network choice.
      this.host.startAgentApi();
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      if (this.host.agentApi.status !== "running") {
        this.resultEl?.setText(`The connection did not start (${this.host.agentApi.status}). Check the port under Settings, Kosmos-Oden, Agent API.`);
        return;
      }
      const overview = await this.host.agentApi.qOverview();
      const count = Number(overview?.notes) || 0;
      const where = s.personalNotes.connection.bindMode === "lan" ? "on your local network" : "on this computer";
      this.resultEl?.setText(count > 0
        ? `The connection is on ${where}. Your assistant can read ${count} ${count === 1 ? "note" : "notes"}.`
        : `The connection is on ${where}, but your assistant cannot read any notes yet. Check the folders you chose. Notes you have labeled as sensitive stay hidden.`);
      this.renderSnippets();
    } catch (_) {
      this.resultEl?.setText("Could not turn on the connection. Close this window and try again.");
    }
  }

  private renderSnippets(): void {
    const el = this.snippetsEl;
    if (!el) return;
    el.empty();
    el.createEl("h3", { text: "Quick connect" });
    el.createEl("p", { text: `Address: ${this.baseUrl()}/mcp. Copy the block for your assistant. Each block contains a private key for this vault. Do not share it.`, cls: "setting-item-description" });
    const s = this.host.agentSettings;
    for (const snippet of buildConnectSnippets({ baseUrl: this.baseUrl(), token: s.agentToken, bridgePath: this.host.bridgePath(), protocolVersion: CONNECT_MCP_PROTOCOL_VERSION })) {
      new Setting(el).setName(snippet.label).setDesc(snippet.hint)
        .addButton((b) => b.setButtonText("Copy").onClick(() => {
          void navigator.clipboard.writeText(snippet.text);
          new Notice(`Kosmos-Oden: copied the ${snippet.label} block.`);
        }));
    }
    el.createEl("p", { text: "After setting up, ask your assistant to search your notes for a word you know is there. That is the real test.", cls: "setting-item-description" });
  }
}
