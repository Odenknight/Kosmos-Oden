import {stableJson} from "gkos-engine/retrieval";
import {prepareNativePublication} from "./native-semantic";
import type {ProjectionObservation, SourceObservationReference} from "./source-observation-ledger";

/** Native owner only. References must come from the retained ledger, which
 * validates them again when appending. This does not enable history storage. */
export async function prepareNativeHistoryProjection(options: Parameters<typeof prepareNativePublication>[0] & {
  historyCorpus: string;
  operation: string;
  references: readonly SourceObservationReference[];
}, signal: AbortSignal) {
  try {
    const {historyCorpus, operation, api} = options;
    if (!historyCorpus || api.provider.vaultIdentity?.() !== historyCorpus ||
        typeof operation !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(operation) ||
        !Array.isArray(options.references) || options.references.length > 5000) return null;
    const references: SourceObservationReference[] = JSON.parse(stableJson(options.references));
    const prepared = await prepareNativePublication(options, signal);
    if (!prepared || api.provider.vaultIdentity?.() !== historyCorpus) return null;
    const sources = new Map<string, string>();
    for (const episode of prepared.verified.episodes.values()) {
      if (sources.has(episode.source_id) && sources.get(episode.source_id) !== episode.source_digest) return null;
      sources.set(episode.source_id, episode.source_digest);
    }
    const seen = new Set<string>(); let previous = 0;
    for (const ref of references) {
      if (!ref || Object.keys(ref).sort().join() !== "receiptDigest,sequence,source,sourceDigest" ||
          typeof ref.source !== "string" || seen.has(ref.source.toLowerCase()) ||
          !Number.isSafeInteger(ref.sequence) || ref.sequence <= previous || ref.sequence > 10000 ||
          typeof ref.receiptDigest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(ref.receiptDigest) ||
          sources.get(ref.source) !== ref.sourceDigest) return null;
      seen.add(ref.source.toLowerCase()); previous = ref.sequence;
    }
    if (references.length !== sources.size) return null;
    const binding = prepared.verified.binding;
    const input: ProjectionObservation = {version:1,operation,corpus:historyCorpus,kind:"projection_published",
      projectionId:binding.projection_id,configurationDigest:binding.configuration_digest,
      publicationDigest:prepared.publicationDigest,authorityDigest:binding.scope_digest,
      policyDigest:binding.policy_digest,sources:references};
    const canonical = stableJson(input);
    for (const ref of references) Object.freeze(ref);
    Object.freeze(references); Object.freeze(input);
    const projectionCurrent = (candidate: ProjectionObservation) => {
      try { return prepared.current() && api.provider.vaultIdentity?.() === historyCorpus && stableJson(candidate) === canonical; }
      catch { return false; }
    };
    return projectionCurrent(input) ? Object.freeze({input, projectionCurrent}) : null;
  } catch { return null; }
}
