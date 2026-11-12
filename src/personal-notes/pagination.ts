/**
 * Personal Notes (0.9.0) — exact note pages, contract `kosmos-personal-notes/1`.
 *
 * Offsets and lengths are UTF-16 code units. A page is an exact slice of the
 * raw Markdown (frontmatter and line endings included): concatenating the
 * pages of an unchanged note reproduces it exactly. No marker or prose is
 * ever inserted. A page never ends between the halves of a surrogate pair,
 * and an offset that points between them is invalid.
 */
import { PERSONAL_LIMITS, PersonalError } from "./types";
import { sha256Hex } from "./hash";

export interface PageRequest {
  /** Nonnegative safe integer. Default 0. */
  offsetChars?: number;
  /** Integer PERSONAL_LIMITS.pageMinChars..pageMaxChars. Default pageDefaultChars. */
  limitChars?: number;
  /** Required for a nonzero offset; validated and honored on page zero too. */
  expectedHash?: string;
}

export interface NotePage {
  content: string;
  content_hash: string;
  offset_chars: number;
  returned_chars: number;
  total_chars: number;
  truncated: boolean;
  next_offset_chars: number | null;
}

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/** True when `index` lies between the two halves of a well-formed surrogate pair. */
export function splitsSurrogatePair(text: string, index: number): boolean {
  return index > 0 && index < text.length && isHigh(text.charCodeAt(index - 1)) && isLow(text.charCodeAt(index));
}

/** Exact slice for one page. Throws `invalid_argument` for an offset beyond the end or inside a pair. */
export function slicePage(raw: string, offsetChars: number, limitChars: number): { content: string; end: number } {
  if (!Number.isSafeInteger(offsetChars) || offsetChars < 0) throw new PersonalError("invalid_argument", "offset_chars must be a nonnegative integer");
  if (!Number.isInteger(limitChars) || limitChars < PERSONAL_LIMITS.pageMinChars || limitChars > PERSONAL_LIMITS.pageMaxChars) {
    throw new PersonalError("invalid_argument", `limit_chars must be an integer from ${PERSONAL_LIMITS.pageMinChars} to ${PERSONAL_LIMITS.pageMaxChars}`);
  }
  if (offsetChars > raw.length) throw new PersonalError("invalid_argument", "offset_chars is beyond the end of the note");
  if (splitsSurrogatePair(raw, offsetChars)) throw new PersonalError("invalid_argument", "offset_chars points inside a surrogate pair");
  let end = Math.min(raw.length, offsetChars + limitChars);
  // limitChars >= 2 guarantees the shortened page is still nonempty.
  if (splitsSurrogatePair(raw, end)) end -= 1;
  return { content: raw.slice(offsetChars, end), end };
}

/**
 * Build one page of `raw`. `contentHash` may be supplied when the caller has
 * already hashed this exact string; otherwise it is computed. A nonzero offset
 * without an expected hash is `invalid_argument`; a hash mismatch is
 * `note_changed`.
 */
export async function readPage(raw: string, request: PageRequest = {}, contentHash?: string): Promise<NotePage> {
  const offset = request.offsetChars ?? 0;
  const limit = request.limitChars ?? PERSONAL_LIMITS.pageDefaultChars;
  if (offset !== 0 && request.expectedHash === undefined) {
    throw new PersonalError("invalid_argument", "expected_hash is required when offset_chars is not 0");
  }
  const hash = contentHash ?? await sha256Hex(raw);
  if (request.expectedHash !== undefined && request.expectedHash !== hash) {
    throw new PersonalError("note_changed", "the note changed since the earlier page; read it again from offset_chars 0");
  }
  const { content, end } = slicePage(raw, offset, limit);
  const truncated = end < raw.length;
  return {
    content,
    content_hash: hash,
    offset_chars: offset,
    returned_chars: content.length,
    total_chars: raw.length,
    truncated,
    next_offset_chars: truncated ? end : null,
  };
}
