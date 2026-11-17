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
 * computed from the requester's own notes (the pool): document frequencies,
 * note counts, corrections and expansion words never depend on a note the
 * requester cannot read, nor on a note that was deleted. The shared
 * vocabulary only maps words to ids; whether a word counts is decided by the
 * pool. One limit remains: the vocabulary holds at most
 * LIBRARIAN_LIMITS.maxVocabulary words for the whole corpus, so once it is
 * full a new word in any note gets no id and cannot be matched by words.
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
/**
 * One test the confidence decision evaluated, about the first hit:
 * no_hits                 nothing matched, so confidence is none;
 * coverage_below_threshold its words carry less of the question than "strong" needs;
 * not_about_question      the question's words are not mostly in its title, aliases, tags or file name;
 * no_word_match           no question word is in it (found by name or meaning only);
 * exact_name              the question is its name, word for word;
 * close_name              its name reads like the question and it carries half the question's weight;
 * semantic_agrees         the closest by meaning is also first by words or name;
 * phrase_missing          a quoted phrase is not in it;
 * rival_note              one of the next notes carries the whole question and it does not.
 */
export type LibrarianConfidenceReason = "no_hits" | "coverage_below_threshold" | "not_about_question" | "no_word_match" |
  "exact_name" | "close_name" | "semantic_agrees" | "phrase_missing" | "rival_note";

export interface LibrarianRequest {
  question: string;
  /** Hits to return, 1..LIBRARIAN_LIMITS.maxFetch. */
  limit?: number;
  /** Paths the requester may see; applied before anything is examined. null = whole corpus (the local user). */
  allowedPaths: ReadonlySet<string> | null;
  policyGeneration?: number;
  signal?: AbortSignal;
  /**
   * Notes ranked by meaning (0.9.5 semantic search), best first. Fused as a
   * fourth list. A path outside the requester's notes is ignored, so this can
   * never widen what a requester sees.
   */
  semantic?: readonly SemanticCandidate[];
}

/** One note found by meaning: its best passage and how close it is to the question. */
export interface SemanticCandidate {
  path: string;
  /** Cosine similarity of the question and the passage, -1..1. */
  score: number;
  /** Start of that passage in the raw note, UTF-16 code units. */
  offsetChars: number;
}

export const SEMANTIC_LIMITS = {
  /** Candidates accepted per question. */
  candidates: 100,
  /** Related notes offered per answer. */
  related: 6,
} as const;

/** How semantic search took part in one answer. */
export interface LibrarianSemanticInfo {
  /**
   * ready     the whole index was used;
   * partial   used, but some notes are not embedded yet;
   * off       semantic search is not set up (lexical only);
   * loading   the model or index is still being loaded (lexical only);
   * error     semantic search failed for this question (lexical only).
   */
  state: "ready" | "partial" | "off" | "loading" | "error";
  /** Display name of the embedding model. */
  model?: string;
  /** Candidates the semantic list contributed to this answer. */
  candidates: number;
  /** Plain-language reason when state is off, loading or error. */
  detail?: string;
}

/** A note close in meaning to one of the answers: usually the neighbouring step or a sibling process. */
export interface LibrarianRelated {
  path: string;
  title: string;
  /** The answer it is related to. */
  relatedTo: string;
  /** "linked" = that answer links to it; "similar" = close in meaning. */
  reason: "linked" | "similar";
  /** Cosine similarity, when found by meaning. */
  score?: number;
}

export interface LibrarianPassage {
  /** Nearest heading above the passage, when there is one. */
  heading?: string;
  /** Original spelling; spaces collapsed, line breaks kept. */
  text: string;
  /** Start of the passage in the raw note, UTF-16 code units. */
  offsetChars: number;
  /**
   * End (exclusive) of the source block the passage was cut from, UTF-16 code
   * units: raw.slice(offsetChars, endChars) is that block exactly as written,
   * before spaces are collapsed or the text is clipped.
   */
  endChars?: number;
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
  ranks: { lexical?: number; expanded?: number; name?: number; semantic?: number };
  /** Cosine similarity of the question and this note's closest passage, when found by meaning. */
  semanticScore?: number;
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
  /**
   * Question words found in no note the requester may read, after spelling
   * correction. They matched nothing, so the answer rests on the other words.
   */
  unmatched: string[];
  /** Quoted phrases found in no note the requester may read. */
  phrasesMissing: string[];
  /** Notes that appeared in any list. */
  total: number;
  hits: LibrarianHit[];
  confidence: LibrarianConfidence;
  /** The tests that decided `confidence`, as stable codes (see LibrarianConfidenceReason). */
  confidenceReasons?: LibrarianConfidenceReason[];
  coverage: SearchCoverage;
  corpusRevision: number;
  /** Present when the answer came through the hybrid (lexical + semantic) path. */
  semantic?: LibrarianSemanticInfo;
  /** Notes worth reading next. */
  related?: LibrarianRelated[];
}

/* ---------------------------------------------------------------------- words */

const WORD_CHAR = /[\p{L}\p{N}]/u;
const HAS_DIGIT = /\d/;

/**
 * Word scanner. A word is a run of letters and digits, what
 * /[\p{L}\p{N}]+/gu matches, found without a RegExp match object per word:
 * indexing a note is mostly this loop. CLASS caches the answer per UTF-16
 * code unit (0 = not yet asked, 1 = letter or digit, 2 = neither); characters
 * outside the Basic Multilingual Plane are asked once each and kept in ASTRAL.
 *
 * One exception: the language names "C++", "G++", "C#" and "F#" are words.
 * Read as a run of letters they are the single letter "c", which is too short
 * to index, so a question about C++ could not find the notes about it.
 */
const CLASS = new Uint8Array(0x10000);
for (let c = 0; c < 128; c++) CLASS[c] = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ? 1 : 2;
const ASTRAL = new Map<number, number>();
function astralClass(codePoint: number): number {
  let cls = ASTRAL.get(codePoint);
  if (cls === undefined) {
    cls = WORD_CHAR.test(String.fromCodePoint(codePoint)) ? 1 : 2;
    if (ASTRAL.size < 4096) ASTRAL.set(codePoint, cls);
  }
  return cls;
}

/** Start of the word last returned by nextWord. Read it before anything else can call nextWord. */
let wordStart = 0;
/** End (exclusive) of the first word at or after `from`, with its start in `wordStart`; -1 when there is none. */
function nextWord(text: string, from: number): number {
  const n = text.length;
  let start = -1;
  for (let i = from; i < n; i++) {
    const c = text.charCodeAt(i);
    let cls = CLASS[c];
    let width = 1;
    if (cls === 0) {
      if (c < 0xd800 || c > 0xdfff) cls = CLASS[c] = WORD_CHAR.test(text[i]) ? 1 : 2;
      else if (c <= 0xdbff && i + 1 < n) {
        const low = text.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) { cls = astralClass(((c - 0xd800) << 10) + (low - 0xdc00) + 0x10000); width = 2; } else cls = 2;
      } else cls = 2;
    }
    if (cls === 1) { if (start < 0) start = i; } else if (start >= 0) { wordStart = start; return i - start === 1 ? i + symbolTail(text, start, i) : i; }
    i += width - 1;
  }
  if (start < 0) return -1;
  wordStart = start;
  return n;
}

/** Length of the "++" or "#" that completes a language name whose letter is at `at` (0 when there is none). */
function symbolTail(text: string, at: number, end: number): number {
  const letter = text.charCodeAt(at) | 32;
  const next = text.charCodeAt(end);
  if (next === 43) return (letter === 99 || letter === 103) && text.charCodeAt(end + 1) === 43 && text.charCodeAt(end + 2) !== 43 ? 2 : 0;
  if (next !== 35 || (letter !== 99 && letter !== 102)) return 0;
  // "c#" then a letter or digit is a link fragment or a tag, not the language.
  const after = text.charCodeAt(end + 1);
  return Number.isNaN(after) || (CLASS[after] || (WORD_CHAR.test(text[end + 1]) ? 1 : 2)) === 2 ? 1 : 0;
}
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
  const searchable = toSearchable(text).text;
  for (let end = nextWord(searchable, 0); end >= 0; end = nextWord(searchable, end)) out.push(searchable.slice(wordStart, end));
  return out;
}

/** The words of `text` exactly as the index sees them (no lowercasing). Exported for the tokenizer's own test. */
export function scanWords(text: string): string[] {
  const out: string[] = [];
  for (let end = nextWord(text, 0); end >= 0; end = nextWord(text, end)) out.push(text.slice(wordStart, end));
  return out;
}

const usable = (word: string) => word.length >= 2 && word.length <= LIBRARIAN_LIMITS.maxWordChars && !STOP.has(word);

/* ----------------------------------------------------------------- vocabulary */

/** Word -> id. Ids are never reused; a removed note's words stay (document frequency drops to 0). */
export class Vocabulary {
  private readonly ids = new Map<string, number>();
  readonly terms: string[] = [];
  /**
   * Word as written -> id of its stem (SKIP_WORD for a word that is never
   * indexed). Scratch for indexing many notes in a row: one lookup instead of
   * the stop-word test, the stemmer and the vocabulary lookup. Its keys are
   * slices of note text, so it is dropped by release() once a batch is in.
   */
  private written = new Map<string, number>();

  /** Id for `term`, assigning one unless the vocabulary is full (-1). */
  id(term: string): number {
    let id = this.ids.get(term);
    if (id === undefined) {
      if (this.terms.length >= LIBRARIAN_LIMITS.maxVocabulary) return -1;
      id = this.terms.length;
      // A fresh copy: a word cut out of a note would otherwise keep that whole
      // note's text alive for as long as the vocabulary lives, after the note
      // was edited or deleted.
      const own = Array.from(term).join("");
      this.terms.push(own);
      this.ids.set(own, id);
    }
    return id;
  }

  lookup(term: string): number { return this.ids.get(term) ?? -1; }

  /** Id recorded for a word as written, or undefined when it has not been seen in this batch. */
  writtenId(word: string): number | undefined { return this.written.get(word); }
  rememberWritten(word: string, id: number): void {
    if (this.written.size >= WRITTEN_WORDS_MAX) this.written.clear();
    this.written.set(word, id);
  }
  /** Drop the indexing scratch. Changes no answer. */
  release(): void { if (this.written.size) this.written = new Map(); }
}

/** Marks a written word that is not indexed: a stop word. */
const SKIP_WORD = -1;
const WRITTEN_WORDS_MAX = 250_000;
/** Per-note word counts by vocabulary id, and the ids touched; reset after every note. */
let COUNTS = new Uint32Array(1 << 15);
let TOUCHED = new Uint32Array(1 << 12);

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
  const body = p.body;
  const { maxDocTerms, maxWordChars } = LIBRARIAN_LIMITS;
  let length = 0;
  let distinct = 0;
  for (let end = nextWord(body, 0); end >= 0; end = nextWord(body, end)) {
    length++;
    const size = end - wordStart;
    if (size < 2 || size > maxWordChars) continue;
    const word = body.slice(wordStart, end);
    let id = vocab.writtenId(word);
    if (id === undefined) {
      if (STOP.has(word)) { vocab.rememberWritten(word, SKIP_WORD); continue; }
      const key = stem(word);
      id = vocab.lookup(key);
      if (id < 0) {
        // A word new to the vocabulary: not taken (and not remembered) when this note or the vocabulary is full.
        if (distinct >= maxDocTerms) continue;
        id = vocab.id(key);
        if (id < 0) continue;
      }
      vocab.rememberWritten(word, id);
    } else if (id === SKIP_WORD) continue;
    if (id >= COUNTS.length) { const grown = new Uint32Array(Math.max(COUNTS.length * 2, id + 1)); grown.set(COUNTS); COUNTS = grown; }
    if (COUNTS[id] === 0) {
      if (distinct >= maxDocTerms) continue;
      if (distinct >= TOUCHED.length) { const grown = new Uint32Array(TOUCHED.length * 2); grown.set(TOUCHED); TOUCHED = grown; }
      TOUCHED[distinct++] = id;
    }
    COUNTS[id]++;
  }
  const ids = TOUCHED.slice(0, distinct).sort();
  const tfs = new Uint16Array(distinct);
  for (let i = 0; i < distinct; i++) { const id = ids[i]; tfs[i] = Math.min(65535, COUNTS[id]); COUNTS[id] = 0; }

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

/**
 * The Librarian's corpus-wide state: the vocabulary and document frequencies.
 * Vectors are held by the caller. The frequencies describe every note, so a
 * question asked over fewer notes must not use them (see runLibrarian).
 */
export class LibrarianIndex {
  readonly vocab = new Vocabulary();
  private df: number[] = [];

  add(v: DocVector): void { for (const id of v.ids) this.df[id] = (this.df[id] ?? 0) + 1; }
  remove(v: DocVector): void { for (const id of v.ids) this.df[id] = Math.max(0, (this.df[id] ?? 0) - 1); }
  clear(): void { this.df = []; }
  /** Document frequency by id over every note added (undefined for an id no note has had). */
  get frequencies(): ArrayLike<number> { return this.df; }
}

/** Document frequency by id within `pool`: how many of its notes contain each word. One pass over the pool. */
export function scopedFrequencies(pool: readonly LibrarianEntry[], vocabularySize: number): Uint32Array {
  const df = new Uint32Array(vocabularySize);
  for (const e of pool) { const ids = e.vector.ids; for (let k = 0; k < ids.length; k++) df[ids[k]]++; }
  return df;
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

/** Rows of the edit-distance table, reused across calls (a correction compares one word with thousands). */
let ROW_A = new Uint16Array(64);
let ROW_B = new Uint16Array(64);

/** Share of the question's weight the best match must carry before related words are learned from the matches. */
const FEEDBACK_MIN_COVERAGE = 0.6;

/** The filler word one edit away from `word` ("" when there is none). Short words are left alone: too many are one edit from another. */
function nearStopWord(word: string): string {
  if (word.length < 4) return "";
  let found = "";
  for (const stop of STOP) {
    if (Math.abs(stop.length - word.length) > 1 || editDistance(word, stop, 1) > 1) continue;
    // Of several, the one the typed word begins (a dropped last letter), then the first in the alphabet.
    const better = !found || (stop.startsWith(word) !== found.startsWith(word) ? stop.startsWith(word) : stop < found);
    if (better) found = stop;
  }
  return found;
}

/** How many notes after the first are checked for one that answers more of the question. */
const RIVAL_DEPTH = 5;

/** Edit distance, or `max + 1` as soon as it must exceed `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (b.length >= ROW_A.length) { ROW_A = new Uint16Array(b.length + 1); ROW_B = new Uint16Array(b.length + 1); }
  let prev = ROW_A;
  let cur = ROW_B;
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

/**
 * Vocabulary ids close to `word` (same first letter) that occur in at least
 * one note of the pool (`df` > 0), nearest first, then alphabetical. A word
 * only in notes outside the pool, or only in deleted notes, is never listed.
 */
function nearest(vocab: Vocabulary, word: string, df: ArrayLike<number>): { id: number; distance: number }[] {
  if (word.length < 4 || HAS_DIGIT.test(word)) return [];
  const max = word.length >= 8 ? 2 : 1;
  const first = word.charCodeAt(0);
  const found: { id: number; distance: number; term: string }[] = [];
  const terms = vocab.terms;
  for (let id = 0; id < terms.length; id++) {
    const term = terms[id];
    if (term.charCodeAt(0) !== first || term === word || !(df[id] > 0)) continue;
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
const LIST_WEIGHT = { lexical: 1, expanded: 0.7, name: 0.8, semantic: 1 } as const;
/** How many notes each ranked list keeps before fusion: the ranking window. */
export const LIST_DEPTH = { lexical: 100, expanded: 100, name: 50, semantic: 100 } as const;
const NAME_MIN = 0.5;

/**
 * The question's trigrams as an open-addressing hash set, so that counting the
 * trigrams a name shares costs one probe per trigram of the name. Every note's
 * names are compared with every question, which makes this the inner loop of
 * the name list. Slots hold index + 1 into `grams`; 0 is empty.
 */
class GramSet {
  private readonly slots: Int32Array;
  private readonly mask: number;
  constructor(private readonly grams: Uint32Array) {
    let size = 16;
    while (size < grams.length * 4) size *= 2;
    this.slots = new Int32Array(size);
    this.mask = size - 1;
    for (let k = 0; k < grams.length; k++) {
      let at = Math.imul(grams[k], 0x9e3779b1) >>> 0 & this.mask;
      while (this.slots[at]) at = (at + 1) & this.mask;
      this.slots[at] = k + 1;
    }
  }
  /** Similarity of the question's words to one name: how much of the name the question covers, tempered by Dice. */
  similarity(name: Uint32Array): number {
    const { grams, slots, mask } = this;
    if (name.length < 3 || !grams.length) return 0;
    let common = 0;
    for (let k = 0; k < name.length; k++) {
      const gram = name[k];
      let at = Math.imul(gram, 0x9e3779b1) >>> 0 & mask;
      for (let slot = slots[at]; slot; slot = slots[at = (at + 1) & mask]) if (grams[slot - 1] === gram) { common++; break; }
    }
    if (!common) return 0;
    return 0.6 * (common / name.length) + 0.4 * ((2 * common) / (grams.length + name.length));
  }
}

/**
 * Rank `pool` (the requester's notes, in any order) for one question.
 * Synchronous: the caller gathers the pool in bounded batches, then calls this.
 *
 * `index` supplies only the vocabulary (word <-> id). Every statistic comes
 * from the pool: `opts.frequencies` must be the pool's document frequency by
 * id, scopedFrequencies(pool, ...) or, when the pool is every note added to
 * `index`, index.frequencies. Left out, it is computed here from the pool.
 * So with the pool unchanged, adding, editing or removing notes outside it
 * changes nothing in the answer.
 */
export function runLibrarian(question: unknown, pool: readonly LibrarianEntry[], index: LibrarianIndex, opts: { limit?: number; semantic?: readonly SemanticCandidate[]; frequencies?: ArrayLike<number> } = {}): Omit<LibrarianResponse, "coverage" | "corpusRevision"> {
  const parsed = parseQuestion(question);
  const limit = Math.max(1, Math.min(LIBRARIAN_LIMITS.maxFetch, Math.floor(opts.limit ?? LIBRARIAN_LIMITS.defaultResults)));
  const n = pool.length;
  const df = opts.frequencies ?? scopedFrequencies(pool, index.vocab.terms.length);
  let totalLength = 0;
  for (const e of pool) totalLength += e.vector.length;
  const avgdl = n ? Math.max(1, totalLength / n) : 1;

  /**
   * How often each of several words occurs in every note: one pass over the
   * notes for all the words. `ids` must be distinct (-1 = not in the
   * vocabulary). They are looked up in ascending order, so each search starts
   * where the previous one ended and a note's word list is visited once.
   */
  const columns = (ids: readonly number[]): { col: Uint16Array; df: number }[] => {
    const out = ids.map(() => ({ col: new Uint16Array(n), df: 0 }));
    const order = ids.map((_, k) => k).filter((k) => ids[k] >= 0).sort((a, b) => ids[a] - ids[b]);
    const wanted = order.map((k) => ids[k]);
    const m = wanted.length;
    if (!m) return out;
    for (let i = 0; i < n; i++) {
      const v = pool[i].vector;
      const sorted = v.ids;
      const last = sorted.length - 1;
      let lo = 0;
      for (let j = 0; j < m && lo <= last; j++) {
        const id = wanted[j];
        let hi = last;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const x = sorted[mid];
          if (x < id) lo = mid + 1;
          else if (x > id) hi = mid - 1;
          else { const o = out[order[j]]; o.col[i] = v.tfs[mid]; o.df++; lo = mid + 1; break; }
        }
      }
    }
    return out;
  };
  const column = (id: number): { col: Uint16Array; df: number } => columns([id])[0];

  /* Question words; a word found nowhere in scope is replaced by the nearest word that is. */
  const terms: Term[] = [];
  const corrections: { from: string; to: string }[] = [];
  const askedIds = parsed.stems.map((key) => index.vocab.lookup(key));
  const askedColumns = columns(askedIds);
  for (let k = 0; k < parsed.stems.length; k++) {
    const key = parsed.stems[k];
    const id = askedIds[k];
    let term: Term = { word: parsed.words[k], id, ...askedColumns[k], weight: 1, expanded: false };
    if (term.df === 0) {
      let best: Term | null = null;
      let bestDistance = Infinity;
      for (const candidate of nearest(index.vocab, key, df).slice(0, LIBRARIAN_LIMITS.correctionCandidates)) {
        if (candidate.distance > bestDistance) break;
        const c = column(candidate.id);
        if (c.df > 0 && (!best || c.df > best.df)) { best = { word: index.vocab.terms[candidate.id], id: candidate.id, ...c, weight: 1, expanded: false }; bestDistance = candidate.distance; }
      }
      // A misspelt filler word ("wher" for "where") is filler: it is read as that
      // word and left out, as the word itself would have been. Otherwise it would
      // count as a question word no note can match and pull every answer down.
      const filler = bestDistance > 1 && parsed.stems.length > 1 ? nearStopWord(term.word) : "";
      if (filler) { corrections.push({ from: term.word, to: filler }); continue; }
      if (best && !terms.some((t) => t.id === best!.id)) { corrections.push({ from: term.word, to: best.word }); term = best; }
    }
    terms.push(term);
  }
  const asked = terms.length;

  const idf = (df: number, docs: number) => Math.log(1 + (docs - df + 0.5) / (df + 0.5));
  /** BM25 length normalisation per note, computed once per question. */
  const norm = new Float64Array(n);
  for (let i = 0; i < n; i++) norm[i] = K1 * (1 - B + B * pool[i].vector.length / avgdl);
  let totalIdf = 0;
  let rareId = -1;
  let rareIdf = 0;
  for (const t of terms) {
    const weight = idf(Math.max(t.df, 1), Math.max(n, 1));
    totalIdf += weight;
    if (t.df && weight > rareIdf) { rareIdf = weight; rareId = t.id; }
  }
  const matched = new Uint8Array(n);
  const matchedIdf = new Float64Array(n);
  const nameIdf = new Float64Array(n);
  const rareMatch = new Uint8Array(n);
  /** Add one word's BM25 contribution to `s`. A question word (not an expansion word) also counts towards coverage. */
  const accumulate = (t: Term, s: Float64Array): void => {
    if (!t.df) return;
    const weight = idf(t.df, n);
    const w = t.weight * weight;
    const col = t.col;
    for (let i = 0; i < n; i++) {
      const tf = col[i];
      if (!tf) continue;
      const v = pool[i].vector;
      s[i] += w * (tf * (K1 + 1)) / (tf + norm[i]);
      if (find(v.head, t.id) >= 0) s[i] += w * HEAD_BONUS;
      if (!t.expanded) {
        matched[i]++;
        matchedIdf[i] += weight;
        if (find(v.nameHead, t.id) >= 0) nameIdf[i] += weight;
        if (t.id === rareId) rareMatch[i] = 1;
      }
    }
  };
  /**
   * Coverage is weighted by how rare each question word is: matching "new" and
   * "request" (which occur everywhere) must not look like answering a question
   * whose rarest word is "laptop".
   */
  const coverage = new Float64Array(n);
  const specificity = new Float64Array(n);
  /** Scale the summed BM25 by coverage, the rarest word and aboutness. Call after every question word is accumulated. */
  const finish = (s: Float64Array): Float64Array => {
    // The rarest question word is what makes the question that question, and a
    // note whose title, aliases, tags or file name carry the words is about the
    // topic rather than merely mentioning it.
    for (let i = 0; i < n; i++) if (s[i]) s[i] *= (0.25 + 0.75 * coverage[i]) * (rareMatch[i] ? 1.25 : 0.75) * (1 + 1.5 * specificity[i]);
    return s;
  };
  const byPath = (a: number, b: number) => (pool[a].prepared.doc.path < pool[b].prepared.doc.path ? -1 : 1);
  /**
   * The `depth` best notes by score, ties by path: the list a full sort would
   * give. Most questions match thousands of notes and keep a hundred, so the
   * best are held in a small heap (worst on top) and only those are sorted.
   */
  const ranked = (s: ArrayLike<number>, keep: (i: number) => boolean, depth: number): number[] => {
    const heap: number[] = [];
    const after = (a: number, b: number) => s[a] < s[b] || (s[a] === s[b] && byPath(a, b) > 0);
    for (let i = 0; i < n; i++) {
      if (!(s[i] > 0) || !keep(i)) continue;
      if (heap.length < depth) {
        let at = heap.push(i) - 1;
        while (at > 0) {
          const up = (at - 1) >> 1;
          if (!after(heap[at], heap[up])) break;
          [heap[at], heap[up]] = [heap[up], heap[at]];
          at = up;
        }
      } else if (s[i] >= s[heap[0]] && after(heap[0], i)) {
        heap[0] = i;
        for (let at = 0; ;) {
          const left = 2 * at + 1, right = left + 1;
          let worst = at;
          if (left < depth && after(heap[left], heap[worst])) worst = left;
          if (right < depth && after(heap[right], heap[worst])) worst = right;
          if (worst === at) break;
          [heap[at], heap[worst]] = [heap[worst], heap[at]];
          at = worst;
        }
      }
    }
    return heap.sort((a, b) => (s[b] - s[a]) || byPath(a, b));
  };

  const raw = new Float64Array(n);
  for (const t of terms) accumulate(t, raw);
  for (let i = 0; i < n; i++) {
    coverage[i] = totalIdf > 0 ? Math.min(1, matchedIdf[i] / totalIdf) : 0;
    specificity[i] = totalIdf > 0 ? nameIdf[i] / totalIdf : 0;
  }
  const lexical = { s: finish(raw.slice()), matched, coverage, specificity };
  // A quoted phrase lifts the notes that contain it; it is not a filter.
  // phraseSeen[k]: some note in scope contains phrase k.
  const phraseSeen = parsed.phrases.map(() => false);
  if (parsed.phrases.length) for (let i = 0; i < n; i++) {
    const body = pool[i].prepared.body;
    for (let k = 0; k < parsed.phrases.length; k++) {
      // A note without a single question word is read only for a phrase no note has shown yet.
      if (!lexical.s[i] && phraseSeen[k]) continue;
      if (body.includes(parsed.phrases[k])) { phraseSeen[k] = true; if (lexical.s[i]) lexical.s[i] *= 1.5; }
    }
  }
  const lexicalOrder = ranked(lexical.s, (i) => lexical.matched[i] > 0, LIST_DEPTH.lexical);

  /* Expansion: words the best lexical matches share. */
  const expansion: Term[] = [];
  // Related words are learned from the best matches, so they are only as good as
  // those matches: when even the best note carries under 60% of the question's
  // weight there is nothing to learn from, and the words it would lend are noise.
  const grounded = lexicalOrder.length > 0 && lexical.coverage[lexicalOrder[0]] >= FEEDBACK_MIN_COVERAGE;
  const feedback = grounded ? lexicalOrder.slice(0, LIBRARIAN_LIMITS.feedbackDocs) : [];
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
      scored.push({ id, term, value: c.weight * idf(df[id], n) });
    }
    scored.sort((a, b) => (b.value - a.value) || (a.term < b.term ? -1 : 1));
    const chosen = scored.slice(0, LIBRARIAN_LIMITS.feedbackTerms);
    const chosenColumns = columns(chosen.map((c) => c.id));
    chosen.forEach((c, k) => expansion.push({ word: c.term, id: c.id, ...chosenColumns[k], weight: EXPANSION_WEIGHT, expanded: true }));
  }
  // The expanded list is the question's own sum plus the expansion words: nothing is scored twice.
  let expandedOrder: number[] = [];
  if (expansion.length) {
    for (const t of expansion) accumulate(t, raw);
    expandedOrder = ranked(finish(raw), () => true, LIST_DEPTH.expanded);
  }

  /* Names. */
  const questionGrams = new GramSet(trigrams(parsed.nameKey));
  const nameScore = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const v = pool[i].vector;
    let best = 0;
    for (let k = 0; k < v.grams.length; k++) {
      const sim = v.names[k] === parsed.nameKey ? 1 : questionGrams.similarity(v.grams[k]);
      if (sim > best) best = sim;
    }
    if (best >= NAME_MIN) nameScore[i] = best;
  }
  const nameOrder = ranked(nameScore, () => true, LIST_DEPTH.name);

  /* Fusion. */
  const fused = new Map<number, { score: number; ranks: LibrarianHit["ranks"] }>();
  const nameWeight = parsed.intent === "locate" ? 1.2 : LIST_WEIGHT.name;
  /* Meaning. Candidates arrive ranked; only notes in this requester's pool count. */
  const semanticOrder: number[] = [];
  const semanticAt = new Map<number, SemanticCandidate>();
  if (opts.semantic?.length) {
    const at = new Map<string, number>();
    for (let i = 0; i < n; i++) at.set(pool[i].prepared.doc.path, i);
    for (const c of opts.semantic) {
      if (semanticOrder.length >= LIST_DEPTH.semantic) break;
      const i = c && typeof c.path === "string" ? at.get(c.path) : undefined;
      if (i === undefined || semanticAt.has(i) || !Number.isFinite(c.score) || !Number.isFinite(c.offsetChars)) continue;
      semanticAt.set(i, c);
      semanticOrder.push(i);
    }
  }
  const fuse = (order: number[], list: "lexical" | "expanded" | "name" | "semantic", weight: number) => {
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
  fuse(semanticOrder, "semantic", LIST_WEIGHT.semantic);
  // A question that is a note's name (title, alias or file name, word for word)
  // is asking for that note: it comes first whatever the other lists say.
  const exact = (i: number) => (nameScore[i] >= 1 ? 1 : 0);
  const order = [...fused.keys()].sort((a, b) => (exact(b) - exact(a)) || (fused.get(b)!.score - fused.get(a)!.score) || byPath(a, b));

  const weights = new Map<string, number>();
  for (const t of terms) weights.set(index.vocab.terms[t.id] ?? stem(t.word), 1);
  for (const t of expansion) weights.set(index.vocab.terms[t.id], EXPANSION_WEIGHT);

  const hits: LibrarianHit[] = order.slice(0, limit).map((i) => {
    const { prepared, vector } = pool[i];
    const d = prepared.doc;
    const matchedTerms = terms.filter((t) => t.col[i] > 0).map((t) => t.word);
    const meaning = semanticAt.get(i);
    const extract = extractFromNote(d.raw, weights, meaning ? meaning.offsetChars : undefined);
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
    if (meaning) hit.semanticScore = Math.round(meaning.score * 1e4) / 1e4;
    if (d.uid !== undefined) hit.uid = d.uid;
    if (d.createdAt !== undefined) hit.createdAt = d.createdAt;
    if (d.updatedAt !== undefined) hit.updatedAt = d.updatedAt;
    return hit;
  });

  let confidence: LibrarianConfidence = "none";
  const confidenceReasons: LibrarianConfidenceReason[] = [];
  if (hits.length) {
    const top = order[0];
    const share = lexical.coverage[top];
    const strongWords = asked <= 2 ? share >= 0.99 : share >= 0.6;
    // "Strong" also needs the note to be about the question (a third of its
    // weight in the title, aliases, tags or headings), not merely to mention it.
    const about = lexical.specificity[top] >= 0.34;
    // A name that reads like the question is strong on its own only when it is
    // the question (an exact name) or the note also carries half of the
    // question's weight: "qwen embedding pooling" resembles a note named "Qwen
    // embedding" whether or not that note says anything about pooling.
    const named = nameScore[top] >= 1 || (nameScore[top] >= 0.8 && share >= 0.5);
    if (!strongWords) confidenceReasons.push("coverage_below_threshold");
    if (!about) confidenceReasons.push("not_about_question");
    if (!lexical.matched[top]) confidenceReasons.push("no_word_match");
    if (named) confidenceReasons.push(nameScore[top] >= 1 ? "exact_name" : "close_name");
    confidence = (strongWords && about && lexical.matched[top] > 0) || named ? "strong" : "weak";
    // Two independent readings agreeing on the same note: the closest by meaning
    // is also what the words (or the name) rank first, and it carries most of them.
    const ranks = fused.get(top)!.ranks;
    if (confidence === "weak" && ranks.semantic === 1 && (ranks.lexical === 1 || ranks.name === 1) && share >= 0.5) { confidence = "strong"; confidenceReasons.push("semantic_agrees"); }
    // Quoting a phrase asks for those exact words: a note without them is not a strong answer.
    if (!parsed.phrases.every((phrase) => pool[top].prepared.body.includes(phrase))) { confidence = "weak"; confidenceReasons.push("phrase_missing"); }
    // A note that leaves out part of the question is not the strong answer while
    // one of the next few notes carries all of it: the reader has to choose.
    if (nameScore[top] < 1 && share < 0.99 && order.slice(1, RIVAL_DEPTH).some((i) => lexical.coverage[i] >= 0.99 && lexical.specificity[i] >= 0.34)) { confidence = "weak"; confidenceReasons.push("rival_note"); }
  } else confidenceReasons.push("no_hits");

  return {
    contract: LIBRARIAN_CONTRACT,
    intent: parsed.intent,
    terms: terms.map((t) => t.word),
    corrections,
    expanded: expansion.map((t) => t.word),
    phrases: parsed.phrases,
    unmatched: terms.filter((t) => t.df === 0).map((t) => t.word),
    phrasesMissing: parsed.phrases.filter((_, k) => !phraseSeen[k]),
    total: fused.size,
    hits,
    confidence,
    confidenceReasons,
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
  // Only a line containing "://" or "mailto:" can hold a link, and most lines
  // of most notes hold neither: jump from one such line to the next instead of
  // running two patterns over every line.
  let scheme = text.indexOf("://");
  let mail = text.indexOf("mailto:");
  let at = 0;
  while (into.length < LIBRARIAN_LIMITS.linksPerNote) {
    if (scheme >= 0 && scheme < at) scheme = text.indexOf("://", at);
    if (mail >= 0 && mail < at) mail = text.indexOf("mailto:", at);
    const found = scheme < 0 ? mail : mail < 0 ? scheme : Math.min(scheme, mail);
    if (found < 0) break;
    const start = text.lastIndexOf("\n", found) + 1;
    const newline = text.indexOf("\n", found);
    const end = newline < 0 ? text.length : newline;
    at = end + 1;
    const line = text.slice(start, newline >= 0 && end > start && text.charCodeAt(end - 1) === 13 ? end - 1 : end);
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

/** List steps of `text`, up to the per-note cap, added to `steps`. */
function stepsIn(text: string, steps: LibrarianStep[]): void {
  let at = 0;
  while (at <= text.length && steps.length < LIBRARIAN_LIMITS.stepsPerNote) {
    const newline = text.indexOf("\n", at);
    const end = newline < 0 ? text.length : newline;
    const line = text.slice(at, newline >= 0 && end > at && text.charCodeAt(end - 1) === 13 ? end - 1 : end);
    at = end + 1;
    const m = LIST_STEP.exec(line);
    if (!m) continue;
    const step = clip(m[3].replace(/[ \t]+/g, " ").trim(), LIBRARIAN_LIMITS.stepChars);
    steps.push(m[2] !== undefined ? { text: step, done: m[2] !== " " } : { text: step });
  }
}

/**
 * Per question: word as written -> its stem when that stem carries weight, ""
 * when it does not. Passages are scored by reading every word of every note
 * returned, and the stemmer is the expensive part of that; each distinct word
 * is stemmed once per question. Keyed by the question's weight table, so it
 * goes away with the question.
 */
const STEM_MEMO = new WeakMap<ReadonlyMap<string, number>, Map<string, string>>();
const STEM_MEMO_MAX = 50_000;

/**
 * Best passages, web links, list steps and note links of one note for the
 * given word weights (stem -> weight). Only the first
 * LIBRARIAN_LIMITS.scanChars of the note are examined.
 */
export function extractFromNote(raw: string, weights: ReadonlyMap<string, number>, focusOffset?: number): Pick<LibrarianHit, "passages" | "links" | "steps" | "noteLinks"> {
  const fm = FRONTMATTER.exec(raw);
  const from = fm ? fm[0].length : 0;
  const to = Math.min(raw.length, from + LIBRARIAN_LIMITS.scanChars);
  const blocks: Block[] = [];
  let heading = "", headingStart = from, headingWeight = 0;
  let blockStart = -1, blockEnd = -1;
  let memo = STEM_MEMO.get(weights);
  if (!memo) STEM_MEMO.set(weights, memo = new Map());
  const value = (text: string): number => {
    const searchable = toSearchable(text).text;
    let seen: Map<string, number> | null = null;
    for (let end = nextWord(searchable, 0); end >= 0; end = nextWord(searchable, end)) {
      const word = searchable.slice(wordStart, end);
      let key = memo!.get(word);
      if (key === undefined) {
        const stemmed = stem(word);
        key = weights.has(stemmed) ? stemmed : "";
        if (memo!.size >= STEM_MEMO_MAX) memo!.clear();
        memo!.set(word, key);
      }
      if (key) (seen ??= new Map()).set(key, (seen.get(key) ?? 0) + 1);
    }
    let v = 0;
    if (seen) for (const [key, count] of seen) v += weights.get(key)! * (1 + 0.2 * Math.min(count - 1, 3));
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
    const h = raw.charCodeAt(at) === 35 ? /^#{1,6}[ \t]+(.+?)[ \t\r]*$/.exec(line) : null;
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
  let chosen = best.length ? best : blocks.slice(0, 1);
  // The passage found by meaning: shown first when no question word matched
  // anywhere in the note, otherwise kept as the second passage.
  if (focusOffset !== undefined && blocks.length) {
    let focus = blocks[0];
    for (const b of blocks) { if (b.start <= focusOffset) focus = b; else break; }
    if (!best.length) chosen = [focus];
    else if (!chosen.includes(focus)) chosen = [chosen[0], focus];
  }
  const passages: LibrarianPassage[] = chosen.map((b) => ({
    ...(b.heading ? { heading: clip(b.heading, 160) } : {}),
    text: clip(tidy(raw.slice(b.start, b.end)), LIBRARIAN_LIMITS.passageChars),
    offsetChars: b.start,
    endChars: b.end,
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
    stepsIn(section, steps);
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
  if (!steps.length) stepsIn(raw.slice(from, to), steps);
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
  const semantic = "semantic" in response ? response.semantic : undefined;
  const how = !semantic ? ""
    : semantic.state === "ready" ? " Searched by words and by meaning."
    : semantic.state === "partial" ? " Searched by words and by meaning (the semantic index is still being built, so some notes were matched by words only)."
    : ` Searched by words only${semantic.detail ? ` (${semantic.detail})` : ""}.`;
  // Older responses (and other producers of this contract) may not carry these two lists.
  const unmatched = response.unmatched ?? [];
  const phrasesMissing = response.phrasesMissing ?? [];
  const absent: string[] = [];
  if (unmatched.length) absent.push(`No shared note contains: ${unmatched.join(", ")}.`);
  if (phrasesMissing.length) absent.push(`No shared note contains the exact phrase${phrasesMissing.length === 1 ? "" : "s"}: ${phrasesMissing.map((p) => `"${p}"`).join(", ")}.`);
  if (!hits.length) {
    return `No shared note answers this.${response.terms.length ? ` Searched for: ${response.terms.join(", ")}.` : ""}${how}`;
  }
  // A note found by meaning alone is the closest one, which is not the same as
  // a match: an off-topic question has a closest note too. Say so, every time.
  const meaningOnly = (hit: LibrarianHit) => hit.ranks.semantic !== undefined && hit.ranks.lexical === undefined && hit.ranks.expanded === undefined && hit.ranks.name === undefined;
  if (hits.every(meaningOnly)) {
    lines.push(`**No shared note contains the words of this question.** The ${hits.length === 1 ? "note" : `${hits.length} notes`} closest in meaning ${hits.length === 1 ? "is" : "are"} listed; ${hits.length === 1 ? "it" : "they"} may be unrelated, so read before relying on ${hits.length === 1 ? "it" : "them"}.${how}`);
  } else {
    lines.push(`**${hits.length} of ${response.total} matching notes** — confidence: ${response.confidence}.${how}`);
  }
  if (response.corrections.length) lines.push(`Read as: ${response.corrections.map((c) => `${c.from} → ${c.to}`).join(", ")}.`);
  // What the answer does not rest on, said before the notes so nobody reads past it.
  if (absent.length && !hits.every(meaningOnly)) lines.push(absent.join(" "));
  hits.forEach((hit, i) => {
    lines.push("", `${i + 1}. **${hit.title}** — ${hit.path}${meaningOnly(hit) ? " — found by meaning only" : ""}`);
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
  const related = ("related" in response ? response.related ?? [] : []).slice(0, SEMANTIC_LIMITS.related);
  if (related.length) {
    lines.push("", "**Related processes — read next if the answer above is only part of the task:**");
    for (const r of related) {
      lines.push(`- **${r.title}** — ${r.path} — ${r.reason === "linked" ? "linked from" : "close in meaning to"} ${r.relatedTo}`);
    }
  }
  return lines.join("\n");
}
