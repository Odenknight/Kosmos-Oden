import { isValidGkxAuthoredUid } from "gkos-engine";
import { validateVaultRelativePath } from "gkos-engine/navigation-effects";
import { readableSpatialGraph } from "./spatial";
export { readableSpatialGraph } from "./spatial";
import type { KosmosAgentServer } from "../plugin/agent-server";
import { ProviderError } from "../plugin/vault-operations";

/** Native host capability, not serializable wire authority or a renderer grant. */
export interface WorkspaceSnapshot<T> {
  value: T;
  /** Reauthorize and apply synchronously, after any asynchronous rendering. */
  publish(apply: (value: T) => void, stillSelected: () => boolean): Promise<boolean>;
}

export interface WorkspaceSearchSnapshot extends WorkspaceSnapshot<any> {
  offset: number;
  /** Opaque native capability bound to this query and original snapshot. */
  next: (() => Promise<WorkspaceSearchSnapshot>) | null;
}

/** Reuse the same read semantics as MCP without starting a listener or emitting
 * agent presence. The host owns this instance; renderer data cannot construct it.
 */
export class NotesWorkspaceHost {
  private active = 0;
  constructor(private readonly api: KosmosAgentServer) {}

  private async capture<T>(read: () => Promise<T>): Promise<WorkspaceSnapshot<T>> {
    if (this.active >= 2) throw new Error("WORKSPACE_BUSY");
    this.active++;
    try {
      const api = this.api, provider = api.provider;
      if (!provider.vaultIdentity) throw new ProviderError("provider_unavailable");
      const corpus = provider.vaultIdentity();
      const ceiling = api.settings.agentSensitivityCeiling, defaults = api.settings.defaultSensitivity;
      const graph = await provider.getGraph();
      const same = (fresh: typeof graph) => api.provider === provider && fresh === graph &&
        provider.vaultIdentity!() === corpus && api.settings.agentSensitivityCeiling === ceiling &&
        api.settings.defaultSensitivity === defaults;
      if (!same(graph)) throw new ProviderError("provider_unavailable");
      const value = await read();
      const fresh = await provider.getGraph();
      if (!same(fresh)) throw new ProviderError("provider_unavailable");
      return {
        value,
        publish: async (apply, stillSelected) => {
          const latest = await provider.getGraph();
          if (!same(latest) || !stillSelected()) return false;
          // No await between current authority/UI checks and the actual DOM commit.
          apply(value);
          return true;
        },
      };
    } finally { this.active--; }
  }

  async search(query: string, options: { body?: boolean; tag?: string; area?: string; limit?: number } = {}): Promise<WorkspaceSearchSnapshot> {
    const captured = { ...options };
    const page = async (offset: number): Promise<WorkspaceSearchSnapshot> => {
      const snapshot = await this.capture(() => this.api.qSearch(query, { ...captured, offset }));
      const end = offset + snapshot.value.results.length;
      return { ...snapshot, offset, next: end < snapshot.value.total && end > offset ? async () => {
        const valid = () => snapshot.publish(() => {}, () => true);
        if (!await valid()) throw new Error("SEARCH_SNAPSHOT_CHANGED");
        const next = await page(end);
        if (!await valid()) throw new Error("SEARCH_SNAPSHOT_CHANGED");
        return next;
      } : null };
    };
    return page(0);
  }

  /** Readable graph for native spatial consumers; publication retains the same
   * corpus, graph object and projection policy checks as Notes. */
  graph() { return this.capture(() => this.api.qGraph()); }

  spatialGraph() { return this.capture(async () => readableSpatialGraph(await this.api.qGraph())); }

  read(path: string, page: { page_size?: number; offset?: number; revision?: string; uid?: string } = {}) {
    const checked = validateVaultRelativePath(path);
    if (!checked.valid || checked.normalized !== path) throw new Error("WORKSPACE_PATH_INVALID");
    const captured = { ...page };
    if (captured.uid !== undefined && !isValidGkxAuthoredUid(captured.uid)) throw new Error("WORKSPACE_UID_INVALID");
    return this.capture(async () => {
      const note = await this.api.qNote({ ...(captured.uid ? { uid: captured.uid } : { path }), offset: captured.offset, revision: captured.revision, page_size: captured.page_size ?? 200_000 });
      if (note.error) return { note, projection: null };
      if (captured.uid ? note.uid !== captured.uid : note.path !== path) throw new Error("WORKSPACE_PATH_MISMATCH");
      const resolved = validateVaultRelativePath(note.path);
      if (!resolved.valid || resolved.normalized !== note.path) throw new Error("WORKSPACE_PATH_INVALID");
      path = note.path;
      const projection = await this.api.qGkxNote({ path });
      const related = await this.api.qRelated({ path });
      const lineage = await this.api.qLineage({ path });
      const assessment = projection.error ? null : await this.api.qAssessment({ path });
      const diagnostics = projection.error ? null : await this.api.qGkxDiagnostics({ path });
      return { note, projection: projection.error ? null : projection, related: related.error ? null : related,
        lineage: lineage.error ? null : lineage,
        assessment: assessment?.error ? null : assessment, diagnostics: diagnostics?.error ? null : diagnostics };
    });
  }
}
