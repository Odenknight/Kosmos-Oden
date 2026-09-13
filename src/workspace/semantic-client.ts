import {prepareGraphitiQueryRequest, acceptGraphitiQueryResult} from "gkos-engine/graphiti";
import type {GraphitiQueryContext, GraphitiQueryResult} from "gkos-engine/graphiti";

/** Native host configuration only; renderer requests cannot supply authority,
 * endpoints or credentials. Unavailable semantic results permit native fallback. */
export function createSemanticQueryClient(options: {
  endpoint: string; token: string; current: () => GraphitiQueryContext; fetcher?: typeof fetch;
  /** Shared by replacement clients so reconnect cannot bypass physical limits. */
  transportBudget?: {active: number};
}) {
  const endpoint = new URL(options.endpoint);
  if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash || endpoint.search ||
      !/^[A-Za-z0-9._~-]{32,512}$/.test(options.token)) throw new TypeError("SEMANTIC_CLIENT_CONFIGURATION_INVALID");
  const headers = {Authorization: `Bearer ${options.token}`, "Content-Type": "application/json", Accept: "application/json"};
  const fetcher = options.fetcher ?? fetch, current = options.current;
  const budget = options.transportBudget ?? {active: 0};
  return {
    isCurrent(query: string, requestId: string, result: GraphitiQueryResult, limit = 10): boolean {
      try {
        return acceptGraphitiQueryResult({contract_version:result.contract_version,request_id:requestId,binding:result.binding,query,limit},
          JSON.stringify(result), current()) !== null;
      } catch { return false; }
    },
    async search(query: string, requestId: string, signal: AbortSignal, limit = 10): Promise<GraphitiQueryResult | null> {
      if (budget.active >= 2 || signal.aborted) return null;
      const controller = new AbortController(), expires = performance.now() + 5000;
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, {once:true});
      const timer = setTimeout(abort, 5000);
      let onAbort: (() => void) | undefined;
      budget.active++;
      const operation = (async () => {
        const request = prepareGraphitiQueryRequest(query, limit, requestId, current());
        if (!request || controller.signal.aborted || performance.now() >= expires) return null;
        const response = await fetcher(endpoint.href, {method:"POST", headers, redirect:"error", cache:"no-store", signal:controller.signal,
          body:JSON.stringify({query:request.query, request_id:request.request_id, limit:request.limit})});
        if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("Content-Type") ?? "") || !response.body) {
          await response.body?.cancel(); return null;
        }
        const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", {fatal:true});
        let size = 0, text = "", complete = false;
        try {
          while (!controller.signal.aborted && performance.now() < expires) {
            const chunk = await reader.read();
            if (chunk.done) {text += decoder.decode(); complete = true; break;}
            size += chunk.value.byteLength;
            if (size > 131072) return null;
            text += decoder.decode(chunk.value, {stream:true});
          }
          if (!complete || controller.signal.aborted || performance.now() >= expires) return null;
          const result = acceptGraphitiQueryResult(request, text, current());
          return !controller.signal.aborted && performance.now() < expires ? result : null;
        } finally {
          if (!complete) {try {await reader.cancel();} catch { /* Native fallback. */ }}
          reader.releaseLock();
        }
      })().catch(() => null).finally(() => {budget.active--;});
      try {
        return await Promise.race([operation, new Promise<null>(resolve => {
          onAbort = () => resolve(null);
          controller.signal.addEventListener("abort", onAbort, {once:true});
          if (controller.signal.aborted) resolve(null);
        })]);
      } finally {
        clearTimeout(timer); signal.removeEventListener("abort", abort);
        if (onAbort) controller.signal.removeEventListener("abort", onAbort);
      }
    },
  };
}
