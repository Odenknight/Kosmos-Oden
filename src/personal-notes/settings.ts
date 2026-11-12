/**
 * Personal Notes (0.9.0) — profile settings, schema 11 migration.
 *
 * Pure. `migrateProfileSettings` reads the whole persisted plugin data object
 * and returns what the plugin applies inside `migrateAgentSettings`; it never
 * mutates its input. Unknown top-level keys are untouched (the caller keeps
 * them); unknown keys inside the `personalNotes` object are carried over.
 */
import type { ActiveProfile, PersonalNotesSettings } from "./types";
import { parseFolderList, type FolderListResult } from "./scope";

export const PERSONAL_SETTINGS_SCHEMA = 11;

/** Flat keys written by the revised 0.9.0 patch (schema 10). Removed after migration. */
export const PATCH_PERSONAL_KEYS = [
  "personalNotesEnabled",
  "personalNotesFolders",
  "personalNotesExcludedFolders",
  "personalNotesImportFolders",
  "personalNotesStampImports",
  "personalNotesPriorDefaultSensitivity",
] as const;

export function defaultPersonalNotesSettings(): PersonalNotesSettings {
  return {
    includeFolders: [],
    excludeFolders: [],
    importFolders: [],
    importReportPaths: [],
    tagging: { enabled: false, folders: [], timestamps: false, uniqueIds: false, supersession: false, automaticTimestamps: false },
    connection: { bindMode: "localhost", advertisedBaseUrl: "", autoStart: false, acceptOlderMcp: true },
  };
}

export interface ProfileMigrationOptions {
  /** The existing sensitivity vocabulary (inject the Engine's SENSITIVITY_RANK). */
  sensitivityRank: Readonly<Record<string, number>>;
  /** The existing fail-closed default sensitivity (the Engine's FAIL_CLOSED_SENSITIVITY_DEFAULT). */
  failClosedSensitivity: string;
}

export interface ProfileMigrationResult {
  activeProfile: ActiveProfile;
  personalNotes: PersonalNotesSettings;
  /** True when no persisted data existed (fresh install): Personal onboarding, nothing shared, connector off. */
  fresh: boolean;
  /** When set, write this to the existing profile's `defaultSensitivity` (undoes the patch's lowering). */
  restoredDefaultSensitivity?: string;
  /** When true, force the connector off (`agentEnabled = false`) and do not autostart until the user acts. */
  connectorMustStayStopped: boolean;
  /** Actionable, local-only messages for the settings tab / a Notice. */
  notices: string[];
  /** Persisted top-level keys to delete (the patch's flat Personal keys). */
  removedKeys: string[];
}

type Rec = Record<string, unknown>;
const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const FIX = "Open Settings → Kosmos-Oden → Personal Notes, review the folders shared with agents, then reconnect.";

function describeRejected(label: string, result: FolderListResult): string {
  const items = result.rejected.map((r) => `${JSON.stringify(r.value) ?? String(r.value)} (${r.reason})`).join(", ");
  return `${label}: these saved entries are not valid vault folders and were not used: ${items}. ${FIX}`;
}

export function migrateProfileSettings(raw: unknown, opts: ProfileMigrationOptions): ProfileMigrationResult {
  if (raw === undefined || raw === null) {
    return { activeProfile: "personal", personalNotes: defaultPersonalNotesSettings(), fresh: true, connectorMustStayStopped: false, notices: [], removedKeys: [] };
  }
  if (!isRecord(raw)) {
    return {
      activeProfile: "existing", personalNotes: defaultPersonalNotesSettings(), fresh: false, connectorMustStayStopped: true, removedKeys: [],
      notices: [`Saved Kosmos-Oden settings could not be read, so sharing with agents is stopped. ${FIX}`],
    };
  }

  const notices: string[] = [];
  let stop = false;
  const fail = (message: string) => { notices.push(message); stop = true; };
  const removedKeys = PATCH_PERSONAL_KEYS.filter((k) => hasOwn(raw, k));
  const validSensitivity = (v: unknown): v is string => typeof v === "string" && hasOwn(opts.sensitivityRank, v);

  // Patch schema-10 mode flag.
  let patchEnabled = false;
  if (hasOwn(raw, "personalNotesEnabled")) {
    if (typeof raw.personalNotesEnabled === "boolean") patchEnabled = raw.personalNotesEnabled;
    else fail(`The saved Personal Notes on/off setting is malformed, so sharing with agents is stopped. ${FIX}`);
  }

  // Profile.
  let activeProfile: ActiveProfile;
  if (hasOwn(raw, "activeProfile")) {
    if (raw.activeProfile === "existing" || raw.activeProfile === "personal") activeProfile = raw.activeProfile;
    else {
      activeProfile = "existing";
      fail(`The saved profile ${JSON.stringify(raw.activeProfile)} is not recognised; the existing profile is active and sharing with agents is stopped. Choose a profile in Settings → Kosmos-Oden, then reconnect.`);
    }
  } else {
    activeProfile = patchEnabled ? "personal" : "existing";
  }

  // Personal settings.
  const personalNotes = defaultPersonalNotesSettings();
  const takeScope = (key: "includeFolders" | "excludeFolders" | "importFolders" | "importReportPaths", value: unknown, label: string, allowRoot = true) => {
    const parsed = parseFolderList(value);
    if (!allowRoot) {
      const root = parsed.folders.indexOf("/");
      if (root >= 0) { parsed.folders.splice(root, 1); parsed.rejected.push({ index: -1, value: "/", reason: "absolute" }); }
    }
    if (parsed.rejected.length) {
      fail(describeRejected(label, parsed));
      // Dropping an exclusion would widen the selection: exclude everything until reviewed.
      if (key === "excludeFolders" && !parsed.folders.includes("/")) {
        parsed.folders.push("/");
        notices.push(`Everything is excluded from sharing until you replace the rejected excluded folders. ${FIX}`);
      }
    }
    personalNotes[key] = parsed.folders;
  };

  if (hasOwn(raw, "personalNotes")) {
    const pn = raw.personalNotes;
    if (!isRecord(pn)) {
      fail(`The saved Personal Notes settings are malformed; nothing is shared and sharing with agents is stopped. ${FIX}`);
    } else {
      Object.assign(personalNotes, pn); // keep unknown keys; known keys are replaced below
      if (!Array.isArray(pn.includeFolders) || !Array.isArray(pn.excludeFolders)) {
        fail(`The saved folders shared with agents are incomplete; nothing is shared and sharing with agents is stopped. ${FIX}`);
        personalNotes.includeFolders = [];
        takeScope("excludeFolders", Array.isArray(pn.excludeFolders) ? pn.excludeFolders : undefined, "Excluded folders");
      } else {
        takeScope("includeFolders", pn.includeFolders, "Folders shared with agents");
        takeScope("excludeFolders", pn.excludeFolders, "Excluded folders");
      }
      takeScope("importFolders", pn.importFolders, "Import folders");
      takeScope("importReportPaths", pn.importReportPaths, "Import reports", false);
      personalNotes.tagging = migrateTagging(pn.tagging, notices);
      personalNotes.connection = migrateConnection(pn.connection, notices, (m) => fail(m));
    }
  } else if (removedKeys.length) {
    // Patch schema 10: carry the user's folder choices over; never discard them.
    takeScope("includeFolders", raw.personalNotesFolders, "Folders shared with agents");
    takeScope("excludeFolders", raw.personalNotesExcludedFolders, "Excluded folders");
    takeScope("importFolders", raw.personalNotesImportFolders, "Import folders");
    if (raw.personalNotesStampImports === true) {
      notices.push("The preview option that stamped timestamps on imported notes was retired. Optional tagging is now off; turn on Personal Notes tagging and choose its folders if you want timestamps.");
    }
    if (patchEnabled) {
      if (raw.agentBindMode === "localhost" || raw.agentBindMode === "lan") personalNotes.connection.bindMode = raw.agentBindMode;
      personalNotes.connection.autoStart = raw.agentEnabled === true;
    }
  }
  if (!hasOwn(raw, "personalNotes") && raw.agentLegacyMcp === false) personalNotes.connection.acceptOlderMcp = false;

  // Undo the patch's saved defaultSensitivity rewrite.
  let restoredDefaultSensitivity: string | undefined;
  if (patchEnabled) {
    const prior = raw.personalNotesPriorDefaultSensitivity;
    if (validSensitivity(prior)) {
      restoredDefaultSensitivity = prior;
      if (prior !== raw.defaultSensitivity) {
        notices.push(`The existing profile's Default sensitivity was restored to "${prior}"; the 0.9.0 preview had changed it. Personal Notes no longer changes it.`);
      }
    } else {
      restoredDefaultSensitivity = opts.failClosedSensitivity;
      fail(`Kosmos-Oden could not tell which Default sensitivity the existing profile used before the 0.9.0 preview changed it, so it was reset to "${opts.failClosedSensitivity}" and sharing with agents is stopped. Check Settings → Kosmos-Oden → Agent API → Default sensitivity, then reconnect.`);
    }
  }

  if (stop) personalNotes.connection.autoStart = false;
  return { activeProfile, personalNotes, fresh: false, restoredDefaultSensitivity, connectorMustStayStopped: stop, notices, removedKeys: [...removedKeys] };
}

function migrateTagging(raw: unknown, notices: string[]): PersonalNotesSettings["tagging"] {
  const t = defaultPersonalNotesSettings().tagging;
  if (raw === undefined) return t;
  if (!isRecord(raw)) {
    notices.push("The saved tagging settings are malformed; optional tagging is off. Review it in Settings → Kosmos-Oden → Personal Notes.");
    return t;
  }
  const folders = parseFolderList(raw.folders);
  Object.assign(t, raw, {
    enabled: raw.enabled === true,
    folders: folders.folders,
    timestamps: raw.timestamps === true,
    uniqueIds: raw.uniqueIds === true,
    supersession: raw.supersession === true,
    automaticTimestamps: raw.automaticTimestamps === true,
  });
  if (folders.rejected.length) {
    t.enabled = false;
    notices.push(`${describeRejected("Tagging folders", folders)} Optional tagging was turned off until you review it.`);
  }
  return t;
}

function migrateConnection(raw: unknown, notices: string[], fail: (m: string) => void): PersonalNotesSettings["connection"] {
  const c = defaultPersonalNotesSettings().connection;
  if (raw === undefined) return c;
  if (!isRecord(raw)) {
    fail(`The saved connection settings are malformed; the connection uses safe defaults and is stopped. ${FIX}`);
    return c;
  }
  Object.assign(c, raw, {
    bindMode: raw.bindMode === "lan" ? "lan" : "localhost",
    advertisedBaseUrl: typeof raw.advertisedBaseUrl === "string" ? raw.advertisedBaseUrl : "",
    autoStart: raw.autoStart === true,
    acceptOlderMcp: raw.acceptOlderMcp !== false,
  });
  if (raw.bindMode !== undefined && raw.bindMode !== "lan" && raw.bindMode !== "localhost") {
    fail(`The saved network mode ${JSON.stringify(raw.bindMode)} is not recognised; "This computer only" is used and the connection is stopped. ${FIX}`);
  }
  if (raw.advertisedBaseUrl !== undefined && typeof raw.advertisedBaseUrl !== "string") {
    notices.push("The saved connection address was malformed and was cleared. Choose it again in Quick Connect.");
  }
  return c;
}
