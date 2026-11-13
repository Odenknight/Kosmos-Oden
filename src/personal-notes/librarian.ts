/**
 * Personal Notes (0.9.5) — the Librarian: deterministic hybrid retrieval.
 *
 * Answers a plain-language question over text already in memory. No model,
 * no network, no tokens, nothing on disk: the same question over the same
 * notes always gives the same answer.
 *
 * Three ranked lists are fused by reciprocal rank (RRF):
 *   - lexical:  BM25 over stemmed words; a word in the title, an alias, a
 *               tag, the file name or a heading counts extra. Any word may
 *               match (unlike search_notes, where every term must).
 *   - expanded: the same, plus words that the best lexical matches have in
 *               common (pseudo-relevance feedback), at a reduced weight. This
 *               bridges different wordings without embeddings.
 *   - name:     character-trigram similarity between the question and each
 *               note's title, aliases and file name (typos, partial names).
 * A question word that occurs nowhere in the requester's notes is replaced by
 * the closest word that does (edit distance), and reported as a correction.
 *
 * For each hit the best passages, the outbound web links (forms flagged),
 * list steps and note links are extracted from the raw text. Everything is
 * computed from the requester's own scope: statistics, corrections and
 * expansion words never come from a note the requester cannot read. The one
 * exception is the corpus-wide document frequency used to pick expansion
 * words among those already found in the requester's top matches.
 *
 * Pure: no Obsidian, no Node, no DOM. Runs in the search worker.
 */
import { toSearchable, type PreparedDoc } from "./fulltext";
import { PersonalError, type SearchCoverage } from "./types";

export const LIBRARIAN_CONTRACT = "kosmos-librarian/1";

export const LIBRARIAN_LIMITS = {
  /** Over-limit questions are rejected, never truncated. */
  questionCodePoints: 500,
  questionTerms: 32,
  defaultResults: 8,
  maxResults: 25,
  /** Hits the worker returns so the caller can collapse versions and duplicates. */
  maxFetch: 80,
  passagesPerNote: 2,
  passageChars: 480,
  /** Raw characters of one note examined for passages, links and steps. */
  scanChars: 200_000,
  sectionChars: 6000,
  linksPerNote: 8,
  stepsPerNote: 12,
  stepChars: 240,
  noteLinksPerNote: 10,
  /** Distinct words kept per note, and the longest word indexed. */
  maxDocTerms: 20_000,
  maxWordChars: 40,
  maxVocabulary: 2_000_000,
  feedbackDocs: 6,
  feedbackTerms: 4,
  correctionCandidates: 12,
  namesPerNote: 8,
} as const;

/* ------------------------------------------------------------------ wire types */

export type LibrarianIntent = "locate" | "howto" | "history" | "troubleshoot" | "lookup";
export type LibrarianConfidence = "strong" | "weak" | "none";

export interface LibrarianRequest {
  question: string;
  /** Hits to return, 1..LIBRARIAN_LIMITS.maxFetch. */
  limit?: number;
  /** Paths the requester may see; applied before anything is examined. null = whole corpus (the local user). */
  allowedPaths: ReadonlySet<string> | null;
  policyGeneration?: number;
  signal?: AbortSignal;
}

export interface LibrarianPassage {
  /** Nearest heading above the passage, when there is one. */
  heading?: string;
  /** Original spelling; spaces collapsed, line breaks kept. */
  text: string;
  /** Start of the passage in the raw note, UTF-16 code units. */
  offsetChars: number;
}

export interface LibrarianLink {
  url: string;
  label: string;
  /** "form" = the link or its line reads like something to fill in or submit. */
  kind: "form" | "link" | "email";
}

export interface LibrarianStep {
  text: string;
  /** Present for task-list items. */
  done?: boolean;
}

export interface LibrarianHit {
  path: string;
  title: string;
  /** Fused ordering value, not a confidence. */
  score: number;
  /** 1-based rank in each list that contained the note. */
  ranks: { lexical?: number; expanded?: number; name?: number };
  /** Question words (after correction) found in the note. */
  matchedTerms: string[];
  /** Share of the question's words found in the note, 0..1. */
  termCoverage: number;
  passages: LibrarianPassage[];
  links: LibrarianLink[];
  steps: LibrarianStep[];
  /** Note links ([[...]]) near the best passage, exactly as written, without alias or heading. */
  noteLinks: string[];
  /** Equal for notes whose text after the properties block is the same. "" for near-empty notes. */
  fingerprint: string;
  uid?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** What a caller needs from the Librarian: the worker client implements it. */
export interface PersonalLibrarian {
  librarian(request: LibrarianRequest): Promise<LibrarianResponse>;
}

export interface LibrarianResponse {
  contract: typeof LIBRARIAN_CONTRACT;
  intent: LibrarianIntent;
  /** Question words used, after stop-word removal (original spelling, lowercase). */
  terms: string[];
  corrections: { from: string; to: string }[];
  /** Words added from the best lexical matches. */
  expanded: string[];
  /** Quoted phrases; a note containing one ranks higher. */
  phrases: string[];
  /** Notes that appeared in any list. */
  total: number;
  hits: LibrarianHit[];
  confidence: LibrarianConfidence;
  coverage: SearchCoverage;
  corpusRevision: number;
}

/* ---------------------------------------------------------------------- words */

const WORD = /[\p{L}\p{N}]+/gu;
const HAS_DIGIT = /\d/;
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

const STOP = new Set((
  "a about after again all also am an and any are as at be because been before being between both but by can could did do does doing " +
  "each few for from get got had has have having how i if in into is it its just me more most my no nor not of on only or other our out " +
  "over own same should so some such than that the their them then there these they this those to too under until up very via vs was we " +
  "were what when where which who whom why will with would you your"
).split(" "));

/**
 * Light English suffix stripper, used for both notes and questions so they
 * meet: plurals, -ly, -ing, -ed, -ion and a final e. It only has to conflate
 * forms of one word; it does not produce dictionary words. Words with a digit
 * and words of three letters or fewer are left alone.
 */
export function stem(word: string): string {
  if (word.length <= 3 || HAS_DIGIT.test(word)) return word;
  let w = word;
  if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "y";
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (/(?:[sxz]|ch|sh)es$/.test(w) && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("s") && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.endsWith("ly") && w.length > 5) w = w.slice(0, -2);
  const before = w;
  if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("ation") && w.length > 6) w = w.slice(0, -5);
  else if (/[st]ion$/.test(w) && w.length > 5) w = w.slice(0, -3);
  if (w !== before && w.length > 3 && w[w.length - 1] === w[w.length - 2] && !/[lsz]$/.test(w)) w = w.slice(0, -1);
  if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);
  return w;
}

/** Lowercase NFC words of `text`, in order. */
function wordsOf(text: string): string[] {
  const out: string[] = [];
  WORD.lastIndex = 0;
  for (const m of toSearchable(text).text.matchAll(WORD)) out.push(m[0]);
  return out;
}

const usable = (word: string) => word.length >= 2 && word.length <= LIBRARIAN_LIMITS.maxWordChars && !STOP.has(word);

/* ----------------------------------------------------------------- vocabulary */

/** Word -> id. Ids are never reused; a removed note's words stay (document frequency drops to 0). */
export class Vocabulary {
  private readonly ids = new Map<string, number>();
  readonly terms: string[] = [];

  /** Id for `term`, assigning one unless the vocabulary is full (-1). */
  id(term: string): number {
    let id = this.ids.get(term);
    if (id === undefined) {
      if (this.terms.length >= LIBRARIAN_LIMITS.maxVocabulary) return -1;
      id = this.terms.length;
      this.terms.push(term);
      this.ids.set(term, id);
    }
    return id;
  }

  lookup(term: string): number { return this.ids.get(term) ?? -1; }
}

/* -------------------------------------------------------------------- vectors */

/** What the Librarian keeps per note besides its PreparedDoc. */
export interface DocVector {
  /** Sorted word ids of the whole raw text, with their counts. */
  ids: Uint32Array;
  tfs: Uint16Array;
  /** Words in the note, stop words included. */
  length: number;
  /** Sorted ids of words in the title, aliases, tags, file name and headings. */
  head: Uint32Array;
  /** Sorted ids of words in the title, aliases, tags and file name only: what a note is *about*. */
  nameHead: Uint32Array;
  /** Normalized title, aliases and file name. */
  names: string[];
  /** Sorted trigram hashes, one array per name. */
  grams: Uint32Array[];
  fingerprint: string;
}

const HEADING = /^#{1,6}[ \t]+(.+)$/gm;
const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
const nameKey = (s: string) => wordsOf(s).join(" ");

function fnv(text: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

/** Sorted, unique trigram hashes of a normalized name, padded with a space on both sides. */
export function trigrams(name: string): Uint32Array {
  const padded = ` ${name} `;
  const seen = new Set<number>();
  for (let i = 0; i + 3 <= padded.length; i++) seen.add(fnv(padded.slice(i, i + 3), 0x811c9dc5));
  return Uint32Array.from(seen).sort();
}

/** Hash of the text after the properties block with all whitespace removed; "" when under 40 characters remain. */
function fingerprintOf(raw: string): string {
  const fm = FRONTMATTER.exec(raw);
  let a = 0x811c9dc5, b = 0x9e3779b9, n = 0;
  for (let i = fm ? fm[0].length : 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 32 || (c >= 9 && c <= 13)) continue;
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
    n++;
  }
  return n < 40 ? "" : a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0") + n.toString(16);
}

export function indexDoc(p: PreparedDoc, vocab: Vocabulary): DocVector {
  const counts = new Map<number, number>();
  let length = 0;
  WORD.lastIndex = 0;
  for (const m of p.body.matchAll(WORD)) {
    length++;
    const word = m[0];
    if (!usable(word)) continue;
    const key = stem(word);
    let id = vocab.lookup(key);
    if (id < 0) {
      if (counts.size >= LIBRARIAN_LIMITS.maxDocTerms) continue;
      id = vocab.id(key);
      if (id < 0) continue;
    } else if (!counts.has(id) && counts.size >= LIBRARIAN_LIMITS.maxDocTerms) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const ids = Uint32Array.from(counts.keys()).sort();
  const tfs = new Uint16Array(ids.length);
  for (let i = 0; i < ids.length; i++) tfs[i] = Math.min(65535, counts.get(ids[i])!);

  const head = new Set<number>();
  const nameHead = new Set<number>();
  const addHead = (text: string, into: Set<number>) => { for (const w of wordsOf(text)) if (usable(w)) { const id = vocab.id(stem(w)); if (id >= 0) into.add(id); } };
  addHead(p.title, head); addHead(p.aliases, head); addHead(p.tags, head); addHead(baseName(p.doc.path), head);
  addHead(p.title, nameHead); addHead(p.aliases, nameHead); addHead(p.tags, nameHead); addHead(baseName(p.doc.path), nameHead);
  HEADING.lastIndex = 0;
  let headings = 0;
  for (const m of p.body.matchAll(HEADING)) { addHead(m[1], head); if (++headings >= 200) break; }

  const names: string[] = [];
  for (const raw of [p.doc.title, ...p.doc.aliases, baseName(p.doc.path)]) {
    const key = nameKey(String(raw ?? ""));
    if (key && !names.includes(key) && names.length < LIBRARIAN_LIMITS.namesPerNote) names.push(key);
  }
  return { ids, tfs, length, head: Uint32Array.from(head).sort(), nameHead: Uint32Array.from(nameHead).sort(), names, grams: names.map(trigrams), fingerprint: fingerprintOf(p.doc.raw) };
}

function find(sorted: Uint32Array, id: number): number {
  let lo = 0, hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = sorted[mid];
    if (v === id) return mid;
    if (v < id) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}

/** The Librarian's corpus-wide state: the vocabulary and document frequencies. Vectors are held by the caller. */
export class LibrarianIndex {
  readonly vocab = new Vocabulary();
  private df: number[] = [];
  docs = 0;

  add(v: DocVector): void { this.docs++; for (const id of v.ids) this.df[id] = (this.df[id] ?? 0) + 1; }
  remove(v: DocVector): void { this.docs--; for (const id of v.ids) this.df[id] = Math.max(0, (this.df[id] ?? 0) - 1); }
  clear(): void { this.df = []; this.docs = 0; }
  frequency(id: number): number { return this.df[id] ?? 0; }
}

/* ------------------------------------------------------------------- question */

const invalid = (message: string) => new PersonalError("invalid_query", message);

export interface ParsedQuestion {
  intent: LibrarianIntent;
  /** Distinct usable words, original (lowercase) spelling, in order of first use. */
  words: string[];
  stems: string[];
  phrases: string[];
  /** Usable words joined by spaces, for name matching. */
  nameKey: string;
}

export function classifyIntent(question: string): LibrarianIntent {
  const q = question.toLowerCase();
  if (/\b(replac(e[sd]?|ed by|ing|ement)|supersed\w*|(older|previous|prior|latest|newest|current|new) version|what changed|version history|out of date|outdated)\b/.test(q)) return "history";
  if (/\b(errors?|fail(s|ed|ing|ure)?|not working|broken|keeps?|dropping|crash\w*|problem|issue|fix|troubleshoot\w*|can't|cannot|won't|doesn't|stuck|timeout|timed out)\b/.test(q)) return "troubleshoot";
  if (/\b(how (do|does|can|could|should|would|to)|steps? (to|for)|procedure|process (to|for|of)|set ?up|setup|configure|install|request(ing)? an?|apply for|sign up|get an? new|obtain|order an?|guide (to|for))\b/.test(q)) return "howto";
  if (/^\s*(find|locate|where('s| is| are| can i find| do i find)|show me|open|link to|get me|pull up)\b/.test(q) || /\b(form|template|checklist|policy|document|page|file|pdf)\s*\??\s*$/.test(q)) return "locate";
  return "lookup";
}

/** Split a question into words and quoted phrases. Rejects (never truncates) over-limit input. */
export function parseQuestion(question: unknown): ParsedQuestion {
  if (typeof question !== "string") throw invalid("question must be a string");
  let points = 0;
  for (const _ of question) if (++points > LIBRARIAN_LIMITS.questionCodePoints) throw invalid(`question is longer than ${LIBRARIAN_LIMITS.questionCodePoints} characters`);
  const phrases: string[] = [];
  for (const m of question.matchAll(/"([^"]{2,200})"/g)) {
    const phrase = toSearchable(m[1].replace(/\s+/g, " ").trim()).text;
    if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
  }
  const words: string[] = [];
  const stems: string[] = [];
  for (const word of wordsOf(question)) {
    if (!usable(word)) continue;
    const key = stem(word);
    if (stems.includes(key)) continue;
    if (stems.length >= LIBRARIAN_LIMITS.questionTerms) throw invalid(`question has more than ${LIBRARIAN_LIMITS.questionTerms} distinct search words`);
    words.push(word);
    stems.push(key);
  }
  if (!stems.length) throw invalid("question has no searchable words");
  return { intent: classifyIntent(question), words, stems, phrases, nameKey: words.join(" ") };
}

/* ----------------------------------------------------------------- correction */

/** Edit distance, or `max + 1` as soon as it must exceed `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** Vocabulary ids close to `word` (same first letter), nearest first, then alphabetical. */
function nearest(vocab: Vocabulary, word: string): { id: number; distance: number }[] {
  if (word.length < 4 || HAS_DIGIT.test(word)) return [];
  const max = word.length >= 8 ? 2 : 1;
  const first = word.charCodeAt(0);
  const found: { id: number; distance: number; term: string }[] = [];
  const terms = vocab.terms;
  for (let id = 0; id < terms.length; id++) {
    const term = terms[id];
    if (term.charCodeAt(0) !== first || term === word) continue;
    const distance = editDistance(word, term, max);
    if (distance <= max) found.push({ id, distance, term });
  }
  found.sort((a, b) => (a.distance - b.distance) || (a.term < b.term ? -1 : 1));
  return found;
}

/* -------------------------------------------------------------------- ranking */

export interface LibrarianEntry { prepared: PreparedDoc; vector: DocVector }

interface Term { word: string; id: number; col: Uint16Array; df: number; weight: number; expanded: boolean }

const K1 = 1.2, B = 0.75, HEAD_BONUS = 3, EXPANSION_WEIGHT = 0.2, RRF_K = 60;
const LIST_WEIGHT = { lexical: 1, expanded: 0.7, name: 0.8 } as const;
const LIST_DEPTH = { lexical: 100, expanded: 100, name: 50 } as const;
const NAME_MIN = 0.5;

function intersect(a: Uint32Array, b: Uint32Array): number {
  let i = 0, j = 0, n = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { n++; i++; j++; } else if (a[i] < b[j]) i++; else j++;
  }
  return n;
}

/** Similarity of the question's words to one name: how much of the name the question covers, tempered by Dice. */
function nameSimilarity(question: Uint32Array, name: Uint32Array): number {
  if (name.length < 3 || !question.length) return 0;
  const common = intersect(question, name);
  if (!common) return 0;
  return 0.6 * (common / name.length) + 0.4 * ((2 * common) / (question.length + name.length));
}

/**
 * Rank `pool` (the requester's notes, in stable path order) for one question.
 * Synchronous: the caller gathers the pool in bounded batches, then calls this.
 */
export function runLibrarian(question: unknown, pool: readonly LibrarianEntry[], index: LibrarianIndex, opts: { limit?: number } = {}): Omit<LibrarianResponse, "coverage" | "corpusRevision"> {
  const parsed = parseQuestion(question);
  const limit = Math.max(1, Math.min(LIBRARIAN_LIMITS.maxFetch, Math.floor(opts.limit ?? LIBRARIAN_LIMITS.defaultResults)));
  const n = pool.length;
  let totalLength = 0;
  for (const e of pool) totalLength += e.vector.length;
  const avgdl = n ? Math.max(1, totalLength / n) : 1;

  const column = (id: number): { col: Uint16Array; df: number } => {
    const col = new Uint16Array(n);
    let df = 0;
    if (id >= 0) for (let i = 0; i < n; i++) {
      const v = pool[i].vector;
      const at = find(v.ids, id);
      if (at >= 0) { col[i] = v.tfs[at]; df++; }
    }
    return { col, df };
  };

  /* Question words; a word found nowhere in scope is replaced by the nearest word that is. */
  const terms: Term[] = [];
  const corrections: { from: string; to: string }[] = [];
  for (let k = 0; k < parsed.stems.length; k++) {
    const key = parsed.stems[k];
    const id = index.vocab.lookup(key);
    let term: Term = { word: parsed.words[k], id, ...column(id), weight: 1, expanded: false };
    if (term.df === 0) {
      let best: Term | null = null;
      let bestDistance = Infinity;
      for (const candidate of nearest(index.vocab, key).slice(0, LIBRARIAN_LIMITS.correctionCandidates)) {
        if (candidate.distance > bestDistance) break;
        const c = column(candidate.id);
        if (c.df > 0 && (!best || c.df > best.df)) { best = { word: index.vocab.terms[candidate.id], id: candidate.id, ...c, weight: 1, expanded: false }; bestDistance = candidate.distance; }
      }
      if (best && !terms.some((t) => t.id === best!.id)) { corrections.push({ from: term.word, to: best.word }); term = best; }
    }
    terms.push(term);
  }
  const asked = terms.length;

  const idf = (df: number, docs: number) => Math.log(1 + (docs - df + 0.5) / (df + 0.5));
  /**
   * BM25 over one list. Coverage is weighted by how rare each question word is:
   * matching "new" and "request" (which occur everywhere) must not look like
   * answering a question whose rarest word is "laptop".
   */
  const score = (list: readonly Term[]): { s: Float64Array; matched: Uint8Array; coverage: Float64Array; specificity: Float64Array } => {
    const s = new Float64Array(n);
    const matched = new Uint8Array(n);
    const matchedIdf = new Float64Array(n);
    const nameIdf = new Float64Array(n);
    const rareMatch = new Uint8Array(n);
    let totalIdf = 0;
    let rareId = -1;
    let rareIdf = 0;
    for (const t of terms) {
      const weight = idf(Math.max(t.df, 1), Math.max(n, 1));
      totalIdf += weight;
      if (t.df && weight > rareIdf) { rareIdf = weight; rareId = t.id; }
    }
    for (const t of list) {
      if (!t.df) continue;
      const weight = idf(t.df, n);
      const w = t.weight * weight;
      for (let i = 0; i < n; i++) {
        const tf = t.col[i];
        if (!tf) continue;
        const v = pool[i].vector;
        s[i] += w * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * v.length / avgdl));
        const inHead = find(v.head, t.id) >= 0;
        if (inHead) s[i] += w * HEAD_BONUS;
        if (!t.expanded) {
          matched[i]++;
          matchedIdf[i] += weight;
          if (find(v.nameHead, t.id) >= 0) nameIdf[i] += weight;
          if (t.id === rareId) rareMatch[i] = 1;
        }
      }
    }
    const coverage = new Float64Array(n);
    const specificity = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      coverage[i] = totalIdf > 0 ? Math.min(1, matchedIdf[i] / totalIdf) : 0;
      // The rarest question word is what makes the question that question, and a
      // note whose title, aliases, tags or file name carry the words is about the
      // topic rather than merely mentioning it.
      specificity[i] = totalIdf > 0 ? nameIdf[i] / totalIdf : 0;
      if (s[i]) s[i] *= (0.25 + 0.75 * coverage[i]) * (rareMatch[i] ? 1.25 : 0.75) * (1 + 1.5 * specificity[i]);
    }
    return { s, matched, coverage, specificity };
  };
  const byPath = (a: number, b: number) => (pool[a].prepared.doc.path < pool[b].prepared.doc.path ? -1 : 1);
  const ranked = (s: ArrayLike<number>, keep: (i: number) => boolean, depth: number): number[] => {
    const order: number[] = [];
    for (let i = 0; i < n; i++) if (s[i] > 0 && keep(i)) order.push(i);
    order.sort((a, b) => (s[b] - s[a]) || byPath(a, b));
    return order.slice(0, depth);
  };

  const lexical = score(terms);
  // A quoted phrase lifts the notes that contain it; it is not a filter.
  if (parsed.phrases.length) for (let i = 0; i < n; i++) {
    if (!lexical.s[i]) continue;
    for (const phrase of parsed.phrases) if (pool[i].prepared.body.includes(phrase)) lexical.s[i] *= 1.5;
  }
  const lexicalOrder = ranked(lexical.s, (i) => lexical.matched[i] > 0, LIST_DEPTH.lexical);

  /* Expansion: words the best lexical matches share. */
  const expansion: Term[] = [];
  const feedback = lexicalOrder.slice(0, LIBRARIAN_LIMITS.feedbackDocs);
  if (feedback.length >= 2) {
    const candidates = new Map<number, { docs: number; weight: number }>();
    const used = new Set(terms.map((t) => t.id));
    for (const i of feedback) {
      const v = pool[i].vector;
      const local = new Map<number, number>();
      for (const id of v.head) local.set(id, 2);
      for (let k = 0; k < v.ids.length; k++) if (v.tfs[k] >= 3) local.set(v.ids[k], (local.get(v.ids[k]) ?? 0) + 1 + Math.log(v.tfs[k]));
      for (const [id, weight] of local) {
        if (used.has(id)) continue;
        const c = candidates.get(id);
        if (c) { c.docs++; c.weight += weight; } else candidates.set(id, { docs: 1, weight });
      }
    }
    const scored: { id: number; term: string; value: number }[] = [];
    for (const [id, c] of candidates) {
      if (c.docs < 2) continue;
      const term = index.vocab.terms[id];
      if (term.length < 3 || /^\d+$/.test(term)) continue;
      scored.push({ id, term, value: c.weight * idf(index.frequency(id), Math.max(index.docs, 1)) });
    }
    scored.sort((a, b) => (b.value - a.value) || (a.term < b.term ? -1 : 1));
    for (const c of scored.slice(0, LIBRARIAN_LIMITS.feedbackTerms)) expansion.push({ word: c.term, id: c.id, ...column(c.id), weight: EXPANSION_WEIGHT, expanded: true });
  }
  const expandedScore = expansion.length ? score([...terms, ...expansion]) : null;
  const expandedOrder = expandedScore ? ranked(expandedScore.s, () => true, LIST_DEPTH.expanded) : [];

  /* Names. */
  const questionGrams = trigrams(parsed.nameKey);
  const nameScore = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const v = pool[i].vector;
    let best = 0;
    for (let k = 0; k < v.grams.length; k++) {
      const sim = v.names[k] === parsed.nameKey ? 1 : nameSimilarity(questionGrams, v.grams[k]);
      if (sim > best) best = sim;
    }
    if (best >= NAME_MIN) nameScore[i] = best;
  }
  const nameOrder = ranked(nameScore, () => true, LIST_DEPTH.name);

  /* Fusion. */
  const fused = new Map<number, { score: number; ranks: LibrarianHit["ranks"] }>();
  const nameWeight = parsed.intent === "locate" ? 1.2 : LIST_WEIGHT.name;
  const fuse = (order: number[], list: "lexical" | "expanded" | "name", weight: number) => {
    order.forEach((i, at) => {
      const f = fused.get(i) ?? { score: 0, ranks: {} };
      f.score += weight / (RRF_K + at + 1);
      f.ranks[list] = at + 1;
      fused.set(i, f);
    });
  };
  fuse(lexicalOrder, "lexical", LIST_WEIGHT.lexical);
  fuse(expandedOrder, "expanded", LIST_WEIGHT.expanded);
  fuse(nameOrder, "name", nameWeight);
  const order = [...fused.keys()].sort((a, b) => (fused.get(b)!.score - fused.get(a)!.score) || byPath(a, b));

  const weights = new Map<string, number>();
  for (const t of terms) weights.set(index.vocab.terms[t.id] ?? stem(t.word), 1);
  for (const t of expansion) weights.set(index.vocab.terms[t.id], EXPANSION_WEIGHT);

  const hits: LibrarianHit[] = order.slice(0, limit).map((i) => {
    const { prepared, vector } = pool[i];
    const d = prepared.doc;
    const matchedTerms = terms.filter((t) => t.col[i] > 0).map((t) => t.word);
    const extract = extractFromNote(d.raw, weights);
    const hit: LibrarianHit = {
      path: d.path,
      title: d.title || d.path,
      score: Math.round(fused.get(i)!.score * 1e6) / 1e6,
      ranks: fused.get(i)!.ranks,
      matchedTerms,
      termCoverage: Math.round(lexical.coverage[i] * 100) / 100,
      ...extract,
      fingerprint: vector.fingerprint,
    };
    if (d.uid !== undefined) hit.uid = d.uid;
    if (d.createdAt !== undefined) hit.createdAt = d.createdAt;
    if (d.updatedAt !== undefined) hit.updatedAt = d.updatedAt;
    return hit;
  });

  let confidence: LibrarianConfidence = "none";
  if (hits.length) {
    const top = order[0];
    const share = lexical.coverage[top];
    const strongWords = asked <= 2 ? share >= 0.99 : share >= 0.6;
    // "Strong" also needs the note to be about the question (a third of its
    // weight in the title, aliases, tags or headings), not merely to mention it.
    const about = lexical.specificity[top] >= 0.34;
    confidence = (strongWords && about && lexical.matched[top] > 0) || nameScore[top] >= 0.8 ? "strong" : "weak";
  }

  return {
    contract: LIBRARIAN_CONTRACT,
    intent: parsed.intent,
    terms: terms.map((t) => t.word),
    corrections,
    expanded: expansion.map((t) => t.word),
    phrases: parsed.phrases,
    total: fused.size,
    hits,
    confidence,
  };
}

/* ----------------------------------------------------------------- extraction */

const isLow = (s: string, i: number) => { const c = s.charCodeAt(i); return c >= 0xdc00 && c <= 0xdfff; };
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = max - 2;
  if (isLow(text, cut)) cut--;
  return text.slice(0, cut).trimEnd() + " …";
}
const tidy = (block: string) => block.split(/\r?\n/).map((l) => l.replace(/[ \t]+/g, " ").trimEnd()).join("\n").trim();

interface Block { start: number; end: number; heading: string; headingStart: number; score: number }

const FORM_WORDS = /\b(forms?|request|apply|application|submit|sign[- ]?up|register|registration|enrol+|order|portal|ticket|survey|questionnaire|book(ing)?|schedule|renew(al)?)\b/i;
const FORM_HOSTS = /(^|\.)(forms\.gle|forms\.office\.com|forms\.microsoft\.com|typeform\.com|jotform\.com|surveymonkey\.com|service-now\.com|formstack\.com|cognitoforms\.com)$|^docs\.google\.com\/forms|airtable\.com\/(shr|app[^/]*\/(shr|pag))/i;
const MD_LINK = /\[([^\]\n]{0,200})\]\(<?((?:https?:\/\/|mailto:)[^\s)>]+)>?(?:\s+"[^"\n]*")?\)/g;
const BARE_URL = /(?<![\w(\[<"'=/])(https?:\/\/[^\s<>"')\]]+)/g;
const NOTE_LINK = /(!?)\[\[([^\]\n|#^]+)(?:[#^][^\]\n|]*)?(?:\|[^\]\n]*)?\]\]/g;
const LIST_STEP = /^[ \t]*(?:(\d{1,3})[.)]|[-*+][ \t]+\[([ xX])\])[ \t]+(.+)$/;

function linkKind(url: string, context: string): LibrarianLink["kind"] {
  if (url.startsWith("mailto:")) return "email";
  let hostAndPath = "";
  try { const u = new URL(url); hostAndPath = u.hostname + u.pathname; } catch { return "link"; }
  const host = hostAndPath.split("/")[0];
  return FORM_HOSTS.test(host) || FORM_HOSTS.test(hostAndPath) || FORM_WORDS.test(context) || FORM_WORDS.test(hostAndPath.replace(/[-_/.]+/g, " ")) ? "form" : "link";
}

function linksIn(text: string, into: LibrarianLink[], seen: Set<string>): void {
  const add = (url: string, label: string, line: string) => {
    if (into.length >= LIBRARIAN_LIMITS.linksPerNote || url.length > 2000 || seen.has(url)) return;
    try { new URL(url); } catch { return; }
    seen.add(url);
    let host = "";
    try { host = new URL(url).hostname; } catch { /* mailto */ }
    const clean = label.replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim();
    into.push({ url, label: clip(clean || host || url, 120), kind: linkKind(url, `${clean} ${line}`) });
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.length > 4000) continue;
    MD_LINK.lastIndex = 0;
    let rest = line;
    for (const m of line.matchAll(MD_LINK)) { add(m[2], m[1], line.replace(MD_LINK, "$1")); rest = rest.replace(m[0], " "); }
    BARE_URL.lastIndex = 0;
    for (const m of rest.matchAll(BARE_URL)) {
      const url = m[1].replace(/[.,;:!?]+$/, "");
      add(url, rest.replace(m[1], " ").replace(/^[\s\-*+>\d.)]+/, ""), rest);
    }
  }
}

/**
 * Best passages, web links, list steps and note links of one note for the
 * given word weights (stem -> weight). Only the first
 * LIBRARIAN_LIMITS.scanChars of the note are examined.
 */
export function extractFromNote(raw: string, weights: ReadonlyMap<string, number>): Pick<LibrarianHit, "passages" | "links" | "steps" | "noteLinks"> {
  const fm = FRONTMATTER.exec(raw);
  const from = fm ? fm[0].length : 0;
  const to = Math.min(raw.length, from + LIBRARIAN_LIMITS.scanChars);
  const blocks: Block[] = [];
  let heading = "", headingStart = from, headingWeight = 0;
  let blockStart = -1, blockEnd = -1;
  const value = (text: string): number => {
    const seen = new Map<string, number>();
    for (const w of wordsOf(text)) { const key = stem(w); if (weights.has(key)) seen.set(key, (seen.get(key) ?? 0) + 1); }
    let v = 0;
    for (const [key, count] of seen) v += weights.get(key)! * (1 + 0.2 * Math.min(count - 1, 3));
    return v;
  };
  const flush = () => {
    if (blockStart < 0) return;
    const text = raw.slice(blockStart, blockEnd);
    if (text.trim()) blocks.push({ start: blockStart, end: blockEnd, heading, headingStart, score: value(text) + 0.5 * headingWeight });
    blockStart = -1;
  };
  let at = from;
  while (at < to) {
    let eol = raw.indexOf("\n", at);
    if (eol < 0 || eol > to) eol = to;
    const line = raw.slice(at, eol);
    const h = /^#{1,6}[ \t]+(.+?)[ \t\r]*$/.exec(line);
    if (h) {
      flush();
      heading = h[1].replace(/[ \t]+#+$/, "");
      headingStart = at;
      headingWeight = value(heading);
    } else if (!line.trim()) flush();
    else {
      if (blockStart < 0) blockStart = at;
      blockEnd = eol;
      if (blockEnd - blockStart > LIBRARIAN_LIMITS.passageChars * 1.5) flush();
    }
    at = eol + 1;
  }
  flush();

  const best = blocks.filter((b) => b.score > 0).sort((a, b) => (b.score - a.score) || (a.start - b.start)).slice(0, LIBRARIAN_LIMITS.passagesPerNote);
  const chosen = best.length ? best : blocks.slice(0, 1);
  const passages: LibrarianPassage[] = chosen.map((b) => ({
    ...(b.heading ? { heading: clip(b.heading, 160) } : {}),
    text: clip(tidy(raw.slice(b.start, b.end)), LIBRARIAN_LIMITS.passageChars),
    offsetChars: b.start,
  }));

  /* The section holding the best passage: its heading to the next heading. */
  const links: LibrarianLink[] = [];
  const steps: LibrarianStep[] = [];
  const noteLinks: string[] = [];
  const seen = new Set<string>();
  if (chosen.length) {
    const top = chosen[0];
    const next = blocks.find((b) => b.headingStart > top.headingStart);
    const section = raw.slice(top.headingStart, Math.min(next ? next.headingStart : to, top.headingStart + LIBRARIAN_LIMITS.sectionChars));
    linksIn(section, links, seen);
    for (const line of section.split(/\r?\n/)) {
      const m = LIST_STEP.exec(line);
      if (!m || steps.length >= LIBRARIAN_LIMITS.stepsPerNote) continue;
      const text = clip(m[3].replace(/[ \t]+/g, " ").trim(), LIBRARIAN_LIMITS.stepChars);
      steps.push(m[2] !== undefined ? { text, done: m[2] !== " " } : { text });
    }
    NOTE_LINK.lastIndex = 0;
    for (const m of section.matchAll(NOTE_LINK)) {
      const target = m[2].trim();
      if (m[1] || !target || noteLinks.includes(target) || noteLinks.length >= LIBRARIAN_LIMITS.noteLinksPerNote) continue;
      noteLinks.push(target);
    }
  }
  // Then the rest of the note, so a form linked elsewhere in it is still offered.
  if (links.length < LIBRARIAN_LIMITS.linksPerNote) linksIn(raw.slice(from, to), links, seen);
  // A note whose steps sit under a neighbouring heading still has steps worth showing.
  if (!steps.length) {
    for (const line of raw.slice(from, to).split(/\r?\n/)) {
      const m = LIST_STEP.exec(line);
      if (!m || steps.length >= LIBRARIAN_LIMITS.stepsPerNote) continue;
      const text = clip(m[3].replace(/[ \t]+/g, " ").trim(), LIBRARIAN_LIMITS.stepChars);
      steps.push(m[2] !== undefined ? { text, done: m[2] !== " " } : { text });
    }
  }
  if (!noteLinks.length) {
    NOTE_LINK.lastIndex = 0;
    for (const m of raw.slice(from, to).matchAll(NOTE_LINK)) {
      const target = m[2].trim();
      if (m[1] || !target || noteLinks.includes(target) || noteLinks.length >= LIBRARIAN_LIMITS.noteLinksPerNote) continue;
      noteLinks.push(target);
    }
  }
  return { passages, links, steps, noteLinks };
}

/* ------------------------------------------------------------------ briefing */

const BRIEF_HITS = 6;
const BRIEF_STEPS = 5;
const BRIEF_LINKS = 6;
const BRIEF_NOTES = 5;

/**
 * Markdown rendering of one response, for an agent to read or quote. Fixed
 * order, fixed caps, no timestamps: the same response always renders the same
 * text. Forms come before other links because they are usually the next action.
 */
export function renderLibrarianBrief(response: Omit<LibrarianResponse, "coverage" | "corpusRevision"> | LibrarianResponse): string {
  const lines: string[] = [];
  const hits = response.hits.slice(0, BRIEF_HITS);
  if (!hits.length) {
    return `No shared note answers this.${response.terms.length ? ` Searched for: ${response.terms.join(", ")}.` : ""}`;
  }
  lines.push(`**${hits.length} of ${response.total} matching notes** — confidence: ${response.confidence}.`);
  if (response.corrections.length) lines.push(`Read as: ${response.corrections.map((c) => `${c.from} → ${c.to}`).join(", ")}.`);
  hits.forEach((hit, i) => {
    lines.push("", `${i + 1}. **${hit.title}** — ${hit.path}`);
    const passage = hit.passages[0];
    if (passage) {
      const quote = passage.text.split(/\r?\n/).join("\n   > ");
      lines.push(`   > ${quote}`);
    }
    for (const [n, step] of hit.steps.slice(0, BRIEF_STEPS).entries()) {
      lines.push(`   ${n + 1}. ${step.done === true ? "[done] " : ""}${step.text}`);
    }
    const ordered = [...hit.links.filter((l) => l.kind === "form"), ...hit.links.filter((l) => l.kind !== "form")];
    for (const link of ordered.slice(0, BRIEF_LINKS)) {
      const suffix = link.kind === "form" ? " (form)" : link.kind === "email" ? " (email)" : "";
      lines.push(`   - ${link.label}: ${link.url}${suffix}`);
    }
    if (hit.noteLinks.length) {
      lines.push(`   Related notes: ${hit.noteLinks.slice(0, BRIEF_NOTES).map((target) => `[[${target}]]`).join(", ")}`);
    }
  });
  return lines.join("\n");
}
