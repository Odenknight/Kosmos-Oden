/**
 * Personal Notes (0.9.0) — shared contracts.
 *
 * Types and constants only: no logic, no Obsidian, no gkos-engine, no Node.
 * Every Personal Notes module, the Agent API server, the plugin and the tests
 * agree on these shapes. Contract identifier: `kosmos-personal-notes/1`.
 */

export const PERSONAL_CONTRACT = "kosmos-personal-notes/1";

/** Which profile the plugin runs. Persisted settings without the field are "existing". */
export type ActiveProfile = "existing" | "personal";

/* ------------------------------------------------------------------ settings */

export interface PersonalTaggingSettings {
  /** Master switch. Default false. */
  enabled: boolean;
  /** Write selection. Distinct from the read selection; default []. */
  folders: string[];
  timestamps: boolean;
  uniqueIds: boolean;
  supersession: boolean;
  /** Stamp updated_at after a real content change inside `folders`. Default false. */
  automaticTimestamps: boolean;
}

export interface PersonalConnectionSettings {
  bindMode: "localhost" | "lan";
  /** Client-reachable base URL chosen by the user. Never contains a token. */
  advertisedBaseUrl: string;
  /** Device-local choice; the persisted value is only a default for this device. */
  autoStart: boolean;
  acceptOlderMcp: boolean;
}

export interface PersonalNotesSettings {
  /** Folders shared with agents. [] shares nothing; "/" explicitly selects all. */
  includeFolders: string[];
  /** Always wins over includeFolders. "/" excludes everything. */
  excludeFolders: string[];
  importFolders: string[];
  /** Importer reports the user selected. Never agent-readable. */
  importReportPaths: string[];
  tagging: PersonalTaggingSettings;
  connection: PersonalConnectionSettings;
  /**
   * Importer boundary for automatic tagging (tagging.ts TaggingImportState).
   * Folders here are deferred until "Import finished — review tags". Kept in
   * the synced settings so another device does not stamp an import in progress.
   * Absent = nothing pending.
   */
  importState?: { running: string[]; awaitingReview: string[] };
}

/* -------------------------------------------------------------------- limits */

export const PERSONAL_LIMITS = {
  /** Concurrent vault reads while building the corpus. */
  readConcurrency: 4,
  editDebounceMs: 250,
  editMaxWaitMs: 2000,
  /** UTF-8 bytes per indexed/read Markdown file. Over-limit files are skipped whole. */
  maxFileBytes: 5 * 1024 * 1024,
  /** Aggregate UTF-8 bytes of indexed raw text. */
  maxCorpusBytes: 128 * 1024 * 1024,
  defaultResults: 20,
  maxResults: 100,
  excerptChars: 320,
  /** Query limits. Over-limit queries are rejected, never truncated. */
  queryCodePoints: 500,
  queryTerms: 16,
  /** Worker batches yield after this much time or this many records. */
  batchMs: 8,
  batchRecords: 64,
  /** get_note paging, in UTF-16 code units. */
  pageDefaultChars: 32_000,
  pageMinChars: 2,
  pageMaxChars: 64_000,
  lineageDefaultNodes: 50,
  lineageMaxNodes: 200,
  relatedDefault: 20,
  relatedMax: 100,
  attachmentRefs: 200,
} as const;

/* ------------------------------------------------------------ notes & source */

export interface PersonalAttachmentRef {
  /** Link target exactly as written in the note. */
  target: string;
  kind: "embed" | "link";
  /** Resolved vault path, or null when the host could not resolve the link. */
  path: string | null;
}

/**
 * Per-note metadata. The plugin fills it from Obsidian's metadata cache and
 * link resolver; tests supply fixtures. Nothing here is derived by an Engine
 * projection, so an absent value means "not authored".
 */
export interface PersonalNoteMeta {
  /** Display title: authored `title` or the file's base name. */
  title: string;
  aliases: string[];
  /** Tags without the leading "#". */
  tags: string[];
  /** Authored flat `uid`, exactly as written, when present. */
  uid?: string;
  /** Authored timestamp strings exactly as written (created_at / updated_at / GKX timestamp). */
  createdAt?: string;
  updatedAt?: string;
  /** Authored `supersedes` link texts exactly as written, e.g. "[[Plans/Old plan]]". */
  supersedes: string[];
  /** Authored reverse declarations (`superseded_by`), exactly as written. */
  supersededBy: string[];
  /** undefined = no sensitivity authored. A string is the authored raw value and may be invalid. */
  authoredSensitivity?: string;
  /** Resolved vault paths of Markdown notes this note links to. */
  links: string[];
  /** Non-note files this note embeds or links to, resolved by the host. */
  attachments: PersonalAttachmentRef[];
  /** True when the frontmatter block could not be parsed. */
  frontmatterError?: boolean;
}

export interface PersonalFileStat {
  /** Vault-relative path with forward slashes, exactly as the vault stores it. */
  path: string;
  mtimeMs: number;
  sizeBytes: number;
}

export interface PersonalNoteRecord extends PersonalFileStat {
  /** Exact raw Markdown, frontmatter and line endings included. Never normalized. */
  raw: string;
  meta: PersonalNoteMeta;
}

/**
 * Where vault content comes from. Implemented by the plugin over the Obsidian
 * vault; by an in-memory fixture in tests. Reads never write.
 */
export interface PersonalVaultSource {
  /** Every Markdown file in the vault. Scope is applied by the caller, not here. */
  listMarkdown(): PersonalFileStat[];
  stat(path: string): PersonalFileStat | null;
  /** Exact raw Markdown. Rejects when the file is missing or unreadable. */
  readRaw(path: string): Promise<string>;
  meta(path: string, raw: string): PersonalNoteMeta;
  /** True when a file (note or attachment) exists at this exact vault path. */
  exists(path: string): boolean;
  /** Resolve a link text written in `fromPath` to a vault path. null = unresolved; "ambiguous" = more than one target. */
  resolveLink(linkText: string, fromPath: string): string | null | "ambiguous";
  /** False when the path is reached through a symlink/junction or resolves outside the canonical vault root. */
  physicallyContained(path: string): boolean;
}

/* ---------------------------------------------------------------- read policy */

/**
 * One Personal read policy, used by every agent-facing path. `generation`
 * increases on any profile, scope, token or bind change; a response computed
 * under an older generation must not be delivered.
 */
export interface PersonalReadPolicy {
  readonly generation: number;
  /** File selection only (scope, exclusions, operational paths). No sensitivity. */
  allowsPath(path: string): boolean;
}

export type PersonalReadDenial = "out_of_scope" | "not_contained" | "sensitivity" | "invalid_sensitivity";

/* -------------------------------------------------------------------- corpus */

export type CorpusState = "indexing" | "ready" | "partial";
export type CorpusOmission = "too_large" | "budget" | "unreadable";

/** Read-only view of the in-memory corpus. Disposable: rebuilt from the vault, never persisted. */
export interface PersonalCorpus {
  readonly revision: number;
  readonly state: CorpusState;
  get(path: string): PersonalNoteRecord | undefined;
  /** Indexed paths in stable (code-unit) order. */
  paths(): string[];
  /** Files skipped whole, with the reason. Never a stored prefix. */
  omitted(): ReadonlyArray<{ path: string; reason: CorpusOmission }>;
  /** Paths whose authored uid equals `uid` (more than one means a duplicate). */
  pathsByUid(uid: string): string[];
}

/* -------------------------------------------------------------------- search */

export type SearchField = "title" | "alias" | "tag" | "path" | "body";

export interface SearchRequest {
  query: string;
  /** 1..PERSONAL_LIMITS.maxResults; default PERSONAL_LIMITS.defaultResults. */
  limit?: number;
  /** Optional exact tag filter (without "#", case-insensitive). */
  tag?: string;
  /**
   * Paths the requester may see. The filter is applied BEFORE matching,
   * counting or coverage. null means the local-human collection (whole corpus).
   */
  allowedPaths: ReadonlySet<string> | null;
  /**
   * Policy generation the request was built under. Omitted = the searcher's
   * current generation. A request or result from an older generation is
   * rejected with "policy_changed".
   */
  policyGeneration?: number;
  signal?: AbortSignal;
}

export interface SearchHit {
  path: string;
  title: string;
  /** Ordering value, not a confidence. */
  score: number;
  matchedIn: SearchField[];
  /** Original source spelling, whitespace collapsed, at most PERSONAL_LIMITS.excerptChars. */
  excerpt: string;
  uid?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SearchCoverage {
  state: CorpusState;
  /** Notes examined for this requester. */
  searched: number;
  /** Notes inside this requester's scope that were skipped (too large, over budget, unreadable). */
  omitted: number;
}

export interface SearchResponse {
  contract: typeof PERSONAL_CONTRACT;
  terms: string[];
  total: number;
  hits: SearchHit[];
  coverage: SearchCoverage;
  corpusRevision: number;
}

export interface PersonalSearch {
  search(request: SearchRequest): Promise<SearchResponse>;
}

/* ------------------------------------------------------------------- lineage */

export interface LineageInputNote {
  path: string;
  uid?: string;
  updatedAt?: string;
  supersedes: string[];
  supersededBy: string[];
}

export interface LineageEdge {
  /** The replacement (newer) note. */
  from: string;
  /** The replaced (older) note. */
  to: string;
  /** "declared" = authored supersedes on `from`; "reverse" = authored superseded_by on `to`. */
  source: "declared" | "reverse";
}

export interface LineageUnresolved {
  from: string;
  /** The declaration exactly as written. */
  declared: string;
  reason: "unresolved" | "ambiguous" | "self";
}

export interface LineageNode {
  path: string;
  uid?: string;
  updatedAt?: string;
  /** Derived for display. Never written to the older note. */
  supersededBy: string[];
  supersedes: string[];
}

export interface LineageView {
  nodes: LineageNode[];
  edges: LineageEdge[];
  /** Notes in this component that nothing supersedes. More than one means branches. */
  heads: string[];
  unresolved: LineageUnresolved[];
  /** Paths on a supersession cycle, if any. */
  cycles: string[][];
  /** Authored reverse declarations that disagree with forward declarations. */
  contradictions: { path: string; detail: string }[];
  truncated: boolean;
  nextCursor: string | null;
}

/* -------------------------------------------------------------------- errors */

export type PersonalErrorCode =
  | "invalid_argument"
  | "invalid_query"
  | "not_found"
  | "ambiguous_uid"
  | "selector_mismatch"
  | "note_changed"
  | "note_too_large"
  | "hash_unavailable"
  | "policy_changed"
  | "search_unavailable"
  | "cancelled";

/** Error with a stable machine code. `message` never names a path outside the caller's scope. */
export class PersonalError extends Error {
  readonly code: PersonalErrorCode;
  constructor(code: PersonalErrorCode, message: string) {
    super(message);
    this.name = "PersonalError";
    this.code = code;
  }
}
