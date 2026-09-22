import {GRAPHITI_QUERY_CONTRACT_VERSION, reconcileManagedGraphitiPublication} from "gkos-engine/graphiti";
import {createSemanticQueryClient} from "./semantic-client";
import type {KosmosAgentServer} from "../plugin/agent-server";
import type {GraphitiQueryResult} from "gkos-engine/graphiti";

export type NativeSemanticProfile = Pick<Parameters<typeof prepareNativeSemanticClient>[0], "endpoint" | "token" | "authority" | "publication"> & {vaultIdentity:string; projectionTime:string};

/** Read only the native plugin's trusted configuration, never note contents. */
export function readNativeSemanticProfile(value: unknown): NativeSemanticProfile | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const keys = ["endpoint", "token", "authority", "publication", "vaultIdentity", "projectionTime"];
    if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return null;
    const json = JSON.stringify(value);
    if (json.length > 16 * 1024 * 1024) return null;
    const profile = JSON.parse(json) as NativeSemanticProfile;
    const endpoint = new URL(profile.endpoint);
    if (!["http:","https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash || endpoint.search ||
        typeof profile.token !== "string" || !/^[A-Za-z0-9._~-]{32,512}$/.test(profile.token) ||
        typeof profile.vaultIdentity !== "string" || !profile.vaultIdentity || profile.vaultIdentity.length > 4096 ||
        typeof profile.projectionTime !== "string" || !Number.isFinite(Date.parse(profile.projectionTime)) ||
        new Date(profile.projectionTime).toISOString() !== profile.projectionTime) return null;
    return profile;
  } catch { return null; }
}

/** Trusted native configuration only. The owning host must invalidate current
 * synchronously when its credential, publication, or authority revision changes.
 * This input must never be assembled from a provider's readiness response. */
export async function prepareNativeSemanticClient(options: {
  api: KosmosAgentServer;
  endpoint: string;
  token: string;
  authority: {corpus_id:string; scope_digest:string; policy_digest:string; configuration_digest:string};
  publication: unknown;
  /** Original published projection recipe, not the current query time. */
  projectionTime?: string;
  current: () => boolean;
  fetcher?: typeof fetch;
  transportBudget?: {active: number};
}, signal: AbortSignal): Promise<ReturnType<typeof createSemanticQueryClient> | null> {
  try {
    const {endpoint, token, fetcher, transportBudget} = options;
    const prepared = await prepareNativePublication(options, signal);
    if (!prepared) return null;
    const {verified, current} = prepared;
    return createSemanticQueryClient({endpoint, token, fetcher, transportBudget, current: () => {
      if (!current()) throw new Error("NATIVE_SEMANTIC_UNAVAILABLE");
      return {status:{contract_version:GRAPHITI_QUERY_CONTRACT_VERSION,mode:"managed",searchable:true,binding:{...verified.binding}},
        decision:"allow",complete_dependency_scope:true,authorized_episodes:structuredClone(verified.episodes)};
    }});
  } catch { return null; }
}

/** Shared native publication witness for queries and retained projection history. */
export async function prepareNativePublication(options: Pick<Parameters<typeof prepareNativeSemanticClient>[0],
  "api" | "authority" | "publication" | "projectionTime" | "current">, signal: AbortSignal) {
  try {
    const {api, current:hostCurrent, projectionTime} = options;
    // Use one detached plain-data receipt for both verification and its digest.
    const publication = structuredClone(options.publication) as any;
    if (JSON.stringify(publication).length > 16 * 1024 * 1024) return null;
    const publicationDigest = publication?.observation;
    let manifestCurrent: (() => boolean) | undefined, invalidated = false;
    const current = () => {
      try { if (signal.aborted || hostCurrent() !== true || manifestCurrent && manifestCurrent() !== true) invalidated = true; }
      catch { invalidated = true; }
      return !invalidated;
    };
    if (!current()) return null;
    const verified = await reconcileManagedGraphitiPublication(async () => {
      if (!current()) throw new Error("NATIVE_SEMANTIC_UNAVAILABLE");
      const manifest = await api.prepareManagedGraphitiManifest(signal, projectionTime);
      manifestCurrent = manifest.current;
      if (!current()) throw new Error("NATIVE_SEMANTIC_UNAVAILABLE");
      return manifest;
    }, {...options.authority}, publication);
    if (!verified || !manifestCurrent || !current() || typeof publicationDigest !== "string") return null;
    return {verified, current, publicationDigest};
  } catch { return null; }
}

/** Owns one native connection. Replacement invalidates old authority immediately. */
export class NativeSemanticConnection {
  private lifetime: AbortController | undefined;
  private client: Awaited<ReturnType<typeof prepareNativeSemanticClient>> = null;
  private preparing = 0;
  private readonly transportBudget = {active: 0};
  private owners = new WeakMap<GraphitiQueryResult, NonNullable<NativeSemanticConnection["client"]>>();

  disconnect(): void {
    this.lifetime?.abort(); this.lifetime = undefined; this.client = null; this.owners = new WeakMap();
  }

  async connect(options: Omit<Parameters<typeof prepareNativeSemanticClient>[0], "transportBudget">): Promise<boolean> {
    this.disconnect();
    if (this.preparing >= 2) return false;
    const lifetime = new AbortController(); this.lifetime = lifetime;
    const hostCurrent = options.current;
    this.preparing++;
    try {
      const client = await prepareNativeSemanticClient({...options,transportBudget:this.transportBudget,
        current: () => this.lifetime === lifetime && hostCurrent() === true}, lifetime.signal);
      if (this.lifetime !== lifetime || lifetime.signal.aborted || !client) return false;
      this.client = client; return true;
    } finally { this.preparing--; }
  }

  async search(...args: Parameters<NonNullable<NativeSemanticConnection["client"]>["search"]>) {
    const client = this.client;
    const result = await client?.search(...args);
    if (!client || this.client !== client || !result) return null;
    this.owners.set(result, client); return result;
  }

  isCurrent(...args: Parameters<NonNullable<NativeSemanticConnection["client"]>["isCurrent"]>) {
    return !!this.client && this.owners.get(args[2]) === this.client && this.client.isCurrent(...args);
  }
}
