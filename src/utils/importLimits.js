export const IMPORT_LIMITS = Object.freeze({
  maxFileBytes: 200 * 1024 * 1024,
  maxArchiveEntries: 5000,
  maxUncompressedBytes: 300 * 1024 * 1024,
  maxSingleEntryBytes: 100 * 1024 * 1024,
});

function formatMegabytes(bytes) {
  return Math.ceil(bytes / (1024 * 1024));
}

export function assertImportFileSize(file) {
  const size = Number(file?.size);
  if (Number.isFinite(size) && size > IMPORT_LIMITS.maxFileBytes) {
    throw new Error(
      `Import file is too large (${formatMegabytes(size)} MB). Maximum: ${formatMegabytes(
        IMPORT_LIMITS.maxFileBytes,
      )} MB.`,
    );
  }
}

function getEntrySize(entry) {
  const size = Number(entry?._data?.uncompressedSize);
  return Number.isFinite(size) && size >= 0 ? size : 0;
}

export function assertArchiveLimits(zip) {
  const entries = Object.values(zip?.files ?? {}).filter((entry) => !entry.dir);
  if (entries.length > IMPORT_LIMITS.maxArchiveEntries) {
    throw new Error(
      `Archive contains too many files (${entries.length}). Maximum: ${IMPORT_LIMITS.maxArchiveEntries}.`,
    );
  }

  let total = 0;
  for (const entry of entries) {
    const size = getEntrySize(entry);
    if (size > IMPORT_LIMITS.maxSingleEntryBytes) {
      throw new Error(
        `Archive entry "${entry.name}" is too large (${formatMegabytes(size)} MB).`,
      );
    }
    total += size;
    if (total > IMPORT_LIMITS.maxUncompressedBytes) {
      throw new Error(
        `Archive expands beyond the ${formatMegabytes(
          IMPORT_LIMITS.maxUncompressedBytes,
        )} MB safety limit.`,
      );
    }
  }
}
