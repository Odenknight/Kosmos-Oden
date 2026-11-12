/**
 * Personal Notes (0.9.0) — "Search my notes": one box, a plain result list.
 *
 * This is the human's own search, so it covers every note in the vault. The
 * folder rule that limits an assistant does not apply here.
 *
 * Obsidian imports are limited to names the test stubs export
 * (see test/source-events.test.mjs): ItemView, Notice, TFile, WorkspaceLeaf.
 */
import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type { PersonalNotesHost } from "../personal-notes/host";
import type { TextHit } from "../personal-notes/fulltext";

export const PERSONAL_SEARCH_VIEW = "kosmos-oden-notes-search";
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 50;

export class PersonalSearchView extends ItemView {
  private input: HTMLInputElement | null = null;
  private statusEl: HTMLElement | null = null;
  private resultsEl: HTMLElement | null = null;
  private timer = 0;
  private sequence = 0;

  constructor(leaf: WorkspaceLeaf, private host: PersonalNotesHost) { super(leaf); }

  getViewType(): string { return PERSONAL_SEARCH_VIEW; }
  getDisplayText(): string { return "Search my notes"; }
  getIcon(): string { return "search"; }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("kosmos-notes-search");
    const input = root.createEl("input", { type: "search", cls: "kosmos-notes-search-input" });
    input.setAttribute("placeholder", "Search my notes");
    input.setAttribute("aria-label", "Search my notes");
    this.input = input;
    this.statusEl = root.createEl("p", { cls: "kosmos-notes-search-status", text: "Type words to find. Put a phrase in quotes." });
    this.statusEl.setAttribute("role", "status");
    this.resultsEl = root.createEl("div", { cls: "kosmos-notes-search-results" });
    this.registerDomEvent(input, "input", () => this.schedule());
    this.registerDomEvent(input, "keydown", (event: KeyboardEvent) => { if (event.key === "Enter") { window.clearTimeout(this.timer); void this.run(); } });
    input.focus();
  }

  async onClose(): Promise<void> {
    window.clearTimeout(this.timer);
    this.sequence++;
    this.contentEl.empty();
    this.input = null; this.statusEl = null; this.resultsEl = null;
  }

  private schedule(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(), SEARCH_DEBOUNCE_MS);
  }

  private async run(): Promise<void> {
    const query = this.input?.value ?? "";
    const turn = ++this.sequence;
    if (!query.trim()) { this.show("Type words to find. Put a phrase in quotes.", []); return; }
    this.statusEl?.setText("Searching…");
    try {
      const graph = await this.host.provider.getGraph();
      if (turn !== this.sequence) return;
      const index = this.host.provider.getTextIndex(graph);
      if (!index) { this.show("Still reading your notes. Try again in a moment.", []); return; }
      const started = performance.now();
      const result = index.search(query, { limit: SEARCH_LIMIT });
      const ms = Math.round(performance.now() - started);
      if (turn !== this.sequence) return;
      const shown = result.hits.length;
      const summary = result.total === 0
        ? "No notes found."
        : `${result.total} ${result.total === 1 ? "note" : "notes"} found${shown < result.total ? `, showing the first ${shown}` : ""}. Searched ${index.notes} notes in ${ms} ms.`;
      this.show(summary, result.hits);
    } catch (_) {
      if (turn === this.sequence) this.show("Could not read your notes just now. Try again.", []);
    }
  }

  private show(status: string, hits: readonly TextHit[]): void {
    this.statusEl?.setText(status);
    const list = this.resultsEl;
    if (!list) return;
    list.empty();
    for (const hit of hits) {
      const row = list.createEl("div", { cls: "kosmos-notes-search-row" });
      const title = row.createEl("a", { cls: "kosmos-notes-search-title", text: hit.title });
      title.setAttribute("href", "#");
      this.registerDomEvent(title, "click", (event: MouseEvent) => { event.preventDefault(); this.open(hit.path); });
      row.createEl("div", { cls: "kosmos-notes-search-path", text: hit.path });
      if (hit.snippet) row.createEl("div", { cls: "kosmos-notes-search-snippet", text: hit.snippet });
    }
  }

  private open(path: string): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) void this.app.workspace.getLeaf("tab").openFile(file);
  }
}
