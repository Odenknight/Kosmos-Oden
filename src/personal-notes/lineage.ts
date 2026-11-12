/**
 * Personal Notes (0.9.0) — optional GKX lineage helper.
 *
 * Pure. Merges one wikilink into a note's `supersedes` property value. The
 * property format is the GKX 2.2 human-editable one: a flat list of whole-value
 * wikilinks. Parsing, resolution and the lineage graph stay in gkos-engine;
 * this only prepares the value an explicit user action writes.
 */

/** Wrap a link text as a wikilink unless it already is one. */
export function asWikilink(linkText: string): string {
  const text = String(linkText ?? "").trim();
  if (!text) return "";
  return /^\[\[.*\]\]$/.test(text) ? text : `[[${text}]]`;
}

/** Return the `supersedes` list with `link` added once. Existing entries are kept as written. */
export function mergeSupersedes(existing: unknown, link: string): string[] {
  const current = Array.isArray(existing)
    ? existing.filter((item) => typeof item === "string" && item.trim()).map((item) => String(item))
    : typeof existing === "string" && existing.trim() ? [existing] : [];
  const wanted = asWikilink(link);
  if (!wanted) return current;
  const key = (value: string) => asWikilink(value).toLowerCase();
  if (current.some((item) => key(item) === key(wanted))) return current;
  return [...current, wanted];
}
