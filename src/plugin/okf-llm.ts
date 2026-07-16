import { requestUrl } from "obsidian";
import type { AgentSettings } from "./agent-server";

export function validatedOkfLlmEndpoint(provider: AgentSettings["okfEnrichmentProvider"], raw: string): string {
  if (provider === "none") throw new Error("Select a local or cloud enrichment provider first.");
  const url = new URL(raw);
  if (url.username || url.password) throw new Error("Model endpoint credentials must not be embedded in the URL.");
  if (provider === "local" && !(url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1" || url.hostname === "[::1]")) throw new Error("Local model endpoints must use loopback only.");
  if (provider === "cloud" && url.protocol !== "https:") throw new Error("Cloud model endpoints must use HTTPS.");
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Model endpoint must use HTTP or HTTPS.");
  return url.toString();
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

/** Bounded OpenAI-compatible JSON request shared by the two advisory passes. */
export async function requestOkfLlmJson(
  settings: AgentSettings,
  system: string,
  payload: unknown,
  maxTokens = 1200,
): Promise<unknown> {
  const provider = settings.okfEnrichmentProvider;
  if (!settings.okfEnrichmentModel.trim()) throw new Error("A model name is required.");
  const endpoint = validatedOkfLlmEndpoint(provider, settings.okfEnrichmentEndpoint);
  const envName = settings.okfEnrichmentApiKeyEnv.trim();
  const key = envName ? String((globalThis as any).process?.env?.[envName] || "") : "";
  if (provider === "cloud" && !key) throw new Error(`Cloud API key environment variable ${envName || "<unset>"} is unavailable to Obsidian.`);
  const body = JSON.stringify({
    model: settings.okfEnrichmentModel,
    temperature: 0,
    max_tokens: Math.max(100, Math.min(1600, maxTokens)),
    response_format: { type: "json_object" },
    tools: [],
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(payload) },
    ],
  });
  const request = requestUrl({ url: endpoint, method: "POST", headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body, throw: false });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Model request timed out; no retry was attempted.")), settings.okfEnrichmentTimeoutMs); });
  const response = await Promise.race([request, timeout]).finally(() => { if (timer) clearTimeout(timer); });
  if (response.status < 200 || response.status >= 300) throw new Error(`Model endpoint returned HTTP ${response.status}.`);
  const content = response.json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Model endpoint did not return OpenAI-compatible message content.");
  if (content.length > 65_536) throw new Error("Model response exceeded the 64 KiB safety limit.");
  return parseJsonObject(content);
}
