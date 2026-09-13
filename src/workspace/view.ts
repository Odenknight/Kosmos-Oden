import { isValidGkxAuthoredUid } from "gkos-engine";
import type { NotesWorkspaceHost, WorkspaceSearchSnapshot } from "./host";
import { renderWorkspaceMarkdown } from "./markdown";
import { WorkspaceSelection } from "./selection";
import { localNoteMap } from "./local-map";

let inspectorSequence = 0;

export function mountNotesWorkspace(root: HTMLElement, host: Pick<NotesWorkspaceHost, "search" | "read">,
  actions: { openSource(path: string): void; openKosmos(path?: string, uid?: string): void; stateChanged?(): void }) {
  const doc = root.ownerDocument, searches = new WorkspaceSelection(), notes = new WorkspaceSelection();
  let timer: ReturnType<typeof setTimeout> | undefined, closed = false;
  let selectedPath: string | undefined, selectedUid: string | undefined;
  let locateSelected: (() => void) | undefined;
  root.replaceChildren(); root.classList.add("kosmos-notes-workspace");
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const node = doc.createElement(tag); if (text !== undefined) node.textContent = text; return node;
  };
  const button = (label: string, action: () => void) => {
    const node = element("button", label); node.type = "button"; node.addEventListener("click", action); return node;
  };
  const toolbar = element("div"); toolbar.className = "kosmos-notes-toolbar";
  toolbar.append(element("strong", "Notes"), button("Kosmos", () => {
    if (locateSelected) locateSelected();
    else if (selectedPath) status.textContent = "Wait for the selected note before switching views.";
    else actions.openKosmos();
  }));
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
  let inspectorOpen = true, inspectorTab = 0;
  const inspectorId = `kosmos-inspector-${++inspectorSequence}`;
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

  async function show(path: string, page: { offset?: number; revision?: string; uid?: string } = {}) {
    if (closed) return;
    selectedPath = path; selectedUid = page.uid;
    if (narrow) { drawer = undefined; syncPanels(); }
    inspector.replaceChildren();
    notes.invalidate(); locateSelected = undefined; delete preview.dataset.path; preview.replaceChildren(element("p", "Loading note…"));
    const pending = notes.select(async () => {
      const snapshot = await host.read(path, { ...page, page_size: 100_000 });
      const fragment = doc.createDocumentFragment(), inspection = doc.createDocumentFragment(), { note, projection } = snapshot.value;
      if (!note.error) path = note.path;
      let locate: (() => void) | undefined;
      const related = "related" in snapshot.value ? snapshot.value.related : null;
      const panels = [element("section"), element("section"), element("section")];
      const tabs = element("div"); tabs.className = "kosmos-notes-tabs";
      tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Inspector sections");
      const labels = ["Metadata and provenance", "Links and lineage", "Diagnostics and assessment"];
      const buttons = labels.map((label, index) => {
        const tab = button(label, () => activate(index));
        tab.id = `${inspectorId}-tab-${index}`; tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", `${inspectorId}-panel-${index}`);
        const panel = panels[index]; panel.id = `${inspectorId}-panel-${index}`;
        panel.setAttribute("role", "tabpanel"); panel.setAttribute("aria-labelledby", tab.id); panel.tabIndex = 0;
        tab.addEventListener("keydown", event => {
          const next = event.key === "ArrowRight" ? (index + 1) % labels.length
            : event.key === "ArrowLeft" ? (index + labels.length - 1) % labels.length
            : event.key === "Home" ? 0 : event.key === "End" ? labels.length - 1 : undefined;
          if (next === undefined) return;
          event.preventDefault(); event.stopPropagation(); activate(next); buttons[next].focus();
        });
        return tab;
      });
      function activate(index: number) {
        inspectorTab = index;
        buttons.forEach((tab, i) => {
          tab.setAttribute("aria-selected", String(i === index)); tab.tabIndex = i === index ? 0 : -1;
          panels[i].hidden = i !== index;
        });
      }
      activate(inspectorTab); tabs.append(...buttons);
      const [metadata, linksPanel, diagnosticsPanel] = panels;
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
          source.append(fields); metadata.append(source);
        }
        const tags: string[] = note.tags ?? [];
        fragment.append(element("h3", "Navigation tags"), element("p", tags.length ? tags.slice(0, 100).join(", ") : "None recorded"));
        if (tags.length > 100) fragment.append(element("p", `Showing 100 of ${tags.length} navigation tags.`));
        fragment.append(button("Open source in Obsidian", () => {
          void snapshot.publish(() => actions.openSource(note.path), () => !closed && notes.version === version && preview.dataset.path === path)
            .then(opened => { if (!opened && !closed && notes.version === version) status.textContent = "Source changed or is unavailable. Search again."; })
            .catch(() => { if (!closed && notes.version === version) status.textContent = "Source changed or is unavailable. Search again."; });
        }));
        locate = () => {
          void snapshot.publish(() => actions.openKosmos(note.path, isValidGkxAuthoredUid(note.uid) ? note.uid : undefined), () => !closed && notes.version === version && preview.dataset.path === path)
            .then(opened => { if (!opened && !closed && notes.version === version) status.textContent = "Note or scope changed. Select it again."; })
            .catch(() => { if (!closed && notes.version === version) status.textContent = "Note location unavailable. Retry."; });
        };
        fragment.append(button("Locate in Kosmos", locate));
        const content = element("article"); content.className = "markdown-rendered";
        // Only our HTML-disabled, resource-free parser produces this HTML.
        content.innerHTML = renderWorkspaceMarkdown(note.content);
        fragment.append(content);
        const continuation = note.continuation;
        fragment.append(element("p", `Characters ${continuation.offset}–${continuation.offset + note.content.length} of ${continuation.total_characters}${continuation.complete ? " · End of note" : " · More available"}`));
        if (continuation.next_offset !== null) fragment.append(button("Read next part", () => void show(path, { offset: continuation.next_offset, revision: continuation.revision })));
        if (continuation.offset > 0) fragment.append(button("Back to start", () => void show(path)));
        if (related) linksPanel.append(localNoteMap(doc, note, related, path => void show(path)));
        if (related) for (const [key, label] of [["outgoing", "Outgoing links"], ["backlinks", "Backlinks"], ["semantic", "Semantic links"]] as const) {
          const links: Array<{ title: string; path: string }> = related[key];
          const section = element("section"); section.append(element("h3", label));
          if (!links.length) section.append(element("p", "No readable links"));
          for (const link of links.slice(0, 100)) {
            const item = button(link.title, () => void show(link.path)); item.title = link.path; section.append(item);
          }
          if (links.length > 100) section.append(element("p", `Showing 100 of ${links.length} readable links. Narrow the search to inspect further notes.`));
          linksPanel.append(section);
        }
        linksPanel.append(element("h3", "Readable lineage"));
        const lineage = "lineage" in snapshot.value ? snapshot.value.lineage : null;
        if (!lineage) linksPanel.append(element("p", "Lineage unavailable"));
        else {
          linksPanel.append(element("p", "Resolved lineage in the current readable scope. This is not an approval record or historical audit log."));
          const chain: Array<{ title: string; path: string; current: boolean }> = lineage.chain;
          const list = element("ul");
          for (const member of chain.slice(0, 100)) {
            const item = element("li");
            const target = button(member.title, () => void show(member.path)); target.title = member.path;
            item.append(target);
            if (member.current) item.append(doc.createTextNode(" · Selected note"));
            list.append(item);
          }
          linksPanel.append(list);
          if (!chain.length) linksPanel.append(element("p", "No readable lineage members"));
          if (chain.length > 100) linksPanel.append(element("p", `Showing 100 of ${chain.length} readable lineage members.`));
          const declarations = element("section"); declarations.setAttribute("aria-label", "Lineage declarations");
          declarations.append(element("h3", "Declaration resolution"));
          const inspection = lineage.inspection;
          if (inspection?.available !== true || !Array.isArray(inspection.declarations)) {
            declarations.append(element("p", "Declaration resolution unavailable"));
          } else {
            declarations.append(element("p", "Resolution is limited to the current readable scope. Unresolved does not mean absent globally. A declaration is not approval."));
            const statuses: Record<string, string> = { resolved: "Resolved", unresolved: "Unresolved in readable scope", ambiguous: "Ambiguous in readable scope", self: "Self-reference" };
            const list = element("ul");
            for (const item of inspection.declarations.slice(0, 100)) {
              const index = Number.isSafeInteger(item.declarationIndex) && item.declarationIndex >= 0 ? String(item.declarationIndex + 1) : "Not recorded";
              const line = Number.isSafeInteger(item.sourceLine) && item.sourceLine > 0 ? ` · Source line ${item.sourceLine}` : "";
              list.append(element("li", `${recordedText(item.field)} · ${recordedText(item.origin)} · Declaration ${index}${line}: ${Object.hasOwn(statuses, item.status) ? statuses[item.status] : "Unknown resolution status"}`));
            }
            declarations.append(list);
            if (!inspection.declarations.length) declarations.append(element("p", "No canonical lineage declarations recorded"));
            if (inspection.declarations.length > 100) declarations.append(element("p", `Showing 100 of ${inspection.declarations.length} declarations. Inspect the canonical source for the remainder.`));
          }
          linksPanel.append(declarations);
        }
        if (!projection) metadata.append(element("p", "No GKX provenance projection is available."));
        else for (const origin of ["authored", "derived", "proposed", "approved", "effective"] as const) {
          const details = element("details"); details.append(element("summary", origin[0].toUpperCase() + origin.slice(1)));
          const evidence = projection[origin]?.evidence;
          const declarations = element("section"); declarations.setAttribute("aria-label", `${origin} evidence declarations`);
          declarations.append(element("h3", "Evidence declarations"), element("p", "Recorded declarations, not verified findings. References are not resolved here; strength and relevance do not establish truth or approval."));
          for (const [kind, label] of [["supports", "Supporting"], ["contradicts", "Contradicting"]] as const) {
            declarations.append(element("h4", label));
            const items: unknown = evidence?.[kind];
            if (!Array.isArray(items)) {
              declarations.append(element("p", items === undefined ? "Not recorded" : "Invalid declaration list; inspect source"));
              continue;
            }
            if (!items.length) declarations.append(element("p", "No declarations recorded"));
            const list = element("ol");
            for (const item of items.slice(0, 50)) {
              const row = element("li"), fields = element("dl");
              if (!item || typeof item !== "object" || Array.isArray(item)) {
                row.textContent = "Unstructured declaration; inspect the origin record below";
              } else {
                for (const [label, value] of [["Target", item.target], ["Source UID", item.source_uid], ["Independence group", item.independence_group]] as const)
                  fields.append(element("dt", label), element("dd", recordedText(value)));
                for (const key of ["strength", "relevance"] as const) {
                  const value = item[key];
                  const text = value === undefined || value === null ? "Not recorded"
                    : typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? String(value) : "Invalid value; inspect source";
                  fields.append(element("dt", key[0].toUpperCase() + key.slice(1)), element("dd", text));
                }
                row.append(fields);
              }
              list.append(row);
            }
            declarations.append(list);
            if (items.length > 50) declarations.append(element("p", `Showing 50 of ${items.length} declarations. Inspect the canonical source for the remainder.`));
          }
          details.append(declarations, element("h3", "Origin record"));
          const text = JSON.stringify(projection[origin], null, 2) ?? "Unavailable";
          details.append(element("pre", text.length <= 64_000 ? text : "This section exceeds the preview budget. Inspect the canonical source."));
          metadata.append(details);
        }
        const assessment = "assessment" in snapshot.value ? snapshot.value.assessment : null;
        diagnosticsPanel.append(element("h3", "Documentation assessment"));
        if (!assessment || assessment.interpretation !== "documentation-and-support-quality-not-truth") {
          diagnosticsPanel.append(element("p", "Assessment not available with a recognized interpretation."));
        } else {
          const score = assessment.scores?.overall;
          diagnosticsPanel.append(element("p", typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1
            ? `Documentation score: ${Math.round(score * 10_000) / 100}%` : "Documentation score: Not recorded"));
          diagnosticsPanel.append(element("p", "Measures documentation and supporting evidence. It does not establish truth or approval."));
          diagnosticsPanel.append(element("p", `Assessment policy: ${assessment.policy?.id ?? "Not recorded"}`));
        }
        const diagnostics = "diagnostics" in snapshot.value ? snapshot.value.diagnostics : null;
        diagnosticsPanel.append(element("h3", "Diagnostics"));
        if (!diagnostics) diagnosticsPanel.append(element("p", "Diagnostics unavailable"));
        else {
          const items: Array<{ severity: string; code: string; message: string }> = diagnostics.diagnostics;
          diagnosticsPanel.append(element("p", items.length ? `${items.length} diagnostics reported` : "No diagnostics reported"));
          const list = element("ul");
          for (const item of items.slice(0, 100)) list.append(element("li", `${item.severity}: ${item.code} — ${item.message}`));
          diagnosticsPanel.append(list);
          if (items.length > 100) diagnosticsPanel.append(element("p", "Showing the first 100 diagnostics."));
        }
        inspection.append(tabs, ...panels);
      }
      return { snapshot, fragment, inspection, locate };
    }, async ({ snapshot, fragment, inspection, locate }, current) => snapshot.publish(() => {
      locateSelected = locate;
      preview.replaceChildren(fragment); preview.dataset.path = path; inspector.replaceChildren(inspection);
      if (narrow && !drawer) preview.focus();
      if (snapshot.value.note.error) { selectedPath = undefined; selectedUid = undefined; }
      else { selectedPath = path; selectedUid = isValidGkxAuthoredUid(snapshot.value.note.uid) ? snapshot.value.note.uid : undefined; }
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
    const restoreUid = restoreSelection ? selectedUid : undefined;
    if (!restoreSelection) { selectedPath = undefined; selectedUid = undefined; }
    actions.stateChanged?.();
    searches.invalidate(); notes.invalidate(); locateSelected = undefined; results.replaceChildren(); preview.replaceChildren(); inspector.replaceChildren(); delete preview.dataset.path;
    const noteVersion = notes.version;
    status.textContent = "Searching…";
    const pending = searches.select(() => next ? next() : host.search(query.value, { body: body.checked, tag: tag.value || undefined, limit: 100 }),
      async (snapshot, current) => snapshot.publish(value => {
        results.replaceChildren();
        for (const note of value.results) {
          const uid = isValidGkxAuthoredUid(note.uid) ? note.uid : undefined;
          const item = button(note.title, () => void show(note.path, uid ? { uid } : {}));
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
      if (published && restorePath && !closed && version === searches.version && notes.version === noteVersion) await show(restorePath, restoreUid ? { uid: restoreUid } : {});
    } catch {
      if (!closed && version === searches.version) status.textContent = "Search unavailable. Retry after the current read finishes.";
    }
  }
  function schedule(restoreSelection = false) {
    if (!restoreSelection) { selectedPath = undefined; selectedUid = undefined; }
    searches.invalidate(); notes.invalidate(); locateSelected = undefined; results.replaceChildren(); preview.replaceChildren(); inspector.replaceChildren(); delete preview.dataset.path;
    status.textContent = "Searching…";
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; void refresh(undefined, restoreSelection); }, 180);
  }
  query.addEventListener("input", () => schedule()); tag.addEventListener("input", () => schedule()); body.addEventListener("change", () => schedule());
  toolbar.append(button("Refresh", () => void refresh(undefined, true)));
  void refresh();
  return {
    select: (path: string | null, uid?: string) => {
      if (closed) return;
      if (path !== null) return show(path, uid ? { uid } : {});
      selectedPath = undefined; selectedUid = undefined; notes.invalidate(); locateSelected = undefined;
      preview.replaceChildren(); inspector.replaceChildren(); delete preview.dataset.path;
      actions.stateChanged?.();
    },
    getState: () => ({ query: query.value, tag: tag.value, body: body.checked, selectedPath, ...(selectedUid ? { selectedUid } : {}) }),
    restore: (state: unknown) => {
      if (closed || !state || typeof state !== "object" || Array.isArray(state)) return;
      const value = state as Record<string, unknown>;
      query.value = typeof value.query === "string" ? value.query.slice(0, 4096) : "";
      tag.value = typeof value.tag === "string" ? value.tag.slice(0, 4096) : "";
      body.checked = value.body === true;
      selectedPath = typeof value.selectedPath === "string" && value.selectedPath.length <= 4096 ? value.selectedPath : undefined;
      selectedUid = typeof value.selectedUid === "string" && isValidGkxAuthoredUid(value.selectedUid) ? value.selectedUid : undefined;
      schedule(true);
    },
    refresh: () => { if (!closed) schedule(true); },
    rename: (oldPath: string, newPath: string) => {
      if (selectedPath === oldPath || selectedPath?.startsWith(oldPath + "/")) selectedPath = newPath + selectedPath.slice(oldPath.length);
      if (!closed) schedule(true);
    },
    remove: (path: string) => {
      if (selectedPath === path || selectedPath?.startsWith(path + "/")) { selectedPath = undefined; selectedUid = undefined; }
      if (!closed) schedule(true);
    },
    close: () => { closed = true; resize.disconnect(); root.removeEventListener("keydown", escapeDrawer); if (timer) clearTimeout(timer); searches.close(); notes.close(); root.replaceChildren(); },
  };
}
