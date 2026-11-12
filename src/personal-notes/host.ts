/**
 * Personal Notes (0.9.0) — the small surface the UI needs from the plugin.
 *
 * Types only. The UI files import this instead of main.ts or agent-server.ts
 * so they stay free of gkos-engine imports and can be type-checked alone.
 */
import type { App } from "obsidian";
import type { FullTextIndex } from "./fulltext";
import type { PersonalNotesStatus } from "./status";
import type { ActiveProfile, PersonalNotesSettings } from "./types";

export interface PersonalNotesSettingsView {
  activeProfile: ActiveProfile;
  personalNotes: PersonalNotesSettings;
  agentEnabled: boolean;
  agentPort: number;
  agentToken: string;
  agentBindMode: "localhost" | "lan";
  /** Also answer MCP clients that use the older handshake revisions. */
  agentLegacyMcp: boolean;
}

export interface PersonalNotesHost {
  app: App;
  agentSettings: PersonalNotesSettingsView;
  provider: {
    getGraph(): Promise<unknown>;
    getTextIndex(graph: unknown): FullTextIndex | null;
  };
  agentApi: { status: string; url?: string; qOverview(): Promise<{ notes?: number }> };
  /** Switch the profile that serves agents and save. Changes nothing else. */
  setActiveProfile(profile: ActiveProfile): Promise<void>;
  saveAgentSettings(): Promise<void>;
  startAgentApi(): void;
  /** Base URLs other devices can use when the connection is open to the local network. */
  agentLanUrls(): string[];
  /** Run the existing deterministic GKX formatting workflow over the import folders (preview first). */
  runGkxTagging(): Promise<void>;
  /** Open "This note replaces another note" for the active note. */
  openSupersedes(): void;
  /** Absolute path of the bundled stdio adapter, for client snippets. */
  bridgePath(): string;
  personalNotesStatus(): Promise<PersonalNotesStatus>;
  openPersonalSearch(): Promise<void>;
  openAddNotes(): void;
  openConnectAi(): void;
}
