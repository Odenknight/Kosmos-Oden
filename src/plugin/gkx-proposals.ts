import type { GkxEnrichmentField, GkxEnrichmentSuggestion } from "gkos-engine";

export const GKX_PROPOSAL_SCHEMA = "gkx-proposal/1" as const;
export const GKX_PROPOSAL_CONTRACT = "GKOS-PROPOSAL-QUARANTINE-1.0.0-draft.1" as const;
export const GKX_PROPOSAL_ROOT = ".gkx/proposals" as const;
export const GKX_DECISION_SCHEMA = "gkx-proposal-decision/1" as const;
export const GKX_DECISION_CONTRACT = "GKOS-PROPOSAL-DECISION-1.0.0-draft.1" as const;
export const GKX_DECISION_ROOT = ".gkx/decisions" as const;

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

export interface CredentialBoundHumanActorRef {
  kind: "credential-bound-human";
  id: string;
  credentialId: string;
  credentialBound: true;
}

export type ProposalDisposition = "accepted" | "rejected" | "deferred";

export interface ImmutableGkxDecision {
  schema: typeof GKX_DECISION_SCHEMA;
  contractVersion: typeof GKX_DECISION_CONTRACT;
  decisionId: string;
  proposal: { id: string; contentHash: string };
  actor: CredentialBoundHumanActorRef;
  disposition: ProposalDisposition;
  source: { path: string; sourceSha256: string };
  planSha256?: string;
  reviewedValueSha256?: string;
  createdAt: string;
  operationId: string;
  contentHash: string;
}

export interface BuildProposalDecisionInput {
  proposal: ImmutableGkxProposal;
  actor: CredentialBoundHumanActorRef;
  disposition: ProposalDisposition;
  createdAt: string;
  operationId: string;
  planSha256?: string;
  reviewedValue?: unknown;
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

export interface PersistDecisionResult {
  directory: typeof GKX_DECISION_ROOT;
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
const DECISION_ID = /^gkxd-[0-9a-f]{24}$/;
const AUDIT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function codeUnitCompare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

function hasExactKeys(value: unknown, expected: string[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort(), wanted = expected.slice().sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

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

/** Parse only exact canonical proposal bytes; callers never infer from a filename. */
export async function parseImmutableProposalYaml(bytes: string): Promise<ImmutableGkxProposal> {
  let proposal: ImmutableGkxProposal;
  try { proposal = JSON.parse(bytes) as ImmutableGkxProposal; } catch { throw new Error("proposal sidecar is not valid canonical YAML/JSON"); }
  if (!hasExactKeys(proposal, ["schema", "contractVersion", "proposalId", "actor", "target", "change", "confidence", "evidence", "createdAt", "operationId", "status", "contentHash", "provenance"])) throw new Error("proposal sidecar has an unexpected shape");
  if (proposal.schema !== GKX_PROPOSAL_SCHEMA || proposal.contractVersion !== GKX_PROPOSAL_CONTRACT || !PROPOSAL_ID.test(proposal.proposalId)) throw new Error("proposal sidecar contract or ID is invalid");
  if (serializeProposalYaml(proposal) !== bytes || !(await verifyProposalContentHash(proposal))) throw new Error("proposal sidecar bytes or content hash are invalid");
  if (!hasExactKeys(proposal.actor, ["kind", "id", "credentialBound"]) || !["credential-bound-agent", "local-human", "deterministic-engine"].includes(proposal.actor.kind) || !AUDIT_ID.test(proposal.actor.id) || typeof proposal.actor.credentialBound !== "boolean") throw new Error("proposal actor is invalid");
  if (proposal.actor.kind === "credential-bound-agent" && !proposal.actor.credentialBound) throw new Error("proposal agent identity is not credential-bound");
  if (!hasExactKeys(proposal.target, ["uid", "path", "sourceSha256"]) || !proposal.target.uid.trim()) throw new Error("proposal target identity is invalid");
  assertSafeVaultRelativePath(proposal.target.path);
  if (!/^[0-9a-f]{64}$/.test(proposal.target.sourceSha256) || proposal.status !== "pending") throw new Error("proposal target hash or status is invalid");
  if (!hasExactKeys(proposal.change, ["field", "canonicalValue"]) || !["description", "type", "tags", "supersedes", "related_to"].includes(proposal.change.field) || canonicalJson(canonicalValue(proposal.change.field, proposal.change.canonicalValue)) !== canonicalJson(proposal.change.canonicalValue)) throw new Error("proposal change is not canonical");
  if (!Number.isFinite(proposal.confidence) || proposal.confidence < 0 || proposal.confidence > 1 || !Array.isArray(proposal.evidence) || !proposal.evidence.length || proposal.evidence.length > 16) throw new Error("proposal confidence or evidence is invalid");
  if (proposal.evidence.some((item) => !hasExactKeys(item, ["blockId", "fingerprint", "startLine", "endLine"]) || !Number.isSafeInteger(item.blockId) || !/^sha256:[0-9a-f]{64}$/.test(item.fingerprint) || !Number.isSafeInteger(item.startLine) || !Number.isSafeInteger(item.endLine) || item.startLine < 1 || item.endLine < item.startLine)) throw new Error("proposal evidence is invalid");
  const proposalCreatedAt = new Date(proposal.createdAt);
  if (!/^gkxep-[0-9a-f]{24}$/.test(proposal.operationId) || !Number.isFinite(proposalCreatedAt.getTime()) || proposalCreatedAt.toISOString() !== proposal.createdAt) throw new Error("proposal operation or creation time is invalid");
  const provenanceKeys = proposal.provenance?.model === undefined ? ["producer", "provider", "automaticApproval"] : ["producer", "provider", "model", "automaticApproval"];
  if (!hasExactKeys(proposal.provenance, provenanceKeys) || !proposal.provenance.producer || !["deterministic", "local", "lan", "cloud"].includes(proposal.provenance.provider) || proposal.provenance.automaticApproval !== false || (proposal.provenance.model !== undefined && !proposal.provenance.model)) throw new Error("proposal provenance is invalid");
  const identityHash = await proposalSha256(canonicalJson({ operationId: proposal.operationId, target: proposal.target, change: proposal.change, evidence: proposal.evidence, actor: proposal.actor }));
  if (proposal.proposalId !== `gkxp-${identityHash.slice(0, 24)}`) throw new Error("proposal identity hash is invalid");
  return proposal;
}

export async function buildImmutableProposalDecision(input: BuildProposalDecisionInput): Promise<ImmutableGkxDecision> {
  const { proposal, actor, disposition } = input;
  if (!(await verifyProposalContentHash(proposal)) || !PROPOSAL_ID.test(proposal.proposalId)) throw new Error("decision requires an intact immutable proposal");
  assertSafeVaultRelativePath(proposal.target.path);
  if (!SHA256.test(proposal.target.sourceSha256)) throw new Error("decision proposal source hash is invalid");
  if (actor.kind !== "credential-bound-human" || actor.credentialBound !== true || !AUDIT_ID.test(actor.id) || !/^sha256:[0-9a-f]{64}$/.test(actor.credentialId)) throw new Error("decision requires a credential-bound human actor");
  if (proposal.actor.kind === "credential-bound-agent" && proposal.actor.id === actor.id) throw new Error("an agent cannot approve its own proposal");
  if (!["accepted", "rejected", "deferred"].includes(disposition)) throw new Error("decision disposition is invalid");
  if (!AUDIT_ID.test(input.operationId)) throw new Error("decision operation ID is invalid");
  const created = new Date(input.createdAt);
  if (!Number.isFinite(created.getTime()) || created.toISOString() !== input.createdAt) throw new Error("decision creation time must be canonical UTC");
  if (input.planSha256 !== undefined && !/^[0-9a-f]{64}$/.test(input.planSha256)) throw new Error("decision plan SHA-256 is invalid");
  if (disposition === "accepted" && (!input.planSha256 || input.reviewedValue === undefined)) throw new Error("accepted decisions require a reviewed value and plan hash");
  if (disposition !== "accepted" && input.reviewedValue !== undefined) throw new Error("only accepted decisions may bind a reviewed value");
  const semantic = {
    schema: GKX_DECISION_SCHEMA,
    contractVersion: GKX_DECISION_CONTRACT,
    proposal: { id: proposal.proposalId, contentHash: proposal.contentHash },
    actor,
    disposition,
    source: { path: proposal.target.path, sourceSha256: proposal.target.sourceSha256.replace(/^sha256:/, "") },
    ...(input.planSha256 ? { planSha256: input.planSha256 } : {}),
    ...(input.reviewedValue !== undefined ? { reviewedValueSha256: `sha256:${await proposalSha256(canonicalJson(input.reviewedValue))}` } : {}),
    operationId: input.operationId,
  };
  const decisionId = `gkxd-${(await proposalSha256(canonicalJson(semantic))).slice(0, 24)}`;
  const content = { ...semantic, decisionId, createdAt: input.createdAt };
  return { ...content, contentHash: `sha256:${await proposalSha256(canonicalJson(content))}` };
}

export function serializeDecisionYaml(decision: ImmutableGkxDecision): string { return `${canonicalJson(decision)}\n`; }

export async function verifyDecisionContentHash(decision: ImmutableGkxDecision): Promise<boolean> {
  const { contentHash, ...content } = decision;
  return contentHash === `sha256:${await proposalSha256(canonicalJson(content))}`;
}

function semanticDecisionBytes(decision: ImmutableGkxDecision): string {
  const { createdAt: _createdAt, contentHash: _contentHash, ...semantic } = decision;
  return canonicalJson(semantic);
}

async function isExistingDecisionEquivalent(bytes: string, incoming: ImmutableGkxDecision): Promise<boolean> {
  let existing: ImmutableGkxDecision;
  try { existing = JSON.parse(bytes) as ImmutableGkxDecision; } catch { return false; }
  try { await assertImmutableDecision(existing); } catch { return false; }
  return serializeDecisionYaml(existing) === bytes
    && existing.decisionId === incoming.decisionId
    && semanticDecisionBytes(existing) === semanticDecisionBytes(incoming);
}

async function assertImmutableDecision(decision: ImmutableGkxDecision): Promise<void> {
  const optional = [decision.planSha256 === undefined ? null : "planSha256", decision.reviewedValueSha256 === undefined ? null : "reviewedValueSha256"].filter((item): item is string => item !== null);
  if (!hasExactKeys(decision, ["schema", "contractVersion", "decisionId", "proposal", "actor", "disposition", "source", "createdAt", "operationId", "contentHash", ...optional])) throw new Error("decision record has an unexpected shape");
  if (decision.schema !== GKX_DECISION_SCHEMA || decision.contractVersion !== GKX_DECISION_CONTRACT || !DECISION_ID.test(decision.decisionId)) throw new Error("decision contract or ID is invalid");
  if (!hasExactKeys(decision.proposal, ["id", "contentHash"]) || !PROPOSAL_ID.test(decision.proposal.id) || !/^sha256:[0-9a-f]{64}$/.test(decision.proposal.contentHash)) throw new Error("decision proposal binding is invalid");
  if (!hasExactKeys(decision.actor, ["kind", "id", "credentialId", "credentialBound"]) || decision.actor.kind !== "credential-bound-human" || decision.actor.credentialBound !== true || !AUDIT_ID.test(decision.actor.id) || !/^sha256:[0-9a-f]{64}$/.test(decision.actor.credentialId)) throw new Error("decision actor binding is invalid");
  if (!hasExactKeys(decision.source, ["path", "sourceSha256"]) || !/^[0-9a-f]{64}$/.test(decision.source.sourceSha256)) throw new Error("decision source binding is invalid");
  assertSafeVaultRelativePath(decision.source.path);
  if (!["accepted", "rejected", "deferred"].includes(decision.disposition) || !AUDIT_ID.test(decision.operationId)) throw new Error("decision disposition or operation is invalid");
  const created = new Date(decision.createdAt);
  if (!Number.isFinite(created.getTime()) || created.toISOString() !== decision.createdAt) throw new Error("decision creation time is invalid");
  if (decision.planSha256 !== undefined && !/^[0-9a-f]{64}$/.test(decision.planSha256)) throw new Error("decision plan binding is invalid");
  if (decision.disposition === "accepted" && (!decision.planSha256 || !/^sha256:[0-9a-f]{64}$/.test(decision.reviewedValueSha256 ?? ""))) throw new Error("accepted decision bindings are incomplete");
  if (decision.disposition !== "accepted" && decision.reviewedValueSha256 !== undefined) throw new Error("non-accepted decision has a reviewed value binding");
  if (!(await verifyDecisionContentHash(decision))) throw new Error(`decision content hash is invalid: ${decision.decisionId}`);
  const { decisionId: _decisionId, createdAt: _createdAt, contentHash: _contentHash, ...semantic } = decision;
  const identityHash = await proposalSha256(canonicalJson(semantic));
  if (decision.decisionId !== `gkxd-${identityHash.slice(0, 24)}`) throw new Error("decision identity hash is invalid");
}

function decisionPath(decisionId: string): string {
  if (!DECISION_ID.test(decisionId)) throw new Error("decision ID is unsafe");
  return `${GKX_DECISION_ROOT}/${decisionId}.yaml`;
}

/** Atomic per-record decision persistence with a complete collision preflight. */
export async function persistImmutableDecisions(adapter: ProposalStorageAdapter, decisions: ImmutableGkxDecision[]): Promise<PersistDecisionResult> {
  const prepared = decisions.map((decision) => ({ decision, path: decisionPath(decision.decisionId), bytes: serializeDecisionYaml(decision) }));
  const unique = new Map<string, typeof prepared[number]>();
  for (const item of prepared) {
    await assertImmutableDecision(item.decision);
    const prior = unique.get(item.decision.decisionId);
    if (prior && prior.bytes !== item.bytes) throw new Error(`different decision bytes share ID ${item.decision.decisionId}`);
    unique.set(item.decision.decisionId, item);
  }
  const ordered = [...unique.values()].sort((a, b) => codeUnitCompare(a.path, b.path));
  const unchanged = new Set<string>();
  // Preflight the whole batch before creating even one decision record.
  for (const item of ordered) if (await adapter.exists(item.path)) {
    const existing = await adapter.read(item.path);
    if (existing !== item.bytes && !(await isExistingDecisionEquivalent(existing, item.decision))) throw new Error(`immutable decision collision at ${item.path}`);
    unchanged.add(item.path);
  }
  await ensureDirectory(adapter, GKX_DECISION_ROOT);
  const result: PersistDecisionResult = { directory: GKX_DECISION_ROOT, created: [], unchanged: [] };
  for (const item of ordered) {
    if (unchanged.has(item.path)) { result.unchanged.push(item.path); continue; }
    const temp = `${GKX_DECISION_ROOT}/.${item.decision.decisionId}.${item.decision.contentHash.slice(-12)}.tmp`;
    try {
      if (await adapter.exists(temp) && await adapter.read(temp) !== item.bytes) throw new Error(`different temporary decision bytes exist at ${temp}`);
      if (!(await adapter.exists(temp))) await adapter.write(temp, item.bytes);
      if (await adapter.read(temp) !== item.bytes) throw new Error(`temporary decision verification failed at ${temp}`);
      if (await adapter.exists(item.path)) {
        const existing = await adapter.read(item.path);
        if (existing !== item.bytes && !(await isExistingDecisionEquivalent(existing, item.decision))) throw new Error(`immutable decision collision at ${item.path}`);
        await adapter.remove(temp); result.unchanged.push(item.path); continue;
      }
      await adapter.rename(temp, item.path);
      if (await adapter.read(item.path) !== item.bytes) throw new Error(`decision verification failed at ${item.path}`);
      result.created.push(item.path);
    } catch (error) {
      try { if (await adapter.exists(temp)) await adapter.remove(temp); } catch { /* retain original failure */ }
      throw error;
    }
  }
  return result;
}

function semanticProposalBytes(proposal: ImmutableGkxProposal): string {
  const { createdAt: _createdAt, contentHash: _contentHash, ...semantic } = proposal;
  return canonicalJson(semantic);
}

async function isExistingEquivalent(existingBytes: string, incoming: ImmutableGkxProposal): Promise<boolean> {
  let existing: ImmutableGkxProposal;
  try { existing = JSON.parse(existingBytes) as ImmutableGkxProposal; } catch { return false; }
  if (serializeProposalYaml(existing) !== existingBytes || !(await verifyProposalContentHash(existing))) return false;
  return existing.schema === GKX_PROPOSAL_SCHEMA
    && existing.contractVersion === GKX_PROPOSAL_CONTRACT
    && existing.proposalId === incoming.proposalId
    && semanticProposalBytes(existing) === semanticProposalBytes(incoming);
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
      const existing = await adapter.read(item.path);
      if (existing !== item.bytes && !(await isExistingEquivalent(existing, item.proposal))) throw new Error(`immutable proposal collision at ${item.path}`);
      result.unchanged.push(item.path);
      continue;
    }
    const temp = `${GKX_PROPOSAL_ROOT}/.${item.proposal.proposalId}.${item.proposal.contentHash.slice(-12)}.tmp`;
    try {
      if (await adapter.exists(temp) && await adapter.read(temp) !== item.bytes) throw new Error(`different temporary proposal bytes exist at ${temp}`);
      if (!(await adapter.exists(temp))) await adapter.write(temp, item.bytes);
      if (await adapter.read(temp) !== item.bytes) throw new Error(`temporary proposal verification failed at ${temp}`);
      if (await adapter.exists(item.path)) {
        const existing = await adapter.read(item.path);
        if (existing !== item.bytes && !(await isExistingEquivalent(existing, item.proposal))) throw new Error(`immutable proposal collision at ${item.path}`);
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
