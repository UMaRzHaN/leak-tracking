// Sources that only ever describe the *secondary* copy of a project. Losing
// one of them still leaves the primary IndexedDB store authoritative, so
// writes may continue. "localstorage" is where the secondary copy lived
// before schema v2 and is still accepted here for warnings created by an
// older build; "mirror" is the IndexedDB mirror object store used since.
const SECONDARY_COPY_SOURCES = new Set(["mirror", "localstorage"]);

export function isProjectDataReadWarningBlocking(warning) {
  if (!warning) return false;
  if (typeof warning.blocksWrites === "boolean") return warning.blocksWrites;
  return !SECONDARY_COPY_SOURCES.has(warning.source);
}

export function splitProjectDataReadWarning(warning) {
  if (!warning) {
    return { loadError: null, loadWarning: null };
  }
  return isProjectDataReadWarningBlocking(warning)
    ? { loadError: warning, loadWarning: null }
    : { loadError: null, loadWarning: warning };
}

/**
 * Decides how a partially failed web read should be surfaced.
 *
 * `mirrorError` is a failure to read the *secondary* copy. Since schema v2
 * that copy is an IndexedDB object store rather than localStorage, so this
 * is an IndexedDB error too — it is still non-blocking because the primary
 * store was read successfully, which is what `indexedDbError` covers.
 */
export function getWebProjectDataReadFailurePolicy({
  indexedDbError = null,
  mirrorError = null,
} = {}) {
  if (indexedDbError) {
    return {
      cause: indexedDbError,
      source: "indexeddb",
      blocksWrites: true,
    };
  }
  if (mirrorError) {
    return {
      cause: mirrorError,
      source: "mirror",
      blocksWrites: false,
    };
  }
  return null;
}
