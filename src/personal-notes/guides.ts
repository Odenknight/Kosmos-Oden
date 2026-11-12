/**
 * Personal Notes (0.9.0) — guide text for the "Add notes" window.
 *
 * Plain data, no logic. All user-facing import guidance lives here so it can
 * be corrected after alpha testing without touching UI code.
 *
 * Kosmos-Oden does not convert notes. Conversion is done by the Obsidian
 * Importer community plugin. These guides were written against Importer
 * 3.1.17; its screens may differ in other versions.
 */
export const IMPORTER_PLUGIN_ID = "obsidian-importer";
export const IMPORTER_COMMAND_ID = "obsidian-importer:open-modal";
export const IMPORTER_INSTALL_URI = "obsidian://show-plugin?id=obsidian-importer";
export const IMPORTER_TESTED_VERSION = "3.1.17";
export const DEFAULT_IMPORT_FOLDER = "Import";

export type SourceGuideId = "keep" | "onenote-account" | "onenote-file" | "existing";

export interface SourceGuide {
  id: SourceGuideId;
  /** Button label on the first screen. */
  title: string;
  /** One line under the button. */
  summary: string;
  /** Numbered steps. "{folder}" is replaced with the import folder name. */
  steps: string[];
  /** Things the user should know before starting. */
  notes: string[];
  /** False when nothing needs importing. */
  usesImporter: boolean;
}

export const SOURCE_GUIDES: readonly SourceGuide[] = [
  {
    id: "keep",
    title: "Google Keep",
    summary: "Bring in a copy of your Keep notes using Google Takeout.",
    usesImporter: true,
    steps: [
      "On a computer, open takeout.google.com and sign in to your Google account.",
      "Choose Deselect all, then tick only Keep.",
      "Create the export. Google emails you when it is ready. Download the .zip file and do not unzip it.",
      "Click Open the Importer below and choose Google Keep.",
      "Choose the .zip file you downloaded.",
      "Tick Import archived notes if you want them included.",
      "Check that Output folder says {folder}. Under Attachment location choose In subfolder under the note, so pictures and files stay beside their notes.",
      "Start the import.",
    ],
    notes: [
      "This is a copy of your Keep notes as they were when Google made the export. To bring in newer notes later, make a new export.",
      "Checklists become task lists. Labels become tags.",
      "Things that only work inside Keep, such as reminders, stay in Keep.",
      "If you rename a note in Keep and import again, it arrives as a second note.",
    ],
  },
  {
    id: "onenote-account",
    title: "OneNote: sign in",
    summary: "Easiest. Sign in with your Microsoft account and pick notebooks.",
    usesImporter: true,
    steps: [
      "Click Open the Importer below and choose Microsoft OneNote.",
      "Choose the Microsoft account method and sign in with the account that owns the notebooks.",
      "Tick the notebooks or sections you want.",
      "Check that Output folder says {folder}. Under Attachment location choose In subfolder under the note, so pictures and files stay beside their notes.",
      "Start the import.",
      "Large notebooks can take a long time because Microsoft limits how fast notes can be downloaded. You can pause and continue.",
    ],
    notes: [
      "Handwriting comes in as a drawing you can look at. On this route it is not searchable text.",
      "Words inside pictures are not searchable on this route.",
      "Notebooks that someone else shared with you may not appear.",
      "Needs an internet connection.",
    ],
  },
  {
    id: "onenote-file",
    title: "OneNote: export files",
    summary: "Works offline. Better if you have a lot of handwriting.",
    usesImporter: true,
    steps: [
      "In OneNote for Windows, right click a notebook and export it to save a .onepkg file, or export one section as a .one file.",
      "Click Open the Importer below and choose Microsoft OneNote (export file).",
      "Choose the file or files you saved, then tick the sections you want.",
      "Check that Output folder says {folder}. Under Attachment location choose In subfolder under the note, so pictures and files stay beside their notes.",
      "Start the import.",
    ],
    notes: [
      "No account or internet connection is needed.",
      "Where OneNote had already recognized your handwriting, that text comes in and can be searched.",
      "Sections protected by a password are skipped.",
    ],
  },
  {
    id: "existing",
    title: "A folder I already have",
    summary: "Your notes are already in this vault. Nothing to import.",
    usesImporter: false,
    steps: [],
    notes: [
      "Notes with no special formatting work as they are.",
      "Use Search my notes to find things, and Connect my AI to let an assistant read the folders you choose.",
    ],
  },
];

export const REIMPORT_ADVICE: readonly string[] = [
  "Importing the same source again later is safe if you choose Skip under Existing notes. Skip keeps every note already in your vault exactly as it is.",
  "Update replaces a note when the original is newer than your copy. That can overwrite changes you made here.",
];

export const PERSONAL_NOTES_PROMISES: readonly string[] = [
  "Kosmos-Oden does not change or delete your notes or your exports unless you ask it to add GKX tags.",
  "Your notes stay ordinary Markdown files with their attachments. They work without Kosmos-Oden.",
];

export const PERSONAL_NOTES_MODE_NOTICE =
  "Choosing a source turns on Personal Notes for this vault. While it is on, an assistant can read only the folders you pick in Connect my AI, and notes with no sensitivity label are treated as internal.";

export const CONNECT_FACTS: readonly string[] = [
  "The connection works only while Obsidian is open on this computer.",
  "Searching happens on this computer. If your assistant runs in the cloud, the notes it reads are sent to that service.",
  "Your assistant can read notes. It cannot change them.",
];

/** Optional GKX tagging, shown after an import. Every item is off until the user asks for it. */
export const GKX_TAGGING_INTRO: readonly string[] = [
  "Optional. GKX tags give a note a permanent ID, time stamps, and a record of which note replaces which. Your notes work without them.",
  "Tagging uses the same deterministic GKX formatting tool as the rest of Kosmos-Oden. It shows a preview, makes a backup, and uses no AI model.",
];
export const GKX_TAGGING_STAMP_DESC =
  "Off by default. When on, Kosmos-Oden adds created_at and updated_at to a note in your import folder the next time you edit it.";
export const GKX_TAGGING_CONVERT_DESC =
  "Adds a GKX version, a unique ID and time stamps to the notes in your import folder. You see every change before anything is written.";
export const GKX_TAGGING_LINEAGE_DESC =
  "Open the newer note, then use this to record that it replaces an older note. Kosmos-Oden adds a supersedes property that links to the older note.";
export const GKX_TAGGING_AFTER =
  "After tagging, run Connect my AI and press Turn on and check again. If the count of readable notes dropped, the tagging gave notes a sensitivity label above your assistant's limit.";
