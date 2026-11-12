/**
 * Personal Notes (0.9.0) — optional deterministic tagging: pure frozen plan.
 *
 * Rule-based metadata edits, no model calls. Timestamps, unique IDs and
 * supersession are independent options. A plain note with these fields stays
 * a plain note: the plan never adds `gkx_version` and never converts a note to
 * full GKX. Clock, ID generator, timestamp formatter and strict YAML parser
 * are injected (the plugin passes Engine `makeGkxUuidV7`, Engine
 * `formatTimestamp` and Obsidian `parseYaml`).
 *
 * Also holds the pure decision for opted-in automatic timestamps and the
 * explicit Importer boundary state.
 */
import type { LineageInputNote, PersonalTaggingSettings } from "./types";
import { FrontmatterPatchError, patchFrontmatter, readFrontmatter } from "./frontmatter-patch";
import type { FrontmatterChange, FrontmatterParse, FrontmatterRead } from "./frontmatter-patch";
import { asWikilink, checkSupersedesProposal } from "./lineage";
import type { LineageResolve, SupersedesRejection } from "./lineage";

export const TAGGING_PLAN_CONTRACT = "kosmos-tagging-plan/1";
/** Preview text per note side is cut at this many characters (display only). */
export const TAGGING_PREVIEW_CHARS = 4000;
export const UID_KEY = "uid";
export const SUPERSEDES_KEY = "supersedes";
/** GKX 2.2 notes keep their single stable `timestamp` (Engine applyNoteTimestamps). */
export const GKX22_TIMESTAMP_KEY = "timestamp";

/** Mirrors Engine GKX_TIMESTAMP_RE / isValidGkxTimestamp. */
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
/** Mirrors Engine VALID_AUTHORED_UID (lowercase RFC 9562 v4 or v7). */
const UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isValidTaggingTimestamp = (v: unknown): v is string =>
  typeof v === "string" && TIMESTAMP_RE.test(v) && !Number.isNaN(Date.parse(v));
export const isValidTaggingUid = (v: unknown): v is string => typeof v === "string" && UID_RE.test(v);

export interface TaggingOptions {
  timestamps: boolean;
  uniqueIds: boolean;
  supersession: boolean;
}

/** Same semantics as the existing timestampCreatedKey / timestampUpdatedKey / timestampUseLocalTimezone settings. */
export interface TaggingTimestampSettings {
  createdKey?: string;
  updatedKey?: string;
  useLocalTimezone?: boolean;
  /** Source-provided creation properties, read (never rewritten) in this order. Default ["created"]. */
  sourceCreatedKeys?: readonly string[];
  /** Source-provided modification properties, read (never rewritten) in this order. Default ["modified", "updated"]. */
  sourceModifiedKeys?: readonly string[];
}

export interface TaggingNoteInput {
  path: string;
  /** Exact raw Markdown. */
  raw: string;
  /** SHA-256 (lowercase hex) of `raw`'s UTF-8 bytes. */
  hash: string;
  ctimeMs?: number | null;
  mtimeMs?: number | null;
}

export interface SupersedesRequest {
  /** Replacement (newer) note; must be in the selection. */
  path: string;
  /** Older note's link text as chosen in the picker. */
  target: string;
}

export interface TaggingPlanInput {
  notes: readonly TaggingNoteInput[];
  options: TaggingOptions;
  /** Frozen proposal clock. Ignored when `pending` is reused. */
  proposalTimeMs: number;
  /** Engine makeGkxUuidV7. Called only for notes that need a new uid. */
  newUid: (nowMs: number) => string;
  /** Engine formatTimestamp(ms, useLocalTimezone). */
  formatTimestamp: (ms: number, useLocalTimezone: boolean) => string;
  /** Strict YAML parse; must throw on malformed YAML (Obsidian parseYaml). */
  parse: FrontmatterParse;
  timestamps?: TaggingTimestampSettings;
  /** Vault index of authored uids: uid -> paths. May include selected paths. */
  existingUids?: ReadonlyMap<string, readonly string[]>;
  /** Paths the user explicitly chose to give a new uid to repair a duplicate (copy repair). */
  uidRepairs?: readonly string[];
  supersedes?: {
    requests: readonly SupersedesRequest[];
    /** Lineage view of the notes visible to this operation. */
    notes: readonly LineageInputNote[];
    resolve: LineageResolve;
  };
  /** A previewed, not yet applied plan. Its clock and allocated uids are reused for unchanged notes. */
  pending?: TaggingPlan | null;
}

export type TaggingFinding =
  | { kind: "duplicate_uid"; uid: string; paths: string[]; repairing: string[] }
  | { kind: "invalid_uid"; path: string; value: string }
  | { kind: "invalid_timestamp"; path: string; key: string; value: string }
  | { kind: "frontmatter_error"; path: string; code: FrontmatterPatchError["code"]; message: string }
  | { kind: "supersedes_rejected"; path: string; target: string; reason: SupersedesRejection | "not_selected" | "disabled"; detail: string };

export interface TaggingNotePlan {
  path: string;
  originalHash: string;
  changes: FrontmatterChange[];
  /** Full proposed text, or null when nothing changes or the note cannot be patched. */
  proposedRaw: string | null;
  previewBefore: string;
  previewAfter: string;
  reasons: string[];
  skips: { field: string; reason: string }[];
}

export interface TaggingPlan {
  contract: typeof TAGGING_PLAN_CONTRACT;
  proposalTimeMs: number;
  options: TaggingOptions;
  notes: TaggingNotePlan[];
  findings: TaggingFinding[];
  /** Values frozen for re-preview: path -> hash and allocated uid. */
  frozen: Record<string, { hash: string; uid?: string }>;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const preview = (text: string) => (text.length > TAGGING_PREVIEW_CHARS ? `${text.slice(0, TAGGING_PREVIEW_CHARS)}…` : text);

function keyOr(value: string | undefined, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function validMs(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function pickTime(fm: FrontmatterRead, sourceKeys: readonly string[], fileMs: number | null | undefined, fallbackMs: number, what: string):
  { ms: number; reason: string } {
  for (const key of sourceKeys) {
    const v = fm.scalars.get(key);
    if (isValidTaggingTimestamp(v)) return { ms: Date.parse(v), reason: `${what} from source property "${key}"` };
  }
  if (validMs(fileMs)) return { ms: fileMs, reason: `${what} from file ${what === "created" ? "creation" : "modification"} time` };
  return { ms: fallbackMs, reason: `${what} from proposal time` };
}

const isGkx22 = (fm: FrontmatterRead) => fm.scalars.get("gkx_version") === "2.2";

interface TimestampContext {
  fm: FrontmatterRead;
  note: TaggingNoteInput;
  settings: TaggingTimestampSettings;
  format: (ms: number, local: boolean) => string;
  fallbackMs: number;
  /** Automatic mode: refresh updated time to this content-event time. */
  eventTimeMs?: number;
}

function timestampChanges(ctx: TimestampContext, plan: TaggingNotePlan, findings: TaggingFinding[]): void {
  const { fm, note, settings } = ctx;
  const local = settings.useLocalTimezone === true;
  const created = () => pickTime(fm, settings.sourceCreatedKeys ?? ["created"], note.ctimeMs, ctx.fallbackMs, "created");
  const missing = (key: string) => !fm.shapes.has(key) || fm.shapes.get(key) === "empty";

  if (isGkx22(fm)) {
    // Engine applyNoteTimestamps: GKX 2.2 keeps one stable `timestamp`; set only when absent.
    if (missing(GKX22_TIMESTAMP_KEY)) {
      const c = created();
      plan.changes.push({ op: "setScalar", key: GKX22_TIMESTAMP_KEY, value: ctx.format(c.ms, local) });
      plan.reasons.push(`GKX 2.2 timestamp: ${c.reason}`);
    } else plan.skips.push({ field: GKX22_TIMESTAMP_KEY, reason: "GKX 2.2 timestamp already authored" });
    return;
  }

  const createdKey = keyOr(settings.createdKey, "created_at");
  const updatedKey = keyOr(settings.updatedKey, "updated_at");
  if (missing(createdKey)) {
    const c = created();
    plan.changes.push({ op: "setScalar", key: createdKey, value: ctx.format(c.ms, local) });
    plan.reasons.push(`${createdKey}: ${c.reason}`);
  } else if (!isValidTaggingTimestamp(fm.scalars.get(createdKey))) {
    findings.push({ kind: "invalid_timestamp", path: note.path, key: createdKey, value: fm.scalars.get(createdKey) ?? `(${fm.shapes.get(createdKey)})` });
    plan.skips.push({ field: createdKey, reason: "existing value is not a valid timestamp; left unchanged" });
  } else plan.skips.push({ field: createdKey, reason: "already present" });

  if (ctx.eventTimeMs !== undefined) {
    const shape = fm.shapes.get(updatedKey);
    const value = ctx.format(ctx.eventTimeMs, local);
    if (shape !== undefined && shape !== "empty" && shape !== "scalar") {
      findings.push({ kind: "invalid_timestamp", path: note.path, key: updatedKey, value: `(${shape})` });
      plan.skips.push({ field: updatedKey, reason: "existing value cannot be edited safely" });
    } else if (fm.scalars.get(updatedKey) !== value) {
      plan.changes.push({ op: "setScalar", key: updatedKey, value });
      plan.reasons.push(`${updatedKey}: content change at event time`);
    }
    return;
  }
  if (missing(updatedKey)) {
    const u = pickTime(fm, settings.sourceModifiedKeys ?? ["modified", "updated"], note.mtimeMs, ctx.fallbackMs, "updated");
    plan.changes.push({ op: "setScalar", key: updatedKey, value: ctx.format(u.ms, local) });
    plan.reasons.push(`${updatedKey}: ${u.reason}`);
  } else if (!isValidTaggingTimestamp(fm.scalars.get(updatedKey))) {
    findings.push({ kind: "invalid_timestamp", path: note.path, key: updatedKey, value: fm.scalars.get(updatedKey) ?? `(${fm.shapes.get(updatedKey)})` });
    plan.skips.push({ field: updatedKey, reason: "existing value is not a valid timestamp; left unchanged" });
  } else plan.skips.push({ field: updatedKey, reason: "already present; a rerun never refreshes it" });
}

function emptyNotePlan(note: TaggingNoteInput): TaggingNotePlan {
  return { path: note.path, originalHash: note.hash, changes: [], proposedRaw: null, previewBefore: "", previewAfter: "", reasons: [], skips: [] };
}

function finish(note: TaggingNoteInput, plan: TaggingNotePlan, parse: FrontmatterParse, findings: TaggingFinding[]): void {
  try {
    const result = patchFrontmatter(note.raw, plan.changes, parse);
    plan.previewBefore = preview(result.before);
    plan.previewAfter = preview(result.after);
    plan.proposedRaw = result.changed ? result.raw : null;
    if (!result.changed) plan.changes = [];
  } catch (error) {
    if (!(error instanceof FrontmatterPatchError)) throw error;
    findings.push({ kind: "frontmatter_error", path: note.path, code: error.code, message: error.message });
    plan.changes = [];
    plan.proposedRaw = null;
  }
}

/** Build the frozen, bounded tagging preview. Pure; reads nothing and writes nothing. */
export function planTagging(input: TaggingPlanInput): TaggingPlan {
  const pending = input.pending && input.pending.contract === TAGGING_PLAN_CONTRACT ? input.pending : null;
  const clock = pending ? pending.proposalTimeMs : input.proposalTimeMs;
  if (!validMs(clock) || !Number.isSafeInteger(clock)) throw new Error("planTagging: proposalTimeMs must be a positive integer millisecond time");
  const options: TaggingOptions = {
    timestamps: input.options?.timestamps === true,
    uniqueIds: input.options?.uniqueIds === true,
    supersession: input.options?.supersession === true,
  };
  const settings = input.timestamps ?? {};
  const findings: TaggingFinding[] = [];
  const frozen: TaggingPlan["frozen"] = {};

  const seenPaths = new Set<string>();
  const notes = [...input.notes].filter((n) => !seenPaths.has(n.path) && seenPaths.add(n.path)).sort((a, b) => cmp(a.path, b.path));
  const reads = new Map<string, FrontmatterRead>();
  const plans = new Map<string, TaggingNotePlan>();
  for (const note of notes) {
    const plan = emptyNotePlan(note);
    plans.set(note.path, plan);
    frozen[note.path] = { hash: note.hash };
    try {
      reads.set(note.path, readFrontmatter(note.raw, input.parse));
    } catch (error) {
      if (!(error instanceof FrontmatterPatchError)) throw error;
      findings.push({ kind: "frontmatter_error", path: note.path, code: error.code, message: error.message });
    }
  }

  if (options.timestamps) {
    for (const note of notes) {
      const fm = reads.get(note.path);
      if (fm) timestampChanges({ fm, note, settings, format: input.formatTimestamp, fallbackMs: clock }, plans.get(note.path)!, findings);
    }
  }

  if (options.uniqueIds) {
    const owners = new Map<string, Set<string>>();
    const own = (uid: string, path: string) => (owners.get(uid) ?? owners.set(uid, new Set()).get(uid)!).add(path);
    for (const [uid, paths] of input.existingUids ?? []) for (const p of paths) own(uid, p);
    const needsUid: string[] = [];
    for (const note of notes) {
      const fm = reads.get(note.path);
      if (!fm) continue;
      const shape = fm.shapes.get(UID_KEY);
      const value = fm.scalars.get(UID_KEY);
      if (shape === undefined || shape === "empty") needsUid.push(note.path);
      else if (isValidTaggingUid(value)) own(value, note.path);
      else {
        findings.push({ kind: "invalid_uid", path: note.path, value: value ?? `(${shape})` });
        plans.get(note.path)!.skips.push({ field: UID_KEY, reason: "existing uid is not a valid UUIDv4/v7; left unchanged" });
      }
    }
    const repairs = new Set(input.uidRepairs ?? []);
    const repairing = new Set<string>();
    for (const [uid, paths] of [...owners].sort((a, b) => cmp(a[0], b[0]))) {
      if (paths.size < 2) continue;
      const sorted = [...paths].sort(cmp);
      const chosen = sorted.filter((p) => repairs.has(p) && plans.has(p));
      // Never leave nobody holding the uid: at least one owner keeps it.
      const allowed = chosen.length >= sorted.length ? chosen.slice(1) : chosen;
      allowed.forEach((p) => repairing.add(p));
      findings.push({ kind: "duplicate_uid", uid, paths: sorted, repairing: allowed });
      for (const p of sorted) {
        if (plans.has(p) && !allowed.includes(p)) plans.get(p)!.skips.push({ field: UID_KEY, reason: `uid ${uid} is shared with another note; choose a repair` });
      }
    }
    const taken = new Set(owners.keys());
    for (const path of [...needsUid, ...[...repairing].sort(cmp)]) {
      const prior = pending?.frozen?.[path];
      let uid = prior && prior.hash === frozen[path].hash && isValidTaggingUid(prior.uid) && !taken.has(prior.uid) ? prior.uid : input.newUid(clock);
      if (!isValidTaggingUid(uid) || taken.has(uid)) throw new Error("planTagging: the injected uid generator returned an invalid or colliding UUID");
      taken.add(uid);
      frozen[path].uid = uid;
      plans.get(path)!.changes.push({ op: "setScalar", key: UID_KEY, value: uid });
      plans.get(path)!.reasons.push(repairing.has(path) ? "uid: new identity for an explicitly repaired duplicate" : "uid: new identity (UUIDv7)");
    }
  }

  if (input.supersedes?.requests?.length) {
    const working = new Map<string, LineageInputNote>();
    for (const n of input.supersedes.notes) if (!working.has(n.path)) working.set(n.path, { ...n, supersedes: [...(n.supersedes ?? [])] });
    for (const request of input.supersedes.requests) {
      const reject = (reason: Extract<TaggingFinding, { kind: "supersedes_rejected" }>["reason"], detail: string) =>
        findings.push({ kind: "supersedes_rejected", path: request.path, target: request.target, reason, detail });
      if (!options.supersession) { reject("disabled", "supersession is not selected"); continue; }
      const plan = plans.get(request.path);
      if (!plan || !reads.has(request.path)) { reject("not_selected", "the replacement note is not in this write selection"); continue; }
      const check = checkSupersedesProposal(request.path, request.target, [...working.values()], input.supersedes.resolve);
      if ("reason" in check) { reject(check.reason, check.detail); continue; }
      if (check.alreadyDeclared) { plan.skips.push({ field: SUPERSEDES_KEY, reason: `already declares ${check.target}` }); continue; }
      plan.changes.push({ op: "addListItem", key: SUPERSEDES_KEY, value: check.link });
      plan.reasons.push(`supersedes: explicit choice ${asWikilink(request.target)}`);
      working.get(request.path)!.supersedes.push(check.link);
    }
  }

  for (const note of notes) if (reads.has(note.path)) finish(note, plans.get(note.path)!, input.parse, findings);
  return { contract: TAGGING_PLAN_CONTRACT, proposalTimeMs: clock, options, notes: notes.map((n) => plans.get(n.path)!), findings, frozen };
}

/** Plan for one opted-in automatic timestamp update at the content-event time. Never touches uid or lineage. */
export function planAutoTimestamp(input: {
  note: TaggingNoteInput;
  eventTimeMs: number;
  formatTimestamp: (ms: number, useLocalTimezone: boolean) => string;
  parse: FrontmatterParse;
  timestamps?: TaggingTimestampSettings;
}): TaggingPlan {
  if (!validMs(input.eventTimeMs) || !Number.isSafeInteger(input.eventTimeMs)) throw new Error("planAutoTimestamp: eventTimeMs must be a positive integer millisecond time");
  const findings: TaggingFinding[] = [];
  const plan = emptyNotePlan(input.note);
  try {
    const fm = readFrontmatter(input.note.raw, input.parse);
    timestampChanges({ fm, note: input.note, settings: input.timestamps ?? {}, format: input.formatTimestamp, fallbackMs: input.eventTimeMs, eventTimeMs: input.eventTimeMs }, plan, findings);
    finish(input.note, plan, input.parse, findings);
  } catch (error) {
    if (!(error instanceof FrontmatterPatchError)) throw error;
    findings.push({ kind: "frontmatter_error", path: input.note.path, code: error.code, message: error.message });
  }
  return {
    contract: TAGGING_PLAN_CONTRACT,
    proposalTimeMs: input.eventTimeMs,
    options: { timestamps: true, uniqueIds: false, supersession: false },
    notes: [plan],
    findings,
    frozen: { [input.note.path]: { hash: input.note.hash } },
  };
}

/* ------------------------------------------------ automatic timestamps */

/**
 * Importer boundary, persisted by the plugin. `running`: Kosmos-launched
 * imports in progress (deferred). `awaitingReview`: imports whose completion
 * Kosmos cannot observe; excluded until the user picks
 * "Import finished — review tags". No timeouts.
 */
export interface TaggingImportState {
  running: string[];
  awaitingReview: string[];
}

const without = (list: readonly string[], folder: string) => list.filter((f) => f !== folder);
const withOne = (list: readonly string[], folder: string) => (list.includes(folder) ? [...list] : [...list, folder]);

export function importStarted(state: TaggingImportState, folder: string, completionObservable: boolean): TaggingImportState {
  return completionObservable
    ? { running: withOne(state.running, folder), awaitingReview: [...state.awaitingReview] }
    : { running: [...state.running], awaitingReview: withOne(state.awaitingReview, folder) };
}

/** Kosmos observed the Importer run for `folder` complete. */
export function importCompleted(state: TaggingImportState, folder: string): TaggingImportState {
  return { running: without(state.running, folder), awaitingReview: [...state.awaitingReview] };
}

/** The user chose "Import finished — review tags" for `folder`. */
export function importReviewed(state: TaggingImportState, folder: string): TaggingImportState {
  return { running: without(state.running, folder), awaitingReview: without(state.awaitingReview, folder) };
}

export type AutoTimestampEventKind = "create" | "modify" | "rename" | "delete" | "read" | "index" | "open" | "metadata";

export interface AutoTimestampEvent {
  kind: AutoTimestampEventKind;
  path: string;
  /** SHA-256 of the file's content after the event; null when unavailable. */
  contentHash: string | null;
  /** When the content event happened (captured once by the plugin, not indexing/replay time). */
  eventTimeMs: number;
}

export interface AutoTimestampState {
  tagging: PersonalTaggingSettings;
  /** False during Obsidian's startup discovery. */
  eventsLive: boolean;
  /** Injected from scope.ts. */
  isUnderAnyFolder: (path: string, folders: readonly string[]) => boolean;
  /** Operational / ineligible paths (isKosmosOperationalPath, !timestampEligible). */
  isExcludedPath?: (path: string) => boolean;
  /** Last content hash Kosmos knows for this path (from the corpus or a previous event). */
  baselineHash: string | undefined;
  /** Hashes of content Kosmos itself wrote to this path. */
  ownWriteHashes?: ReadonlySet<string>;
  imports: TaggingImportState;
}

export type AutoTimestampDecision =
  | { action: "stamp"; eventTimeMs: number; recordHash: string }
  | { action: "skip"; reason: string; recordHash: string | null };

/**
 * `raw` with the value of the top-level `updatedKey` frontmatter line blanked.
 * Automatic timestamps compare content in this form, so a change to that
 * stamp alone (another device's automatic stamp arriving by sync, or a manual
 * correction) is not a content change and cannot start a stamp ping-pong.
 */
export function withoutUpdatedStamp(raw: string, updatedKey = "updated_at"): string {
  if (!/^﻿?---\r?\n/.test(raw)) return raw;
  const key = new RegExp(`^${updatedKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*:`);
  const lines = raw.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    if (line === "---") break;
    if (key.test(line)) lines[i] = `${updatedKey}:${lines[i].endsWith("\r") ? "\r" : ""}`;
  }
  return lines.join("\n");
}

/** Decide whether one vault event earns an automatic timestamp update. Pure. */
export function autoTimestampDecision(event: AutoTimestampEvent, state: AutoTimestampState): AutoTimestampDecision {
  const hash = typeof event.contentHash === "string" && event.contentHash ? event.contentHash : null;
  const skip = (reason: string, record: string | null = hash): AutoTimestampDecision => ({ action: "skip", reason, recordHash: record });
  if (event.kind !== "create" && event.kind !== "modify") return skip("not_a_content_event", null);
  if (!state.eventsLive) return skip("startup_discovery");
  const t = state.tagging;
  if (!t?.enabled || !t.timestamps || !t.automaticTimestamps) return skip("disabled");
  if (state.isExcludedPath?.(event.path)) return skip("excluded_path");
  if (!state.isUnderAnyFolder(event.path, t.folders ?? [])) return skip("outside_tagging_folders");
  if (state.isUnderAnyFolder(event.path, state.imports?.running ?? [])) return skip("import_running");
  if (state.isUnderAnyFolder(event.path, state.imports?.awaitingReview ?? [])) return skip("import_awaiting_review");
  if (!hash) return skip("hash_unavailable", null);
  if (state.ownWriteHashes?.has(hash)) return skip("own_write");
  if (state.baselineHash === hash) return skip("unchanged");
  if (state.baselineHash === undefined && event.kind === "modify") return skip("no_baseline");
  if (!validMs(event.eventTimeMs)) return skip("invalid_event_time");
  return { action: "stamp", eventTimeMs: event.eventTimeMs, recordHash: hash };
}
