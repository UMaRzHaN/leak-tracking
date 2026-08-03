export function isProjectDataReadWarningBlocking(warning) {
  if (!warning) return false;
  if (typeof warning.blocksWrites === "boolean") return warning.blocksWrites;
  return warning.source !== "localstorage";
}

export function splitProjectDataReadWarning(warning) {
  if (!warning) {
    return { loadError: null, loadWarning: null };
  }
  return isProjectDataReadWarningBlocking(warning)
    ? { loadError: warning, loadWarning: null }
    : { loadError: null, loadWarning: warning };
}

export function getWebProjectDataReadFailurePolicy({
  indexedDbError = null,
  localStorageError = null,
} = {}) {
  if (indexedDbError) {
    return {
      cause: indexedDbError,
      source: "indexeddb",
      blocksWrites: true,
    };
  }
  if (localStorageError) {
    return {
      cause: localStorageError,
      source: "localstorage",
      blocksWrites: false,
    };
  }
  return null;
}
