/** DOM/Obsidian-free public surface used by the sync planner tests. */
export {
  MAX_CONFLICT_COPIES,
  buildNextcloudDavRoot,
  conflictCopyPath,
  effectiveSyncExcludes,
  emptyNextcloudState,
  isConflictCopyOf,
  isConflictCopyPath,
  isExcluded,
  migrateNextcloudSettings,
  migrateNextcloudState,
  normalizeRemotePath,
  planSync,
  safeRelativePath,
  stateForScope,
  syncScope,
} from "./nextcloud-sync-core";
export type { LocalEntry, RemoteEntry, SyncRecord } from "./nextcloud-sync-core";
