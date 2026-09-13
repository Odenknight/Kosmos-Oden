import type { NotesWorkspaceHost, WorkspaceSearchSnapshot } from "./host";
import { renderWorkspaceMarkdown } from "./markdown";
import { WorkspaceSelection } from "./selection";

export function mountNotesWorkspace(root: HTMLElement, host: Pick<NotesWorkspaceHost, "search" | "read">,
  actions: { openSource(path: string): void; openKosmos(): void }) {
  const doc = root.ownerDocument, searches = new WorkspaceSelection(), notes = new WorkspaceSelection();
  let timer: ReturnType<typeof setTimeout> | undefined, closed = false;
  root.replaceChildren(); root.classList.add("kosmos-notes-workspace");
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const node = doc.createElement(tag); if (text !== undefined) node.textContent = text; return node;
  };
  const button = (label: string, action: () => void) => {
    const node = element("button", label); node.type = "button"; node.addEventListener("click", action); return node;
  };
  const toolbar = element("div"); toolbar.className = "kosmos-notes-toolbar";
  toolbar.append(element("strong", "Notes"), button("Kosmos", actions.openKosmos));
  const query = element("input"); query.type = "search"; query.placeholder = "Search readable notes";
  query.setAttribute("aria-label", "Search readable notes");
  const tag = element("input"); tag.placeholder = "Navigation tag (optional)"; tag.setAttribute("aria-label", "Navigation tag");
  const bodyLabel = element("label"), body = element("input"); body.type = "checkbox";
  bodyLabel.append(body, doc.createTextNode(" Search note bodies"));
  toolbar.append(query, tag, bodyLabel);
  const status = element("p"); status.setAttribute("role", "status");
  const layout = element("div"); layout.className = "kosmos-notes-layout";
  const results = element("div"); results.className = "kosmos-notes-results"; results.setAttribute("aria-label", "Readable notes");
  const preview = element("section"); preview.className = "kosmos-notes-preview"; preview.setAttribute("aria-label", "Selected note");
  layout.append(results, preview); root.append(toolbar, status, layout);

  async function show(path: string, page: { offset?: number; revision?: string } = {}) {
    notes.invalidate(); delete preview.dataset.path; preview.replaceChildren(element("p", "Loading note…"));
    const pending = notes.select(async () => {
      const snapshot = await host.read(path, { ...page, page_size: 100_000 });
      const fragment = doc.createDocumentFragment(), { note, projection } = snapshot.value;
      if (note.error) {
        fragment.append(element("p", note.code === "NOTE_REVISION_CHANGED" ? "Note changed. Reopen it from the results." : "Note unavailable in the current scope."));
      } else {
        fragment.append(element("h2", note.title), element("p", `${note.path} · ${note.sensitivity}`));
        fragment.append(button("Open source in Obsidian", () => {
          void snapshot.publish(() => actions.openSource(note.path), () => !closed && notes.version === version && preview.dataset.path === path)
            .then(opened => { if (!opened && !closed && notes.version === version) status.textContent = "Source changed or is unavailable. Search again."; })
            .catch(() => { if (!closed && notes.version === version) status.textContent = "Source changed or is unavailable. Search again."; });
        }));
        const content = element("article"); content.className = "markdown-rendered";
        // Only our HTML-disabled, resource-free parser produces this HTML.
        content.innerHTML = renderWorkspaceMarkdown(note.content);
        fragment.append(content);
        const continuation = note.continuation;
        fragment.append(element("p", `Characters ${continuation.offset}–${continuation.offset + note.content.length} of ${continuation.total_characters}${continuation.complete ? " · End of note" : " · More available"}`));
        if (continuation.next_offset !== null) fragment.append(button("Read next part", () => void show(path, { offset: continuation.next_offset, revision: continuation.revision })));
        if (continuation.offset > 0) fragment.append(button("Back to start", () => void show(path)));
        if (!projection) fragment.append(element("p", "No GKX provenance projection is available."));
        else for (const origin of ["authored", "derived", "proposed", "approved", "effective"] as const) {
          const details = element("details"); details.append(element("summary", origin[0].toUpperCase() + origin.slice(1)));
          const text = JSON.stringify(projection[origin], null, 2) ?? "Unavailable";
          details.append(element("pre", text.length <= 64_000 ? text : "This section exceeds the preview budget. Inspect the canonical source."));
          fragment.append(details);
        }
      }
      return { snapshot, fragment };
    }, async ({ snapshot, fragment }, current) => snapshot.publish(() => {
      preview.replaceChildren(fragment); preview.dataset.path = path;
    }, current), ({ fragment }) => fragment.replaceChildren());
    const version = notes.version;
    try {
      if (!await pending && !closed && version === notes.version) preview.replaceChildren(element("p", "Note or scope changed. Select it again."));
    } catch {
      if (!closed && version === notes.version) preview.replaceChildren(element("p", "Note read unavailable. Retry after the current read finishes."));
    }
  }

  async function refresh(next?: () => Promise<WorkspaceSearchSnapshot>) {
    if (closed) return;
    searches.invalidate(); notes.invalidate(); results.replaceChildren(); preview.replaceChildren(); delete preview.dataset.path;
    status.textContent = "Searching…";
    const pending = searches.select(() => next ? next() : host.search(query.value, { body: body.checked, tag: tag.value || undefined, limit: 100 }),
      async (snapshot, current) => snapshot.publish(value => {
        results.replaceChildren();
        for (const note of value.results) {
          const item = button(note.title, () => void show(note.path));
          item.title = note.path; results.append(item);
        }
        if (snapshot.next) results.append(button("Next results", () => void refresh(snapshot.next!)));
        if (snapshot.offset > 0) results.append(button("Back to first results", () => void refresh()));
        status.textContent = `${snapshot.offset ? `${snapshot.offset + 1}–${snapshot.offset + value.results.length}` : value.results.length} of ${value.total} readable matches${value.bodySearch ? " · Body search covers bounded prefixes" : ""}`;
      }, current), () => {});
    const version = searches.version;
    try {
      if (!await pending && !closed && version === searches.version) status.textContent = "Scope changed. Search again.";
    } catch {
      if (!closed && version === searches.version) status.textContent = "Search unavailable. Retry after the current read finishes.";
    }
  }
  function schedule() {
    searches.invalidate(); notes.invalidate(); results.replaceChildren(); preview.replaceChildren(); delete preview.dataset.path;
    status.textContent = "Searching…";
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; void refresh(); }, 180);
  }
  query.addEventListener("input", schedule); tag.addEventListener("input", schedule); body.addEventListener("change", schedule);
  toolbar.append(button("Refresh", () => void refresh()));
  void refresh();
  return {
    refresh: () => { if (!closed) schedule(); },
    close: () => { closed = true; if (timer) clearTimeout(timer); searches.close(); notes.close(); root.replaceChildren(); },
  };
}
