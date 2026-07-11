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
import type { OkfData } from "./types";

export function parseOkfPlus(data: Frontmatter, content: string): OkfData | null {
  const related: string[] = [];
  const m = content.match(/^\s*\*\*Related:?\*\*\s*(.+)$/mi);
  if (m) for (const w of parseWikiLinks(m[1])) related.push(w.target);
  const has =
    data.type != null || data.timestamp != null || data.supersedes != null ||
    (data as Record<string, unknown>).superseded_by != null ||
    (data as Record<string, unknown>).supersededBy != null ||
    data.resource != null || related.length > 0;
  if (!has) return null;
  return {
    type: typeof data.type === "string" ? data.type : undefined,
    title: typeof data.title === "string" ? data.title : undefined,
    timestamp: typeof data.timestamp === "string" ? data.timestamp : undefined,
    resource: typeof data.resource === "string" ? data.resource : undefined,
    supersedes: normalizeStringList(data.supersedes),
    supersededBy: normalizeStringList(
      (data as Record<string, unknown>).superseded_by ?? (data as Record<string, unknown>).supersededBy
    ),
    related,
  };
}

/** Parse an OKF+ timestamp; returns ms since epoch or null when invalid/absent. */
export function parseOkfTimestamp(okf: OkfData | null | undefined): number | null {
  if (!okf || typeof okf.timestamp !== "string") return null;
  const t = Date.parse(okf.timestamp);
  return Number.isNaN(t) ? null : t;
}
