import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import { publicGkxEnrichmentApplyPlan, verifyGkxEnrichmentApplyPlan, type GkxEnrichmentApplyEntry, type GkxEnrichmentApplyPlan } from "gkos-engine";
import {
  GKX_PROPOSAL_ROOT,
  buildImmutableProposalDecision,
  canonicalJson,
  parseImmutableProposalYaml,
  persistImmutableDecisions,
  proposalSha256,
  type CredentialBoundHumanActorRef,
  type ImmutableGkxProposal,
  type ProposalStorageAdapter,
} from "./gkx-proposals";

const REVIEWER_SECRET_ID = "kosmos-oden:gkx-reviewer-credential:v1";

export interface ReviewedApplyAcknowledgements {
  backupReady: true;
  valuesReviewed: true;
  relationshipsReviewed: true;
}

export interface ReviewedDecisionAcknowledgement { valuesReviewed: true; }

export interface GkxEnrichmentApplyResult {
  runId: string;
  planHash: string;
  applied: string[];
  skippedChanged: string[];
  skippedMissing: string[];
  failed: Array<{ path: string; error: string }>;
  reviewed: number;
  accepted: number;
  rejected: number;
  edited: number;
  backupRoot: string;
  planPath: string;
  resultPath: string;
  completedAt: string;
}
async function ensureFolder(app: App, path: string): Promise<void> {
  let current = "";
  for (const part of normalizePath(path).split("/").filter(Boolean)) {
    current = current ? `${current}/${part}` : part;
    if (!(await app.vault.adapter.exists(current))) {
      try { await app.vault.createFolder(current); }
      catch (error) { if (!(await app.vault.adapter.exists(current))) throw error; }
    }
  }
}

function storageAdapter(app: App): ProposalStorageAdapter {
  return {
    exists: (path) => app.vault.adapter.exists(path),
    read: (path) => app.vault.adapter.read(path),
    write: (path, contents) => app.vault.adapter.write(path, contents),
    rename: (from, to) => app.vault.adapter.rename(from, to),
    remove: (path) => app.vault.adapter.remove(path),
    mkdir: async (path) => { await app.vault.createFolder(path); },
  };
}

async function credentialBoundReviewer(app: App): Promise<CredentialBoundHumanActorRef> {
  const secrets = (app as any).secretStorage;
  if (!secrets || typeof secrets.getSecret !== "function" || typeof secrets.setSecret !== "function") throw new Error("Secret Storage is unavailable; reviewer identity cannot be credential-bound");
  let secret = String(await Promise.resolve(secrets.getSecret(REVIEWER_SECRET_ID)) || "");
  if (secret && !/^[0-9a-f]{64}$/.test(secret)) throw new Error("Secret Storage reviewer credential is invalid; refusing to rotate audit identity silently");
  if (!secret) {
    const random = new Uint8Array(32); crypto.getRandomValues(random);
    secret = [...random].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    await Promise.resolve(secrets.setSecret(REVIEWER_SECRET_ID, secret));
    if (String(await Promise.resolve(secrets.getSecret(REVIEWER_SECRET_ID)) || "") !== secret) throw new Error("Secret Storage did not retain the reviewer credential");
  }
  const digest = await proposalSha256(secret);
  return { kind: "credential-bound-human", id: `local-human-${digest.slice(0, 24)}`, credentialId: `sha256:${digest}`, credentialBound: true };
}

function canonicalSuggestionValue(value: string | string[]): string | string[] {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => String(item).normalize("NFC").trim()).filter(Boolean))].sort()
    : String(value).normalize("NFC").trim();
}

async function loadCanonicalProposalSidecars(app: App): Promise<ImmutableGkxProposal[]> {
  const adapter: any = app.vault.adapter;
  if (typeof adapter.list !== "function" || !(await adapter.exists(GKX_PROPOSAL_ROOT))) throw new Error("immutable proposal quarantine is unavailable; save proposals before recording decisions");
  const listing = await adapter.list(GKX_PROPOSAL_ROOT);
  const files = [...(listing?.files ?? [])].filter((path: string) => path.startsWith(`${GKX_PROPOSAL_ROOT}/`) && path.endsWith(".yaml")).sort();
  const proposals: ImmutableGkxProposal[] = [];
  for (const path of files) proposals.push(await parseImmutableProposalYaml(await adapter.read(path)));
  return proposals;
}

/** Resolve every plan item before writing any decision, plan, backup, or source byte. */
async function bindPlanToProposals(app: App, plan: GkxEnrichmentApplyPlan): Promise<Array<{ entry: GkxEnrichmentApplyEntry; review: GkxEnrichmentApplyEntry["decisions"][number]; proposal: ImmutableGkxProposal }>> {
  const proposals = await loadCanonicalProposalSidecars(app);
  const used = new Set<string>();
  const bound: Array<{ entry: GkxEnrichmentApplyEntry; review: GkxEnrichmentApplyEntry["decisions"][number]; proposal: ImmutableGkxProposal }> = [];
  for (const entry of plan.entries) for (const review of entry.decisions) {
    if (review.decision === "accepted" && !review.finalSuggestion) throw new Error(`accepted review item ${entry.proposalId}:${review.suggestionIndex} has no final reviewed value`);
    const expectedValue = canonicalJson(canonicalSuggestionValue(review.originalSuggestion.value));
    const matches = proposals.filter((proposal) => !used.has(proposal.proposalId)
      && proposal.operationId === entry.proposalId
      && proposal.target.path === entry.path
      && proposal.target.sourceSha256.replace(/^sha256:/, "") === entry.expectedNoteHash.replace(/^sha256:/, "")
      && proposal.change.field === review.originalSuggestion.field
      && canonicalJson(proposal.change.canonicalValue) === expectedValue);
    if (matches.length !== 1) throw new Error(`review item ${entry.proposalId}:${review.suggestionIndex} has ${matches.length} canonical proposal matches; expected exactly one`);
    used.add(matches[0].proposalId); bound.push({ entry, review, proposal: matches[0] });
  }
  return bound;
}

export async function persistReviewedEnrichmentDecisions(app: App, plan: GkxEnrichmentApplyPlan, acknowledgement: ReviewedDecisionAcknowledgement): Promise<{ created: string[]; unchanged: string[] }> {
  if (!acknowledgement || acknowledgement.valuesReviewed !== true) throw new Error("explicit human review acknowledgement is required before decision persistence");
  if (!(await verifyGkxEnrichmentApplyPlan(plan))) throw new Error("reviewed enrichment plan changed before decision persistence");
  const bound = await bindPlanToProposals(app, plan);
  const actor = await credentialBoundReviewer(app);
  const createdAt = new Date().toISOString();
  const decisions = await Promise.all(bound.map(({ review, proposal }) => buildImmutableProposalDecision({
    proposal,
    actor,
    disposition: review.decision,
    createdAt,
    operationId: plan.runId,
    planSha256: plan.planHash,
    ...(review.decision === "accepted" ? { reviewedValue: { field: review.finalSuggestion!.field, value: review.finalSuggestion!.value } } : {}),
  })));
  return persistImmutableDecisions(storageAdapter(app), decisions);
}

export async function saveGkxEnrichmentApplyPlan(app: App, plan: GkxEnrichmentApplyPlan): Promise<string> {
  const root = normalizePath(`.gkx/enrichment/${plan.runId}`);
  const path = `${root}/plan.json`;
  await ensureFolder(app, root);
  const serialized = JSON.stringify(publicGkxEnrichmentApplyPlan(plan), null, 2) + "\n";
  if (await app.vault.adapter.exists(path)) {
    if (await app.vault.adapter.read(path) !== serialized) throw new Error(`a different enrichment plan already exists at ${path}`);
  } else await app.vault.adapter.write(path, serialized);
  return path;
}

export async function applyGkxEnrichmentPlan(app: App, plan: GkxEnrichmentApplyPlan, acknowledgements: ReviewedApplyAcknowledgements): Promise<GkxEnrichmentApplyResult> {
  if (!(await verifyGkxEnrichmentApplyPlan(plan))) throw new Error("approved enrichment plan or in-memory content changed after preview; build a new plan");
  if (!acknowledgements || acknowledgements.backupReady !== true || acknowledgements.valuesReviewed !== true || acknowledgements.relationshipsReviewed !== true) throw new Error("all explicit human acknowledgements are required before decision persistence or apply");
  // The immutable reviewed decisions are committed first. Failure here leaves
  // proposal and source bytes untouched and prevents the guarded writer.
  await persistReviewedEnrichmentDecisions(app, plan, { valuesReviewed: true });
  const root = normalizePath(`.gkx/enrichment/${plan.runId}`);
  const backupRoot = normalizePath(`.gkx/backup/${plan.runId}`);
  const planPath = await saveGkxEnrichmentApplyPlan(app, plan);
  const resultPath = `${root}/result.json`;
  await ensureFolder(app, backupRoot);
  const result: GkxEnrichmentApplyResult = { runId: plan.runId, planHash: plan.planHash, applied: [], skippedChanged: [], skippedMissing: [], failed: [], reviewed: plan.totals.reviewed, accepted: plan.totals.accepted, rejected: plan.totals.rejected, edited: plan.totals.edited, backupRoot, planPath, resultPath, completedAt: "" };
  for (const entry of plan.entries.filter((candidate) => candidate.status === "ready")) {
    try {
      const abstract = app.vault.getAbstractFileByPath(entry.path);
      if (!(abstract instanceof TFile)) { result.skippedMissing.push(entry.path); continue; }
      const live = await app.vault.read(abstract);
      if (live !== entry.originalContent) { result.skippedChanged.push(entry.path); continue; }
      const backupPath = normalizePath(`${backupRoot}/${entry.path}.bak`);
      const slash = backupPath.lastIndexOf("/");
      if (slash > 0) await ensureFolder(app, backupPath.slice(0, slash));
      if (await app.vault.adapter.exists(backupPath)) throw new Error(`backup already exists: ${backupPath}`);
      await app.vault.adapter.writeBinary(backupPath, await app.vault.adapter.readBinary(entry.path));
      let matched = false;
      const written = await app.vault.process(abstract, (current) => {
        if (current !== entry.originalContent) return current;
        matched = true; return entry.proposedContent!;
      });
      if (!matched || written !== entry.proposedContent) result.skippedChanged.push(entry.path);
      else result.applied.push(entry.path);
    } catch (error: any) { result.failed.push({ path: entry.path, error: String(error?.message || error) }); }
  }
  result.completedAt = new Date().toISOString();
  await app.vault.adapter.write(resultPath, JSON.stringify(result, null, 2) + "\n");
  return result;
}

function acknowledgement(parent: HTMLElement, text: string, changed: (checked: boolean) => void): void {
  const label = parent.createEl("label"); label.style.display = "flex"; label.style.gap = "8px"; label.style.alignItems = "flex-start"; label.style.margin = "10px 0";
  const input = label.createEl("input", { type: "checkbox" }); label.createSpan({ text });
  input.addEventListener("change", () => changed(input.checked));
}

function renderEntries(parent: HTMLElement, title: string, entries: GkxEnrichmentApplyEntry[]): void {
  const details = parent.createEl("details"); details.createEl("summary", { text: `${title} (${entries.length})` });
  for (const entry of entries.slice(0, 50)) {
    const note = details.createEl("div"); note.style.margin = "8px 0 12px";
    note.createEl("strong", { text: entry.path });
    if (entry.reasons.length) note.createEl("div", { text: entry.reasons.join(" | "), cls: "setting-item-description" });
    const accepted = entry.decisions.filter((decision) => decision.decision === "accepted" && decision.finalSuggestion);
    if (accepted.length) {
      const list = note.createEl("ul");
      for (const decision of accepted) list.createEl("li", { text: `${decision.finalSuggestion!.field}: ${JSON.stringify(decision.finalSuggestion!.value)}${decision.edited ? " (reviewer edited)" : ""}` });
    }
  }
}

export class GkxEnrichmentApplyPreviewModal extends Modal {
  private applying = false;
  constructor(app: App, private plan: GkxEnrichmentApplyPlan, private onApplied?: (result: GkxEnrichmentApplyResult) => void) { super(app); }
  onOpen(): void {
    const { contentEl, plan } = this; contentEl.empty();
    contentEl.createEl("h2", { text: "Apply reviewed GKX enrichment — governed preview" });
    contentEl.createEl("p", { text: `${plan.totals.reviewed} suggestions reviewed: ${plan.totals.accepted} accepted, ${plan.totals.rejected} rejected, ${plan.totals.edited} edited. ${plan.totals.ready} notes are ready; ${plan.totals.blocked} are blocked; ${plan.totals.noChange} require no write.` });
    contentEl.createEl("p", { text: `Plan SHA-256: ${plan.planHash}`, cls: "setting-item-description" });
    contentEl.createEl("p", { text: "The plan contains hashes and decisions, not note bodies. Each ready note is rechecked, byte-backed up, and written only if it still exactly matches the reviewed source. Markdown body bytes remain unchanged." });
    renderEntries(contentEl, "Ready changes", plan.entries.filter((entry) => entry.status === "ready"));
    renderEntries(contentEl, "Blocked", plan.entries.filter((entry) => entry.status === "blocked"));
    renderEntries(contentEl, "No change", plan.entries.filter((entry) => entry.status === "no-change"));
    if (!plan.totals.ready) {
      let reviewed = false; let decisionButton: HTMLButtonElement | null = null;
      acknowledgement(contentEl, "I reviewed every recorded disposition; confidence and connectivity approved nothing automatically.", (value) => { reviewed = value; if (decisionButton) decisionButton.disabled = !value; });
      new Setting(contentEl).addButton((button) => {
        button.setButtonText("Save reviewed decisions"); decisionButton = button.buttonEl; decisionButton.disabled = true;
        button.onClick(async () => {
          if (!reviewed) return;
          try { const result = await persistReviewedEnrichmentDecisions(this.app, plan, { valuesReviewed: true }); const path = await saveGkxEnrichmentApplyPlan(this.app, plan); new Notice(`Reviewed decisions saved: ${result.created.length} new, ${result.unchanged.length} unchanged. Plan: ${path}`); }
          catch (error: any) { new Notice(`Decision persistence stopped: ${String(error?.message || error)}. No source note was changed.`, 12000); }
        });
      }).addButton((button) => button.setButtonText("Close").setCta().onClick(() => this.close()));
      return;
    }
    let backup = false, reviewed = false, relationship = false; let applyButton: HTMLButtonElement | null = null;
    const refresh = () => { if (applyButton) applyButton.disabled = !(backup && reviewed && relationship) || this.applying; };
    acknowledgement(contentEl, "I have made a separate, restorable vault backup; cloud sync alone is not a backup.", (value) => { backup = value; refresh(); });
    acknowledgement(contentEl, "I explicitly reviewed every accepted value, including any reviewer edits; confidence did not approve anything automatically.", (value) => { reviewed = value; refresh(); });
    acknowledgement(contentEl, "I verified supersession direction and relationship meaning. Resolved targets do not by themselves prove the relationship is true.", (value) => { relationship = value; refresh(); });
    new Setting(contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("Save plan only").onClick(async () => { const path = await saveGkxEnrichmentApplyPlan(this.app, plan); new Notice(`Enrichment plan saved to ${path}`); }))
      .addButton((button) => {
        button.setButtonText(`Back up and apply ${plan.totals.ready} notes`).setWarning(); applyButton = button.buttonEl; refresh();
        button.onClick(async () => {
          if (this.applying || !backup || !reviewed || !relationship) return;
          this.applying = true; refresh(); applyButton!.textContent = "Applying safely…";
          const notice = new Notice("Vault Kosmos: backing up and applying reviewed enrichment…", 0);
          try {
            const result = await applyGkxEnrichmentPlan(this.app, plan, { backupReady: true, valuesReviewed: true, relationshipsReviewed: true }); notice.hide(); this.onApplied?.(result);
            new Notice(`Vault Kosmos: ${result.applied.length} notes updated; ${result.skippedChanged.length + result.skippedMissing.length} changed/missing skipped; ${result.failed.length} failed. Audit: ${result.resultPath}`, 12000); this.close();
          } catch (error: any) { notice.hide(); this.applying = false; applyButton!.textContent = `Back up and apply ${plan.totals.ready} notes`; refresh(); new Notice(`Enrichment apply stopped: ${String(error?.message || error)}. No unbacked note is intentionally written.`, 15000); }
        });
      });
  }
}
