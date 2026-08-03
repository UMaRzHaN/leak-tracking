export const syncErrors = {
  INCOMPATIBLE_VERSION: "The other phone runs an incompatible app version",
  SESSION_EXPIRED: "The QR code has expired",
  SESSION_STOPPED: "The sync session has already been stopped",
  INVALID_CODE: "Wrong connection code",
  DIFFERENT_ORIGIN:
    "These projects have different origins and cannot be merged",
  SESSION_BUSY: "Another device is already using this sync session",
  TRANSFER_BUSY: "Another device is already using this transfer session",
  NOT_CONFIRMED: "The transfer was not confirmed on the first device",
  ARCHIVE_CORRUPT: "The archive was corrupted in transit",
  WRONG_SESSION: "The QR code belongs to a finished session",
  FINGERPRINT_MISMATCH: "The host security key does not match",
  CONNECTION_INTERRUPTED: "The connection dropped during transfer",
  ARCHIVE_EMPTY: "The sync archive is empty",
  ARCHIVE_TOO_LARGE: "The sync archive is too large",
  NO_LOCAL_NETWORK: "Connect to Wi-Fi or turn on a hotspot",
};
