/**
 * Personal Notes (0.9.0) — in-memory full-text search.
 *
 * Deliberately simple: a linear scan over lowercased note text held in
 * memory. No inverted index, no embeddings, no files on disk. It is rebuilt
 * from the provider's committed source snapshot whenever that snapshot
 * changes, so it can never be stale against the graph it was built from and
 * there is nothing to sync, corrupt or migrate.
 *
 * Matching rule: every query term must appear in at least one field of the
 * note (title, alias, tag, path or body). Quoted text is one term.
 */
export interface TextDoc {
  path: string;
  title: string;
  aliases?: readonly string[];
  tags?: readonly string[];
  body: string;
}

export type TextField = "title" | "alias" | "tag" | "path" | "body";

export interface TextHit {
  path: string;
  title: string;
  score: number;
  matchedIn: TextField[];
  snippet: string;
}

export interface TextSearchResult {
  terms: string[];
  total: number;
  hits: TextHit[];
}

/** Longest body kept per note. Longer bodies are cut and counted as truncated. */
export const MAX_INDEXED_BODY_CHARS = 2_000_000;
export const MAX_QUERY_TERMS = 16;
export const MAX_TERM_CHARS = 200;
export const SNIPPET_BEFORE = 60;
export const SNIPPET_AFTER = 120;

const FIELD_WEIGHT: Record<TextField, number> = { title: 3, alias: 2, tag: 2, path: 1, body: 0.5 };
const FIELD_ORDER: TextField[] = ["title", "alias", "tag", "path", "body"];

/** Split a query into lowercased terms. "quoted text" stays one term. */
export function parseQuery(query: unknown): string[] {
  if (typeof query !== "string") return [];
  const terms: string[] = [];
  const seen = new Set<string>();
  const pattern = /"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(query)) !== null) {
    // A stray or unclosed quote is dropped instead of becoming part of a term.
    const raw = ((match[1] !== undefined ? match[1] : match[2]) ?? "").replace(/"/g, "");
    const term = raw.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase().slice(0, MAX_TERM_CHARS);
    if (!term || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
    if (terms.length >= MAX_QUERY_TERMS) break;
  }
  return terms;
}

interface Entry {
  path: string;
  title: string;
  lowerTitle: string;
  lowerAliases: string;
  lowerTags: string;
  lowerPath: string;
  /** Text that snippets are cut from. Same length as lowerBody by construction. */
  body: string;
  lowerBody: string;
}

function countOccurrences(haystack: string, needle: string, cap: number): number {
  let count = 0;
  let from = 0;
  while (count < cap) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    count++;
    from = at + needle.length;
  }
  return count;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export class FullTextIndex {
  private readonly entries: Entry[] = [];
  /** Notes held in the index. */
  readonly notes: number;
  /** Notes whose body was longer than MAX_INDEXED_BODY_CHARS and was cut. */
  readonly truncatedNotes: number;
  /** Total body characters held. */
  readonly characters: number;

  constructor(docs: readonly TextDoc[]) {
    let truncated = 0;
    let characters = 0;
    for (const doc of docs) {
      if (!doc || typeof doc.path !== "string" || !doc.path) continue;
      // NFC on both sides (index and query) so composed and decomposed
      // spellings of the same text match.
      let body = (typeof doc.body === "string" ? doc.body : "").normalize("NFC");
      if (body.length > MAX_INDEXED_BODY_CHARS) { body = body.slice(0, MAX_INDEXED_BODY_CHARS); truncated++; }
      let lowerBody = body.toLowerCase();
      // A few characters change length when lowercased. Snippet offsets are
      // taken from lowerBody, so keep both strings the same length.
      if (lowerBody.length !== body.length) body = lowerBody;
      characters += body.length;
      const title = (typeof doc.title === "string" && doc.title ? doc.title : doc.path).normalize("NFC");
      this.entries.push({
        path: doc.path,
        title,
        lowerTitle: title.toLowerCase(),
        lowerAliases: (doc.aliases ?? []).map(String).join("\n").normalize("NFC").toLowerCase(),
        lowerTags: (doc.tags ?? []).map(String).join("\n").normalize("NFC").toLowerCase(),
        lowerPath: doc.path.normalize("NFC").toLowerCase(),
        body,
        lowerBody,
      });
    }
    this.notes = this.entries.length;
    this.truncatedNotes = truncated;
    this.characters = characters;
  }

  /**
   * Search. `accept` filters by path BEFORE any text is examined, so a caller
   * can enforce a read rule without leaking matches from notes it may not see.
   */
  search(query: unknown, opts: { limit?: number; accept?: (path: string) => boolean } = {}): TextSearchResult {
    const terms = parseQuery(query);
    const limit = Math.max(1, Math.min(200, Math.floor(opts.limit ?? 20)));
    if (!terms.length) return { terms, total: 0, hits: [] };
    const wholeQuery = terms.join(" ");
    const scored: TextHit[] = [];
    for (const entry of this.entries) {
      if (opts.accept && !opts.accept(entry.path)) continue;
      let score = 0;
      let firstBodyAt = -1;
      let firstBodyLength = 0;
      const fields = new Set<TextField>();
      let every = true;
      for (const term of terms) {
        let best = 0;
        if (entry.lowerTitle.includes(term)) { best = Math.max(best, FIELD_WEIGHT.title); fields.add("title"); }
        if (entry.lowerAliases.includes(term)) { best = Math.max(best, FIELD_WEIGHT.alias); fields.add("alias"); }
        if (entry.lowerTags.includes(term)) { best = Math.max(best, FIELD_WEIGHT.tag); fields.add("tag"); }
        if (entry.lowerPath.includes(term)) { best = Math.max(best, FIELD_WEIGHT.path); fields.add("path"); }
        const at = entry.lowerBody.indexOf(term);
        if (at >= 0) {
          best = Math.max(best, FIELD_WEIGHT.body);
          fields.add("body");
          score += 0.1 * countOccurrences(entry.lowerBody, term, 5);
          if (firstBodyAt < 0 || at < firstBodyAt) { firstBodyAt = at; firstBodyLength = term.length; }
        }
        if (best === 0) { every = false; break; }
        score += best;
      }
      if (!every) continue;
      if (entry.lowerTitle === wholeQuery) score += 3;
      else if (entry.lowerTitle.startsWith(wholeQuery)) score += 2;
      else if (terms.length > 1 && entry.lowerTitle.includes(wholeQuery)) score += 1;
      scored.push({
        path: entry.path,
        title: entry.title,
        score: Math.round(score * 1000) / 1000,
        matchedIn: FIELD_ORDER.filter((field) => fields.has(field)),
        snippet: this.snippet(entry, firstBodyAt, firstBodyLength),
      });
    }
    scored.sort((a, b) => (b.score - a.score) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return { terms, total: scored.length, hits: scored.slice(0, limit) };
  }

  private snippet(entry: Entry, at: number, length: number): string {
    if (at < 0) {
      const head = collapse(entry.body.slice(0, SNIPPET_BEFORE + SNIPPET_AFTER));
      return entry.body.length > SNIPPET_BEFORE + SNIPPET_AFTER ? head + " …" : head;
    }
    const start = Math.max(0, at - SNIPPET_BEFORE);
    const end = Math.min(entry.body.length, at + length + SNIPPET_AFTER);
    const text = collapse(entry.body.slice(start, end));
    return (start > 0 ? "… " : "") + text + (end < entry.body.length ? " …" : "");
  }
}
