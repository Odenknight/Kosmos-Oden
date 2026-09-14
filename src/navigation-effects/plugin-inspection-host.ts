import { NodeNavigationEffectsExecutor } from "gkos-engine/navigation-effects/node";
import { createEffectHostUnavailable, type EffectHostUnavailable, type RecoveryInspection } from "./effect-adapter";
import { mapEngineRecoveryInspection } from "./engine-host-receipts";
import { NAVIGATION_EFFECTS_STATE_ROOT } from "./settings";

export type EffectsInspectionResult = RecoveryInspection | EffectHostUnavailable;

export interface EffectsInspectionVaultBinding {
  adapter: object;
  basePath: string;
  currentAdapter(): object;
  currentBasePath(): string;
}

/** Read-only owner for one desktop FileSystemAdapter binding. */
export class EffectsInspectionHost {
  private revision = 0;
  private active = true;

  constructor(private readonly binding: EffectsInspectionVaultBinding) {}

  close(): void {
    this.active = false;
    this.revision++;
  }

  async inspect(): Promise<EffectsInspectionResult> {
    const revision = ++this.revision;
    try {
      if (!this.active || !this.binding.basePath
          || this.binding.currentAdapter() !== this.binding.adapter
          || this.binding.currentBasePath() !== this.binding.basePath) return this.unavailable();
      // `cooperative-vault` is acknowledged only for this observation. It is
      // not path-safety evidence for source effects or permission to write.
      const executor = new NodeNavigationEffectsExecutor({
        vaultRoot: this.binding.basePath,
        stateRoot: `${this.binding.basePath.replace(/[\\/]$/u, "")}/${NAVIGATION_EFFECTS_STATE_ROOT}`,
        pathThreatModel: "cooperative-vault",
      });
      const observed = await executor.inspectRecovery();
      const mapped = await mapEngineRecoveryInspection("obsidian", observed);
      if (!this.active || revision !== this.revision
          || this.binding.currentAdapter() !== this.binding.adapter
          || this.binding.currentBasePath() !== this.binding.basePath) return this.unavailable();
      return mapped.inspection;
    } catch {
      return this.unavailable();
    }
  }

  private unavailable(): EffectHostUnavailable {
    return createEffectHostUnavailable("obsidian", "inspect-recovery", ["ADAPTER_NOT_CONFIGURED"]);
  }
}
