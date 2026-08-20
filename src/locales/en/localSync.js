export const localSync = {
  title: "Local sync",
  lead: "Transfer the database directly between phones on the same Wi-Fi network or hotspot. No internet required.",

  status: {
    idle: "Ready",
    preparing: "Preparing archive",
    hosting: "QR is active",
    scanning: "Opening camera",
    scanningImport: "Opening camera",
    joining: "Connecting",
    merging: "Merging data",
    importing: "Importing database",
    complete: "Complete",
  },

  hostTitle: "This phone",
  hostHint: "Create a QR code on the device that already has the database.",
  hostIdle: "Show QR",
  hostPreparing: "Preparing archive...",
  stop: "Stop session",
  expiresIn: "Expires in",
  transferred: "Transferred to devices",
  sessionId: "Session ID",
  multiDevice: "Allow imports to multiple devices",
  multiDeviceHint:
    "By default, the QR closes after the first successful transfer.",

  approvalTitle: "Allow transfer?",
  approvalSync: "The second device requests two-way synchronization.",
  approvalImport: "The second device requests a copy of the database.",
  peerAddress: "Device",
  approve: "Allow",
  reject: "Reject",

  peerTitle: "Second phone",
  peerHint:
    "Scan the QR to synchronize the current project or import the database as a new project.",
  scanSync: "Scan and synchronize",
  scanSyncLoading: "Opening camera...",
  scanImport: "Scan and import database",
  scanImportLoading: "Importing by QR...",

  manualTitle: "Manual connection",
  manualHint:
    "Use IP, port, code, security key and session ID if the camera is unavailable.",
  address: "Address",
  code: "Code",
  securityKey: "Security key",
  securityKeyPlaceholder: "64 SHA-256 characters",
  port: "Port",
  connect: "Connect and synchronize",
  connecting: "Synchronizing...",

  overlay: "Point the camera at the QR code",
  cancel: "Cancel",
  warning:
    "The connection is encrypted with TLS. For manual connection, verify the security key against the first phone.",
};
