export type WatcherEventKind = "create" | "modify" | "rename" | "delete";

export interface WatcherDelivery {
  kind: WatcherEventKind;
  path: string;
  previousPath?: string;
  stableIdentity?: string;
}

export interface MonotonicClock {
  now(): number;
}

export interface EventDebouncerOptions {
  clock: MonotonicClock;
  quietMs?: number;
  maximumMs?: number;
  capacity?: number;
  pathCapacity?: number;
}

export interface CoalescedWatcherEvent {
  key: string;
  stableIdentity: string | null;
  paths: string[];
  kinds: WatcherEventKind[];
  firstOffsetMs: number;
  lastOffsetMs: number;
  deliveryCount: number;
}

export interface WatcherBatch {
  events: CoalescedWatcherEvent[];
  openedAtMs: number;
  closedAtMs: number;
  requiresFullReconciliation: boolean;
  overflowCount: number;
}

export type IngestResult = "accepted" | "ignored" | "overflow";

const DEFAULT_QUIET_MS = 750;
const DEFAULT_MAXIMUM_MS = 3_000;
const DEFAULT_CAPACITY = 2_048;
const EVENT_ORDER: WatcherEventKind[] = ["create", "modify", "rename", "delete"];

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Normalizes delivery paths for identity/coalescing only. Effect adapters must
 * still apply their stronger containment and portability policy before writes.
 */
export function normalizeWatcherPath(input: string): string | null {
  if (typeof input !== "string" || input.length === 0 || input.includes("\0")) return null;
  let value: string;
  try { value = input.normalize("NFC").replace(/\\/g, "/"); } catch { return null; }
  while (value.startsWith("./")) value = value.slice(2);
  if (!value || value.startsWith("/") || value.startsWith("//") || /^[A-Za-z]:/.test(value)) return null;
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return segments.join("/");
}

export function isIgnoredEffectsPath(input: string): boolean {
  const path = normalizeWatcherPath(input);
  if (!path) return true;
  const lower = path.toLocaleLowerCase("en-US");
  if (lower === ".gkx" || lower.startsWith(".gkx/")) return true;
  if (lower === "_archive/moc-runs" || lower.startsWith("_archive/moc-runs/")) return true;
  const name = path.slice(path.lastIndexOf("/") + 1);
  // Effect adapters use hidden same-directory temporary files. The second
  // spelling is reserved for hosts that cannot create a leading-dot file.
  return /^\.[^/]+\.(?:gkos-)?(?:tmp|temp)(?:[-.][A-Za-z0-9_-]+)?$/i.test(name)
    || /^[^/]+\.gkos-(?:tmp|temp)(?:[-.][A-Za-z0-9_-]+)?$/i.test(name);
}

interface MutableEvent {
  key: string;
  stableIdentity: string | null;
  paths: Set<string>;
  kinds: Set<WatcherEventKind>;
  firstOffsetMs: number;
  lastOffsetMs: number;
  deliveryCount: number;
}

/** Pure polling debouncer: it owns no timer and performs no I/O. */
export class NavigationEventDebouncer {
  private readonly clock: MonotonicClock;
  private readonly quietMs: number;
  private readonly maximumMs: number;
  private readonly capacity: number;
  private readonly pathCapacity: number;
  private readonly pending = new Map<string, MutableEvent>();
  private pathCount = 0;
  private openedAtMs: number | null = null;
  private latestAtMs: number | null = null;
  private lastObservedMs: number | null = null;
  private overflowCount = 0;

  constructor(options: EventDebouncerOptions) {
    this.clock = options.clock;
    this.quietMs = options.quietMs ?? DEFAULT_QUIET_MS;
    this.maximumMs = options.maximumMs ?? DEFAULT_MAXIMUM_MS;
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
    this.pathCapacity = options.pathCapacity ?? this.capacity * 2;
    if (!Number.isFinite(this.quietMs) || this.quietMs < 0) throw new Error("quietMs must be a non-negative finite number");
    if (!Number.isFinite(this.maximumMs) || this.maximumMs < this.quietMs) throw new Error("maximumMs must be finite and at least quietMs");
    if (!Number.isInteger(this.capacity) || this.capacity < 1) throw new Error("capacity must be a positive integer");
    if (!Number.isInteger(this.pathCapacity) || this.pathCapacity < 1) throw new Error("pathCapacity must be a positive integer");
  }

  ingest(delivery: WatcherDelivery): IngestResult {
    const now = this.observeTime();
    const current = normalizeWatcherPath(delivery.path);
    const previous = delivery.previousPath == null ? null : normalizeWatcherPath(delivery.previousPath);
    const paths = [...new Set([current, previous].filter((path): path is string => !!path && !isIgnoredEffectsPath(path)))].sort(compareCodeUnits);
    if (paths.length === 0) return "ignored";

    const normalizedIdentity = typeof delivery.stableIdentity === "string" ? delivery.stableIdentity.normalize("NFC") : "";
    const identity = normalizedIdentity && !normalizedIdentity.includes("\0") && normalizedIdentity.length <= 1_024 ? normalizedIdentity : null;
    const key = identity ? `identity:${identity}` : `path:${current && !isIgnoredEffectsPath(current) ? current : paths[0]}`;
    let item = this.pending.get(key);
    const additionalPaths = paths.reduce((count, path) => count + (item?.paths.has(path) ? 0 : 1), 0);
    if ((!item && this.pending.size >= this.capacity) || this.pathCount + additionalPaths > this.pathCapacity) {
      this.overflowCount += 1;
      this.openedAtMs ??= now;
      this.latestAtMs = now;
      return "overflow";
    }
    if (!item) {
      item = { key, stableIdentity: identity, paths: new Set(), kinds: new Set(), firstOffsetMs: now, lastOffsetMs: now, deliveryCount: 0 };
      this.pending.set(key, item);
    }
    for (const path of paths) {
      if (!item.paths.has(path)) this.pathCount += 1;
      item.paths.add(path);
    }
    item.kinds.add(delivery.kind);
    item.lastOffsetMs = now;
    item.deliveryCount += 1;
    this.openedAtMs ??= now;
    this.latestAtMs = now;
    return "accepted";
  }

  drainReady(): WatcherBatch | null {
    const now = this.observeTime();
    if (this.openedAtMs == null || this.latestAtMs == null) return null;
    const ready = this.overflowCount > 0
      || now - this.latestAtMs >= this.quietMs
      || now - this.openedAtMs >= this.maximumMs;
    if (!ready) return null;
    return this.drain(now);
  }

  drainNow(): WatcherBatch | null {
    const now = this.observeTime();
    return this.openedAtMs == null ? null : this.drain(now);
  }

  get size(): number { return this.pending.size; }
  get overflowed(): boolean { return this.overflowCount > 0; }

  private observeTime(): number {
    const now = this.clock.now();
    if (!Number.isFinite(now) || now < 0) throw new Error("monotonic clock must return a non-negative finite number");
    if (this.lastObservedMs != null && now < this.lastObservedMs) throw new Error("monotonic clock moved backwards");
    this.lastObservedMs = now;
    return now;
  }

  private drain(now: number): WatcherBatch {
    const events = [...this.pending.values()].map((item): CoalescedWatcherEvent => ({
      key: item.key,
      stableIdentity: item.stableIdentity,
      paths: [...item.paths].sort(compareCodeUnits),
      kinds: EVENT_ORDER.filter((kind) => item.kinds.has(kind)),
      firstOffsetMs: item.firstOffsetMs,
      lastOffsetMs: item.lastOffsetMs,
      deliveryCount: item.deliveryCount,
    })).sort((left, right) => compareCodeUnits(left.paths[0], right.paths[0]) || compareCodeUnits(left.key, right.key));
    const batch: WatcherBatch = {
      events,
      openedAtMs: this.openedAtMs!,
      closedAtMs: now,
      requiresFullReconciliation: this.overflowCount > 0,
      overflowCount: this.overflowCount,
    };
    this.pending.clear();
    this.pathCount = 0;
    this.openedAtMs = null;
    this.latestAtMs = null;
    this.overflowCount = 0;
    return batch;
  }
}
