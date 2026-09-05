import { App, Modal, Setting } from "obsidian";
import type { MocOwnership } from "gkos-engine/navigation-effects";
import type { AdoptionPreview } from "../navigation-effects/adoption-plan";

export interface AdoptionPreviewFreshness {
  current: boolean;
  reasonCodes?: readonly string[];
  message?: string;
}

export type AdoptionPreviewFreshnessCheck = (
  preview: AdoptionPreview,
) => Promise<boolean | AdoptionPreviewFreshness>;

type FreshnessState = "unknown" | "checking" | "current" | "stale" | "unavailable";

/**
 * Trusted operator UI for recording adoption of exact, already-existing MOC
 * bytes. This module is intentionally Obsidian-only and is not imported by the
 * standalone viewer or MCP surfaces. The callbacks must not write the target
 * MOC; `recordAdoption` may persist only the reviewed registry and receipt.
 */
export class MocAdoptionModal extends Modal {
  private ownership: MocOwnership = "unmanaged";
  private preview?: AdoptionPreview;
  private confirmationText = "";
  private errorSummary = "";
  private generating = false;
  private recording = false;
  private freshnessState: FreshnessState = "unknown";
  private freshnessReasons: readonly string[] = [];
  private freshnessMessage = "";
  private freshnessSequence = 0;
  private opener: HTMLElement | null = null;
  private confirmationInput?: HTMLInputElement;
  private confirmationButton?: HTMLButtonElement;
  private freshnessStatusEl?: HTMLElement;
  private errorSummaryEl?: HTMLElement;

  constructor(
    app: App,
    private readonly createPreview: (ownership: MocOwnership) => Promise<AdoptionPreview>,
    private readonly recordAdoption: (preview: AdoptionPreview) => Promise<void>,
    private readonly checkFreshness?: AdoptionPreviewFreshnessCheck,
  ) {
    super(app);
  }

  onOpen(): void {
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.renderStageOne();
    this.focusStageHeading();
  }

  onClose(): void {
    this.freshnessSequence += 1;
    this.contentEl.empty();
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
  }

  private focusStageHeading(): void {
    this.titleEl.tabIndex = -1;
    this.titleEl.focus({ preventScroll: true });
  }

  private renderErrorSummary(parent: HTMLElement): void {
    const summary = parent.createEl("div", {
      cls: "kosmos-adoption-error-summary",
      attr: { role: "alert", "aria-live": "assertive", tabindex: "-1" },
    });
    this.errorSummaryEl = summary;
    this.updateErrorSummary();
  }

  private updateErrorSummary(): void {
    if (!this.errorSummaryEl) return;
    this.errorSummaryEl.empty();
    this.errorSummaryEl.hidden = !this.errorSummary;
    if (!this.errorSummary) return;
    this.errorSummaryEl.createEl("strong", { text: "Adoption could not continue" });
    this.errorSummaryEl.createEl("p", { text: this.errorSummary });
  }

  private showError(message: string): void {
    this.errorSummary = message;
    this.updateErrorSummary();
    this.errorSummaryEl?.focus({ preventScroll: true });
  }

  private clearError(): void {
    this.errorSummary = "";
    this.updateErrorSummary();
  }

  private renderStageOne(): void {
    const { contentEl } = this;
    this.setTitle("Adopt MOC ownership — step 1 of 2");
    contentEl.empty();
    contentEl.addClass("kosmos-adoption-modal");
    this.renderErrorSummary(contentEl);
    contentEl.createEl("p", {
      text: "Existing MOCs are unmanaged. Adoption records authority over the exact reviewed bytes; this screen never updates the MOC.",
    });

    let generateButton: HTMLButtonElement | undefined;
    let continueButton: HTMLButtonElement | undefined;
    const inspection = contentEl.createDiv({ cls: "kosmos-adoption-inspection" });
    const refreshActions = () => {
      if (generateButton) {
        generateButton.disabled = this.generating || this.ownership === "unmanaged";
        generateButton.textContent = this.generating
          ? "Generating preview…"
          : this.preview
            ? "Regenerate candidate preview"
            : "Generate candidate preview";
      }
      if (continueButton) continueButton.disabled = this.generating || !this.preview?.confirmable || this.preview.ownership !== this.ownership;
    };
    const renderInspection = () => {
      inspection.empty();
      if (!this.preview) {
        inspection.createEl("p", {
          text: this.ownership === "unmanaged"
            ? "Choose a managed ownership mode to inspect a candidate. Unmanaged MOCs cannot be adopted or executed."
            : "Generate a deterministic candidate to inspect its ownership and marker validation.",
          cls: "setting-item-description",
        });
        return;
      }
      this.renderCandidateInspection(inspection, this.preview);
    };

    const ownershipSetting = new Setting(contentEl)
      .setName("Ownership mode")
      .setDesc("Region management preserves every character outside one valid generated region. Full management binds the complete current file.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("unmanaged", "Unmanaged")
          .addOption("region-managed", "Generated region")
          .addOption("fully-managed", "Complete MOC")
          .setValue(this.ownership)
          .onChange((value) => {
            this.ownership = value as MocOwnership;
            this.preview = undefined;
            this.confirmationText = "";
            this.freshnessState = "unknown";
            this.freshnessReasons = [];
            this.freshnessMessage = "";
            this.clearError();
            renderInspection();
            refreshActions();
          });
        dropdown.selectEl.setAttribute("aria-label", "Ownership mode");
        dropdown.selectEl.setAttribute("aria-describedby", "kosmos-adoption-ownership-help");
      });
    ownershipSetting.descEl.id = "kosmos-adoption-ownership-help";
    ownershipSetting.settingEl.insertAdjacentElement("afterend", inspection);
    renderInspection();

    new Setting(contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => {
        button.setButtonText("Generate candidate preview").onClick(async () => {
          if (this.generating || this.ownership === "unmanaged") return;
          this.generating = true;
          this.preview = undefined;
          this.clearError();
          renderInspection();
          refreshActions();
          try {
            const preview = await this.createPreview(this.ownership);
            if (preview.ownership !== this.ownership) throw new Error("The preview ownership does not match the selected ownership mode.");
            this.preview = preview;
            renderInspection();
            refreshActions();
            inspection.querySelector<HTMLElement>("[data-adoption-validation]")?.focus({ preventScroll: true });
          } catch (error) {
            this.showError(error instanceof Error ? error.message : String(error));
          } finally {
            this.generating = false;
            refreshActions();
          }
        });
        generateButton = button.buttonEl;
      })
      .addButton((button) => {
        button.setButtonText("Review exact diff").setCta().setDisabled(true).onClick(() => {
          if (!this.preview?.confirmable || this.preview.ownership !== this.ownership) return;
          void this.enterStageTwo();
        });
        continueButton = button.buttonEl;
      });
    refreshActions();
  }

  private renderCandidateInspection(parent: HTMLElement, preview: AdoptionPreview): void {
    const validationPassed = preview.confirmable && preview.reasonCodes.length === 0;
    const status = parent.createEl("div", {
      cls: validationPassed ? "kosmos-adoption-validation is-valid" : "kosmos-adoption-validation is-blocked",
      attr: { "data-adoption-validation": "", role: validationPassed ? "status" : "alert", tabindex: "-1" },
    });
    status.createEl("strong", { text: validationPassed ? "Candidate and marker validation passed" : "Candidate is blocked" });
    status.createEl("p", { text: preview.semanticSummary });
    this.appendSummary(status, [
      ["Target", preview.targetPath],
      ["Selected ownership", preview.ownership],
      ["Candidate digest", preview.proposedDigest],
    ]);

    if (preview.ownership === "region-managed") {
      const region = preview.binding?.generatedRegion;
      if (region) {
        const details = status.createEl("details", { attr: { open: "" } });
        details.createEl("summary", { text: "Validated generated region" });
        this.appendSummary(details, [
          ["Marker version", region.markerVersion],
          ["Marker configuration digest", region.configDigest],
          ["Generated body digest", region.bodyDigest],
          ["Start offset", String(region.startOffset)],
          ["End offset", String(region.endOffset)],
        ]);
      } else status.createEl("p", { text: "No valid generated region was found." });
    } else if (preview.ownership === "fully-managed") {
      status.createEl("p", { text: "Complete-MOC ownership has no preserved human prefix or suffix; the binding covers the entire current file." });
    }

    if (preview.reasonCodes.length > 0) {
      status.createEl("p", { text: "Review blockers:" });
      const reasons = status.createEl("ul");
      for (const reason of preview.reasonCodes) reasons.createEl("li", { text: reason });
    }
  }

  private async enterStageTwo(): Promise<void> {
    this.confirmationText = "";
    this.clearError();
    this.freshnessState = "checking";
    this.freshnessReasons = [];
    this.freshnessMessage = "";
    this.renderStageTwo();
    this.focusStageHeading();
    await this.evaluateFreshness();
  }

  private renderStageTwo(): void {
    const { contentEl, preview } = this;
    this.setTitle("Confirm exact MOC adoption — step 2 of 2");
    contentEl.empty();
    contentEl.addClass("kosmos-adoption-modal");
    this.renderErrorSummary(contentEl);
    if (!preview) {
      contentEl.createEl("p", { text: "No preview is available. Return to ownership selection and generate a new preview." });
      new Setting(contentEl).addButton((button) => button.setButtonText("Back to ownership selection").setCta().onClick(() => {
        this.renderStageOne();
        this.focusStageHeading();
      }));
      return;
    }

    contentEl.createEl("p", { text: "Review the exact digest-bound candidate below. Recording adoption persists ownership metadata and an immutable receipt only; it does not update the MOC." });
    this.appendSummary(contentEl, [
      ["Target", preview.targetPath],
      ["Ownership", preview.ownership],
      ["Current target digest", preview.currentDigest],
      ["Proposed candidate digest", preview.proposedDigest],
      ["Policy digest", preview.policyDigest],
      ["Configuration digest", preview.configDigest],
      ["Human actor digest", preview.actorDigest],
      ["Prior registry digest", preview.priorRegistryDigest],
      ["Prior registry generation", String(preview.priorRegistryGeneration)],
      ["Preview digest", preview.previewDigest],
    ]);
    contentEl.createEl("p", { text: `Semantic change: ${preview.semanticSummary}` });

    this.freshnessStatusEl = contentEl.createEl("div", {
      cls: "kosmos-adoption-freshness",
      attr: { role: "status", "aria-live": "polite", "aria-atomic": "true", tabindex: "-1" },
    });
    this.updateFreshnessStatus();

    if (preview.binding?.generatedRegion) {
      const region = contentEl.createEl("details", { attr: { open: "" } });
      region.createEl("summary", { text: "Generated region binding" });
      this.appendSummary(region, [
        ["Marker version", preview.binding.generatedRegion.markerVersion],
        ["Marker configuration digest", preview.binding.generatedRegion.configDigest],
        ["Generated body digest", preview.binding.generatedRegion.bodyDigest],
        ["Start offset", String(preview.binding.generatedRegion.startOffset)],
        ["End offset", String(preview.binding.generatedRegion.endOffset)],
      ]);
    }

    const preserved = contentEl.createEl("details", { attr: { open: "" } });
    preserved.createEl("summary", { text: "Preserved human prefix and suffix" });
    preserved.createEl("pre", {
      text: `PREFIX ${JSON.stringify(preview.preservedHumanPrefix)}\nSUFFIX ${JSON.stringify(preview.preservedHumanSuffix)}`,
      cls: "kosmos-adoption-exact-text",
      attr: { tabindex: "0", "aria-label": "Exact preserved human prefix and suffix" },
    });

    const diff = contentEl.createEl("details", { attr: { open: "" } });
    diff.createEl("summary", { text: "Exact current and candidate text diff" });
    diff.createEl("pre", {
      text: preview.exactDiff,
      cls: "kosmos-adoption-exact-text",
      attr: { tabindex: "0", "aria-label": "Exact current and candidate text diff" },
    });

    const expected = `ADOPT ${preview.targetPath}`;
    const confirmationSetting = new Setting(contentEl)
      .setName("Explicit confirmation")
      .setDesc(`Type ${expected} exactly. The target bytes and all authority-bound digests will be rechecked immediately before the registry is recorded.`)
      .addText((text) => {
        text.setValue(this.confirmationText).setPlaceholder(expected).onChange((value) => {
          this.confirmationText = value;
          this.updateConfirmationState();
        });
        text.inputEl.setAttribute("aria-label", `Type ${expected} to confirm adoption`);
        text.inputEl.setAttribute("autocomplete", "off");
        text.inputEl.setAttribute("spellcheck", "false");
        this.confirmationInput = text.inputEl;
      });
    confirmationSetting.descEl.id = "kosmos-adoption-confirmation-help";
    this.confirmationInput?.setAttribute("aria-describedby", "kosmos-adoption-confirmation-help kosmos-adoption-freshness-status");

    new Setting(contentEl)
      .addButton((button) => button.setButtonText("Back to regenerate").onClick(() => {
        this.preview = undefined;
        this.confirmationText = "";
        this.freshnessSequence += 1;
        this.freshnessState = "unknown";
        this.renderStageOne();
        this.focusStageHeading();
      }))
      .addButton((button) => {
        button.setButtonText("Record adoption only").setCta().setDisabled(true).onClick(() => void this.confirm());
        this.confirmationButton = button.buttonEl;
      });
    this.updateConfirmationState();
  }

  private appendSummary(parent: HTMLElement, entries: ReadonlyArray<readonly [string, string]>): void {
    const summary = parent.createEl("dl", { cls: "kosmos-adoption-summary" });
    for (const [name, value] of entries) {
      summary.createEl("dt", { text: name });
      summary.createEl("dd", { text: value });
    }
  }

  private updateFreshnessStatus(): void {
    if (!this.freshnessStatusEl) return;
    const el = this.freshnessStatusEl;
    el.id = "kosmos-adoption-freshness-status";
    el.empty();
    el.removeClass("is-current", "is-blocked");
    if (this.freshnessState === "checking") {
      el.createEl("strong", { text: "Checking exact current state…" });
    } else if (this.freshnessState === "current") {
      el.addClass("is-current");
      el.createEl("strong", { text: "Exact current-state check passed" });
      el.createEl("p", { text: "Target, policy, configuration, actor, and registry bindings still match this preview." });
    } else if (this.freshnessState === "stale") {
      el.addClass("is-blocked");
      el.createEl("strong", { text: "Preview is stale — regenerate it" });
      el.createEl("p", { text: this.freshnessMessage || "One or more exact state bindings changed after preview generation." });
    } else if (this.freshnessState === "unavailable") {
      el.addClass("is-blocked");
      el.createEl("strong", { text: "Current-state verification unavailable" });
      el.createEl("p", { text: this.freshnessMessage || "No trusted freshness check is connected. Adoption remains disabled." });
    } else el.createEl("strong", { text: "Current state has not been checked" });
    if (this.freshnessReasons.length > 0) {
      const reasons = el.createEl("ul");
      for (const reason of this.freshnessReasons) reasons.createEl("li", { text: reason });
    }
  }

  private updateConfirmationState(): void {
    const preview = this.preview;
    const expected = preview ? `ADOPT ${preview.targetPath}` : "";
    const enabled = Boolean(preview?.confirmable && this.freshnessState === "current" && this.confirmationText === expected && !this.recording);
    if (this.confirmationButton) {
      this.confirmationButton.disabled = !enabled;
      this.confirmationButton.textContent = this.recording ? "Recording adoption…" : "Record adoption only";
      this.confirmationButton.setAttribute("aria-disabled", String(!enabled));
    }
    if (this.confirmationInput) this.confirmationInput.disabled = this.recording;
  }

  private async evaluateFreshness(): Promise<boolean> {
    const preview = this.preview;
    if (!preview) return false;
    const sequence = ++this.freshnessSequence;
    this.freshnessState = "checking";
    this.freshnessReasons = [];
    this.freshnessMessage = "";
    this.updateFreshnessStatus();
    this.updateConfirmationState();

    if (!this.checkFreshness) {
      this.freshnessState = "unavailable";
      this.freshnessMessage = "The trusted target, policy, configuration, actor, and registry freshness check was not supplied.";
      this.updateFreshnessStatus();
      this.updateConfirmationState();
      return false;
    }

    try {
      const result = await this.checkFreshness(preview);
      if (sequence !== this.freshnessSequence || this.preview?.previewDigest !== preview.previewDigest) return false;
      const normalized = typeof result === "boolean" ? { current: result } : result;
      this.freshnessState = normalized.current ? "current" : "stale";
      this.freshnessReasons = normalized.reasonCodes ?? (normalized.current ? [] : ["ADOPTION_PREVIEW_STALE"]);
      this.freshnessMessage = normalized.message ?? "";
      this.updateFreshnessStatus();
      this.updateConfirmationState();
      return normalized.current;
    } catch (error) {
      if (sequence !== this.freshnessSequence) return false;
      this.freshnessState = "unavailable";
      this.freshnessReasons = ["FRESHNESS_CHECK_FAILED"];
      this.freshnessMessage = error instanceof Error ? error.message : String(error);
      this.updateFreshnessStatus();
      this.updateConfirmationState();
      return false;
    }
  }

  private async confirm(): Promise<void> {
    const preview = this.preview;
    const expected = preview ? `ADOPT ${preview.targetPath}` : "";
    if (!preview?.confirmable || this.confirmationText !== expected || this.recording) return;
    this.recording = true;
    this.clearError();
    this.updateConfirmationState();
    try {
      if (!(await this.evaluateFreshness())) {
        this.showError("The exact current-state check did not pass. Return to step 1 and regenerate the preview; no MOC bytes were changed.");
        return;
      }
      await this.recordAdoption(preview);
      this.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("STALE")) {
        this.freshnessState = "stale";
        this.freshnessReasons = ["ADOPTION_PREVIEW_STALE"];
        this.freshnessMessage = "The target or another exact adoption binding changed during confirmation.";
        this.updateFreshnessStatus();
      }
      this.showError(`${message} No MOC bytes were changed by this adoption screen.`);
    } finally {
      this.recording = false;
      this.updateConfirmationState();
    }
  }
}
