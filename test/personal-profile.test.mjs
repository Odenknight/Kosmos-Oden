/** Personal Notes profile settings migration to schema 11 (0.9.0): acceptance row V02. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PATCH_PERSONAL_KEYS,
  PERSONAL_SETTINGS_SCHEMA,
  defaultPersonalNotesSettings,
  migrateProfileSettings,
} from "../dist/kosmos-personal-notes.mjs";
import { RANK } from "./helpers/personal-fixture.mjs";

const OPTS = { sensitivityRank: RANK, failClosedSensitivity: "secret" };
const migrate = (raw) => migrateProfileSettings(raw, OPTS);

/** A v0.8.4 (schema 9) data.json, abridged to the keys this migration reads plus unrelated ones. */
const BASELINE_9 = Object.freeze({
  schemaVersion: 9, agentEnabled: true, agentPort: 4816, agentBindMode: "lan", agentSensitivityCeiling: "internal",
  defaultSensitivity: "confidential", noteTimestampsEnabled: true, nextcloud: { remoteFolder: "Kosmos-Oden/V" }, someFutureKey: { x: 1 },
});

test("schema number and fresh defaults", () => {
  assert.equal(PERSONAL_SETTINGS_SCHEMA, 11);
  const a = defaultPersonalNotesSettings();
  const b = defaultPersonalNotesSettings();
  assert.notEqual(a, b);
  assert.notEqual(a.tagging, b.tagging, "fresh nested objects each call");
  a.includeFolders.push("X");
  assert.deepEqual(b.includeFolders, []);
  assert.deepEqual(a.connection, { bindMode: "localhost", advertisedBaseUrl: "", autoStart: false, acceptOlderMcp: true });
  assert.ok(Object.values(a.tagging).every((v) => v === false || (Array.isArray(v) && v.length === 0)), "all tagging off");
});

test("fresh install opens Personal onboarding with nothing shared and the connector off", () => {
  for (const raw of [undefined, null]) {
    const r = migrate(raw);
    assert.equal(r.fresh, true);
    assert.equal(r.activeProfile, "personal");
    assert.deepEqual(r.personalNotes.includeFolders, []);
    assert.equal(r.personalNotes.connection.autoStart, false);
    assert.equal(r.personalNotes.tagging.enabled, false);
    assert.equal(r.restoredDefaultSensitivity, undefined);
    assert.deepEqual(r.notices, []);
  }
});

test("baseline schema 9 migrates to the existing profile and changes nothing it saved", () => {
  const raw = structuredClone(BASELINE_9);
  const r = migrate(raw);
  assert.deepEqual(raw, BASELINE_9, "input is not mutated (unknown keys stay with the caller)");
  assert.equal(r.fresh, false);
  assert.equal(r.activeProfile, "existing");
  assert.equal(r.restoredDefaultSensitivity, undefined, "untouched v0.8.4 default stays exactly as saved");
  assert.equal(r.connectorMustStayStopped, false, "an existing user's connector workflow is kept");
  assert.deepEqual(r.removedKeys, []);
  assert.deepEqual(r.notices, []);
  assert.deepEqual(r.personalNotes, defaultPersonalNotesSettings(), "Personal starts empty; LAN mode is not copied into it");
  assert.equal(migrate({}).activeProfile, "existing", "any persisted object without activeProfile is the existing profile");
});

test("patch schema 10 with Personal mode on: folders kept, prior default restored, flat keys removed", () => {
  const raw = {
    ...BASELINE_9, schemaVersion: 10, defaultSensitivity: "internal", agentLegacyMcp: false,
    personalNotesEnabled: true, personalNotesFolders: ["Import", "Journal/Shared"], personalNotesExcludedFolders: ["Import/Private"],
    personalNotesImportFolders: ["Import"], personalNotesStampImports: false, personalNotesPriorDefaultSensitivity: "confidential",
  };
  const r = migrate(raw);
  assert.equal(r.activeProfile, "personal");
  assert.equal(r.restoredDefaultSensitivity, "confidential", "the lowered default is undone from the recorded prior value");
  assert.equal(r.connectorMustStayStopped, false);
  assert.deepEqual(r.personalNotes.includeFolders, ["Import", "Journal/Shared"]);
  assert.deepEqual(r.personalNotes.excludeFolders, ["Import/Private"]);
  assert.deepEqual(r.personalNotes.importFolders, ["Import"]);
  assert.equal(r.personalNotes.connection.bindMode, "lan", "the network choice used in Personal mode is kept");
  assert.equal(r.personalNotes.connection.autoStart, true, "an explicitly running connector stays a deliberate choice");
  assert.equal(r.personalNotes.connection.acceptOlderMcp, false);
  assert.equal(r.personalNotes.tagging.enabled, false);
  assert.deepEqual([...r.removedKeys].sort(), [...PATCH_PERSONAL_KEYS].sort());
  assert.ok(!r.removedKeys.includes("agentLegacyMcp") && !r.removedKeys.includes("agentBindMode"), "existing-profile keys stay");
  assert.match(r.notices.join("\n"), /restored to "confidential"/);
});

test("patch schema 10 with Personal mode off keeps the chosen folders without restoring anything", () => {
  const r = migrate({ ...BASELINE_9, schemaVersion: 10, personalNotesEnabled: false, personalNotesFolders: ["Notes"], personalNotesPriorDefaultSensitivity: "" });
  assert.equal(r.activeProfile, "existing");
  assert.deepEqual(r.personalNotes.includeFolders, ["Notes"], "alpha settings are not discarded");
  assert.equal(r.restoredDefaultSensitivity, undefined);
  assert.equal(r.personalNotes.connection.bindMode, "localhost");
  assert.equal(r.connectorMustStayStopped, false);
});

test("ambiguous restoration keeps the connector stopped and falls back closed", () => {
  for (const prior of [undefined, "", "bogus", 7]) {
    const raw = { ...BASELINE_9, schemaVersion: 10, defaultSensitivity: "internal", personalNotesEnabled: true, personalNotesFolders: ["Import"] };
    if (prior !== undefined) raw.personalNotesPriorDefaultSensitivity = prior;
    const r = migrate(raw);
    assert.equal(r.restoredDefaultSensitivity, "secret", `prior ${JSON.stringify(prior)}: never guess a more permissive value`);
    assert.equal(r.connectorMustStayStopped, true);
    assert.equal(r.personalNotes.connection.autoStart, false);
    assert.match(r.notices.join("\n"), /Default sensitivity/);
    assert.deepEqual(r.personalNotes.includeFolders, ["Import"], "the folder choice survives");
  }
});

test("retired import-stamping option is reported, not converted into tagging", () => {
  const r = migrate({ schemaVersion: 10, personalNotesEnabled: false, personalNotesStampImports: true });
  assert.equal(r.personalNotes.tagging.enabled, false);
  assert.equal(r.personalNotes.tagging.automaticTimestamps, false);
  assert.match(r.notices.join("\n"), /retired/);
});

test("schema 11 round-trips, including unknown nested keys", () => {
  const personalNotes = {
    ...defaultPersonalNotesSettings(), includeFolders: ["/"], excludeFolders: ["/"], importReportPaths: ["Import/report.md"],
    tagging: { ...defaultPersonalNotesSettings().tagging, enabled: true, folders: ["Import"], uniqueIds: true, futureFlag: 1 },
    connection: { bindMode: "lan", advertisedBaseUrl: "http://host.example:4816", autoStart: true, acceptOlderMcp: false },
    futureSection: { a: 1 },
  };
  const r = migrate({ schemaVersion: 11, activeProfile: "personal", personalNotes });
  assert.equal(r.activeProfile, "personal");
  assert.deepEqual(r.personalNotes, personalNotes, "an explicit / exclusion (exclude everything) is kept, not discarded");
  assert.equal(r.connectorMustStayStopped, false);
  assert.deepEqual(r.notices, []);
});

test("malformed profile or scope state stops sharing with an actionable notice", () => {
  const cases = [
    "not an object",
    [1, 2],
    { activeProfile: "work" },
    { activeProfile: "personal", personalNotes: "Import" },
    { activeProfile: "personal", personalNotes: { includeFolders: ["Import"] } },
    { activeProfile: "personal", personalNotes: { includeFolders: ["Import", "../Private"], excludeFolders: [] } },
    { activeProfile: "personal", personalNotes: { includeFolders: ["Import"], excludeFolders: ["Import\\Private"] } },
    { activeProfile: "personal", personalNotes: { includeFolders: [], excludeFolders: [], connection: { bindMode: "0.0.0.0" } } },
    { personalNotesEnabled: "yes", personalNotesFolders: ["Import"] },
  ];
  for (const raw of cases) {
    const r = migrate(raw);
    assert.equal(r.connectorMustStayStopped, true, JSON.stringify(raw));
    assert.equal(r.personalNotes.connection.autoStart, false);
    assert.ok(r.notices.length > 0 && r.notices.every((n) => /Settings/.test(n)), `actionable notice for ${JSON.stringify(raw)}`);
  }
  assert.equal(migrate({ activeProfile: "work" }).activeProfile, "existing");
  const incomplete = migrate({ activeProfile: "personal", personalNotes: { includeFolders: ["Import"] } });
  assert.deepEqual(incomplete.personalNotes.includeFolders, [], "an incomplete selection shares nothing");
  const badExclude = migrate({ activeProfile: "personal", personalNotes: { includeFolders: ["Import"], excludeFolders: ["Import\\Private"] } });
  assert.match(badExclude.notices[0], /Import\\\\Private/, "the rejected entry is named");
});

test("malformed tagging state turns tagging off without stopping reads", () => {
  const r = migrate({ activeProfile: "personal", personalNotes: { includeFolders: [], excludeFolders: [], tagging: { enabled: true, folders: ["/abs"] } } });
  assert.equal(r.personalNotes.tagging.enabled, false);
  assert.equal(r.connectorMustStayStopped, false);
  assert.match(r.notices.join("\n"), /tagging/i);
});

test("profile switching is not a migration concern: re-migrating migrated output never changes the existing default", () => {
  const first = migrate({ ...BASELINE_9, schemaVersion: 10, defaultSensitivity: "internal", personalNotesEnabled: true, personalNotesFolders: ["A"], personalNotesPriorDefaultSensitivity: "secret" });
  // What the integrator persists: flat keys removed, nested settings and profile written.
  const saved = { ...BASELINE_9, defaultSensitivity: first.restoredDefaultSensitivity, schemaVersion: 11, activeProfile: "existing", personalNotes: first.personalNotes };
  const second = migrate(saved);
  assert.equal(second.restoredDefaultSensitivity, undefined);
  assert.deepEqual(second.personalNotes, first.personalNotes);
  assert.deepEqual(second.notices, []);
});
