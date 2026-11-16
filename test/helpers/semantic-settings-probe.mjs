/** The saved-settings path a real load takes (migrateProfileSettings), for the semantic settings test. */
import { defaultPersonalNotesSettings, migrateProfileSettings } from "../../dist/kosmos-personal-notes.mjs";

import { RANK } from "./personal-fixture.mjs";

const OPTS = { sensitivityRank: RANK, failClosedSensitivity: "secret" };

export { defaultPersonalNotesSettings };
export function normalizeAgentSettingsForTest(raw) {
  const personalNotes = { excludeFolders: [], ...(raw.personalNotes ?? {}) };
  return migrateProfileSettings({ ...raw, personalNotes }, OPTS);
}
