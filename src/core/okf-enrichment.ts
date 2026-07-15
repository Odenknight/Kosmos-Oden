import { parseFrontmatter } from "./markdown";
import { sha256Text } from "./okf-migration";

export type OkfEnrichmentField = "description" | "type" | "tags" | "supersedes" | "related_to";

export interface OkfEvidenceBlock {
  id: number;
  startLine: number;
  endLine: number;
  selectionRule: "qualifying-prose" | "explicit-version-language" | "heading-context" | "fallback-prose";
  text: string;
  fingerprint: string;
}

export interface OkfEnrichmentSuggestion {
  field: OkfEnrichmentField;
  value: string | string[];
  confidence: number;
  reason: string;
  evidenceBlockIds: number[];
  source: "deterministic" | "llm";
}

export interface OkfEvidenceAssessment {
  status: "adequate" | "weak" | "insufficient";
  /** Structural evidence quality only. It is not semantic truth or author competence. */
  qualityScore: number;
  basis: "deterministic-evidence-quality";
  reasons: string[];
}

export interface EvidenceWindowOptions { maxParagraphs?: number; maxChars?: number; }

const normalizeParagraph = (lines: string[]): string => lines.map((line) => line.trim()).join(" ").replace(/\s+/g, " ").trim();
const isBoilerplate = (text: string): boolean => /^(table of contents|contents|navigation|related|references|links|tags)\s*:?$/i.test(text);
const proseScore = (text: string): number => {
  if (text.length < 40) return -10;
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const ratio = letters / Math.max(1, text.length);
  if (ratio < 0.45 || isBoilerplate(text)) return -10;
  return Math.min(4, text.length / 160) + (/[.!?]["')\]]?$/.test(text) ? 1 : 0);
};

/**
 * Select reproducible candidate evidence. "Meaningful" is intentionally not
 * claimed: these objective rules can identify prose-shaped evidence, not
 * guarantee that an author placed the important idea near the top.
 */
export async function selectOkfEvidenceWindow(raw: string, options: EvidenceWindowOptions = {}): Promise<OkfEvidenceBlock[]> {
  const maxParagraphs = Math.max(1, Math.min(8, options.maxParagraphs ?? 4));
  const maxChars = Math.max(400, Math.min(12_000, options.maxChars ?? 4_000));
  const { content } = parseFrontmatter(raw);
  const lines = content.split(/\r?\n/);
  const candidates: Array<{ start: number; end: number; text: string; rule: OkfEvidenceBlock["selectionRule"]; score: number }> = [];
  let inFence = false, paragraph: string[] = [], start = 0, heading = "";
  const fallbackParts: string[] = [];
  const flush = (end: number) => {
    if (!paragraph.length) return;
    const text = normalizeParagraph(paragraph); paragraph = [];
    const version = /\b(supersedes|replaces|deprecated by|updated version of|successor to)\b/i.test(text);
    const score = proseScore(text);
    if (score >= 0 || version) candidates.push({ start, end, text: heading ? `${heading} — ${text}` : text, rule: version ? "explicit-version-language" : "qualifying-prose", score: (version ? score + 10 : score) - Math.min(2, start / 1000) });
  };
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^```|^~~~/.test(trimmed)) { flush(i); inFence = !inFence; continue; }
    if (inFence) continue;
    if (/^#{1,6}\s+/.test(trimmed)) { flush(i); heading = trimmed.replace(/^#{1,6}\s+/, "").slice(0, 160); continue; }
    const excluded = !trimmed || /^[-*+]\s+\[[ xX]\]/.test(trimmed) || /^\|.*\|$/.test(trimmed) || /^!\[/.test(trimmed) || /^>\s*\[!/.test(trimmed) || /^(---|___|\*\*\*)$/.test(trimmed);
    if (excluded) { flush(i); continue; }
    fallbackParts.push(trimmed);
    if (!paragraph.length) start = i + 1;
    paragraph.push(trimmed);
  }
  flush(lines.length);
  const selected: typeof candidates = [];
  let used = 0;
  for (const candidate of candidates.sort((a, b) => b.score - a.score || a.start - b.start)) {
    if (selected.length >= maxParagraphs || used >= maxChars) break;
    const remaining = maxChars - used;
    const text = candidate.text.slice(0, remaining);
    if (text.length < 40) continue;
    selected.push({ ...candidate, text }); used += text.length;
  }
  selected.sort((a, b) => a.start - b.start);
  if (!selected.length) {
    const fallback = fallbackParts.join(" ").replace(/\s+/g, " ").slice(0, maxChars);
    if (fallback.length >= 20) selected.push({ start: 1, end: lines.length, text: fallback, rule: "fallback-prose", score: 0 });
  }
  const out: OkfEvidenceBlock[] = [];
  for (let i = 0; i < selected.length; i++) out.push({ id: i + 1, startLine: selected[i].start, endLine: selected[i].end, selectionRule: selected[i].rule, text: selected[i].text, fingerprint: `sha256:${await sha256Text(selected[i].text)}` });
  return out;
}

/**
 * Scores only observable structure: amount of prose-shaped material, sentence
 * boundaries, and explicit version language. It cannot determine whether an
 * author expressed the genuinely important idea, so weak evidence is surfaced
 * for review instead of being "repaired" by guessing.
 */
export function assessOkfEvidence(blocks: OkfEvidenceBlock[]): OkfEvidenceAssessment {
  if (!blocks.length) return { status: "insufficient", qualityScore: 0, basis: "deterministic-evidence-quality", reasons: ["No qualifying prose-shaped evidence was found outside excluded structures."] };
  const reasons: string[] = [];
  const chars = blocks.reduce((sum, block) => sum + block.text.length, 0);
  const sentences = blocks.reduce((sum, block) => sum + (block.text.match(/[.!?](?:\s|$)/g) ?? []).length, 0);
  const fallbackOnly = blocks.every((block) => block.selectionRule === "fallback-prose");
  const explicitVersion = blocks.some((block) => block.selectionRule === "explicit-version-language");
  let score = Math.min(0.35, chars / 1200) + Math.min(0.25, blocks.length * 0.1) + Math.min(0.25, sentences * 0.08) + (explicitVersion ? 0.15 : 0);
  if (fallbackOnly) { score = Math.min(score, 0.35); reasons.push("Only fallback text passed; it did not meet the prose-shape gate."); }
  if (blocks.length < 2) reasons.push("Only one evidence block was available; document structure provides little corroboration.");
  if (sentences === 0) reasons.push("No sentence boundary was detected in the selected evidence.");
  if (chars < 160) reasons.push("Selected evidence is short and may omit the document's purpose.");
  if (explicitVersion) reasons.push("Explicit version language was detected, but the named relationship still requires approval.");
  if (!reasons.length) reasons.push("Multiple prose-shaped blocks with sentence boundaries passed the deterministic gate.");
  score = Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
  return { status: score >= 0.65 ? "adequate" : "weak", qualityScore: score, basis: "deterministic-evidence-quality", reasons };
}

export function deterministicOkfSuggestions(blocks: OkfEvidenceBlock[]): OkfEnrichmentSuggestion[] {
  const all = blocks.map((block) => block.text).join("\n");
  const suggestions: OkfEnrichmentSuggestion[] = [];
  const first = blocks[0];
  if (first && first.text.length >= 40) suggestions.push({ field: "description", value: first.text.slice(0, 280), confidence: 0.62, reason: "First qualifying prose block; review because position is not proof of importance.", evidenceBlockIds: [first.id], source: "deterministic" });
  const tags = [...new Set((all.match(/(^|\s)#[A-Za-z][\w/-]*/g) ?? []).map((tag) => tag.trim().slice(1)))].slice(0, 20);
  if (tags.length) suggestions.push({ field: "tags", value: tags, confidence: 0.9, reason: "Explicit Markdown hashtags in the selected evidence.", evidenceBlockIds: blocks.filter((block) => tags.some((tag) => block.text.includes(`#${tag}`))).map((block) => block.id), source: "deterministic" });
  if (/\b(step\s+\d+|procedure|runbook|prerequisite|instructions?)\b/i.test(all)) suggestions.push({ field: "type", value: "procedural", confidence: 0.76, reason: "Procedure vocabulary appears in bounded evidence.", evidenceBlockIds: blocks.filter((block) => /\b(step\s+\d+|procedure|runbook|prerequisite|instructions?)\b/i.test(block.text)).map((block) => block.id), source: "deterministic" });
  else if (/\b(meeting|journal|daily note|incident|event)\b/i.test(all) && /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/.test(all)) suggestions.push({ field: "type", value: "episodic", confidence: 0.72, reason: "Event vocabulary and an explicit date appear together.", evidenceBlockIds: blocks.map((block) => block.id), source: "deterministic" });
  const relation = /\b(?:supersedes|replaces|updated version of|successor to)\s+(?:the\s+)?\[\[([^\]]+)\]\]/ig;
  let match: RegExpExecArray | null;
  while ((match = relation.exec(all))) suggestions.push({ field: "supersedes", value: `[[${match[1].trim()}]]`, confidence: 0.88, reason: "Explicit version language names a wikilink target; still requires human approval.", evidenceBlockIds: blocks.filter((block) => block.text.includes(match![0])).map((block) => block.id), source: "deterministic" });
  return suggestions.slice(0, 16);
}

export function validateLlmEnrichmentResponse(value: unknown, blocks: OkfEvidenceBlock[], maxSuggestions = 12): OkfEnrichmentSuggestion[] {
  const allowed = new Set<OkfEnrichmentField>(["description", "type", "tags", "supersedes", "related_to"]);
  const rows = Array.isArray((value as any)?.suggestions) ? (value as any).suggestions : [];
  const blockIds = new Set(blocks.map((block) => block.id));
  const out: OkfEnrichmentSuggestion[] = [];
  for (const row of rows.slice(0, Math.max(1, Math.min(24, maxSuggestions)))) {
    if (!row || !allowed.has(row.field) || !(typeof row.value === "string" || Array.isArray(row.value))) continue;
    const ids = Array.isArray(row.evidenceBlockIds) ? row.evidenceBlockIds.filter((id: unknown) => Number.isInteger(id) && blockIds.has(id as number)).slice(0, 8) : [];
    const reason = typeof row.reason === "string" ? row.reason.trim().slice(0, 500) : "";
    const confidence = Number(row.confidence);
    if (!ids.length || !reason || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) continue;
    const normalized = Array.isArray(row.value) ? row.value.filter((item: unknown) => typeof item === "string").map((item: string) => item.trim().slice(0, 180)).filter(Boolean).slice(0, 20) : row.value.trim().slice(0, 500);
    if (Array.isArray(normalized) && !normalized.length) continue;
    if (typeof normalized === "string" && !normalized) continue;
    if (row.field === "type" && (Array.isArray(normalized) || !["episodic", "semantic", "procedural"].includes(normalized))) continue;
    const cited = blocks.filter((block) => ids.includes(block.id)).map((block) => block.text).join("\n");
    const values = Array.isArray(normalized) ? normalized : [normalized];
    if (row.field === "supersedes") {
      const explicitTargets = [...cited.matchAll(/\b(?:supersedes|replaces|updated version of|successor to)\s+(?:the\s+)?\[\[([^\]]+)\]\]/ig)].map((match) => `[[${match[1].trim()}]]`);
      if (!values.every((candidate) => explicitTargets.includes(candidate))) continue;
    }
    if (row.field === "related_to" && !values.every((candidate) => cited.includes(candidate) && /^\[\[[^\]]+\]\]$/.test(candidate))) continue;
    out.push({ field: row.field, value: normalized, confidence, reason, evidenceBlockIds: ids, source: "llm" });
  }
  return out;
}
