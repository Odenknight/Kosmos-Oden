/**
 * Personal Notes (0.9.0) — the surface the UI gets from the plugin.
 *
 * Types only. UI files import this instead of main.ts or agent-server.ts, so
 * they stay free of gkos-engine imports and can be tested against a fake.
 * The plugin implements it; nothing here grants an assistant any access.
 */
import type { App, TFile } from "obsidian";
import type { checkSupersedesProposal } from "./lineage";
import type { RejectedFolder } from "./scope";
import type { PersonalNotesStatus } from "./status";
import type { TaggingPlan } from "./tagging";
import type { TaggingApplyResult } from "./tagging-writer";
import type { ActiveProfile, CorpusState, PersonalNotesSettings, SearchResponse } from "./types";

export interface PersonalSettingsView {
  activeProfile: ActiveProfile;
  /** Read-only snapshot. Change it through updatePersonalNotes(). */
  personalNotes: Readonly<PersonalNotesSettings>;
  port: number;
}

export interface PersonalSearchStatus {
  /** "failed" = the search worker stopped; offer retrySearch(). */
  state: CorpusState | "failed";
  notes: number;
  /** Files skipped whole (too large, over budget, unreadable). */
  omitted: number;
  error?: string;
}

export type ImporterState = "enabled" | "installed" | "missing" | "unknown";

export type PersonalConnectionState = "stopped" | "starting" | "running" | "error" | "unavailable";

export interface PersonalConnectionStatus {
  state: PersonalConnectionState;
  bindMode: "localhost" | "lan";
  port: number;
  /** Set when state is "error" or "unavailable" (for example port in use, no desktop). */
  error?: string;
  /** A device-local token exists for this vault on this device. */
  hasToken: boolean;
  /** Device-local "Start when Obsidian opens". */
  autoStart: boolean;
}

export interface ConnectionTestStep {
  name: "authenticate" | "open" | "list_tools" | "search" | "read";
  ok: boolean;
  /** Plain-language result. Never contains the token. */
  detail: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  baseUrl: string;
  transport: "streamable-http";
  /** MCP revision actually used by the test. */
  protocolVersion?: string;
  steps: ConnectionTestStep[];
}

export type SupersedesCheck = ReturnType<typeof checkSupersedesProposal>;

export interface PersonalPluginHost {
  app: App;

  /* ---- profile and settings ---- */
  settings(): PersonalSettingsView;
  /** Actionable messages from the last settings migration (empty when none). */
  settingsNotices(): string[];
  setActiveProfile(profile: ActiveProfile): Promise<void>;
  /**
   * Apply a change to the Personal settings. Folder lists are validated
   * strictly: when any entry is rejected nothing is saved and the rejected
   * entries are returned. On success the plugin saves, invalidates in-flight
   * agent responses and reconfigures or restarts the connection as needed.
   */
  updatePersonalNotes(change: (draft: PersonalNotesSettings) => void): Promise<{ saved: boolean; rejected: RejectedFolder[] }>;

  /* ---- local search (the user's own view: whole vault, operational files excluded) ---- */
  search(query: string, opts?: { limit?: number; signal?: AbortSignal }): Promise<SearchResponse>;
  searchStatus(): PersonalSearchStatus;
  /** Subscribe to search status changes. Returns the unsubscribe function. */
  onSearchStatus(listener: () => void): () => void;
  retrySearch(): void;
  /** Notes an assistant can read right now (shared folders, sensitivity rule). */
  sharedNoteCount(): number;

  /* ---- import (conversion is done by the Obsidian Importer plugin) ---- */
  importer(): { state: ImporterState; version: string | null; tested: boolean };
  /** Open the Importer through its command. False = use the command palette instead. Defers automatic tagging for `destinationFolder`. */
  openImporter(destinationFolder: string): boolean;
  /** Folders whose import has not been marked finished; automatic tagging stays off there. */
  pendingImportFolders(): string[];
  /** "Import finished — review tags". */
  importFinished(folder: string): Promise<void>;
  personalNotesStatus(): Promise<PersonalNotesStatus>;

  /* ---- optional deterministic tagging (off until the user selects it) ---- */
  /** Frozen preview over the tagging selection, or over `paths`. Re-preview of an unchanged pending proposal keeps its values. Writes nothing. */
  previewTagging(paths?: string[]): Promise<TaggingPlan>;
  applyTagging(plan: TaggingPlan): Promise<TaggingApplyResult>;
  /** Check and preview "this note supersedes…" for the replacement note. `plan` is null when the check fails. Writes nothing. */
  previewSupersedes(replacement: TFile, targetLinkText: string): Promise<{ check: SupersedesCheck; plan: TaggingPlan | null }>;

  /* ---- connection ---- */
  connection(): PersonalConnectionStatus;
  /** Ensure a device-local token, start the listener and resolve when it is really listening or has failed. */
  connect(): Promise<PersonalConnectionStatus>;
  disconnect(): Promise<void>;
  rotateToken(): Promise<void>;
  setAutoStart(on: boolean): Promise<void>;
  /** This computer's own LAN/VPN addresses. Never 0.0.0.0 or a loopback address. */
  reachableAddresses(): string[];
  /** Real request sequence from this computer against `baseUrl`. Proves nothing about another machine's route. */
  testConnection(baseUrl: string, canaryPath?: string): Promise<ConnectionTestResult>;
  /** The token, for building copy-to-clipboard configuration only. Never log it or write it into a note. */
  connectionToken(): string;
  /** Path of the bundled stdio bridge on this computer. */
  bridgePath(): string;
  /** MCP revisions each transport advertises with the current settings. */
  mcpProtocols(): { http: string[]; stdio: string[] };

  /* ---- navigation ---- */
  openPersonalSearch(): Promise<void>;
  openAddNotes(): void;
  openConnectAi(): void;
  openTagging(): void;
  openSupersedes(): void;
}
