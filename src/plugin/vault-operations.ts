/** Physical read ownership survives logical deadlines and plugin reloads. */
export const VAULT_READ_TIMEOUT_MS = 10_000;
export const VAULT_BUILD_TIMEOUT_MS = 20_000;
export const MAX_PHYSICAL_VAULT_READS = 16;
export type ProviderFailure = "timeout" | "provider_unavailable";

export class ProviderError extends Error {
  readonly name = "ProviderError";
  constructor(readonly reason: ProviderFailure) {
    super(reason === "timeout" ? "Vault operation timed out" : "Vault provider unavailable");
  }
}

interface Operation { started: number; promise: Promise<unknown>; }
interface Registry { reads: Map<string, Operation>; }
// Obsidian keeps its Vault object when a plugin is reloaded. Retaining this
// registry in the host realm prevents reload from forgetting unfinished I/O.
const key = Symbol.for("kosmos-oden.physical-vault-reads.v1");
const host = globalThis as any;
const registries: WeakMap<object, Registry> = host[key] ??= new WeakMap();
function registry(vault: object): Registry {
  let value = registries.get(vault);
  if (!value) { value = { reads: new Map() }; registries.set(vault, value); }
  return value;
}

export function physicalReadState(vault: object): { outstanding: number; oldestAgeMs: number } {
  const reads = [...registry(vault).reads.values()];
  return { outstanding: reads.length, oldestAgeMs: reads.length ? Math.max(...reads.map(r => performance.now() - r.started)) : 0 };
}

export function deadline<T>(work: Promise<T>, ms: number, expire?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const until = performance.now() + ms;
    const timer = setTimeout(() => { expire?.(); reject(new ProviderError("timeout")); }, Math.max(0, ms));
    work.then(value => {
      clearTimeout(timer);
      if (performance.now() >= until) { expire?.(); reject(new ProviderError("timeout")); }
      else resolve(value);
    }, error => { clearTimeout(timer); reject(error); });
  });
}

export function readVaultText(vault: { cachedRead(file: any): Promise<string> }, file: { path: string }, timeoutMs = VAULT_READ_TIMEOUT_MS): Promise<string> {
  return readVault(vault, file, () => vault.cachedRead(file), timeoutMs);
}

export function readVaultBytes(vault: { readBinary(file: any): Promise<ArrayBuffer> }, file: { path: string }, timeoutMs = VAULT_READ_TIMEOUT_MS): Promise<ArrayBuffer> {
  return readVault(vault, file, () => vault.readBinary(file), timeoutMs);
}

function readVault<T>(vault: object, file: { path: string }, read: () => Promise<T>, timeoutMs: number): Promise<T> {
  const state = registry(vault);
  const path = file.path;
  // A timed-out physical read is never reused as fresh content. Refuse a
  // duplicate until it settles, including after a plugin/provider replacement.
  if (state.reads.has(path) || state.reads.size >= MAX_PHYSICAL_VAULT_READS) return Promise.reject(new ProviderError("provider_unavailable"));
  const work = Promise.resolve().then(read);
  const operation: Operation = { started: performance.now(), promise: work };
  state.reads.set(path, operation);
  const release = () => { if (state.reads.get(path) === operation) state.reads.delete(path); };
  const observed = work.then(value => { release(); return value; }, () => { release(); throw new ProviderError("provider_unavailable"); });
  return deadline(observed, timeoutMs);
}
