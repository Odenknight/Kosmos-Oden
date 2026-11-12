/**
 * Personal Notes (0.9.0) — memory-only full-text matching.
 *
 * Lexical scan over text already in memory: no inverted index, no embeddings,
 * nothing on disk. The search worker (search-worker.ts) runs this over the
 * corpus in bounded batches; the same code is used synchronously by tests and
 * the legacy `FullTextIndex` adapter below.
 *
 * Matching: every query term must appear in at least one field (title 3,
 * alias 2, tag 2, path 1, body 0.5). Quoted text is one contiguous phrase.
 * Searchable copies are NFC + lowercase; raw text is never changed. A compact
 * offset map (OffsetMap) translates positions in the searchable copy back to
 * the raw text so excerpts show the original spelling.
 */
import { PERSONAL_LIMITS, PersonalError, type SearchField, type SearchHit } from "./types";

const FIELD_WEIGHT = { title: 3, alias: 2, tag: 2, path: 1, body: 0.5 } as const;
const FIELD_ORDER: SearchField[] = ["title", "alias", "tag", "path", "body"];
const FIELD_BIT: Record<SearchField, number> = { title: 1, alias: 2, tag: 4, path: 8, body: 16 };

/* --------------------------------------------------------------- normalization */

const NON_ASCII = /[^\x00-\x7f]/;
const NON_ASCII_RUNS = /[^\x00-\x7f]+/g;
/** One code point plus following combining marks / conjoining Hangul vowels and trailing consonants. */
const CLUSTER = /[\s\S][\p{M}ᅠ-ᇿ]*/gu;

/**
 * Compact offset map: only pieces whose length changed under NFC + lowercase
 * are recorded; every other position maps one-to-one.
 *
 * `bytes` is a stream of entries, each four unsigned LEB128 varints
 * (gap, normLen, rawLen, count): `count` consecutive pieces of the same shape,
 * each preceded by `gap` unchanged units. A run of identical pieces (a page
 * of "İ") is one entry; an irregular mix costs about four bytes per piece.
 * `checkpoints` holds (normCursor, rawCursor, byteOffset) before every
 * CHECKPOINT_EVERY-th entry, so a lookup decodes at most that many entries.
 */
export interface OffsetMap {
  bytes: Uint8Array;
  checkpoints: Uint32Array;
}

/** Searchable copy of `raw` plus its offset map. null means identity (pure ASCII and most text). */
export interface SearchableText {
  text: string;
  map: OffsetMap | null;
}

const CHECKPOINT_EVERY = 32;
const lower = (s: string): string => s.normalize("NFC").toLowerCase();

/** Appends map entries, merging consecutive pieces of the same shape. */
class OffsetMapBuilder {
  private bytes = new Uint8Array(64);
  private len = 0;
  private checkpoints: number[] = [];
  private entries = 0;
  private normCursor = 0; // end of the last flushed entry, normalized
  private rawCursor = 0;
  private prevNormEnd = 0; // end of the last piece, normalized
  private pending: [gap: number, normLen: number, rawLen: number, count: number] | null = null;

  piece(normStart: number, normLen: number, rawLen: number): void {
    const gap = normStart - this.prevNormEnd;
    this.prevNormEnd = normStart + normLen;
    const p = this.pending;
    if (p && p[0] === gap && p[1] === normLen && p[2] === rawLen) { p[3]++; return; }
    this.flush();
    this.pending = [gap, normLen, rawLen, 1];
  }

  private flush(): void {
    const p = this.pending;
    if (!p) return;
    if (this.entries++ % CHECKPOINT_EVERY === 0) this.checkpoints.push(this.normCursor, this.rawCursor, this.len);
    for (const v of p) this.varint(v);
    this.normCursor += p[3] * (p[0] + p[1]);
    this.rawCursor += p[3] * (p[0] + p[2]);
    this.pending = null;
  }

  private varint(v: number): void {
    if (this.len + 5 > this.bytes.length) { const grown = new Uint8Array(this.bytes.length * 2); grown.set(this.bytes); this.bytes = grown; }
    while (v >= 0x80) { this.bytes[this.len++] = (v & 0x7f) | 0x80; v >>>= 7; }
    this.bytes[this.len++] = v;
  }

  done(): OffsetMap | null {
    this.flush();
    return this.entries ? { bytes: this.bytes.slice(0, this.len), checkpoints: Uint32Array.from(this.checkpoints) } : null;
  }
}

export function toSearchable(raw: string): SearchableText {
  if (!NON_ASCII.test(raw)) return { text: raw.toLowerCase(), map: null };
  const parts: string[] = [];
  const map = new OffsetMapBuilder();
  let rawAt = 0; // raw consumed so far
  let normAt = 0; // normalized length so far
  const pushSame = (s: string) => { parts.push(s); normAt += s.length; };
  const pushPiece = (orig: string) => {
    const t = lower(orig);
    if (t.length !== orig.length) map.piece(normAt, t.length, orig.length);
    parts.push(t);
    normAt += t.length;
  };
  NON_ASCII_RUNS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NON_ASCII_RUNS.exec(raw)) !== null) {
    // The ASCII character before a run can compose with it ("e" + U+0301), so it joins the run.
    const start = m.index > rawAt ? m.index - 1 : m.index;
    const end = m.index + m[0].length;
    if (start > rawAt) pushSame(raw.slice(rawAt, start).toLowerCase());
    const run = raw.slice(start, end);
    const t = lower(run);
    if (t.length === run.length && run.normalize("NFC") === run) {
      pushSame(t); // case mapping kept the length: positions stay aligned
    } else {
      // Localize the length change to single clusters so excerpts stay precise.
      CLUSTER.lastIndex = 0;
      let c: RegExpExecArray | null;
      while ((c = CLUSTER.exec(run)) !== null) pushPiece(c[0]);
    }
    rawAt = end;
  }
  if (rawAt < raw.length) pushSame(raw.slice(rawAt).toLowerCase());
  return { text: parts.join(""), map: map.done() };
}

/**
 * Map a position in the searchable copy to the raw text. `end` maps a range
 * end. Inside a changed piece a start maps to the piece's raw start and an
 * end to its raw end; elsewhere the mapping is one-to-one.
 */
export function toRawOffset(map: OffsetMap | null, pos: number, end = false): number {
  if (!map) return pos;
  const cp = map.checkpoints;
  let lo = 0, hi = cp.length / 3 - 1, k = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp[mid * 3] <= pos) { k = mid; lo = mid + 1; } else hi = mid - 1;
  }
  let n = cp[k * 3], r = cp[k * 3 + 1], at = cp[k * 3 + 2];
  const bytes = map.bytes;
  const next = (): number => {
    let v = 0, shift = 0, b: number;
    do { b = bytes[at++]; v += (b & 0x7f) * 2 ** shift; shift += 7; } while (b & 0x80);
    return v;
  };
  while (at < bytes.length) {
    const gap = next(), normLen = next(), rawLen = next(), count = next();
    const stride = gap + normLen;
    if (pos < n + count * stride) {
      const j = Math.floor((pos - n) / stride);
      const rem = pos - n - j * stride;
      const pieceRaw = r + j * (gap + rawLen) + gap;
      if (rem < gap) return pieceRaw - gap + rem;
      return end && rem > gap ? pieceRaw + rawLen : pieceRaw;
    }
    n += count * stride;
    r += count * (gap + rawLen);
  }
  return r + (pos - n);
}

/* ---------------------------------------------------------------------- query */

const invalid = (message: string) => new PersonalError("invalid_query", message);

/**
 * Split a query into normalized terms. "quoted text" is one phrase term.
 * Rejects (never truncates) non-strings, unclosed quotes, more than
 * PERSONAL_LIMITS.queryCodePoints code points or PERSONAL_LIMITS.queryTerms terms.
 * Returns [] for a blank query.
 */
export function parseQuery(query: unknown): string[] {
  if (typeof query !== "string") throw invalid("query must be a string");
  const tokens: string[] = [];
  let points = 0;
  let current = "";
  let phrase: string | null = null;
  for (const ch of query) {
    if (++points > PERSONAL_LIMITS.queryCodePoints) throw invalid(`query is longer than ${PERSONAL_LIMITS.queryCodePoints} characters`);
    if (ch === '"') {
      if (phrase !== null) { tokens.push(phrase); phrase = null; } else { if (current) tokens.push(current); current = ""; phrase = ""; }
    } else if (phrase !== null) phrase += ch;
    else if (/\s/.test(ch)) { if (current) tokens.push(current); current = ""; }
    else current += ch;
  }
  if (phrase !== null) throw invalid('query has an unclosed quote (")');
  if (current) tokens.push(current);
  const terms: string[] = [];
  let count = 0;
  for (const token of tokens) {
    const term = toSearchable(token.replace(/\s+/g, " ").trim()).text;
    if (!term) continue;
    if (++count > PERSONAL_LIMITS.queryTerms) throw invalid(`query has more than ${PERSONAL_LIMITS.queryTerms} terms`);
    if (!terms.includes(term)) terms.push(term);
  }
  return terms;
}

/* ----------------------------------------------------------------- documents */

export interface SearchDoc {
  path: string;
  title: string;
  aliases: readonly string[];
  tags: readonly string[];
  /** Complete raw Markdown, frontmatter included. */
  raw: string;
  uid?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** A document with its searchable copies. Built once per content change, reused by every query. */
export interface PreparedDoc {
  readonly doc: SearchDoc;
  readonly body: string;
  readonly map: OffsetMap | null;
  readonly title: string;
  readonly aliases: string;
  readonly tags: string;
  readonly path: string;
  /** Exact tags, normalized, for the optional tag filter. */
  readonly tagKeys: readonly string[];
}

export const tagKey = (tag: string): string => lower(tag.replace(/^#/, ""));

export function prepareDoc(doc: SearchDoc): PreparedDoc {
  const searchable = toSearchable(doc.raw);
  return {
    doc,
    body: searchable.text,
    map: searchable.map,
    title: lower(doc.title || doc.path),
    // "\n" keeps a term from spanning two aliases or tags.
    aliases: lower(doc.aliases.join("\n")),
    tags: lower(doc.tags.join("\n")),
    path: lower(doc.path),
    tagKeys: doc.tags.map(tagKey),
  };
}

/* ------------------------------------------------------------------ excerpts */

const isLow = (s: string, i: number) => { const c = s.charCodeAt(i); return c >= 0xdc00 && c <= 0xdfff; };
const isHigh = (s: string, i: number) => { const c = s.charCodeAt(i); return c >= 0xd800 && c <= 0xdbff; };
/** Move a cut point off the middle of a surrogate pair (backward, or forward when `forward`). */
function safeCut(s: string, i: number, forward = false): number {
  if (i > 0 && i < s.length && isLow(s, i) && isHigh(s, i - 1)) return forward ? i + 1 : i - 1;
  return i;
}
const collapse = (s: string) => s.replace(/\s+/g, " ");
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
const CONTEXT_BEFORE = 100;

/**
 * Excerpt of the raw text around [rawStart, rawEnd): original spelling and
 * case, whitespace collapsed, at most PERSONAL_LIMITS.excerptChars UTF-16
 * code units, never splitting a surrogate pair. rawStart < 0 = no body match.
 */
export function excerptAt(raw: string, rawStart: number): string {
  const max = PERSONAL_LIMITS.excerptChars;
  let from: number;
  let before = "";
  let cutBefore = false;
  if (rawStart < 0) {
    const fm = FRONTMATTER.exec(raw);
    from = fm ? fm[0].length : 0;
  } else {
    from = rawStart;
    const lo = safeCut(raw, Math.max(0, rawStart - CONTEXT_BEFORE * 3), true);
    before = collapse(raw.slice(lo, rawStart)).trimStart();
    cutBefore = lo > 0;
    if (before.length > CONTEXT_BEFORE) {
      before = before.slice(safeCut(before, before.length - CONTEXT_BEFORE, true)).trimStart();
      cutBefore = true;
    }
  }
  const hi = safeCut(raw, Math.min(raw.length, from + max * 4));
  let text = (before + collapse(raw.slice(from, hi))).trimStart();
  const head = cutBefore ? "… " : "";
  const budget = max - head.length;
  let cutAfter = hi < raw.length;
  if (text.length > budget) { text = text.slice(0, safeCut(text, budget - 2)); cutAfter = true; }
  text = text.trimEnd();
  if (cutAfter && text.length + 2 > budget) text = text.slice(0, safeCut(text, budget - 2)).trimEnd();
  return head + text + (cutAfter ? " …" : "");
}

/* -------------------------------------------------------------------- search */

function countOccurrences(haystack: string, needle: string, from: number, cap: number): number {
  let count = 0;
  while (count < cap) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    count++;
    from = at + needle.length;
  }
  return count;
}

interface Candidate {
  prepared: PreparedDoc;
  score: number;
  fields: number;
  bodyAt: number;
}

const better = (a: Candidate, b: Candidate) =>
  a.score > b.score || (a.score === b.score && a.prepared.doc.path < b.prepared.doc.path);

/**
 * One query over any sequence of prepared documents. Feed documents with
 * `consider` (the worker does this in bounded batches), then read `hits()`.
 * Keeps only the top `limit` candidates; excerpts are built for those alone.
 */
export class SearchRun {
  readonly terms: readonly string[];
  total = 0;
  private readonly order: string[];
  private readonly whole: string;
  private readonly tag: string | null;
  private readonly limit: number;
  private readonly top: Candidate[] = [];

  constructor(terms: readonly string[], opts: { limit?: number; tag?: string } = {}) {
    this.terms = terms;
    // Longest first: the rarest term usually rejects a document soonest.
    this.order = [...terms].sort((a, b) => b.length - a.length);
    this.whole = terms.join(" ");
    this.tag = opts.tag ? tagKey(opts.tag) : null;
    this.limit = opts.limit ?? PERSONAL_LIMITS.defaultResults;
  }

  consider(p: PreparedDoc): void {
    if (!this.order.length) return;
    if (this.tag !== null && !p.tagKeys.includes(this.tag)) return;
    let score = 0;
    let fields = 0;
    let bodyAt = -1;
    for (const term of this.order) {
      let best = 0;
      if (p.title.includes(term)) { best = FIELD_WEIGHT.title; fields |= FIELD_BIT.title; }
      if (p.aliases.includes(term)) { best = Math.max(best, FIELD_WEIGHT.alias); fields |= FIELD_BIT.alias; }
      if (p.tags.includes(term)) { best = Math.max(best, FIELD_WEIGHT.tag); fields |= FIELD_BIT.tag; }
      if (p.path.includes(term)) { best = Math.max(best, FIELD_WEIGHT.path); fields |= FIELD_BIT.path; }
      const at = p.body.indexOf(term);
      if (at >= 0) {
        best = Math.max(best, FIELD_WEIGHT.body);
        fields |= FIELD_BIT.body;
        score += 0.1 * (1 + countOccurrences(p.body, term, at + term.length, 4));
        if (bodyAt < 0 || at < bodyAt) bodyAt = at;
      }
      if (best === 0) return;
      score += best;
    }
    if (p.title === this.whole) score += 3;
    else if (p.title.startsWith(this.whole)) score += 2;
    else if (this.terms.length > 1 && p.title.includes(this.whole)) score += 1;
    this.total++;
    const c: Candidate = { prepared: p, score: Math.round(score * 1000) / 1000, fields, bodyAt };
    const top = this.top;
    if (top.length >= this.limit && !better(c, top[top.length - 1])) return;
    let lo = 0, hi = top.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (better(top[mid], c)) lo = mid + 1; else hi = mid; }
    top.splice(lo, 0, c);
    if (top.length > this.limit) top.pop();
  }

  hits(): SearchHit[] {
    return this.top.map((c) => {
      const d = c.prepared.doc;
      const hit: SearchHit = {
        path: d.path,
        title: d.title || d.path,
        score: c.score,
        matchedIn: FIELD_ORDER.filter((f) => c.fields & FIELD_BIT[f]),
        excerpt: excerptAt(d.raw, c.bodyAt < 0 ? -1 : toRawOffset(c.prepared.map, c.bodyAt)),
      };
      if (d.uid !== undefined) hit.uid = d.uid;
      if (d.createdAt !== undefined) hit.createdAt = d.createdAt;
      if (d.updatedAt !== undefined) hit.updatedAt = d.updatedAt;
      return hit;
    });
  }
}

/** Clamp/validate a result limit. Rejects non-integers instead of guessing. */
export function resultLimit(limit: unknown): number {
  if (limit === undefined || limit === null) return PERSONAL_LIMITS.defaultResults;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > PERSONAL_LIMITS.maxResults) {
    throw new PersonalError("invalid_argument", `limit must be an integer from 1 to ${PERSONAL_LIMITS.maxResults}`);
  }
  return limit;
}

/* ------------------------------------------------------ legacy synchronous API */

/** Input shape of the starter patch's index (vault-provider.ts). */
export interface TextDoc {
  path: string;
  title: string;
  aliases?: readonly string[];
  tags?: readonly string[];
  body: string;
}
export type TextField = SearchField;
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

/**
 * Synchronous reference matcher. Not used by the plugin (search runs in the
 * worker and has no main-thread fallback); the Node tests and the benchmark
 * use it to check the worker's results against a single-threaded run.
 * Same matching as the worker; a body over the per-file limit is skipped
 * whole, never cut to a prefix.
 */
export class FullTextIndex {
  private readonly prepared: PreparedDoc[] = [];
  readonly notes: number;
  /** Notes skipped whole because the body exceeded PERSONAL_LIMITS.maxFileBytes (name kept for callers). */
  readonly truncatedNotes: number;
  readonly characters: number;

  constructor(docs: readonly TextDoc[]) {
    let skipped = 0;
    let characters = 0;
    for (const d of docs) {
      if (!d || typeof d.path !== "string" || !d.path) continue;
      const body = typeof d.body === "string" ? d.body : "";
      if (body.length * 3 > PERSONAL_LIMITS.maxFileBytes && utf8Length(body) > PERSONAL_LIMITS.maxFileBytes) { skipped++; continue; }
      characters += body.length;
      this.prepared.push(prepareDoc({
        path: d.path,
        title: typeof d.title === "string" && d.title ? d.title : d.path,
        aliases: (d.aliases ?? []).map(String),
        tags: (d.tags ?? []).map(String),
        raw: body,
      }));
    }
    this.notes = this.prepared.length;
    this.truncatedNotes = skipped;
    this.characters = characters;
  }

  /** `accept` filters by path before any text is examined. Throws PersonalError("invalid_query"). */
  search(query: unknown, opts: { limit?: number; accept?: (path: string) => boolean } = {}): TextSearchResult {
    const terms = parseQuery(query);
    const limit = Math.max(1, Math.min(PERSONAL_LIMITS.maxResults, Math.floor(opts.limit ?? PERSONAL_LIMITS.defaultResults)));
    const run = new SearchRun(terms, { limit });
    for (const p of this.prepared) if (!opts.accept || opts.accept(p.doc.path)) run.consider(p);
    return {
      terms,
      total: run.total,
      hits: run.hits().map((h) => ({ path: h.path, title: h.title, score: h.score, matchedIn: h.matchedIn, snippet: h.excerpt })),
    };
  }
}

/** UTF-8 byte length without allocating an encoded copy. Lone surrogates count as U+FFFD (3 bytes). */
export function utf8Length(s: string): number {
  if (!NON_ASCII.test(s)) return s.length;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && isLow(s, i + 1)) { n += 4; i++; }
    else n += 3;
  }
  return n;
}
