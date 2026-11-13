/**
 * Semantic search (0.9.5) — split one note into passages to embed.
 *
 * Heading-aware: a passage never crosses a heading, and each carries the
 * nearest heading above it. Offsets are UTF-16 code units into the raw note,
 * the same unit the Librarian uses, so a passage found by meaning can be
 * shown from the note itself (the index stores no note text).
 *
 * Pure and deterministic: the same note always yields the same passages.
 */

export const CHUNK_LIMITS = {
  /** A passage is closed once it reaches this many characters. */
  targetChars: 1000,
  /** No passage is longer than this. */
  maxChars: 1400,
  /** Passages per note; the rest of a longer note is not embedded. */
  maxChunksPerNote: 120,
  /** Raw characters of one note examined. */
  scanChars: 400_000,
} as const;

export interface Chunk {
  /** Nearest heading above the passage, "" when there is none. */
  heading: string;
  /** Start in the raw note, UTF-16 code units. */
  offsetChars: number;
  lengthChars: number;
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
const HEADING = /^#{1,6}[ \t]+(.+?)[ \t\r]*$/;

/** Split [start, end) at sentence or line ends so no piece exceeds `max`. */
function splitLong(raw: string, start: number, end: number, max: number, out: Array<[number, number]>): void {
  let at = start;
  while (end - at > max) {
    const window = raw.slice(at, at + max);
    let cut = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "), window.lastIndexOf("。"));
    if (cut < max * 0.4) cut = window.lastIndexOf(" ");
    if (cut < max * 0.4) cut = max - 1;
    let next = at + cut + 1;
    // never split a surrogate pair
    const c = raw.charCodeAt(next);
    if (c >= 0xdc00 && c <= 0xdfff) next++;
    out.push([at, next]);
    at = next;
  }
  if (end > at) out.push([at, end]);
}

export function chunkNote(raw: string): Chunk[] {
  const fm = FRONTMATTER.exec(raw);
  const from = fm ? fm[0].length : 0;
  const to = Math.min(raw.length, from + CHUNK_LIMITS.scanChars);
  const chunks: Chunk[] = [];
  let heading = "";
  let start = -1, end = -1;
  const close = () => {
    if (start < 0) return;
    const pieces: Array<[number, number]> = [];
    splitLong(raw, start, end, CHUNK_LIMITS.maxChars, pieces);
    for (const [a, b] of pieces) {
      if (chunks.length >= CHUNK_LIMITS.maxChunksPerNote) break;
      if (raw.slice(a, b).trim()) chunks.push({ heading, offsetChars: a, lengthChars: b - a });
    }
    start = -1;
  };
  let at = from;
  let fence = false;
  while (at < to && chunks.length < CHUNK_LIMITS.maxChunksPerNote) {
    let eol = raw.indexOf("\n", at);
    if (eol < 0 || eol > to) eol = to;
    const line = raw.slice(at, eol);
    if (/^[ \t]*(```|~~~)/.test(line)) fence = !fence;
    const h = fence ? null : HEADING.exec(line);
    if (h) {
      close();
      heading = h[1].replace(/[ \t]+#+$/, "").slice(0, 160);
    } else if (!line.trim()) {
      // A blank line ends a passage only once it is long enough: short
      // paragraphs under one heading are embedded together, with their context.
      if (start >= 0 && end - start >= CHUNK_LIMITS.targetChars) close();
    } else {
      if (start < 0) start = at;
      end = eol;
      if (end - start >= CHUNK_LIMITS.maxChars) close();
    }
    at = eol + 1;
  }
  close();
  return chunks;
}

/** The text embedded for one passage: title and heading give a short passage its context. */
export function chunkText(raw: string, chunk: Chunk, title: string): string {
  const body = raw.slice(chunk.offsetChars, chunk.offsetChars + chunk.lengthChars).replace(/[ \t]+/g, " ").trim();
  const context = chunk.heading && chunk.heading !== title ? `${title} — ${chunk.heading}` : title;
  return context ? `${context}\n${body}` : body;
}

/**
 * Cheap change detector for a note's text: equal keys mean (for this purpose)
 * equal text. Not a security hash. Two independent 32-bit FNV-1a lanes plus the
 * length; sampled for very long notes so a full vault scan stays fast.
 */
export function contentKey(raw: string, title = ""): string {
  let a = 0x811c9dc5, b = 0x01000193;
  const mix = (code: number) => {
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ ((code << 5) | (code >>> 11)), 0x85ebca6b);
  };
  for (let i = 0; i < title.length; i++) mix(title.charCodeAt(i));
  mix(0xffff);
  const n = Math.min(raw.length, CHUNK_LIMITS.scanChars + 4096);
  for (let i = 0; i < n; i++) mix(raw.charCodeAt(i));
  return `${raw.length.toString(36)}-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}
