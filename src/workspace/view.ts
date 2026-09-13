import type { NotesWorkspaceHost, WorkspaceSearchSnapshot } from "./host";
import { renderWorkspaceMarkdown } from "./markdown";
import { WorkspaceSelection } from "./selection";
import { localNoteMap } from "./local-map";

export function mountNotesWorkspace(root: HTMLElement, host: Pick<NotesWorkspaceHost, "search" | "read">,
  actions: { openSource(path: string): void; openKosmos(path?: string): void; stateChanged?(): void }) {
  const doc = root.ownerDocument, searches = new WorkspaceSelection(), notes = new WorkspaceSelection();
  let timer: ReturnType<typeof setTimeout> | undefined, closed = false;
  let selectedPath: string | undefined;
  root.replaceChildren(); root.classList.add("kosmos-notes-workspace");
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const node = doc.createElement(tag); if (text !== undefined) node.textContent = text; return node;
  };
  const button = (label: string, action: () => void) => {
    const node = element("button", label); node.type = "button"; node.addEventListener("click", action); return node;
  };
  const toolbar = element("div"); toolbar.className = "kosmos-notes-toolbar";
  toolbar.append(element("strong", "Notes"), button("Kosmos", () => actions.openKosmos()));
  const query = element("input"); query.type = "search"; query.placeholder = "Search readable notes";
  query.setAttribute("aria-label", "Search readable notes");
  const tag = element("input"); tag.placeholder = "Navigation tag (optional)"; tag.setAttribute("aria-label", "Navigation tag");
  const bodyLabel = element("label"), body = element("input"); body.type = "checkbox";
  bodyLabel.append(body, doc.createTextNode(" Search note bodies"));

  const status = element("p"); status.setAttribute("role", "status");
  const layout = element("div"); layout.className = "kosmos-notes-layout";
  const results = element("div"); results.className = "kosmos-notes-results"; results.setAttribute("aria-label", "Readable notes");
  const preview = element("section"); preview.className = "kosmos-notes-preview"; preview.setAttribute("aria-label", "Selected note");
  preview.tabIndex = -1;
  const navigation = element("section"); navigation.className = "kosmos-notes-navigation";
  navigation.setAttribute("aria-label", "Note navigation"); navigation.append(query, tag, bodyLabel, results);
  const inspector = element("aside"); inspector.className = "kosmos-notes-inspector";
  inspector.setAttribute("aria-label", "Note inspector"); inspector.tabIndex = -1;
  let narrow = root.clientWidth <= 600, drawer: "navigation" | "inspector" | undefined;
  let inspectorOpen = true;
  const navigationButton = button("Browse notes", () => {
    drawer = drawer === "navigation" ? undefined : "navigation"; syncPanels();
    if (drawer) query.focus(); else preview.focus();
  });
  const inspectorButton = button("Inspector", () => {
    if (narrow) drawer = drawer === "inspector" ? undefined : "inspector";
    else inspectorOpen = !inspectorOpen;
    syncPanels(); if (!inspector.hidden) inspector.focus(); else preview.focus();
  });
  toolbar.append(navigationButton, inspectorButton);
  function syncPanels() {
    root.dataset.narrow = String(narrow);
    navigationButton.hidden = !narrow;
    navigation.hidden = narrow && drawer !== "navigation";
    preview.hidden = narrow && !!drawer;
    inspector.hidden = narrow ? drawer !== "inspector" : !inspectorOpen;
    root.dataset.inspector = String(!inspector.hidden);
    navigationButton.setAttribute("aria-expanded", String(!navigation.hidden));
    inspectorButton.setAttribute("aria-expanded", String(!inspector.hidden));
  }
  const escapeDrawer = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !narrow || !drawer) return;
    const trigger = drawer === "navigation" ? navigationButton : inspectorButton;
    drawer = undefined; syncPanels(); trigger.focus(); event.preventDefault(); event.stopPropagation();
  };
  root.addEventListener("keydown", escapeDrawer);
  const resize = new ResizeObserver(() => {
    const next = root.clientWidth <= 600;
    if (next === narrow) return;
    narrow = next; drawer = undefined; syncPanels();
    if (doc.activeElement instanceof HTMLElement && doc.activeElement.closest("[hidden]")) navigationButton.hidden ? preview.focus() : navigationButton.focus();
  });
  layout.append(navigation, preview, inspector); root.append(toolbar, status, layout);
  syncPanels(); resize.observe(root);

  async function show(path: string, page: { offset?: number; revision?: string } = {}) {
    if (closed) return;
    selectedPath = path;
    if (narrow) { drawer = undefined; syncPanels(); }
    inspector.replaceChildren();
    notes.invalidate(); delete preview.dataset.path; preview.replaceChildren(element("p", "Loading note…"));
    const pending = notes.select(async () => {
      const snapshot = await host.read(path, { ...page, page_size: 100_000 });
      const fragment = doc.createDocumentFragment(), inspection = doc.createDocumentFragment(), { note, projection } = snapshot.value;
      const related = "related" in snapshot.value ? snapshot.value.related : null;
      if (note.error) {
        fragment.append(element("p", note.code === "NOTE_REVISION_CHANGED" ? "Note changed. Reopen it from the results." : "Note unavailable in the current scope."));
      } else {
        fragment.append(element("h2", note.title), element("p", `${note.path} · ${note.sensitivity}`));
        const recordedText = (value: unknown) => typeof value === "string" && value.trim()
          ? value.length <= 4096 ? value : "Exceeds preview budget; inspect source" : "Not recorded";
        const governance = element("section"); governance.setAttribute("aria-label", "Governance summary");
        governance.append(element("h3", "Governance"),
          element("p", `Effective epistemic state: ${recordedText(projection?.effective?.epistemicState)}`),
          element("p", `Effective sensitivity: ${recordedText(projection?.effective?.sensitivity)}`),
          element("p", "Effective values come from the Engine projection. They do not establish permission to act."));
        fragment.append(governance);
        if (projection) {
          const source = element("details"); source.append(element("summary", "Projection source"));
          const fields = element("dl");
          for (const [label, value] of [["Source path", projection.source?.path], ["Source version", projection.source?.version],
            ["Content hash", projection.source?.contentHash], ["Projection profile", projection.profile], ["Projection mode", projection.mode]] as const) {
            fields.append(element("dt", label), element("dd", recordedText(value)));
          }
          const claim = projection.conformanceClaim;
          fields.append(element("dt", "Engine projection capability"), element("dd", typeof claim === "boolean" ? String(claim) : recordedText(claim)));
          source.append(fields); inspection.append(source);
        }
        const tags: string[] = note.tags ?? [];
        fragment.append(element("h3", "Navigation tags"), element("p", tags.length ? tags.slice(0, 100).join(", ") : "None recorded"));
        if (tags.length > 100) fragment.append(element("p", `Showing 100 of ${tags.length} navigation tags.`));
        fragment.append(button("Open source in Obsidian", () => {
          void snapshot.publish(() => actions.openSource(note.path), () => !closed && notes.version === version && preview.dataset.path === path)
            .then(opened => { if (!opened && !closed && notes.version === version) status.textContent = "Source changed or is unavailable. Search again."; })
            .catch(() => { if (!closed && notes.version === version) status.textContent = "Source changed or is unavailable. Search again."; });
        }));
        fragment.append(button("Locate in Kosmos", () => {
          void snapshot.publish(() => actions.openKosmos(note.path), () => !closed && notes.version === version && preview.dataset.path === path)
            .then(opened => { if (!opened && !closed && notes.version === version) status.textContent = "Note or scope changed. Select it again."; })
            .catch(() => { if (!closed && notes.version === version) status.textContent = "Note location unavailable. Retry."; });
        }));
        const content = element("article"); content.className = "markdown-rendered";
        // Only our HTML-disabled, resource-free parser produces this HTML.
        content.innerHTML = renderWorkspaceMarkdown(note.content);
        fragment.append(content);
        const continuation = note.continuation;
        fragment.append(element("p", `Characters ${continuation.offset}–${continuation.offset + note.content.length} of ${continuation.total_characters}${continuation.complete ? " · End of note" : " · More available"}`));
        if (continuation.next_offset !== null) fragment.append(button("Read next part", () => void show(path, { offset: continuation.next_offset, revision: continuation.revision })));
        if (continuation.offset > 0) fragment.append(button("Back to start", () => void show(path)));
        if (related) inspection.append(localNoteMap(doc, note, related, path => void show(path)));
        if (related) for (const [key, label] of [["outgoing", "Outgoing links"], ["backlinks", "Backlinks"], ["semantic", "Semantic links"]] as const) {
          const links: Array<{ title: string; path: string }> = related[key];
          const section = element("section"); section.append(element("h3", label));
          if (!links.length) section.append(element("p", "No readable links"));
          for (const link of links.slice(0, 100)) {
            const item = button(link.title, () => void show(link.path)); item.title = link.path; section.append(item);
          }
          if (links.length > 100) section.append(element("p", `Showing 100 of ${links.length} readable links. Narrow the search to inspect further notes.`));
          inspection.append(section);
        }
        if (!projection) inspection.append(element("p", "No GKX provenance projection is available."));
        else for (const origin of ["authored", "derived", "proposed", "approved", "effective"] as const) {
          const details = element("details"); details.append(element("summary", origin[0].toUpperCase() + origin.slice(1)));
          const text = JSON.stringify(projection[origin], null, 2) ?? "Unavailable";
          details.append(element("pre", text.length <= 64_000 ? text : "This section exceeds the preview budget. Inspect the canonical source."));
          inspection.append(details);
        }
        const assessment = "assessment" in snapshot.value ? snapshot.value.assessment : null;
        inspection.append(element("h3", "Documentation assessment"));
        if (!assessment || assessment.interpretation !== "documentation-and-support-quality-not-truth") {
          inspection.append(element("p", "Assessment not available with a recognized interpretation."));
        } else {
          const score = assessment.scores?.overall;
          inspection.append(element("p", typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1
            ? `Documentation score: ${Math.round(score * 10_000) / 100}%` : "Documentation score: Not recorded"));
          inspection.append(element("p", "Measures documentation and supporting evidence. It does not establish truth or approval."));
          inspection.append(element("p", `Assessment policy: ${assessment.policy?.id ?? "Not recorded"}`));
        }
        const diagnostics = "diagnostics" in snapshot.value ? snapshot.value.diagnostics : null;
        inspection.append(element("h3", "Diagnostics"));
        if (!diagnostics) inspection.append(element("p", "Diagnostics unavailable"));
        else {
          const items: Array<{ severity: string; code: string; message: string }> = diagnostics.diagnostics;
          inspection.append(element("p", items.length ? `${items.length} diagnostics reported` : "No diagnostics reported"));
          const list = element("ul");
          for (const item of items.slice(0, 100)) list.append(element("li", `${item.severity}: ${item.code} — ${item.message}`));
          inspection.append(list);
          if (items.length > 100) inspection.append(element("p", "Showing the first 100 diagnostics."));
        }
      }
      return { snapshot, fragment, inspection };
    }, async ({ snapshot, fragment, inspection }, current) => snapshot.publish(() => {
      preview.replaceChildren(fragment); preview.dataset.path = path; inspector.replaceChildren(inspection);
      if (narrow && !drawer) preview.focus();
      if (snapshot.value.note.error) selectedPath = undefined;
      actions.stateChanged?.();
    }, current), ({ fragment, inspection }) => { fragment.replaceChildren(); inspection.replaceChildren(); });
    const version = notes.version;
    try {
      if (!await pending && !closed && version === notes.version) preview.replaceChildren(element("p", "Note or scope changed. Select it again."));
    } catch {
      if (!closed && version === notes.version) preview.replaceChildren(element("p", "Note read unavailable. Retry after the current read finishes."));
    }
  }

  async function refresh(next?: () => Promise<WorkspaceSearchSnapshot>, restoreSelection = false) {
    if (closed) return;
    if (timer) { clearTimeout(timer); timer = undefined; }
    const restorePath = restoreSelection ? selectedPath : undefined;
    if (!restoreSelection) selectedPath = undefined;
    actions.stateChanged?.();
    searches.invalidate(); notes.invalidate(); results.replaceChildren(); preview.replaceChildren(); inspector.replaceChildren(); delete preview.dataset.path;
    const noteVersion = notes.version;
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
      const published = await pending;
      if (!published && !closed && version === searches.version) status.textContent = "Scope changed. Search again.";
      if (published && restorePath && !closed && version === searches.version && notes.version === noteVersion) await show(restorePath);
    } catch {
      if (!closed && version === searches.version) status.textContent = "Search unavailable. Retry after the current read finishes.";
    }
  }
  function schedule(restoreSelection = false) {
    if (!restoreSelection) selectedPath = undefined;
    searches.invalidate(); notes.invalidate(); results.replaceChildren(); preview.replaceChildren(); inspector.replaceChildren(); delete preview.dataset.path;
    status.textContent = "Searching…";
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; void refresh(undefined, restoreSelection); }, 180);
  }
  query.addEventListener("input", () => schedule()); tag.addEventListener("input", () => schedule()); body.addEventListener("change", () => schedule());
  toolbar.append(button("Refresh", () => void refresh(undefined, true)));
  void refresh();
  return {
    getState: () => ({ query: query.value, tag: tag.value, body: body.checked, selectedPath }),
    restore: (state: unknown) => {
      if (closed || !state || typeof state !== "object" || Array.isArray(state)) return;
      const value = state as Record<string, unknown>;
      query.value = typeof value.query === "string" ? value.query.slice(0, 4096) : "";
      tag.value = typeof value.tag === "string" ? value.tag.slice(0, 4096) : "";
      body.checked = value.body === true;
      selectedPath = typeof value.selectedPath === "string" && value.selectedPath.length <= 4096 ? value.selectedPath : undefined;
      schedule(true);
    },
    refresh: () => { if (!closed) schedule(true); },
    rename: (oldPath: string, newPath: string) => {
      if (selectedPath === oldPath || selectedPath?.startsWith(oldPath + "/")) selectedPath = newPath + selectedPath.slice(oldPath.length);
      if (!closed) schedule(true);
    },
    remove: (path: string) => {
      if (selectedPath === path || selectedPath?.startsWith(path + "/")) selectedPath = undefined;
      if (!closed) schedule(true);
    },
    close: () => { closed = true; resize.disconnect(); root.removeEventListener("keydown", escapeDrawer); if (timer) clearTimeout(timer); searches.close(); notes.close(); root.replaceChildren(); },
  };
}
