export const errors = {
  // Projects
  PROJECT_CREATE_FAILED: "Could not create the project",
  PROJECT_SWITCH_TIMEOUT: "Timed out waiting for the project to switch",
  PROJECT_DATA_WRITE_FAILED: "Could not save the project data",
  PROJECT_DATA_WRITE_BLOCKED:
    "The project is read-only: its data could not be read. Reload the app.",
  PROJECT_LIST_READ_FAILED: "Could not read the project list",

  // Voice input
  MIC_DENIED: "No access to the microphone",
  VOICE_UNSUPPORTED: "Voice input is not supported",
  CAMERA_PERMISSION_REQUIRED: "Allow the app to use the camera",

  // Sync QR code
  QR_SCAN_CANCELLED: "Scanning cancelled",
  QR_SCAN_UNSUPPORTED: "This phone does not support QR scanning",
  QR_NOT_LEAK_TRACKER: "This is not a Leak Tracker QR code",
  QR_CORRUPT: "The sync QR code is damaged",
  QR_INCOMPATIBLE_VERSION:
    "The QR code was made by an incompatible app version",
  QR_INVALID_PARAMS: "The QR code carries invalid connection parameters",
  QR_NO_PROJECT_ID: "The QR code carries no project identifier",
  QR_OTHER_DATABASE: "The QR code belongs to a different database",
  QR_OTHER_PROJECT: "The QR code was made for a different project",
  QR_SESSION_INVALID: "Invalid QR session identifier",

  // Archive transfer
  SYNC_ID_CREATE_FAILED: "Could not create a sync identifier",
  SYNC_ID_SAVE_FAILED: "Could not save the sync identifier",
  SYNC_ID_REPLACE_FAILED: "Could not replace the sync identifier",
  ARCHIVE_CHANNEL_CLOSED: "The archive transfer channel is closed",
  ARCHIVE_READ_FAILED: "Could not read the archive",
  ARCHIVE_PREPARE_FAILED: "Could not prepare the archive",
  ARCHIVE_SIZE_MISMATCH: "The prepared archive size does not match",
  RECEIVED_ARCHIVE_BAD_SIZE: "Received an invalid archive size",
  RECEIVED_ARCHIVE_BAD_PATH: "Received an invalid archive path",
  RECEIVED_ARCHIVE_NO_TOKEN: "Received an archive without a cleanup token",
  RECEIVED_ARCHIVE_SIZE_MISMATCH:
    "The received archive size does not match the declared one",

  // Project archive import
  ARCHIVE_OTHER_DATABASE: "The archive came from a different database",
  ARCHIVE_NO_SYNC_ID: "The archive carries no sync identifier",
  ARCHIVE_NO_BACKUP_JSON: "backup.json was not found in the archive",
  ARCHIVE_BACKUP_JSON_INVALID: "backup.json contains invalid JSON",
  ARCHIVE_RECOVERY_JSON_INVALID: "{{file}} contains invalid JSON",
  ARCHIVE_PHOTO_MISSING: 'Photo file "{{path}}" was not found in the archive',
  IMPORT_STORAGE_NOT_READY: "Storage for the imported project is not ready",
  PHOTO_SAVE_FAILED: "Could not save photo {{path}}",
  PHOTO_DELETE_FAILED: "Some project photos could not be deleted",
  COMPONENT_PHOTO_SAVE_FAILED: "Could not save the component photo",

  // Another tab
  PROJECT_CHANGED_ELSEWHERE:
    "The project changed in another tab. Reload the page — saving now would overwrite those edits.",
  IDB_BLOCKED:
    "The database is busy in another tab. Close the app's other tabs.",

  // Storage
  IDB_NOT_READY: "Storage is not ready yet. Try again in a few seconds.",

  // Device storage
  DEVICE_OUT_OF_SPACE:
    "The device is out of space. Free some up — export the project and clear the map cache — then try again.",

  // Excel import
  ZIP_NO_XLSX: "No .xlsx file was found in the ZIP",

  // Codes that useLocalSync already handles with richer text (project types are
  // interpolated there); that text wins. These entries cover the paths that do
  // not go through it.
  PROJECT_TYPE_MISSING: "Could not determine the project type in the archive",
  CURRENT_PROJECT_TYPE_MISSING: "Could not determine the current project type",
  PROJECT_TYPE_MISMATCH:
    "The imported project type does not match the current project",
  SYNC_EPOCH_MISMATCH:
    "Device sync histories diverged after deleted records were purged. Send the whole project from the up-to-date device.",
  ARCHIVE_NO_PROJECT_META:
    "The archive carries no project metadata. Fill in the project name and type.",
  RECEIVED_ARCHIVE_READ_FAILED: "Could not read the received archive",
  ARCHIVE_OVER_LIMIT: "The sync archive is larger than {{limitMb}} MB",
  SYNC_ANDROID_ONLY: "Local sync is only available in the Android app",

  // Component registry
  NO_COMPONENT_REGISTRY: "This project type has no component registry",

  // Leak lifecycle
  INVALID_LEAK_STATUS_TRANSITION: "This status change is not allowed",
  HISTORY_USER_REQUIRED:
    "No one is set to record the change: fill in the name in your profile.",

  // Drawings
  SCHEMA_OPEN_FAILED: "No app on this device can open the drawing",
  SCHEMA_OPEN_BLOCKED: "The browser blocked opening the drawing in a new tab",
  SCHEMA_UNSUPPORTED: "This drawing format is not supported",

  // Another set of codes with handlers of their own — in `importErrorText`
  // and in the drawing list. That text is more precise and wins; these
  // entries cover the paths that bypass those handlers.
  EMPTY_EXCEL: "No importable rows found in Excel",
  EMPTY_INVENTORY: "No component cards were found in the archive",
  MISSING_PROJECT_TYPE: "Select project type",
  UNKNOWN_IMPORT_FILE:
    "Could not tell what this file is. A ZIP backup, an XLSX or an inventory archive is expected.",
};
