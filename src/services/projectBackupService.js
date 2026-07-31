/**
 * Stable public facade for project backup, import, merge and sync operations.
 * Implementation is split by responsibility under ./projectBackup/.
 */
export {
  buildBackupZip,
  buildProjectBackupZip,
  exportBackupZip,
  streamProjectBackupZip,
} from "./projectBackup/backupExport";

export {
  importBackupZip,
  importIntoExistingProject,
  importProjectZip,
} from "./projectBackup/backupImport";

export {
  detectProjectTypeFromLeaks,
  peekBackupZip,
} from "./projectBackup/archiveParser";

export {
  mergeLeaksByFreshness,
  previewMergeLeaks,
} from "./projectBackup/merge";
