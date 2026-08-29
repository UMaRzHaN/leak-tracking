export const app = {
  importingData: "Importing data, please wait...",
  loading: "Loading data",

  loadWarning: {
    title: "Browser backup storage is unavailable",
    description:
      "The primary IndexedDB database is working. You can continue; the backup copy will be repaired after the error is resolved.",
    retry: "Retry mirror",
  },

  loadError: {
    title: "Data could not be read",
    description:
      "The project is not treated as empty. Writes are blocked to protect existing data. Check storage and try again.",
    retry: "Retry",
    download: "Download recovery data",
    saved: "Saved to Documents/{{path}}",
    downloaded: "File saved ({{fileName}})",
    saveFailed: "The file could not be saved",
  },
};
