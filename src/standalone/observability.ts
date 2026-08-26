export interface TraversalEventEnvelope {
  schema_version: 1;
  session_id: string;
  sequence: number;
  offset_ms: number;
  operation_id: string;
  agent_id: string;
  agent_label: string;
  tool: string;
  paths: string[];
  status: string;
  cost_units: number | null;
}

export interface TraversalSessionMetadata {
  started_at: string;
  service_protocol: string;
  viewer_version: string;
  corpus_hash: string | null;
  redaction: string;
}

export interface TraversalSessionExport {
  schema_version: 1;
  metadata: TraversalSessionMetadata;
  events: TraversalEventEnvelope[];
  truncated: boolean;
}

export type MonotonicClock = () => number;

export const TRAVERSAL_SESSION_MAX_EVENTS = 5_000;
export const TRAVERSAL_SESSION_MAX_BYTES = 2_000_000;
export const TRAVERSAL_REDACTION = "Traversal envelopes only; no note bodies, tokens, prompts, credentials, or raw errors.";

const SAFE_PATH = /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\0)[^\\]+$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const TOOL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function validPlainPath(path: string): boolean {
  if (path.length > 1024 || !SAFE_PATH.test(path) || path.startsWith("//")) return false;
  return path.split("/").every((segment) => {
    if (!segment || segment === "." || segment === ".." || /[. ]$/u.test(segment) || /[<>:"|?*]/u.test(segment)) return false;
    return !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(segment);
  });
}

/** Accept only literal canonical paths; URL-encoded or malformed encodings are noncanonical. */
function validCanonicalPath(path: string): boolean {
  let decoded: string;
  try { decoded = decodeURIComponent(path); } catch { return false; }
  if (decoded !== path || /[\u0000-\u001f\u007f]/u.test(path)) return false;
  return validPlainPath(path) && path === path.normalize("NFC");
}

function exactKeys(value: unknown, expected: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort(), wanted = expected.slice().sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function normalizeSessionMetadata(value: unknown, allowRuntimeExtras = false): TraversalSessionMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!allowRuntimeExtras && !exactKeys(value, ["started_at", "service_protocol", "viewer_version", "corpus_hash", "redaction"])) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.started_at !== "string" || v.started_at.length > 40 || !Number.isFinite(Date.parse(v.started_at))) return null;
  if (typeof v.service_protocol !== "string" || !VERSION.test(v.service_protocol)) return null;
  if (typeof v.viewer_version !== "string" || !VERSION.test(v.viewer_version)) return null;
  if (v.corpus_hash !== null && (typeof v.corpus_hash !== "string" || !SHA256.test(v.corpus_hash))) return null;
  if (!allowRuntimeExtras && v.redaction !== TRAVERSAL_REDACTION) return null;
  return {
    started_at: v.started_at,
    service_protocol: v.service_protocol,
    viewer_version: v.viewer_version,
    corpus_hash: v.corpus_hash as string | null,
    redaction: TRAVERSAL_REDACTION,
  };
}

export function normalizeTraversalEvent(value: unknown): TraversalEventEnvelope | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const expected = ["agent_id", "agent_label", "cost_units", "offset_ms", "operation_id", "paths", "schema_version", "sequence", "session_id", "status", "tool"];
  const keys = Object.keys(v).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return null;
  if (v.schema_version !== 1 || !Number.isSafeInteger(v.sequence) || Number(v.sequence) < 0) return null;
  if (!Number.isSafeInteger(v.offset_ms) || Number(v.offset_ms) < 0) return null;
  if (!ID.test(String(v.session_id ?? "")) || !ID.test(String(v.operation_id ?? "")) || !ID.test(String(v.agent_id ?? ""))) return null;
  if (typeof v.agent_label !== "string" || v.agent_label.length < 1 || v.agent_label.length > 80 || !TOOL.test(String(v.tool ?? ""))) return null;
  if (!Array.isArray(v.paths) || v.paths.length > 256) return null;
  if (v.paths.some((p) => typeof p !== "string")) return null;
  const paths = (v.paths as string[]).slice();
  if (paths.some((p) => !validCanonicalPath(p))) return null;
  if (!["completed", "failed", "denied"].includes(v.status as string)) return null;
  if (v.cost_units !== null && (typeof v.cost_units !== "number" || !Number.isFinite(v.cost_units) || v.cost_units < 0)) return null;
  return {
    schema_version: 1,
    session_id: v.session_id as string,
    sequence: Number(v.sequence),
    offset_ms: Number(v.offset_ms),
    operation_id: v.operation_id as string,
    agent_id: v.agent_id as string,
    agent_label: v.agent_label as string,
    tool: v.tool as string,
    paths,
    status: v.status as string,
    cost_units: v.cost_units as number | null,
  };
}

/** Per-node traffic scores with monotonic-time exponential decay. */
export class TrafficHeatmap {
  private readonly scores = new Map<string, { value: number; at: number }>();
  constructor(
    private readonly clock: MonotonicClock = () => performance.now(),
    private readonly halfLifeMs = 15_000,
    private readonly maximumNodes = 10_000,
    /** Hard privacy/rendering horizon: old traffic is exactly zero, not merely tiny. */
    private readonly horizonMs = 120_000,
  ) {
    if (!(halfLifeMs > 0) || !(maximumNodes > 0) || !(horizonMs >= halfLifeMs)) throw new Error("invalid traffic heatmap bounds");
  }
  private decay(entry: { value: number; at: number }, now: number): number {
    return entry.value * Math.pow(0.5, Math.max(0, now - entry.at) / this.halfLifeMs);
  }
  visit(id: string, weight = 1): void {
    const now = this.clock();
    const old = this.scores.get(id);
    this.scores.delete(id);
    this.scores.set(id, { value: Math.min(8, (old ? this.decay(old, now) : 0) + Math.max(0, weight)), at: now });
    while (this.scores.size > this.maximumNodes) this.scores.delete(this.scores.keys().next().value!);
  }
  value(id: string, now = this.clock()): number {
    const entry = this.scores.get(id);
    if (!entry) return 0;
    if (Math.max(0, now - entry.at) >= this.horizonMs) { this.scores.delete(id); return 0; }
    return Math.min(1, this.decay(entry, now) / 4);
  }
  clear(): void { this.scores.clear(); }
  get size(): number { return this.scores.size; }
}

/** Explicit, in-memory-only recorder. Only validated event-envelope fields survive. */
export class TraversalSessionRecorder {
  private events: TraversalEventEnvelope[] = [];
  private bytes = 0;
  private active = false;
  private truncated = false;
  private metadata: TraversalSessionMetadata | null = null;
  constructor(private readonly maximumEvents = TRAVERSAL_SESSION_MAX_EVENTS, private readonly maximumBytes = TRAVERSAL_SESSION_MAX_BYTES) {
    if (!(maximumEvents > 0 && maximumEvents <= TRAVERSAL_SESSION_MAX_EVENTS) || !(maximumBytes > 0 && maximumBytes <= TRAVERSAL_SESSION_MAX_BYTES)) {
      throw new Error("invalid traversal recording bounds");
    }
  }
  start(metadata: TraversalSessionMetadata): void {
    const normalized = normalizeSessionMetadata(metadata, true);
    if (!normalized) throw new Error("invalid traversal session metadata");
    this.events = []; this.truncated = false; this.active = true; this.metadata = normalized;
    this.bytes = new TextEncoder().encode(JSON.stringify(this.export())).byteLength;
    if (this.bytes > this.maximumBytes) { this.active = false; this.truncated = true; throw new Error("traversal session metadata exceeds the byte cap"); }
  }
  stop(): void { this.active = false; }
  record(value: unknown): boolean {
    if (!this.active) return false;
    const event = normalizeTraversalEvent(value); if (!event) return false;
    const copy = { ...event, paths: event.paths.slice() };
    const encoded = JSON.stringify(copy); const next = this.bytes + new TextEncoder().encode(encoded).byteLength + (this.events.length ? 1 : 0);
    if (this.events.length >= this.maximumEvents || next > this.maximumBytes) { this.truncated = true; this.active = false; return false; }
    this.events.push(copy); this.bytes = next; return true;
  }
  export(): TraversalSessionExport | null {
    if (!this.metadata) return null;
    return { schema_version: 1, metadata: { ...this.metadata }, events: this.events.map((e) => ({ ...e, paths: e.paths.slice() })), truncated: this.truncated };
  }
  get status() { return { active: this.active, events: this.events.length, bytes: this.bytes, truncated: this.truncated }; }
}

/** Clock-driven deterministic replay. No timers, persistence, or live-log writes. */
export class TraversalReplay {
  private events: TraversalEventEnvelope[] = [];
  private index = 0;
  private positionMs = 0;
  private lastClock = 0;
  private playing = false;
  private ended = false;
  private speed = 1;
  constructor(
    private readonly clock: MonotonicClock = () => performance.now(),
    private readonly maximumEvents = TRAVERSAL_SESSION_MAX_EVENTS,
    private readonly maximumBytes = TRAVERSAL_SESSION_MAX_BYTES,
  ) {
    if (!(maximumEvents > 0 && maximumEvents <= TRAVERSAL_SESSION_MAX_EVENTS) || !(maximumBytes > 0 && maximumBytes <= TRAVERSAL_SESSION_MAX_BYTES)) {
      throw new Error("invalid traversal replay bounds");
    }
  }
  load(session: TraversalSessionExport): void {
    if (!exactKeys(session, ["schema_version", "metadata", "events", "truncated"]) || session.schema_version !== 1 || typeof session.truncated !== "boolean") {
      throw new Error("unrecognized traversal session envelope");
    }
    if (!normalizeSessionMetadata(session.metadata) || !Array.isArray(session.events)) throw new Error("invalid traversal session metadata or events");
    if (session.events.length > this.maximumEvents) throw new Error(`traversal session exceeds ${this.maximumEvents} events`);
    let encoded: string;
    try { encoded = JSON.stringify(session); } catch { throw new Error("traversal session is not serializable"); }
    if (new TextEncoder().encode(encoded).byteLength > this.maximumBytes) throw new Error(`traversal session exceeds ${this.maximumBytes} bytes`);
    const normalized = session.events.map(normalizeTraversalEvent);
    if (normalized.some((event) => !event)) throw new Error("traversal session contains an invalid event");
    this.events = (normalized as TraversalEventEnvelope[])
      .sort((a, b) => a.sequence - b.sequence || a.offset_ms - b.offset_ms);
    this.restart(); this.pause();
  }
  play(): void { if (!this.events.length) return; if (this.ended) this.restart(); this.lastClock = this.clock(); this.playing = true; }
  pause(): void { this.advanceClock(); this.playing = false; }
  restart(): void { this.index = 0; this.positionMs = 0; this.lastClock = this.clock(); this.playing = false; this.ended = false; }
  stop(): void { this.restart(); this.events = []; }
  /** Reset playback to the requested point; the next tick deterministically rebuilds all due visual events. */
  seek(ms: number): void { this.positionMs = Math.max(0, Number(ms) || 0); this.index = 0; this.ended = false; this.lastClock = this.clock(); }
  setSpeed(speed: number): void { if (![1, 2, 5].includes(speed)) throw new Error("replay speed must be 1x, 2x, or 5x"); this.advanceClock(); this.speed = speed; }
  tick(): TraversalEventEnvelope[] {
    this.advanceClock(); const due: TraversalEventEnvelope[] = [];
    while (this.index < this.events.length && this.events[this.index].offset_ms <= this.positionMs) due.push(this.events[this.index++]);
    if (this.events.length && this.index >= this.events.length) { this.playing = false; this.ended = true; }
    return due;
  }
  private advanceClock(): void {
    const now = this.clock();
    if (this.playing) this.positionMs += Math.max(0, now - this.lastClock) * this.speed;
    this.lastClock = now;
  }
  get state() { return { loaded: this.events.length > 0, playing: this.playing, ended: this.ended, positionMs: this.positionMs, durationMs: this.events.at(-1)?.offset_ms || 0, speed: this.speed }; }
}
