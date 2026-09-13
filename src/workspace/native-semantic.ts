import {GRAPHITI_QUERY_CONTRACT_VERSION, reconcileManagedGraphitiPublication} from "gkos-engine/graphiti";
import {createSemanticQueryClient} from "./semantic-client";
import type {KosmosAgentServer} from "../plugin/agent-server";

/** Trusted native configuration only. The owning host must invalidate current
 * synchronously when its credential, publication, or authority revision changes.
 * This input must never be assembled from a provider's readiness response. */
export async function prepareNativeSemanticClient(options: {
  api: KosmosAgentServer;
  endpoint: string;
  token: string;
  authority: {corpus_id:string; scope_digest:string; policy_digest:string; configuration_digest:string};
  publication: unknown;
  current: () => boolean;
  fetcher?: typeof fetch;
}, signal: AbortSignal): Promise<ReturnType<typeof createSemanticQueryClient> | null> {
  try {
    const {api, endpoint, token, current: hostCurrent, fetcher} = options;
    let manifestCurrent: (() => boolean) | undefined, invalidated = false;
    const current = () => {
      if (signal.aborted || hostCurrent() !== true || manifestCurrent && manifestCurrent() !== true) invalidated = true;
      return !invalidated;
    };
    if (!current()) return null;
    const verified = await reconcileManagedGraphitiPublication(async () => {
      if (!current()) throw new Error("NATIVE_SEMANTIC_UNAVAILABLE");
      const manifest = await api.prepareManagedGraphitiManifest(signal);
      manifestCurrent = manifest.current;
      if (!current()) throw new Error("NATIVE_SEMANTIC_UNAVAILABLE");
      return manifest;
    }, {...options.authority}, options.publication);
    if (!verified || !manifestCurrent || !current()) return null;
    return createSemanticQueryClient({endpoint, token, fetcher, current: () => {
      if (!current()) throw new Error("NATIVE_SEMANTIC_UNAVAILABLE");
      return {status:{contract_version:GRAPHITI_QUERY_CONTRACT_VERSION,mode:"managed",searchable:true,binding:{...verified.binding}},
        decision:"allow",complete_dependency_scope:true,authorized_episodes:structuredClone(verified.episodes)};
    }});
  } catch { return null; }
}
