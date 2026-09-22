/** Render only visible rows; the host must authorize every later DOM commit. */
export function mountVirtualList(container: HTMLElement, count: number, row: (index: number) => HTMLElement,
  publish: (apply: () => void) => Promise<boolean>) {
  const doc = container.ownerDocument, height = 112;
  const viewport = doc.createElement("div"), space = doc.createElement("div");
  viewport.className = "kosmos-notes-viewport"; viewport.setAttribute("role", "list");
  viewport.setAttribute("aria-label", "Search results");
  space.style.height = `${count * height}px`; space.style.position = "relative";
  viewport.append(space); container.append(viewport);
  let closed = false, revision = 0, active = 0, focusRequested = false;
  const rendered = new Map<number, HTMLElement>();
  function render(focus = false) {
    const start = Math.max(0, Math.floor(viewport.scrollTop / height) - 2);
    const end = Math.min(count, Math.ceil((viewport.scrollTop + (viewport.clientHeight || 448)) / height) + 2);
    const wanted = new Set(Array.from({ length: end - start }, (_, i) => start + i));
    for (const [i, element] of rendered) if (element.contains(doc.activeElement)) wanted.add(i);
    if (count) wanted.add(active);
    for (const [i, element] of rendered) if (!wanted.has(i)) { element.remove(); rendered.delete(i); }
    for (const i of [...wanted].sort((a, b) => a - b)) {
      if (!rendered.has(i)) {
        const element = row(i); element.setAttribute("role", "listitem");
        element.setAttribute("aria-posinset", String(i + 1)); element.setAttribute("aria-setsize", String(count));
        element.style.cssText = `position:absolute;top:${i * height}px;height:${height}px;width:100%;box-sizing:border-box`;
        element.addEventListener("focusin", () => {
          active = i;
          for (const [index, held] of rendered) held.querySelector("button")!.tabIndex = index === active ? 0 : -1;
        });
        const following = [...rendered.keys()].filter(index => index > i).sort((a, b) => a - b)[0];
        space.insertBefore(element, following === undefined ? null : rendered.get(following)!);
        rendered.set(i, element);
      }
    }
    for (const [i, element] of rendered) {
      const button = element.querySelector("button")!; button.tabIndex = i === active ? 0 : -1;
      if (focus && i === active) button.focus({ preventScroll: true });
    }
  }
  async function update(focus = false) {
    focusRequested ||= focus;
    const version = ++revision;
    try {
      const ok = await publish(() => { if (!closed && version === revision) { render(focusRequested && viewport.contains(doc.activeElement)); focusRequested = false; } });
      if (!ok && !closed && version === revision) { space.replaceChildren(); rendered.clear(); }
    } catch { if (!closed && version === revision) { space.replaceChildren(); rendered.clear(); } }
  }
  const scroll = () => { void update(); };
  const key = (event: KeyboardEvent) => {
    const next = event.key === "ArrowDown" ? Math.min(count - 1, active + 1)
      : event.key === "ArrowUp" ? Math.max(0, active - 1)
      : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : undefined;
    if (next === undefined || !count) return;
    event.preventDefault(); active = next;
    viewport.scrollTop = Math.max(0, active * height - viewport.clientHeight / 2);
    void update(true);
  };
  viewport.addEventListener("scroll", scroll); viewport.addEventListener("keydown", key);
  const resize = new ResizeObserver(scroll); resize.observe(viewport);
  render();
  return () => { closed = true; revision++; resize.disconnect(); viewport.removeEventListener("scroll", scroll); viewport.removeEventListener("keydown", key); };
}
