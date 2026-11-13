/**
 * Personal Notes (0.9.0) — guide text for the "Add notes" window.
 *
 * Plain data, no logic. All user-facing import guidance lives here so it can
 * be corrected after alpha testing without touching UI code.
 *
 * Kosmos-Oden does not convert notes. Conversion is done by the Obsidian
 * Importer community plugin. These guides were written against Importer
 * 3.1.17; its screens may differ in other versions. The official guides are
 * linked for the details.
 */
export const IMPORTER_PLUGIN_ID = "obsidian-importer";
export const IMPORTER_COMMAND_ID = "obsidian-importer:open-modal";
export const IMPORTER_INSTALL_URI = "obsidian://show-plugin?id=obsidian-importer";
export const IMPORTER_TESTED_VERSION = "3.1.17";
export const DEFAULT_IMPORT_FOLDER = "Import";
/** How to open the Importer by hand when the command could not be run. */
export const IMPORTER_PALETTE_FALLBACK =
  "Open the command palette (Ctrl+P, or Cmd+P on a Mac), type Importer, and run the Importer's command to open it.";

export type SourceGuideId = "keep" | "onenote-account" | "onenote-file" | "existing";

export interface SourceGuide {
  id: SourceGuideId;
  /** Button label on the first screen. */
  title: string;
  /** One line under the button. */
  summary: string;
  /** Official Obsidian guide for this source, or null. */
  guideUrl: string | null;
  /** Suggested destination: its own folder, attachments kept inside it. */
  suggestedFolder: string;
  /** Numbered steps. "{folder}" is replaced with the destination folder. */
  steps: string[];
  /** Things the user should know before starting. */
  notes: string[];
  /** False when nothing needs importing. */
  usesImporter: boolean;
}

export const KEEP_GUIDE_URL = "https://obsidian.md/help/import/google-keep";
export const ONENOTE_GUIDE_URL = "https://obsidian.md/help/import/onenote";

const OUTPUT_STEP = "Set the Importer's output folder to {folder}. If the Importer asks where to put pictures and attachments, keep them inside that folder.";

export const SOURCE_GUIDES: readonly SourceGuide[] = [
  {
    id: "keep",
    title: "Google Keep",
    summary: "A copy of your Keep notes from a Google Takeout export (.zip).",
    guideUrl: KEEP_GUIDE_URL,
    suggestedFolder: `${DEFAULT_IMPORT_FOLDER}/Google Keep`,
    usesImporter: true,
    steps: [
      "On a computer, open takeout.google.com and sign in to your Google account.",
      "Choose Deselect all, then tick only Keep.",
      "Create the export. Google emails you when it is ready. Download the .zip file and keep it as it is.",
      "Click Open Importer below and choose Google Keep.",
      "Choose the .zip file you downloaded.",
      OUTPUT_STEP,
      "Start the import, then come back here and choose Review results.",
    ],
    notes: [
      "This is a copy of your Keep notes as they were when Google made the export. Newer notes need a new export.",
      "Checklists become task lists, but nested (indented) checklist items may come in flat. Labels become tags.",
      "Reminders, collaborators and other things that only work inside Keep are not carried over.",
      "If you rename a note in Keep and import again, it arrives as a second note. Kosmos-Oden does not merge them.",
    ],
  },
  {
    id: "onenote-account",
    title: "OneNote: sign in to Microsoft",
    summary: "Pick notebooks from your Microsoft account. Needs an internet connection.",
    guideUrl: ONENOTE_GUIDE_URL,
    suggestedFolder: `${DEFAULT_IMPORT_FOLDER}/OneNote`,
    usesImporter: true,
    steps: [
      "Click Open Importer below and choose Microsoft OneNote.",
      "Sign in with the Microsoft account that owns the notebooks.",
      "Tick the notebooks or sections you want and check the preview.",
      OUTPUT_STEP,
      "Start the import. Large notebooks can take a long time because Microsoft limits how fast notes can be downloaded.",
      "When it has finished, come back here and choose Review results.",
    ],
    notes: [
      "Handwriting (ink) is kept as a drawing you can look at. It is not turned into text, so it cannot be searched.",
      "Words inside pictures are not turned into searchable text.",
      "Notebooks that someone else shared with you may not appear.",
    ],
  },
  {
    id: "onenote-file",
    title: "OneNote: exported files",
    summary: "Import .one or .onepkg files saved from OneNote for Windows. Works offline.",
    guideUrl: ONENOTE_GUIDE_URL,
    suggestedFolder: `${DEFAULT_IMPORT_FOLDER}/OneNote`,
    usesImporter: true,
    steps: [
      "In OneNote for Windows, export a notebook as a .onepkg file, or one section as a .one file.",
      "Click Open Importer below and choose Microsoft OneNote, then the option for exported files.",
      "Choose the file or files you saved, then tick the sections you want and check the preview.",
      OUTPUT_STEP,
      "Start the import, then come back here and choose Review results.",
    ],
    notes: [
      "No account or internet connection is needed.",
      "Where OneNote had already recognized handwriting as text, that text comes in and can be searched. Other handwriting is kept as a drawing only; Kosmos-Oden does not transcribe it.",
      "Words inside pictures are not turned into searchable text.",
      "Sections protected by a password are skipped.",
    ],
  },
  {
    id: "existing",
    title: "A folder already in this vault",
    summary: "Your notes are already here. Nothing to import.",
    guideUrl: null,
    suggestedFolder: "",
    usesImporter: false,
    steps: [],
    notes: [
      "Ordinary notes work as they are; they need no special formatting.",
      "Search my notes covers your whole vault. Assistants see only the folders you share in Connect my AI.",
    ],
  },
];

export const REIMPORT_ADVICE: readonly string[] = [
  "Importing the same source again: choose Skip existing notes. Skip leaves every note already in your vault exactly as it is.",
  "Update can replace a note you changed here when the source is newer, so a change on both sides can be lost.",
  "To bring in an updated export without risk, import it into a new, empty folder (for example Import/Google Keep 2026-12) and compare by hand.",
];

export const PERSONAL_NOTES_PROMISES: readonly string[] = [
  "Searching and connecting never change your notes or your exports. Notes change only when the Importer writes them, or when you apply optional tags yourself.",
  "Your notes stay ordinary Markdown files with their attachments. They work without Kosmos-Oden.",
];

/** Shown when the existing profile is active. Choosing a source never switches it. */
export const PERSONAL_PROFILE_EXPLAINER =
  "Importing and searching work in either profile. Switching to the Personal Notes profile changes only what a connected assistant can read: just the Folders shared with agents, which start empty. Your existing Agent API settings are kept and come back if you switch back. Nothing is shared until you choose folders.";

export const CONNECT_FACTS: readonly string[] = [
  "The connection works only while Obsidian is open on this computer.",
  "Searching happens on this computer. If your assistant runs in the cloud, the notes it reads are sent to that service and processed there.",
  "Your assistant can read notes in the folders you share. It cannot change them.",
];

export const TAGGING_INTRO: readonly string[] = [
  "Optional and off by default. Tags here are plain rules, not AI: a time stamp, a permanent ID, or a record of which note replaces which. No model is used.",
  "A tagged note stays an ordinary note; it is not converted to a different format.",
  "Tagging and sharing are separate: tagging a folder never shares it, and sharing a folder never tags it.",
];
