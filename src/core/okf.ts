/**
 * Kosmos Core — OKF+ (Open Knowledge Format Plus) parsing.
 * Evolutionary frontmatter (type / timestamp / supersedes / superseded_by /
 * resource) plus the footer `**Related:**` semantic links.
 *
 * This module only *reads declarations*. Canonical lineage resolution — the
 * bidirectional normalization of supersedes/superseded_by — happens in
 * lineage.ts (§3), never here.
 */
import type { Frontmatter } from "./markdown";
import { normalizeStringList, parseWikiLinks } from "./markdown";
import type { OkfData, OkfRelation, OkfSensitivity } from "./types";

const RELATIONS: OkfRelation[] = [
  "depends_on", "derives_from", "contradicts", "refines", "implements",
  "blocks", "documents", "cites", "related_to",
];

/** Normalize a flat OKF list and unwrap canonical `"[[Target]]"` entries.
 * Legacy plain-title/path values remain readable for compatibility. */
function normalizeOkfRefs(v: unknown): string[] {
  const out: string[] = [];
  for (const raw of normalizeStringList(v)) {
    const links = parseWikiLinks(raw);
    if (links.length) out.push(...links.map((l) => l.target));
    else out.push(raw);
  }
  // Preserve duplicates here so lineage validation can report duplicate
  // declarations instead of silently normalizing away evidence of bad input.
  return out.map((x) => x.trim()).filter(Boolean);
}

const scalar = (v: unknown): string | undefined => typeof v === "string" && v !== "" ? v : undefined;

function sensitivity(v: unknown): OkfSensitivity | undefined {
  if (v === "public" || v === "internal" || v === "confidential" || v === "phi") return v;
  // An explicit but invalid label must not silently downgrade access. The
  // read-only projector fails closed at the highest sensitivity; a governed
  // processor can separately route the malformed value to salvage/review.
  return typeof v === "string" && v.trim() ? "phi" : undefined;
}

export function parseOkfPlus(data: Frontmatter, content: string): OkfData | null {
  const related: string[] = [];
  const m = content.match(/^\s*\*\*Related:?\*\*\s*(.+)$/mi);
  if (m) for (const w of parseWikiLinks(m[1])) related.push(w.target);
  const raw = data as Record<string, unknown>;
  const has =
    raw.okf_version != null || raw.uid != null || data.type != null || data.timestamp != null || data.supersedes != null ||
    (data as Record<string, unknown>).superseded_by != null ||
    (data as Record<string, unknown>).supersededBy != null ||
    raw.forked_from != null || raw.forked_to != null ||
    RELATIONS.some((k) => raw[k] != null) || data.resource != null || related.length > 0;
  if (!has) return null;
  const relations: Partial<Record<OkfRelation, string[]>> = {};
  for (const key of RELATIONS) {
    const refs = normalizeOkfRefs(raw[key]);
    if (refs.length) relations[key] = refs;
  }
  return {
    okfVersion: scalar(raw.okf_version),
    uid: scalar(raw.uid),
    type: scalar(data.type),
    title: scalar(data.title),
    description: scalar(raw.description),
    timestamp: scalar(data.timestamp),
    epistemicState: scalar(raw.epistemic_state),
    scope: scalar(raw.scope),
    scopeId: scalar(raw.scope_id),
    sensitivity: sensitivity(raw.sensitivity),
    resource: scalar(data.resource),
    supersedes: normalizeOkfRefs(data.supersedes),
    supersededBy: normalizeOkfRefs(
      (data as Record<string, unknown>).superseded_by ?? (data as Record<string, unknown>).supersededBy
    ),
    forkedFrom: normalizeOkfRefs(raw.forked_from),
    // `forked_by` is read-only compatibility; canonical v2.2 emission is forked_to.
    forkedTo: normalizeOkfRefs(raw.forked_to ?? raw.forked_by),
    relations,
    related: [...new Set([...related, ...(relations.related_to ?? [])])],
  };
}

/** Parse an OKF+ timestamp; returns ms since epoch or null when invalid/absent. */
export function parseOkfTimestamp(okf: OkfData | null | undefined): number | null {
  if (!okf || typeof okf.timestamp !== "string") return null;
  const t = Date.parse(okf.timestamp);
  return Number.isNaN(t) ? null : t;
}
