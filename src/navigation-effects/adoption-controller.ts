import { canonicalJson } from "./adoption-registry";
import { planMocAdoption, confirmMocAdoption, type AdoptionPreview, type AdoptionPreviewInput } from "./adoption-plan";
import type { SqliteAdoptionStore } from "./sqlite-adoption-store";

/** Supplied only by the trusted native host, including authenticated adoption
 * authority and source-state fencing. Renderer payloads cannot supply this.
 */
export interface AdoptionSourceCapture {
  input: Omit<AdoptionPreviewInput, "registry" | "ownership" | "operationId">;
  credentialId: string;
  stillCurrent(): boolean;
}

export function createAdoptionCallbacks(
  store: Pick<SqliteAdoptionStore, "load" | "commit">,
  capture: () => Promise<AdoptionSourceCapture>,
  clock: () => string = () => new Date().toISOString(),
) {
  let revision = 0, active: AdoptionPreview | undefined, activeBytes = "", recording = false, closed = false;
  const current = (preview: AdoptionPreview, version: number) => !closed && revision === version && active === preview && canonicalJson(preview) === activeBytes;
  async function fresh(preview: AdoptionPreview) {
    const source = await capture();
    const input = structuredClone(source.input), credentialId = source.credentialId;
    const registry = await store.load();
    const plan = await planMocAdoption({ ...input, registry, ownership: preview.ownership, operationId: preview.operationId });
    if (plan.previewDigest !== preview.previewDigest || source.stillCurrent() !== true) throw Error("ADOPTION_PREVIEW_STALE");
    return { source, input, credentialId, registry, plan };
  }
  return {
    async createPreview(ownership: AdoptionPreviewInput["ownership"]) {
      if (closed || recording) throw Error("ADOPTION_WORKFLOW_UNAVAILABLE");
      const version = ++revision; active = undefined;
      const source = await capture(), input = structuredClone(source.input), registry = await store.load();
      const preview = await planMocAdoption({ ...input, registry, ownership, operationId: crypto.randomUUID() });
      if (closed || version !== revision || source.stillCurrent() !== true) throw Error("ADOPTION_PREVIEW_STALE");
      active = preview; activeBytes = canonicalJson(preview); return preview;
    },
    async checkFreshness(preview: AdoptionPreview) {
      const version = revision;
      if (!current(preview, version)) return false;
      try { await fresh(preview); return current(preview, version); } catch { return false; }
    },
    async recordAdoption(preview: AdoptionPreview) {
      const version = revision;
      if (recording || !current(preview, version)) throw Error("ADOPTION_PREVIEW_STALE");
      recording = true;
      try {
        const { source, input, credentialId, registry, plan } = await fresh(preview);
        const confirmed = await confirmMocAdoption({ preview, registry, rereadBytes: input.currentBytes,
          currentTargetPath: input.targetPath, currentProposedDigest: plan.proposedDigest,
          currentPolicyDigest: input.policyDigest, currentConfigDigest: input.configDigest,
          currentExistingPaths: input.existingPaths, actor: input.actor, credentialId,
          confirmed: true, occurredAt: clock() });
        await store.commit(registry.registryDigest, confirmed.registry, confirmed.receipt,
          () => current(preview, version) && source.stillCurrent() === true);
        active = undefined;
      } finally { recording = false; }
    },
    close() { closed = true; revision++; active = undefined; activeBytes = ""; },
  };
}
