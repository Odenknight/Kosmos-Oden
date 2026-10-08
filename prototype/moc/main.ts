import { Plugin, Modal, Notice, FileSystemAdapter, Setting, type ButtonComponent } from "obsidian";
import { randomUUID } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { createPrototypeHost, validateFolder, TARGET_NAME } from "./tree-host.mjs";

export default class MocPrototype extends Plugin {
  record: { root: string; folder: string; adoptionId: string } | null = null;
  records: { root: string; folder: string; adoptionId: string }[] = [];
  enabled = false;
  busy = false;
  disposed = false;
  epoch = 0;
  runtime: any = null;
  state = "Paused. No maintenance starts automatically.";
  lastCommit = "None in this session";
  async onload() {
    const data = await this.loadData();
    if (data?.version === 1 && typeof data.record?.root === "string" && typeof data.record?.folder === "string" && typeof data.record?.adoptionId === "string") this.record = data.record;
    this.records = data?.version === 2 && Array.isArray(data.records) ? data.records.filter((r: any) => typeof r?.root === "string" && typeof r?.folder === "string" && typeof r?.adoptionId === "string") : this.record ? [this.record] : [];
    this.record = this.records.at(-1) ?? null;
    this.addCommand({ id: "open-moc-prototype", name: "Open MOC test controls", callback: () => new Controls(this).open() });
    this.addCommand({ id: "pause-moc-prototype", name: "Pause MOC maintenance", callback: () => void this.pause().then(() => new Notice(this.state)) });
    this.addRibbonIcon("list-tree", "Kosmos MOC test controls", () => new Controls(this).open());
  }
  async root() {
    if (!(this.app.vault.adapter instanceof FileSystemAdapter)) throw new Error("Desktop filesystem vault required.");
    return realpath(this.app.vault.adapter.getBasePath());
  }
  async pause() {
    this.epoch++;
    this.enabled = false;
    const active = this.runtime;
    if (!active) { this.state = "Paused."; return; }
    const result = await active.shutdown();
    if (result.clean) { this.runtime = null; this.state = "Paused. Engine shut down cleanly."; }
    else this.state = "Recovery required. Do not restart or delete Engine state.";
  }
  async start(folder: string, confirmation: string) {
    if (this.disposed) throw new Error("Plugin is unloading.");
    const epoch = ++this.epoch;
    if (this.runtime) throw new Error("Maintenance is already running. Click Pause maintenance before starting another folder.");
    if (confirmation !== "COPY") throw new Error("Type COPY to authorize this test session.");
    validateFolder(folder);
    const root = await this.root();
    this.record = this.records.find(r => r.root === root && r.folder === folder) ?? null;
    const previewHost = await createPrototypeHost({ root, folder, adoptionId: this.record?.adoptionId ?? randomUUID(), isEnabled: () => false });
    await previewHost.preview();
    if (!this.record) {
      try { await lstat(resolve(root, folder, TARGET_NAME)); throw new Error("The target already exists. Choose a folder without a prototype index."); }
      catch (error: any) { if (error.code !== "ENOENT") throw error; }
      this.record = { root, folder, adoptionId: randomUUID() };
      this.records.push(this.record);
      await this.saveData({ version: 2, records: this.records });
    }
    if (this.disposed || epoch !== this.epoch) throw new Error("Startup cancelled.");
    this.enabled = true;
    try {
      const host = await createPrototypeHost({ ...this.record, isEnabled: () => this.enabled, onCommitted: () => { this.lastCommit = new Date().toLocaleTimeString(); } });
      this.runtime = host.runtime;
      if (!await this.runtime.start()) throw new Error("Recovery did not permit startup.");
      this.state = "Maintenance running. Authorization expires after two hours; pause and start to renew.";
    } catch (error: any) {
      await this.pause();
      const code = typeof error?.message === "string" && /^[A-Z][A-Z0-9_]{2,80}(?:: [^\r\n]+)?$/.test(error.message) ? error.message : "STARTUP_REFUSED";
      this.state = `Could not start ${folder}/${TARGET_NAME}. Engine reason: ${code}. Keep .gkx and _archive intact. Copy this status when reporting the problem.`;
      throw new Error(this.state);
    }
  }
  onunload() { this.disposed = true; this.enabled = false; void this.pause(); }
}

class Controls extends Modal {
  private refreshTimer: ReturnType<typeof setInterval> | undefined;
  constructor(private plugin: MocPrototype) { super(plugin.app); }
  onOpen() {
    const el = this.contentEl; el.empty(); el.createEl("h2", { text: "Kosmos MOC prototype 0.2.0" });
    el.createEl("p", { text: "1. Enter a folder path. 2. Preview its notes. 3. Type COPY. 4. Start maintenance. Success creates Kosmos Index.md in that folder and its subfolders. To test another folder, pause first, change the path, then start again." });
    el.createEl("p", { text: "Select a folder tree in your copied vault. Each folder gets Kosmos Index.md with parent and child folder links and files grouped by type. PDF, image, audio and other attachments are listed by name; their contents are not read or searched. Hidden folders and _archive are excluded. Existing index.md notes are preserved." });
    el.createEl("p", { text: "The generated index belongs to Engine. Do not edit it during this test. Original notes are read only. Engine also writes recovery records under .gkx and _archive. Pause sync and other automation that modifies the generated index." });
    el.createEl("p", { text: "By typing COPY and starting, you authorize this local session to list files throughout the selected folder tree and maintain its generated indexes, including folders created during this session. Confirm that the copy has no retention restriction on that generated target. No labels are changed and no network service is used." });
    let folder = this.plugin.record?.folder ?? ""; let confirmation = "";
    new Setting(el).setName("Source folder").setDesc("For example Research or Projects/Ideas. Pause before selecting another folder. Each folder keeps its own saved authorization.").addText(input => input.setValue(folder).onChange(value => { folder = value.trim(); }));
    new Setting(el).setName("Authorize copied vault test").setDesc("Type COPY. Maintenance always starts paused after Obsidian opens.").addText(input => input.onChange(value => { confirmation = value; }));
    const status = el.createEl("pre"); status.style.whiteSpace = "pre-wrap";
    let startButton: ButtonComponent, pauseButton: ButtonComponent, reconcileButton: ButtonComponent;
    const refresh = () => {
      const state = this.plugin.runtime?.status;
      status.textContent = `${this.plugin.busy ? "Working…\n" : ""}${this.plugin.state}\nLast write: ${this.plugin.lastCommit}${state ? `\n${state.running ? "Monitoring the selected folder tree." : "Monitoring stopped."}\n${state.active ? "Updating indexes…" : state.pending ? "Changes queued for an update." : "No changes waiting."}${state.errorCode ? `\nNeeds attention: ${state.errorCode}` : ""}` : ""}`;
      startButton?.setDisabled(this.plugin.busy || !!this.plugin.runtime);
      pauseButton?.setDisabled(this.plugin.busy || !this.plugin.runtime);
      reconcileButton?.setDisabled(this.plugin.busy || !this.plugin.runtime);
    };
    const act = async (work: () => Promise<void>) => {
      if (this.plugin.busy) return;
      this.plugin.busy = true;
      refresh();
      try { await work(); } catch (error: any) { this.plugin.state = error.message; new Notice(error.message); }
      finally { this.plugin.busy = false; refresh(); }
    };
    new Setting(el).addButton(b => b.setButtonText("Preview folder tree").onClick(() => void act(async () => {
      const host = await createPrototypeHost({ root: await this.plugin.root(), folder, adoptionId: this.plugin.record?.adoptionId ?? randomUUID(), isEnabled: () => false });
      const paths = await host.preview();
      preview.textContent = `${paths.filter(p => p.startsWith("INDEX:")).length} indexes; ${paths.filter(p => !p.startsWith("INDEX:")).length} files. Main index: ${host.target}\n${paths.slice(0, 100).join("\n")}${paths.length > 100 ? "\nPreview limited to 100 paths." : ""}`;
    }))).addButton(b => { startButton = b; b.setButtonText("Start maintenance").setCta().onClick(() => void act(() => this.plugin.start(folder, confirmation))); });
    new Setting(el).addButton(b => { reconcileButton = b; b.setButtonText("Reconcile now").onClick(() => void act(async () => {
      if (!this.plugin.runtime || !this.plugin.enabled) throw new Error("Start maintenance first.");
      await this.plugin.runtime.reconcileNow();
      if (this.plugin.runtime.status.errorCode) throw new Error("Reconciliation needs review. Inspect runtime status; pause before changing configuration.");
    })); }).addButton(b => { pauseButton = b; b.setButtonText("Pause maintenance").onClick(() => void act(() => this.plugin.pause())); }).addButton(b => b.setButtonText("Open main index").onClick(() => void act(async () => {
      const selected = this.plugin.record?.folder;
      const path = selected ? `${selected}/${TARGET_NAME}` : "";
      if (!path || !this.app.vault.getAbstractFileByPath(path)) throw new Error("The main index has not been created yet. Preview the tree and start maintenance first.");
      await this.app.workspace.openLinkText(path, "", true);
    })));
    const preview = el.createEl("pre"); preview.style.whiteSpace = "pre-wrap";
    refresh();
    this.refreshTimer = setInterval(refresh, 1000);
  }
  onClose() { if (this.refreshTimer) clearInterval(this.refreshTimer); }
}
