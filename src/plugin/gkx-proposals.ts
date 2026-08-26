import type { GkxEnrichmentField, GkxEnrichmentSuggestion } from "gkos-engine";

export const GKX_PROPOSAL_SCHEMA = "gkx-proposal/1" as const;
export const GKX_PROPOSAL_CONTRACT = "GKOS-PROPOSAL-QUARANTINE-1.0.0-draft.1" as const;
export const GKX_PROPOSAL_ROOT = ".gkx/proposals" as const;

export const AUTHORITY_BEARING_FIELDS = new Set([
  "approval", "approval_state", "effective", "effective_state", "uid", "sensitivity",
  "epistemic_state", "authorization", "authority", "lineage", "authoritative_lineage",
]);

export interface ProposalActorRef {
  kind: "credential-bound-agent" | "local-human" | "deterministic-engine";
  id: string;
  credentialBound: boolean;
}

export interface ProposalEvidenceRef {
  blockId: number;
  fingerprint: string;
  startLine: number;
  endLine: number;
}

export interface ImmutableGkxProposal {
  schema: typeof GKX_PROPOSAL_SCHEMA;
  contractVersion: typeof GKX_PROPOSAL_CONTRACT;
  proposalId: string;
  actor: ProposalActorRef;
  target: { uid: string; path: string; sourceSha256: string };
  change: { field: GkxEnrichmentField; canonicalValue: string | string[] };
  confidence: number;
  evidence: ProposalEvidenceRef[];
  createdAt: string;
  operationId: string;
  status: "pending";
  contentHash: string;
  provenance: {
    producer: string;
    provider: "deterministic" | "local" | "lan" | "cloud";
    model?: string;
    automaticApproval: false;
  };
}

export interface EnrichmentProposalSource {
  proposalId: string;
  createdAt: string;
  targetUid: string;
  path: string;
  noteHash: string;
  provider: "deterministic" | "local" | "lan" | "cloud";
  model?: string;
  evidence: Array<{ id: number; fingerprint: string; startLine: number; endLine: number }>;
  suggestions: GkxEnrichmentSuggestion[];
}

export interface ProposalStorageAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, contents: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

export interface PersistProposalResult {
  directory: typeof GKX_PROPOSAL_ROOT;
  created: string[];
  unchanged: string[];
}

export interface ProposalConflict {
  targetUid: string;
  field: GkxEnrichmentField;
  proposalIds: string[];
  canonicalValues: Array<string | string[]>;
}

export interface ProposalTriageFilters {
  direction: "descending" | "ascending";
  field?: string;
  source?: string;
  minimumConfidence?: number;
  maximumConfidence?: number;
  conflict?: "conflicting" | "clear";
  agent?: string;
}

const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const SHA256 = /^(?:sha256:)?[0-9a-f]{64}$/;
const PROPOSAL_ID = /^gkxp-[0-9a-f]{24}$/;

function codeUnitCompare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => codeUnitCompare(a, b)).map(([key, item]) => [key, stable(item)]));
  return value;
}

export function canonicalJson(value: unknown): string { return JSON.stringify(stable(value)); }

export async function proposalSha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function assertSafeVaultRelativePath(path: string): string {
  if (typeof path !== "string" || !path || path.includes("\0")) throw new Error("proposal target path is empty or contains NUL");
  let decoded: string;
  try { decoded = decodeURIComponent(path); } catch { throw new Error("proposal target path has invalid encoding"); }
  const normalized = decoded.normalize("NFC").replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.startsWith("//") || /^[a-z]:/i.test(normalized)) throw new Error("proposal target path must be vault-relative");
  const segments = normalized.split("/");
  if (segments.some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part) || WINDOWS_DEVICE.test(part))) throw new Error("proposal target path contains a traversal or portability hazard");
  if (normalized !== path.replace(/\\/g, "/").normalize("NFC")) throw new Error("proposal target path must already be normalized and unencoded");
  return normalized;
}

function canonicalValue(field: GkxEnrichmentField, value: string | string[]): string | string[] {
  if (AUTHORITY_BEARING_FIELDS.has(field)) throw new Error(`authority-bearing field is denied: ${field}`);
  if (Array.isArray(value)) return [...new Set(value.map((item) => item.normalize("NFC").trim()).filter(Boolean))].sort(codeUnitCompare);
  return value.normalize("NFC").trim();
}

function assertSource(source: EnrichmentProposalSource): void {
  assertSafeVaultRelativePath(source.path);
  if (!source.targetUid.trim()) throw new Error("proposal target UID is required");
  if (!SHA256.test(source.noteHash)) throw new Error("proposal target source SHA-256 is invalid");
  if (!/^gkxep-[0-9a-f]{24}$/.test(source.proposalId)) throw new Error("proposal operation ID is invalid");
  if (!Number.isFinite(Date.parse(source.createdAt))) throw new Error("proposal creation time is invalid");
}

export async function buildImmutableProposals(source: EnrichmentProposalSource, actor: ProposalActorRef = { kind: "local-human", id: "local-obsidian-operator", credentialBound: false }): Promise<ImmutableGkxProposal[]> {
  assertSource(source);
  if (!actor.id.trim()) throw new Error("proposal actor ID is required");
  if (actor.kind === "credential-bound-agent" && !actor.credentialBound) throw new Error("agent proposals require a credential-bound identity");
  const evidenceById = new Map(source.evidence.map((item) => [item.id, item]));
  const results: ImmutableGkxProposal[] = [];
  for (const suggestion of source.suggestions) {
    if (!Number.isFinite(suggestion.confidence) || suggestion.confidence < 0 || suggestion.confidence > 1) throw new Error("proposal confidence must be between 0 and 1");
    const evidence = [...new Set(suggestion.evidenceBlockIds)].slice(0, 16).map((id) => evidenceById.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item)).map((item) => ({ blockId: item.id, fingerprint: item.fingerprint, startLine: item.startLine, endLine: item.endLine }));
    if (!evidence.length) throw new Error("proposal evidence references are required");
    if (evidence.some((item) => !/^sha256:[0-9a-f]{64}$/.test(item.fingerprint) || !Number.isSafeInteger(item.startLine) || !Number.isSafeInteger(item.endLine) || item.startLine < 1 || item.endLine < item.startLine)) throw new Error("proposal evidence reference is invalid");
    const base = {
      schema: GKX_PROPOSAL_SCHEMA,
      contractVersion: GKX_PROPOSAL_CONTRACT,
      actor,
      target: { uid: source.targetUid, path: source.path, sourceSha256: source.noteHash.replace(/^sha256:/, "") },
      change: { field: suggestion.field, canonicalValue: canonicalValue(suggestion.field, suggestion.value) },
      confidence: suggestion.confidence,
      evidence,
      createdAt: source.createdAt,
      operationId: source.proposalId,
      status: "pending" as const,
      provenance: { producer: suggestion.source === "llm" ? (source.model || "configured-model") : "gkos-engine:deterministic", provider: source.provider, ...(source.model ? { model: source.model } : {}), automaticApproval: false as const },
    };
    const identityHash = await proposalSha256(canonicalJson({ operationId: base.operationId, target: base.target, change: base.change, evidence: base.evidence, actor: base.actor }));
    const proposalId = `gkxp-${identityHash.slice(0, 24)}`;
    const contentHash = `sha256:${await proposalSha256(canonicalJson({ ...base, proposalId }))}`;
    results.push({ ...base, proposalId, contentHash });
  }
  return results;
}

// JSON is a strict, deterministic subset of YAML 1.2. Keeping the exact bytes
// canonical makes idempotency and immutable-record verification unambiguous.
export function serializeProposalYaml(proposal: ImmutableGkxProposal): string { return `${canonicalJson(proposal)}\n`; }

export async function verifyProposalContentHash(proposal: ImmutableGkxProposal): Promise<boolean> {
  const { contentHash, ...content } = proposal;
  return contentHash === `sha256:${await proposalSha256(canonicalJson(content))}`;
}

function proposalPath(proposalId: string): string {
  if (!PROPOSAL_ID.test(proposalId)) throw new Error("proposal ID is unsafe");
  return `${GKX_PROPOSAL_ROOT}/${proposalId}.yaml`;
}

async function ensureDirectory(adapter: ProposalStorageAdapter, path: string): Promise<void> {
  let current = "";
  for (const part of path.split("/")) {
    current = current ? `${current}/${part}` : part;
    if (!(await adapter.exists(current))) {
      try { await adapter.mkdir(current); }
      catch (error) { if (!(await adapter.exists(current))) throw error; }
    }
  }
}

export async function persistImmutableProposals(adapter: ProposalStorageAdapter, proposals: ImmutableGkxProposal[]): Promise<PersistProposalResult> {
  const prepared = proposals.map((proposal) => ({ proposal, path: proposalPath(proposal.proposalId), bytes: serializeProposalYaml(proposal) }));
  const byId = new Map<string, string>();
  for (const item of prepared) {
    assertSafeVaultRelativePath(item.proposal.target.path);
    if (!(await verifyProposalContentHash(item.proposal))) throw new Error(`proposal content hash is invalid: ${item.proposal.proposalId}`);
    const prior = byId.get(item.proposal.proposalId);
    if (prior !== undefined && prior !== item.bytes) throw new Error(`different proposal bytes share ID ${item.proposal.proposalId}`);
    byId.set(item.proposal.proposalId, item.bytes);
  }
  await ensureDirectory(adapter, GKX_PROPOSAL_ROOT);
  const result: PersistProposalResult = { directory: GKX_PROPOSAL_ROOT, created: [], unchanged: [] };
  for (const item of [...new Map(prepared.map((entry) => [entry.proposal.proposalId, entry])).values()].sort((a, b) => codeUnitCompare(a.path, b.path))) {
    if (await adapter.exists(item.path)) {
      if (await adapter.read(item.path) !== item.bytes) throw new Error(`immutable proposal collision at ${item.path}`);
      result.unchanged.push(item.path);
      continue;
    }
    const temp = `${GKX_PROPOSAL_ROOT}/.${item.proposal.proposalId}.${item.proposal.contentHash.slice(-12)}.tmp`;
    try {
      if (await adapter.exists(temp) && await adapter.read(temp) !== item.bytes) throw new Error(`different temporary proposal bytes exist at ${temp}`);
      if (!(await adapter.exists(temp))) await adapter.write(temp, item.bytes);
      if (await adapter.read(temp) !== item.bytes) throw new Error(`temporary proposal verification failed at ${temp}`);
      if (await adapter.exists(item.path)) {
        if (await adapter.read(item.path) !== item.bytes) throw new Error(`immutable proposal collision at ${item.path}`);
        await adapter.remove(temp);
        result.unchanged.push(item.path);
        continue;
      }
      await adapter.rename(temp, item.path);
      if (await adapter.read(item.path) !== item.bytes) throw new Error(`proposal verification failed at ${item.path}`);
      result.created.push(item.path);
    } catch (error) {
      try { if (await adapter.exists(temp)) await adapter.remove(temp); } catch { /* retain the original failure */ }
      throw error;
    }
  }
  return result;
}

export function projectProposalConflicts(proposals: ImmutableGkxProposal[]): ProposalConflict[] {
  const groups = new Map<string, ImmutableGkxProposal[]>();
  for (const proposal of proposals) {
    const key = `${proposal.target.uid}\0${proposal.change.field}`;
    groups.set(key, [...(groups.get(key) ?? []), proposal]);
  }
  const conflicts: ProposalConflict[] = [];
  for (const group of groups.values()) {
    const values = new Map(group.map((item) => [canonicalJson(item.change.canonicalValue), item.change.canonicalValue]));
    if (values.size < 2) continue;
    conflicts.push({ targetUid: group[0].target.uid, field: group[0].change.field, proposalIds: group.map((item) => item.proposalId).sort(codeUnitCompare), canonicalValues: [...values.entries()].sort(([a], [b]) => codeUnitCompare(a, b)).map(([, value]) => value) });
  }
  return conflicts.sort((a, b) => codeUnitCompare(`${a.targetUid}\0${a.field}`, `${b.targetUid}\0${b.field}`));
}

export function triageProposals(proposals: ImmutableGkxProposal[], filters: ProposalTriageFilters): ImmutableGkxProposal[] {
  const conflicts = new Set(projectProposalConflicts(proposals).flatMap((item) => item.proposalIds));
  return proposals.filter((proposal) => {
    if (filters.field && proposal.change.field !== filters.field) return false;
    if (filters.source && proposal.provenance.producer !== filters.source && proposal.provenance.provider !== filters.source) return false;
    if (filters.agent && !proposal.actor.id.toLowerCase().includes(filters.agent.toLowerCase())) return false;
    if (filters.minimumConfidence !== undefined && proposal.confidence < filters.minimumConfidence) return false;
    if (filters.maximumConfidence !== undefined && proposal.confidence > filters.maximumConfidence) return false;
    if (filters.conflict === "conflicting" && !conflicts.has(proposal.proposalId)) return false;
    if (filters.conflict === "clear" && conflicts.has(proposal.proposalId)) return false;
    return true;
  }).sort((a, b) => (filters.direction === "ascending" ? a.confidence - b.confidence : b.confidence - a.confidence) || codeUnitCompare(a.proposalId, b.proposalId));
}

export function selectTriageCandidates(proposals: ImmutableGkxProposal[], threshold: number): string[] {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error("selection threshold must be between 0 and 1");
  return proposals.filter((proposal) => proposal.confidence >= threshold && !AUTHORITY_BEARING_FIELDS.has(proposal.change.field)).map((proposal) => proposal.proposalId).sort(codeUnitCompare);
}
