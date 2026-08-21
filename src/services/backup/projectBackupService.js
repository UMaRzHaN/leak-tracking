/**
 * Stable public facade for project backup, import, merge and sync operations.
 * Implementation is split by responsibility across this directory.
 */
export {
  buildBackupZip,
  buildProjectBackupZip,
  exportBackupZip,
  streamProjectBackupZip,
} from "./backupExport";

export {
  importBackupZip,
  importIntoExistingProject,
  importProjectZip,
} from "./backupImport";

export { detectProjectTypeFromLeaks, peekBackupZip } from "./archiveParser";

export { previewArchiveComponents } from "./componentArchive";

export { mergeLeaksByFreshness, previewMergeLeaks } from "./merge";
