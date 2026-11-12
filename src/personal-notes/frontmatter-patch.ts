/**
 * Personal Notes (0.9.0) — narrow, byte-preserving frontmatter patcher.
 *
 * Pure. Edits only the lines of the top-level keys it is asked to change (or
 * adds a frontmatter block to a note that has none). Everything else — the
 * Markdown body, unrelated keys, comments, key order, quoting, line endings,
 * BOM and trailing-newline state — is kept byte for byte. There is no
 * whole-document reserialization.
 *
 * Safety model: a conservative line scanner classifies every top-level entry
 * (and refuses duplicate keys, tab indentation, orphan lines and unclosed
 * single-line quotes/brackets); the injected `parse` must be a strict YAML
 * parser that THROWS on malformed YAML (the plugin injects Obsidian's
 * `parseYaml`). After patching, both versions are parsed and every non-target
 * key must be deeply equal and the body bytes identical, or nothing is
 * returned.
 */

/** Strict YAML parse of the text between the `---` delimiters. Must throw on malformed YAML. */
export type FrontmatterParse = (yamlText: string) => unknown;

export type FrontmatterChange =
  | { op: "setScalar"; key: string; value: string }
  | { op: "setList"; key: string; values: string[] }
  | { op: "addListItem"; key: string; value: string };

export type FrontmatterPatchErrorCode =
  | "malformed_yaml"
  | "duplicate_key"
  | "unsupported_shape"
  | "unterminated_frontmatter"
  | "verification_failed"
  | "invalid_change";

export class FrontmatterPatchError extends Error {
  readonly code: FrontmatterPatchErrorCode;
  readonly key?: string;
  constructor(code: FrontmatterPatchErrorCode, message: string, key?: string) {
    super(message);
    this.name = "FrontmatterPatchError";
    this.code = code;
    this.key = key;
  }
}

/** Shape of an existing top-level value, as far as the patcher can tell from its lines. */
export type FrontmatterShape =
  | "empty" | "scalar" | "flow_list" | "block_list"
  | "block_scalar" | "flow_map" | "node_property" | "multiline" | "nested";

interface Line { text: string; term: string }

interface Entry {
  key: string;
  /** Key exactly as written (quotes included). */
  rawKey: string;
  start: number;
  /** Exclusive line index. */
  end: number;
  inline: string;
  shape: FrontmatterShape;
  /** For block lists: the prefix written before each item, e.g. "  - ". */
  itemPrefix?: string;
}

interface Split {
  bom: string;
  /** "---" + its terminator, or "" when the note has no frontmatter. */
  open: string;
  lines: Line[];
  /** Closing "---" line with its terminator (may lack one at end of file). */
  close: string;
  body: string;
  eol: string;
  hasFrontmatter: boolean;
}

export interface FrontmatterRead {
  hasFrontmatter: boolean;
  /** Result of the injected strict parse ({} when there is no frontmatter). */
  data: Record<string, unknown>;
  /** Top-level keys in written order with their shapes. */
  shapes: Map<string, FrontmatterShape>;
  /** Authored scalar text, unquoted, exactly as written (only for shape "scalar"). Avoids parser type coercion. */
  scalars: Map<string, string>;
  /** Header text between the delimiters, for previews. */
  header: string;
}

export interface FrontmatterPatchResult {
  raw: string;
  changed: boolean;
  /** Header text before/after, for previews. */
  before: string;
  after: string;
}

const KEY_RE = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s"'#\-?:,[\]{}&*!|>%@`][^#]*?)[ \t]*:(?:[ \t]+(.*))?$/;
const DQ_RE = /^"(?:[^"\\]|\\.)*"[ \t]*(?:#.*)?$/;
const SQ_RE = /^'(?:[^']|'')*'[ \t]*(?:#.*)?$/;
const PLAIN_KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function splitRaw(raw: string): Split {
  const bom = raw.charCodeAt(0) === 0xfeff ? "﻿" : "";
  const s = bom ? raw.slice(1) : raw;
  const openMatch = /^---(\r?\n)/.exec(s);
  if (!openMatch) {
    // A file that is only "---" opens a block it never closes.
    if (s === "---") throw new FrontmatterPatchError("unterminated_frontmatter", "frontmatter block is not closed");
    const nl = s.indexOf("\n");
    const eol = nl > 0 && s[nl - 1] === "\r" ? "\r\n" : "\n";
    return { bom, open: "", lines: [], close: "", body: s, eol, hasFrontmatter: false };
  }
  const open = openMatch[0];
  const eol = openMatch[1];
  const lines: Line[] = [];
  let pos = open.length;
  while (pos < s.length) {
    const nl = s.indexOf("\n", pos);
    const full = nl === -1 ? s.slice(pos) : s.slice(pos, nl + 1);
    const text = full.replace(/\r?\n$/, "");
    if (text === "---") {
      return { bom, open, lines, close: full, body: s.slice(pos + full.length), eol, hasFrontmatter: true };
    }
    lines.push({ text, term: full.slice(text.length) });
    pos += full.length;
  }
  throw new FrontmatterPatchError("unterminated_frontmatter", "frontmatter block is not closed");
}

function stripComment(value: string): string {
  return value.replace(/(?:^|[ \t]+)#.*$/, "").trim();
}

function unquoteKey(rawKey: string): string {
  if (rawKey.startsWith('"')) return JSON.parse(rawKey);
  if (rawKey.startsWith("'")) return rawKey.slice(1, -1).replace(/''/g, "'");
  return rawKey.trim();
}

/** Malformed-line checks on an inline value that sits on a single line. */
function checkInline(inline: string, hasContinuation: boolean, lineNo: number): void {
  const v = inline.trim();
  const bad = (what: string) => new FrontmatterPatchError("malformed_yaml", `line ${lineNo}: ${what}`);
  if (v.startsWith('"') && !DQ_RE.test(v) && !hasContinuation) throw bad("unclosed double quote");
  if (v.startsWith("'") && !SQ_RE.test(v) && !hasContinuation) throw bad("unclosed single quote");
  const plain = stripComment(v);
  if (plain.startsWith("[") && !plain.endsWith("]") && !hasContinuation) throw bad("unclosed flow sequence");
  if (plain.startsWith("{") && !plain.endsWith("}") && !hasContinuation) throw bad("unclosed flow mapping");
}

function classify(entry: Entry, lines: Line[]): void {
  const v = stripComment(entry.inline);
  const cont = lines.slice(entry.start + 1, entry.end).filter((l) => l.text.trim() !== "" && !/^\s*#/.test(l.text));
  if (/^[|>]/.test(v)) { entry.shape = "block_scalar"; return; }
  if (/^[&*!]/.test(v)) { entry.shape = "node_property"; return; }
  if (v.startsWith("{")) { entry.shape = "flow_map"; return; }
  if (v.startsWith("[")) { entry.shape = cont.length ? "multiline" : "flow_list"; return; }
  if (v !== "") { entry.shape = cont.length ? "multiline" : "scalar"; return; }
  if (!cont.length) { entry.shape = "empty"; return; }
  let prefix: string | undefined;
  for (const line of cont) {
    const m = /^(\s*-[ \t]+)(.*)$/.exec(line.text);
    const item = m ? m[2].trim() : "";
    const simple = m && item !== "" && !/^[&*!|>{[\-?]/.test(item)
      && (!item.startsWith('"') || DQ_RE.test(item)) && (!item.startsWith("'") || SQ_RE.test(item))
      && !/^[^"'].*:([ \t]|$)/.test(item);
    if (!simple || (prefix !== undefined && m![1] !== prefix)) { entry.shape = "nested"; return; }
    prefix = m![1];
  }
  entry.shape = "block_list";
  entry.itemPrefix = prefix;
}

function scanEntries(lines: Line[]): Entry[] {
  const entries: Entry[] = [];
  const seen = new Set<string>();
  let cur: Entry | null = null;
  lines.forEach((line, i) => {
    const t = line.text;
    if (t.trim() === "") return;
    if (/^\s/.test(t)) {
      if (/^ *\t/.test(t)) throw new FrontmatterPatchError("malformed_yaml", `line ${i + 2}: tab indentation`);
      if (!cur) throw new FrontmatterPatchError("malformed_yaml", `line ${i + 2}: indented line without a key`);
      cur.end = i + 1;
      return;
    }
    if (t.startsWith("#")) return;
    if (/^-([ \t]|$)/.test(t)) {
      if (!cur || stripComment(cur.inline) !== "") throw new FrontmatterPatchError("malformed_yaml", `line ${i + 2}: list item without a key`);
      cur.end = i + 1;
      return;
    }
    const m = KEY_RE.exec(t);
    if (!m) throw new FrontmatterPatchError("malformed_yaml", `line ${i + 2}: not a top-level "key: value" line`);
    const key = unquoteKey(m[1]);
    if (seen.has(key)) throw new FrontmatterPatchError("duplicate_key", `duplicate top-level key "${key}"`, key);
    seen.add(key);
    cur = { key, rawKey: m[1], start: i, end: i + 1, inline: m[2] ?? "", shape: "empty" };
    entries.push(cur);
  });
  for (const e of entries) {
    checkInline(e.inline, e.end > e.start + 1, e.start + 2);
    classify(e, lines);
  }
  return entries;
}

function headerText(lines: Line[]): string {
  return lines.map((l) => l.text + l.term).join("");
}

function strictParse(parse: FrontmatterParse, text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = parse(text);
  } catch (error: any) {
    throw new FrontmatterPatchError("malformed_yaml", `frontmatter is not valid YAML: ${String(error?.message || error)}`);
  }
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new FrontmatterPatchError("malformed_yaml", "frontmatter is not a mapping");
  return value as Record<string, unknown>;
}

function scalarText(inline: string): string {
  const v = inline.trim();
  if (v.startsWith('"')) {
    const m = /^"(?:[^"\\]|\\.)*"/.exec(v)!;
    try { return JSON.parse(m[0]); } catch { return m[0].slice(1, -1); }
  }
  if (v.startsWith("'")) return /^'(?:[^']|'')*'/.exec(v)![0].slice(1, -1).replace(/''/g, "'");
  return stripComment(v);
}

/** Read a note's frontmatter without changing it. Throws FrontmatterPatchError when it cannot be edited safely. */
export function readFrontmatter(raw: string, parse: FrontmatterParse): FrontmatterRead {
  const split = splitRaw(raw);
  const entries = scanEntries(split.lines);
  const header = headerText(split.lines);
  const data = split.hasFrontmatter ? strictParse(parse, header) : {};
  const shapes = new Map<string, FrontmatterShape>();
  const scalars = new Map<string, string>();
  for (const e of entries) {
    shapes.set(e.key, e.shape);
    if (e.shape === "scalar") scalars.set(e.key, scalarText(e.inline));
  }
  return { hasFrontmatter: split.hasFrontmatter, data, shapes, scalars, header };
}

function yamlKey(key: string): string {
  return PLAIN_KEY_RE.test(key) ? key : JSON.stringify(key);
}

/** JSON string syntax is valid YAML double-quoted scalar syntax. */
function q(value: string): string {
  return JSON.stringify(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual((a as any)[k], (b as any)[k]));
}

function validateChange(change: FrontmatterChange): void {
  const ok = change && typeof change.key === "string" && change.key.trim() === change.key && change.key !== ""
    && !/[\r\n]/.test(change.key)
    && (change.op === "setList"
      ? Array.isArray(change.values) && change.values.every((v) => typeof v === "string")
      : (change.op === "setScalar" || change.op === "addListItem") && typeof change.value === "string");
  if (!ok) throw new FrontmatterPatchError("invalid_change", "invalid frontmatter change");
}

function listLines(key: string, values: readonly string[], eol: string, prefix = "  - "): Line[] {
  return [{ text: `${key}:`, term: eol }, ...values.map((v) => ({ text: prefix + q(v), term: eol }))];
}

function applyOne(lines: Line[], change: FrontmatterChange, eol: string, parse: FrontmatterParse): Line[] {
  const entries = scanEntries(lines);
  const entry = entries.find((e) => e.key === change.key);
  const unsupported = () => new FrontmatterPatchError("unsupported_shape", `cannot safely edit "${change.key}" (${entry!.shape})`, change.key);
  const replace = (next: Line[]) => [...lines.slice(0, entry!.start), ...next, ...lines.slice(entry!.end)];
  const append = (next: Line[]) => {
    let at = lines.length;
    while (at > 0 && lines[at - 1].text.trim() === "") at--;
    return [...lines.slice(0, at), ...next, ...lines.slice(at)];
  };
  const keyText = entry ? entry.rawKey : yamlKey(change.key);

  if (change.op === "setScalar") {
    const line = { text: `${keyText}: ${q(change.value)}`, term: eol };
    if (!entry) return append([line]);
    if (entry.shape !== "empty" && entry.shape !== "scalar") throw unsupported();
    line.term = lines[entry.start].term;
    return replace([line]);
  }
  if (change.op === "setList") {
    if (!entry) return append(listLines(keyText, change.values, eol));
    if (!["empty", "scalar", "flow_list", "block_list"].includes(entry.shape)) throw unsupported();
    return replace(listLines(keyText, change.values, eol, entry.itemPrefix));
  }
  // addListItem
  if (!entry) return append(listLines(keyText, [change.value], eol));
  if (entry.shape === "empty") return replace(listLines(keyText, [change.value], eol));
  const current = strictParse(parse, headerText(lines))[change.key];
  const existing = Array.isArray(current) ? current : current == null ? [] : [current];
  if (existing.some((v) => v === change.value)) return lines;
  if (entry.shape === "block_list") {
    return [...lines.slice(0, entry.end), { text: entry.itemPrefix + q(change.value), term: eol }, ...lines.slice(entry.end)];
  }
  if ((entry.shape === "scalar" || entry.shape === "flow_list") && existing.every((v) => typeof v === "string")) {
    return replace(listLines(keyText, [...(existing as string[]), change.value], eol));
  }
  throw unsupported();
}

/**
 * Apply `changes` to `raw`. Returns the new raw text; only the target keys'
 * lines differ. Throws FrontmatterPatchError and returns nothing on any doubt.
 */
export function patchFrontmatter(raw: string, changes: readonly FrontmatterChange[], parse: FrontmatterParse): FrontmatterPatchResult {
  if (typeof raw !== "string") throw new FrontmatterPatchError("invalid_change", "raw note text must be a string");
  changes.forEach(validateChange);
  const split = splitRaw(raw);
  scanEntries(split.lines);
  const beforeHeader = headerText(split.lines);
  const beforeData = split.hasFrontmatter ? strictParse(parse, beforeHeader) : {};
  if (!changes.length) return { raw, changed: false, before: beforeHeader, after: beforeHeader };

  let lines = split.lines;
  for (const change of changes) lines = applyOne(lines, change, split.eol, parse);
  const afterHeader = headerText(lines);
  if (split.hasFrontmatter && afterHeader === beforeHeader) return { raw, changed: false, before: beforeHeader, after: afterHeader };

  const open = split.hasFrontmatter ? split.open : `---${split.eol}`;
  const close = split.hasFrontmatter ? split.close : `---${split.eol}`;
  const next = split.bom + open + afterHeader + close + split.body;

  // Verify: re-split and re-parse the result independently.
  const check = splitRaw(next);
  scanEntries(check.lines);
  const afterData = strictParse(parse, headerText(check.lines));
  if (check.body !== split.body || check.bom !== split.bom) {
    throw new FrontmatterPatchError("verification_failed", "patch would change the note body");
  }
  const targets = new Set(changes.map((c) => c.key));
  for (const key of new Set([...Object.keys(beforeData), ...Object.keys(afterData)])) {
    if (!targets.has(key) && !deepEqual(beforeData[key], afterData[key])) {
      throw new FrontmatterPatchError("verification_failed", `patch would change unrelated property "${key}"`, key);
    }
  }
  for (const change of changes) {
    const got = afterData[change.key];
    const ok = change.op === "setScalar" ? got === change.value
      : change.op === "setList" ? deepEqual(got, change.values)
      : Array.isArray(got) && got.includes(change.value);
    // A later change in the same call may legitimately overwrite an earlier one on the same key.
    const last = [...changes].reverse().find((c) => c.key === change.key);
    if (!ok && last === change) throw new FrontmatterPatchError("verification_failed", `patched value of "${change.key}" did not read back`, change.key);
  }
  return { raw: next, changed: true, before: beforeHeader, after: afterHeader };
}
