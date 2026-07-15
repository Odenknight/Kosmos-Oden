/**
 * Kosmos Core — Graphiti episode projection.
 *
 * OKF+ source notes and accepted semantic events are authoritative. Graphiti is
 * a disposable projection, so an export must never make current graph state
 * look as though it was known by an older episode. In particular, predecessor
 * episodes do not carry `superseded_by`, `head`, or `invalid_at` fields.
 */
import type { GraphitiEpisode, KosmosGraph, KosmosNode } from "./types";

export const DEFAULT_GRAPHITI_CONTENT_CHARS = 20_000;

export interface GraphitiOptions {
  /** Human-readable vault / knowledge-base name. */
  vault?: string;
  /** Stable opaque vault identity used only to disambiguate the namespace. */
  vaultIdentity?: string;
  /** Explicit namespace override for callers with a governed registry. */
  groupId?: string;
  /** Per-note content cap. Graphiti recommends compact JSON within the LLM context. */
  maxContentChars?: number;
}

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vault";

function hash32(input: string, seed = 0): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 0x01000193) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic RFC-4122-shaped UUIDv5 fallback (identity only, not security). */
export function deterministicUuid(input: string): string {
  const bytes = new Uint8Array(16);
  for (let block = 0; block < 4; block++) {
    const h = hash32(input, Math.imul(block + 1, 0x9e3779b1));
    bytes[block * 4] = h >>> 24;
    bytes[block * 4 + 1] = h >>> 16;
    bytes[block * 4 + 2] = h >>> 8;
    bytes[block * 4 + 3] = h;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function episodeUuid(n: KosmosNode, namespace: string): string {
  const uid = n.okf?.uid;
  return uid && UUID_V4.test(uid) ? uid : deterministicUuid(`${namespace}\u0000${n.path}`);
}

function referenceTimeSource(n: KosmosNode): string {
  if (n.okf?.timestamp && !Number.isNaN(Date.parse(n.okf.timestamp))) return "okf.timestamp";
  if (n.createdAt) return "file.created_at";
  if (n.updatedAt) return "file.updated_at";
  return "index_time_fallback";
}

/** Build chronological Graphiti JSON episodes from the current source graph. */
export function buildGraphitiEpisodes(graph: KosmosGraph, opts: GraphitiOptions = {}): GraphitiEpisode[] {
  const vault = opts.vault || "vault";
  const namespace = opts.vaultIdentity || vault;
  const groupId = opts.groupId || `okf-${slug(vault)}-${hash32(namespace).toString(16).padStart(8, "0")}-assertions`;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const label = (id: string): string => byId.get(id)?.label ?? id;
  const out: GraphitiEpisode[] = [];

  for (const n of graph.nodes) {
    if (n.kind !== "file") continue;
    const okf = n.okf;
    const title = okf?.title || n.label;
    const ts = n.validAt ?? n.createdAt ?? new Date().toISOString();
    const semantic = [...new Set(graph.links
      .filter((l) => l.kind === "semantic" && l.source === n.id)
      .map((l) => label(l.target)))];

    out.push({
      uuid: episodeUuid(n, namespace),
      name: title,
      episode_body: JSON.stringify({
        schema: "okf-plus-graphiti/2.2",
        title,
        path: n.path,
        uid: okf?.uid ?? null,
        type: okf?.type || n.type || "note",
        description: okf?.description ?? null,
        epistemic_state: okf?.epistemicState ?? null,
        scope: okf?.scope ?? null,
        scope_id: okf?.scopeId ?? null,
        sensitivity: okf?.sensitivity ?? "internal",
        tags: n.tags,
        timestamp: ts,
        reference_time_source: referenceTimeSource(n),
        authority: {
          class: "explicit_user_assertion",
          governance_status: "unadjudicated",
          projection_status: "non_authoritative",
          accepted_semantics: false,
        },
        // Only forward-looking facts present by this episode time. Current
        // predecessor state (superseded_by/head/invalid_at) belongs to a later
        // projection and is deliberately excluded.
        lineage: {
          resolved_supersedes: (okf?.supersedesIds ?? []).map(label),
          declared_supersedes: okf?.supersedes ?? [],
        },
        related_to: semantic,
        typed_relationships: okf?.relations ?? {},
      }),
      source: "json",
      source_description: `OKF+ explicit user assertion · non-authoritative Graphiti projection · vault "${vault}" · ${n.path}`,
      reference_time: ts,
      group_id: groupId,
    });
  }
  out.sort((a, b) => a.reference_time.localeCompare(b.reference_time) || a.uuid.localeCompare(b.uuid));
  return out;
}

/** Attach source bodies to prebuilt episodes with a per-note context cap. */
export function attachGraphitiContent(
  episodes: GraphitiEpisode[],
  contents: Map<string, string>,
  maxContentChars = DEFAULT_GRAPHITI_CONTENT_CHARS
): GraphitiEpisode[] {
  const cap = Math.max(1, Math.floor(maxContentChars));
  for (const e of episodes) {
    try {
      const body = JSON.parse(e.episode_body);
      const content = contents.get(body.path);
      if (content == null) continue;
      body.content_char_count = content.length;
      body.content_truncated = content.length > cap;
      body.content = content.length > cap ? content.slice(0, cap) : content;
      e.episode_body = JSON.stringify(body);
    } catch {
      /* episode body is generated above and is always valid JSON */
    }
  }
  return episodes;
}

export function buildGraphitiEpisodesWithContent(
  graph: KosmosGraph,
  contents: Map<string, string>,
  opts: GraphitiOptions = {}
): GraphitiEpisode[] {
  return attachGraphitiContent(
    buildGraphitiEpisodes(graph, opts),
    contents,
    opts.maxContentChars ?? DEFAULT_GRAPHITI_CONTENT_CHARS
  );
}

/** Strip YAML frontmatter from raw note text (for episode content payloads). */
export function stripFrontmatter(raw: string): string {
  return raw.replace(/^---[\s\S]*?---\s*/, "");
}
