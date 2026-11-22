/**
 * Personal Notes (0.9.0) — "Search my notes".
 *
 * The user's own search over the whole vault (operational files excluded).
 * Assistants see only the Folders shared with agents; that rule is applied by
 * the plugin to agent requests, not here.
 *
 * Each keystroke aborts the previous request; results render with two
 * delegated listeners on the list (no per-row listeners), and the list is a
 * keyboard-navigable listbox.
 */
import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type { PersonalPluginHost, PersonalSearchStatus } from "../personal-notes/plugin-host";
import { PERSONAL_LIMITS, type SearchField, type SearchHit } from "../personal-notes/types";

export const PERSONAL_SEARCH_VIEW = "kosmos-oden-notes-search";
export const LOCAL_LIBRARIAN_VIEW = "kosmos-oden-local-librarian";
export const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 50;
const HINT = "Type words to find. Put an exact phrase in quotes.";

const FIELD_NAMES: Record<SearchField, string> = { title: "title", alias: "alias", tag: "tag", path: "folder or file name", body: "text" };
type ResultRow = Pick<SearchHit, "path" | "title" | "excerpt" | "matchedIn">;

function renderLibrarianHelp(root: HTMLElement): (query: string) => void {
  const topics = [
    ["How do I connect an AI assistant?", /\bmcp\b|\bconnect\b.*\b(ai|assistant)\b/i, [
      "MCP lets a desktop assistant ask the Librarian for notes. In Personal Notes, open Connect my AI, choose the folders it may read and put private folders in Never share. Use Localhost only for an assistant on this computer.",
      "Press Connect, then use Quick Connect to copy the client configuration and test it. Keep the token private. A cloud assistant receives the passages it reads.",
    ]],
    ["Which GKX tags should I use?", /\b(gkx|gkxtreme|tagging)\b/i, [
      "Basic — Start with ordinary Markdown. If dates would help, use Optional tags to preview created and updated timestamps.",
      "Intermediate — Add permanent note IDs to track identity over time. Use This note supersedes… to record which earlier note a new one replaces.",
      "GKXtreme — For a governed collection, use GKOS Note Formatting to review structured properties and proposed topic tags or relationships. Start with Deterministic only. Preview changes and review backups before applying them.",
    ]],
    ["Which sync services can I use?", /\bsync (services|providers|options)\b|\b(nextcloud|dropbox|onedrive|google drive|s3)\b/i, [
      "Nextcloud is built in. Under Connectivity to Sync Vault, enter your server, remote folder and app password. Test the connection before running Sync now.",
      "S3-compatible storage is planned. Dropbox, OneDrive and Google Drive are candidates for later releases.",
    ]],
  ] as const;
  const sections = topics.map(([question, keywords, paragraphs]) => {
    const details = root.createEl("details");
    details.createEl("summary", { text: question });
    for (const text of paragraphs) details.createEl("p", { text });
    return { details, keywords };
  });
  return (query) => {
    for (const { details, keywords } of sections) details.open = keywords.test(query);
  };
}

/** Plain explanation of a rejected query. */
export function invalidQueryMessage(query: string, fallback: string): string {
  if (((query.match(/"/g) ?? []).length) % 2 === 1) return "A quotation mark is not closed. Add the closing \" to search for an exact phrase.";
  if ([...query].length > PERSONAL_LIMITS.queryCodePoints) return `The search text is too long. Use at most ${PERSONAL_LIMITS.queryCodePoints} characters.`;
  if (query.trim().split(/\s+/).length > PERSONAL_LIMITS.queryTerms) return `Too many words. Use at most ${PERSONAL_LIMITS.queryTerms} words or phrases.`;
  return `This search could not be run: ${fallback}`;
}

export function searchStatusText(s: PersonalSearchStatus): string {
  switch (s.state) {
    case "indexing": return `Reading your notes… ${s.notes} so far. Results may be incomplete until this finishes.`;
    case "failed": return `Search stopped working${s.error ? `: ${s.error}` : ""}.`;
    case "partial": return `${s.notes} notes searchable. ${s.omitted} ${s.omitted === 1 ? "file was" : "files were"} skipped (too large or unreadable) and cannot be found here; ${s.omitted === 1 ? "it still opens" : "they still open"} in Obsidian.`;
    default: return `${s.notes} notes searchable.`;
  }
}

export class PersonalSearchView extends ItemView {
  private input: HTMLInputElement | null = null;
  private indexEl: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private resultsEl: HTMLElement | null = null;
  private hits: ResultRow[] = [];
  private timer = 0;
  private controller: AbortController | null = null;
  private turn = 0;
  private showHelpFor?: (query: string) => void;

  constructor(leaf: WorkspaceLeaf, private host: PersonalPluginHost, private viewType = PERSONAL_SEARCH_VIEW) { super(leaf); }

  private get librarian(): boolean { return this.viewType === LOCAL_LIBRARIAN_VIEW; }
  private get hint(): string { return this.librarian ? "Ask a question using words from your notes. Open a match to read the source." : HINT; }
  getViewType(): string { return this.viewType; }
  getDisplayText(): string { return this.librarian ? "Ask the Librarian" : "Search my notes"; }
  getIcon(): string { return this.librarian ? "book-open" : "search"; }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("kosmos-notes-search");
    root.createEl("p", { cls: "kosmos-notes-search-scope", text: this.librarian
      ? "Your Librarian looks for passages in this vault’s Markdown notes on this device. You choose separately what an assistant can read."
      : "Your own search over the whole vault. Assistants can read only the Folders shared with agents." });
    const input = root.createEl("input", { type: "search", cls: "kosmos-notes-search-input" });
    input.setAttribute("placeholder", this.librarian ? "What did I write about…?" : "Search my notes");
    input.setAttribute("aria-label", this.getDisplayText());
    const listId = this.viewType + "-results";
    input.setAttribute("aria-controls", listId);
    this.input = input;
    if (this.librarian) {
      const ask = root.createEl("button", { text: "Ask the Librarian" });
      this.registerDomEvent(ask, "click", () => { window.clearTimeout(this.timer); void this.run(); });
    }
    this.indexEl = root.createDiv({ cls: "kosmos-notes-search-index" });
    this.indexEl.setAttribute("role", "status");
    this.summaryEl = root.createEl("p", { cls: "kosmos-notes-search-status", text: this.hint });
    this.summaryEl.setAttribute("role", "status");
    this.summaryEl.setAttribute("aria-live", "polite");
    if (this.librarian) this.showHelpFor = renderLibrarianHelp(root);
    const list = root.createDiv({ cls: "kosmos-notes-search-results" });
    list.setAttribute("id", listId);
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Search results");
    this.resultsEl = list;

    this.registerDomEvent(input, "input", () => this.schedule());
    this.registerDomEvent(input, "keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter") { event.preventDefault(); window.clearTimeout(this.timer); void this.run(); }
      else if (event.key === "ArrowDown" && this.hits.length) { event.preventDefault(); this.focusHit(0); }
    });
    this.registerDomEvent(list, "click", (event: MouseEvent) => {
      const index = this.hitIndex(event.target);
      if (index !== null) { event.preventDefault(); this.openResult(index); }
    });
    this.registerDomEvent(list, "keydown", (event: KeyboardEvent) => this.listKey(event));
    this.register(this.host.onSearchStatus(() => this.renderIndexStatus()));
    this.register(() => { window.clearTimeout(this.timer); this.controller?.abort(); });
    this.renderIndexStatus();
    input.focus();
  }

  async onClose(): Promise<void> {
    window.clearTimeout(this.timer);
    this.controller?.abort();
    this.controller = null;
    this.turn++;
    this.showHelpFor = undefined;
    this.contentEl.empty();
    this.input = null; this.indexEl = null; this.summaryEl = null; this.resultsEl = null; this.hits = [];
  }

  private renderIndexStatus(): void {
    const el = this.indexEl;
    if (!el) return;
    el.empty();
    let s: PersonalSearchStatus;
    try { s = this.host.searchStatus(); } catch { return; }
    el.createEl("span", { text: searchStatusText(s) });
    el.toggleClass("kosmos-personal-warning", s.state === "failed" || s.state === "partial");
    if (s.state === "failed") {
      const retry = el.createEl("button", { text: "Retry", cls: "kosmos-notes-search-retry" });
      retry.addEventListener("click", () => { this.host.retrySearch(); this.renderIndexStatus(); });
    }
  }

  private schedule(): void {
    window.clearTimeout(this.timer);
    this.controller?.abort();
    this.controller = null;
    if (this.librarian) this.show(this.hint, []);
    else this.timer = window.setTimeout((): void => void this.run(), SEARCH_DEBOUNCE_MS);
  }

  private async run(): Promise<void> {
    const query = this.input?.value ?? "";
    this.controller?.abort();
    const turn = ++this.turn;
    this.showHelpFor?.(query);
    if (!query.trim()) { this.controller = null; this.show(this.hint, []); return; }
    const controller = new AbortController();
    this.controller = controller;
    this.summaryEl?.setText("Searching…");
    try {
      const r = this.librarian
        ? await this.host.askLocalLibrarian(query, controller.signal)
        : await this.host.search(query, { limit: SEARCH_LIMIT, signal: controller.signal });
      if (turn !== this.turn || controller.signal.aborted) return;
      const shown = r.hits.length;
      let summary = r.total === 0 ? "No notes found." : shown < r.total ? `Showing ${shown} of ${r.total} notes found.` : `${r.total} ${r.total === 1 ? "note" : "notes"} found.`;
      if (r.coverage.state === "indexing") summary += " Still reading your notes, so more may appear.";
      if (r.coverage.omitted > 0) summary += ` ${r.coverage.omitted} ${r.coverage.omitted === 1 ? "file was" : "files were"} not searched (too large or unreadable).`;
      if ("confidence" in r) {
        if (r.confidence === "weak") summary += " These matches share only some clues. Check the passages.";
        this.show(summary, r.hits.map((hit): ResultRow => ({
          title: hit.title, path: hit.path, excerpt: hit.passages[0]?.text ?? "", matchedIn: [],
        })));
      } else this.show(summary, r.hits);
    } catch (error: any) {
      if (turn !== this.turn || controller.signal.aborted || error?.name === "AbortError" || error?.code === "cancelled") return;
      const message = String(error?.message || error);
      if (error?.code === "invalid_query") this.show(this.librarian ? message : invalidQueryMessage(query, message), []);
      else if (error?.code === "search_unavailable") { this.show("Search is not available right now. Press Retry above, or try again in a moment.", []); this.renderIndexStatus(); }
      else if (error?.code === "policy_changed") this.show("Your settings changed while searching. Press Enter to search again.", []);
      else this.show(`Search failed: ${message}`, []);
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  private show(summary: string, hits: ResultRow[]): void {
    this.summaryEl?.setText(summary);
    this.hits = hits;
    const list = this.resultsEl;
    if (!list) return;
    list.empty();
    hits.forEach((hit, index) => {
      const row = list.createDiv({ cls: "kosmos-notes-search-row" });
      row.setAttribute("role", "option");
      row.setAttribute("id", `${this.viewType}-hit-${index}`);
      row.setAttribute("data-index", String(index));
      row.setAttribute("aria-selected", "false");
      row.tabIndex = -1;
      row.createDiv({ cls: "kosmos-notes-search-title", text: hit.title });
      row.createDiv({ cls: "kosmos-notes-search-path", text: hit.path });
      if (hit.matchedIn.length) row.createDiv({ cls: "kosmos-notes-search-fields", text: `Found in: ${hit.matchedIn.map((f) => FIELD_NAMES[f] ?? f).join(", ")}` });
      if (hit.excerpt) row.createDiv({ cls: "kosmos-notes-search-snippet", text: hit.excerpt });
    });
  }

  private rows(): HTMLElement[] { return Array.from((this.resultsEl?.children ?? []) as ArrayLike<HTMLElement>); }

  private hitIndex(target: EventTarget | null): number | null {
    const row = (target as HTMLElement | null)?.closest?.(".kosmos-notes-search-row") as HTMLElement | null;
    const raw = row?.getAttribute("data-index");
    const index = raw == null ? NaN : Number(raw);
    return Number.isInteger(index) && index >= 0 && index < this.hits.length ? index : null;
  }

  private focusHit(index: number): void {
    const rows = this.rows();
    rows.forEach((row, i) => { row.setAttribute("aria-selected", String(i === index)); row.tabIndex = i === index ? 0 : -1; });
    rows[index]?.focus();
  }

  private listKey(event: KeyboardEvent): void {
    const index = this.hitIndex(event.target);
    if (index === null) return;
    if (event.key === "ArrowDown") { event.preventDefault(); this.focusHit(Math.min(index + 1, this.hits.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); if (index === 0) this.input?.focus(); else this.focusHit(index - 1); }
    else if (event.key === "Home") { event.preventDefault(); this.focusHit(0); }
    else if (event.key === "End") { event.preventDefault(); this.focusHit(this.hits.length - 1); }
    else if (event.key === "Enter") { event.preventDefault(); this.openResult(index); }
    else if (event.key === "Escape") { event.preventDefault(); this.input?.focus(); }
  }

  private openResult(index: number): void {
    const hit = this.hits[index];
    if (!hit) return;
    const file = this.app.vault.getAbstractFileByPath(hit.path);
    if (file instanceof TFile) void this.app.workspace.getLeaf("tab").openFile(file);
  }
}
