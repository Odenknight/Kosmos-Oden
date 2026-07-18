import type { Frontmatter } from "./markdown";
import { contentHash } from "./paths";

export type OkfOrigin = "authored" | "derived" | "proposed" | "approved";
export type DiagnosticSeverity = "info" | "warning" | "error" | "critical";
export interface OkfDiagnostic { code: string; severity: DiagnosticSeverity; field?: string; message: string; deterministic: true; remediation?: string; sourcePath?: string; targetUid?: string }
export interface OriginSet<T> { authored: T; derived: T; proposed: T; approved: T }
export interface OkfAssessment {
  policyId: string; policyVersion: string; policyHash: string; assessor: "kosmos-oden";
  engineVersion: string; inputHash: string; calculatedAt: string;
  components: Record<string, number | null>; exclusions: string[]; overall: number | null;
  meaning: "documentation-and-support-quality-not-truth";
}
export interface Okf23Projection {
  profile: "OKF+ v2.3 Validating Projection Profile";
  mode: "strict-v2.3" | "compatible" | "legacy";
  okfVersion: string | null; uid: string | null; title: string | null; type: string | null;
  createdAt: string | null; updatedAt: string | null; contentHash: string;
  authored: Record<string, unknown>; derived: Record<string, unknown>;
  proposed: Record<string, unknown>; approved: Record<string, unknown>;
  labels: OriginSet<string[]>; extensions: Record<string, unknown>;
  diagnostics: OkfDiagnostic[]; assessment: OkfAssessment;
  schema: { id: "okf-plus-2.3-validating-projection"; version: "2.3"; hash: string };
}

const KNOWN = new Set(["okf_version","uid","title","type","created_at","updated_at","timestamp","authorship","epistemic","epistemic_state","sensitivity","provenance","relationships","evidence","lineage","review","assessment","authorization","labels","supersedes","superseded_by","supersededBy","forked_from","forked_to","description","scope","scope_id","resource","tags","aliases"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EPISTEMIC = new Set(["unknown","observation","reported","inferred","hypothesis","modeled","supported","contested","refuted","retracted","accepted","superseded"]);
const SENSITIVITY = new Set(["public","internal","restricted","confidential","regulated","phi","secret"]);
const s = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const diag = (code: string, severity: DiagnosticSeverity, field: string, message: string, sourcePath?: string): OkfDiagnostic => ({ code, severity, field, message, deterministic: true, sourcePath });
const score = (n: number) => Math.max(0, Math.min(1, Math.round(n * 10000) / 10000));

export function projectOkf23(data: Frontmatter, rawContent: string, sourcePath = "", mode: Okf23Projection["mode"] = "compatible", engineVersion = "0.6.5-beta.7"): Okf23Projection {
  const raw = data as Record<string, unknown>; const diagnostics: OkfDiagnostic[] = [];
  const version = s(raw.okf_version); const uid = s(raw.uid); const is23 = version === "2.3" || version?.startsWith("2.3.");
  if (!uid) diagnostics.push(diag("OKF-IDENTITY-001", mode === "strict-v2.3" ? "error" : "warning", "uid", "Missing UID; legacy path identity remains readable but is not canonical.", sourcePath));
  else if (!UUID.test(uid)) diagnostics.push(diag("OKF-IDENTITY-002", "error", "uid", "UID is not a recognized UUID.", sourcePath));
  if (mode === "strict-v2.3" && !is23) diagnostics.push(diag("OKF-SCHEMA-001", "error", "okf_version", "Strict mode requires OKF+ 2.3.", sourcePath));
  const epistemic = s(obj(raw.epistemic).state) ?? s(raw.epistemic_state);
  if (epistemic && !EPISTEMIC.has(epistemic)) diagnostics.push(diag("OKF-EPISTEMIC-002", "error", "epistemic", "Invalid epistemic state.", sourcePath));
  const sensitivity = s(obj(raw.sensitivity).level) ?? s(raw.sensitivity);
  if (!sensitivity) diagnostics.push(diag("OKF-SENSITIVITY-001", "warning", "sensitivity", "Sensitivity missing; effective default is internal.", sourcePath));
  else if (!SENSITIVITY.has(sensitivity)) diagnostics.push(diag("OKF-SENSITIVITY-005", "error", "sensitivity", "Invalid sensitivity level; access must fail closed.", sourcePath));
  const provenance = obj(raw.provenance), evidence = obj(raw.evidence), relationships = obj(raw.relationships), review = obj(raw.review), authorization = obj(raw.authorization);
  const structural = score([version,uid,s(raw.title),s(raw.type),s(raw.created_at) ?? s(raw.timestamp),sensitivity].filter(Boolean).length / 6);
  const provenanceScore = Object.keys(provenance).length ? score((s(provenance.source_kind) ? .35 : 0) + (provenance.source_refs ? .35 : 0) + (s(provenance.source_locator) ? .3 : 0)) : null;
  const evidenceScore = Object.keys(evidence).length ? score((Array.isArray(evidence.supports) ? .5 : 0) + (Array.isArray(evidence.contradicts) ? .5 : 0)) : null;
  const relationScore = Object.keys(relationships).length ? 1 : null;
  const freshness = s(raw.updated_at) || s(raw.timestamp) ? 1 : null;
  const contradiction = Array.isArray(evidence.contradicts) ? (evidence.contradicts.length ? .5 : 1) : null;
  const readiness = Object.keys(review).length || Object.keys(authorization).length ? .75 : null;
  const components: Record<string, number | null> = { structural_completeness: structural, provenance_quality: provenanceScore, evidence_support: evidenceScore, relationship_integrity: relationScore, temporal_freshness: freshness, contradiction_status: contradiction, review_readiness: readiness };
  const weights: Record<string, number> = { structural_completeness:.15, provenance_quality:.2, evidence_support:.2, relationship_integrity:.15, temporal_freshness:.1, contradiction_status:.1, review_readiness:.1 };
  let weighted=0,total=0; const exclusions:string[]=[]; for (const [k,v] of Object.entries(components)) v == null ? exclusions.push(k) : (weighted += v*weights[k], total += weights[k]);
  const overall = total ? score(weighted/total) : null;
  const derivedLabels = [uid ? "identity:stable" : "identity:missing", `sensitivity:${sensitivity ?? "internal"}`, overall == null ? "assessment:not-assessable" : overall >= .85 ? "assessment:strongly-documented" : overall >= .7 ? "assessment:well-documented" : overall >= .45 ? "assessment:partially-supported" : "assessment:weakly-supported"];
  const authoredLabels = obj(raw.labels); const extensions = Object.fromEntries(Object.entries(raw).filter(([k]) => !KNOWN.has(k)));
  const inputHash = contentHash(JSON.stringify(raw));
  return { profile:"OKF+ v2.3 Validating Projection Profile", mode, okfVersion:version, uid, title:s(raw.title), type:s(raw.type), createdAt:s(raw.created_at) ?? s(raw.timestamp), updatedAt:s(raw.updated_at), contentHash:contentHash(rawContent), authored:raw, derived:{ effectiveSensitivity:sensitivity ?? "internal", epistemicState:epistemic }, proposed:{}, approved:{}, labels:{ authored:Array.isArray(authoredLabels.authored) ? authoredLabels.authored.filter((x):x is string=>typeof x==="string") : [], derived:derivedLabels, proposed:[], approved:[] }, extensions, diagnostics, assessment:{ policyId:"okf23-default", policyVersion:"1.0.0", policyHash:contentHash(JSON.stringify(weights)), assessor:"kosmos-oden", engineVersion, inputHash, calculatedAt:"deterministic-at-index-time", components, exclusions, overall, meaning:"documentation-and-support-quality-not-truth" }, schema:{ id:"okf-plus-2.3-validating-projection", version:"2.3", hash:contentHash("okf-plus-2.3-validating-projection/1") } };
}
