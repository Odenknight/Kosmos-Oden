/**
 * Kosmos Core — Graphiti export (§13).
 *
 * Every note becomes one getzep/graphiti `EpisodeType.json`-compatible episode:
 *   { name, episode_body, source, source_description, reference_time, group_id }
 *
 * The episode body carries the CANONICAL lineage (what the system resolved,
 * §13.1) as `supersedes` / `superseded_by`, and preserves the raw authored
 * declarations separately under `source_okf.declared_*`, so "what the author
 * declared" and "what the system resolved" stay explicit.
 *
 * Episodes are sorted chronologically by reference_time so bulk ingestion
 * replays lineage in order. This is an *ingestable format* guarantee — it does
 * not guarantee Graphiti will reconstruct an identical internal graph (§13.2).
 */
import type { GraphitiEpisode, KosmosGraph } from "./types";

export interface GraphitiOptions {
  /** Vault / knowledge-base name; also used to derive group_id. */
  vault?: string;
  groupId?: string;
}

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vault";

/** Build episodes from an assembled graph (canonical lineage included). */
export function buildGraphitiEpisodes(graph: KosmosGraph, opts: GraphitiOptions = {}): GraphitiEpisode[] {
  const vault = opts.vault || "vault";
  const groupId = opts.groupId || slug(vault);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const label = (id: string): string => byId.get(id)?.label ?? id;
  const out: GraphitiEpisode[] = [];

  for (const n of graph.nodes) {
    if (n.kind !== "file") continue;
    const okf = n.okf;
    const title = okf?.title || n.label;
    const ts = n.validAt ?? n.createdAt ?? new Date().toISOString();
    // Related footer + full note body ride along; semantic links use canonical labels.
    const semantic = graph.links
      .filter((l) => l.kind === "semantic" && l.source === n.id)
      .map((l) => label(l.target));
    out.push({
      name: title,
      episode_body: JSON.stringify({
        title,
        path: n.path,
        type: okf?.type || n.type || "note",
        tags: n.tags,
        timestamp: ts,
        // Canonical lineage projections (§13.1) — resolved note titles.
        supersedes: (okf?.supersedesIds ?? []).map(label),
        superseded_by: (okf?.supersededByIds ?? []).map(label),
        related: okf?.related ?? semantic,
        head: okf?.head ?? false,
        invalid_at: okf?.invalidAt ?? null,
        // Raw authored declarations, preserved verbatim.
        source_okf: {
          declared_supersedes: okf?.supersedes ?? [],
          declared_superseded_by: okf?.supersededBy ?? [],
        },
        content: n.kind === "file" ? (n as { content?: string }).content ?? undefined : undefined,
      }),
      source: "json",
      source_description: `OKF+ note · vault "${vault}" · ${n.path}`,
      reference_time: ts,
      group_id: groupId,
    });
  }
  out.sort((a, b) => a.reference_time.localeCompare(b.reference_time));
  return out;
}

/**
 * Convenience for callers that still hold raw file content: attach the note
 * body (frontmatter stripped) to each episode. `contents` maps path -> body.
 */
export function buildGraphitiEpisodesWithContent(
  graph: KosmosGraph,
  contents: Map<string, string>,
  opts: GraphitiOptions = {}
): GraphitiEpisode[] {
  const episodes = buildGraphitiEpisodes(graph, opts);
  for (const e of episodes) {
    try {
      const body = JSON.parse(e.episode_body);
      const c = contents.get(body.path);
      if (c != null) {
        body.content = c;
        e.episode_body = JSON.stringify(body);
      }
    } catch {
      /* episode body is always our own JSON; parse cannot realistically fail */
    }
  }
  return episodes;
}

/** Strip YAML frontmatter from raw note text (for episode content payloads). */
export function stripFrontmatter(raw: string): string {
  return raw.replace(/^---[\s\S]*?---\s*/, "");
}
