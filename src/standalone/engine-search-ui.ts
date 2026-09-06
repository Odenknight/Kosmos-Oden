import { EngineSearchClient } from "./engine-search";

/** Search is separate from the viewer connection and ordinary local search. */
export function mountEngineSearch(): { setApi(api: string | null): void } {
  const open = document.createElement("button"); open.textContent = "Search with Engine"; open.hidden = true;
  open.style.cssText = "position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:50;padding:8px";
  const dialog = document.createElement("dialog"); dialog.setAttribute("aria-label", "Engine retrieval");
  dialog.style.cssText = "max-width:640px;width:calc(100% - 48px);max-height:80vh;overflow:auto;background:#101b2a;color:#edf5ff;border:1px solid #789;border-radius:12px;padding:20px";
  dialog.innerHTML = `<h2>Search with Engine</h2><p>Search the notes permitted by your MCP identity. Your viewer credential is separate.</p><label>MCP credential <input type="password" autocomplete="off" aria-label="MCP credential"></label> <button data-connect>Connect search</button><form><label>Search notes <input name="query" maxlength="256" required></label> <button data-search disabled>Search</button></form><p role="status"></p><div data-results></div><button data-more disabled>Next results</button> <button data-close>Close</button>`;
  document.body.append(open, dialog);
  const credential = dialog.querySelector<HTMLInputElement>('input[type="password"]')!;
  const query = dialog.querySelector<HTMLInputElement>('input[name="query"]')!;
  const status = dialog.querySelector<HTMLElement>('[role="status"]')!;
  const results = dialog.querySelector<HTMLElement>("[data-results]")!;
  const search = dialog.querySelector<HTMLButtonElement>("[data-search]")!;
  const more = dialog.querySelector<HTMLButtonElement>("[data-more]")!;
  const connect = dialog.querySelector<HTMLButtonElement>("[data-connect]")!;
  let api: string | null = null, client: EngineSearchClient | null = null, epoch = 0, cursor: string | null = null, lastQuery = "", searching = false;
  function reset() { epoch++; const old = client; client = null; void old?.close(); credential.value = ""; results.replaceChildren(); status.textContent = ""; search.disabled = more.disabled = true; connect.disabled = false; cursor = null; }
  open.onclick = () => dialog.showModal();
  dialog.querySelector<HTMLButtonElement>("[data-close]")!.onclick = () => dialog.close();
  dialog.addEventListener("close", reset);
  connect.onclick = async () => {
    const token = credential.value; reset(); if (!api) return;
    const version = epoch; connect.disabled = true; status.textContent = "Connecting…";
    let next: EngineSearchClient | null = null;
    try { next = new EngineSearchClient(api, token); client = next; await next.connect(); if (version !== epoch) return; search.disabled = false; status.textContent = "Connected. Results use Engine verified citations."; }
    catch (error) { if (version !== epoch) return; void next?.close(); client = null; status.textContent = (error as Error).message; }
    finally { if (version === epoch) connect.disabled = false; }
  };
  async function run(nextPage: boolean) {
    if (!client || searching) return; const version = epoch; const active = client; searching = true;
    search.disabled = more.disabled = true; results.replaceChildren(); status.textContent = "Searching…";
    if (!nextPage) { cursor = null; lastQuery = query.value; }
    try {
      const page = await active.search(lastQuery, cursor); if (version !== epoch) return;
      for (const hit of page.items) {
        const section = document.createElement("section"), title = document.createElement("h3"), text = document.createElement("p"), citation = document.createElement("small");
        title.textContent = hit.canonical_path; text.textContent = hit.chunk.text;
        citation.textContent = `Verified lines ${hit.citation.start_line}–${hit.citation.end_line} · ${hit.citation.source_digest}`;
        section.append(title, text, citation); results.append(section);
      }
      cursor = page.page.next_cursor; more.disabled = !cursor;
      status.textContent = `${page.items.length} results on this page. Engine returns a bounded ranked window, not an exhaustive vault listing.`;
    } catch (error) { if (version === epoch) { cursor = null; status.textContent = (error as Error).message; } }
    finally { searching = false; if (version === epoch) search.disabled = false; }
  }
  dialog.querySelector("form")!.onsubmit = (event) => { event.preventDefault(); void run(false); };
  more.onclick = () => void run(true);
  return { setApi(value) { if (api === value) return; reset(); api = value; open.hidden = !api; if (!api && dialog.open) dialog.close(); } };
}
