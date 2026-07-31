export const IMPORT_LIMITS = Object.freeze({
  // Imports are parsed inside the WebView. JSZip and ExcelJS retain multiple
  // representations of the same bytes, so these limits are intentionally
  // lower than the native streaming-export limit and are suitable for 2 GB
  // Android devices as well as desktop browsers.
  maxFileBytes: 96 * 1024 * 1024,
  maxArchiveEntries: 12_000,
  maxUncompressedBytes: 192 * 1024 * 1024,
  maxSingleEntryBytes: 24 * 1024 * 1024,
  maxExportBytes: 96 * 1024 * 1024,
});

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_FILE_SIGNATURE = 0x02014b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP_EOCD_MIN_BYTES = 22;
const ZIP64_EOCD_MIN_BYTES = 56;
const ZIP64_LOCATOR_BYTES = 20;
const ZIP_CENTRAL_FILE_HEADER_BYTES = 46;
const ZIP_SCAN_CHUNK_BYTES = 1024 * 1024;
const ZIP_UINT16_MAX = 0xffff;
const ZIP_UINT32_MAX = 0xffffffff;

function formatMegabytes(bytes) {
  return Math.ceil(bytes / (1024 * 1024));
}

function tooManyEntriesError(count) {
  return new Error(
    `Archive contains too many entries (${count}). Maximum: ${IMPORT_LIMITS.maxArchiveEntries}.`,
  );
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

function normalizeArrayBuffer(value) {
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    );
  }
  if (
    value != null &&
    Number.isFinite(Number(value.byteLength)) &&
    typeof value.slice === "function"
  ) {
    return value;
  }
  return null;
}

function createFileRangeReader(file) {
  let fullBufferPromise = null;

  const readFullBuffer = async () => {
    if (typeof file?.arrayBuffer !== "function") return null;
    if (!fullBufferPromise) {
      fullBufferPromise = Promise.resolve(file.arrayBuffer()).then(
        normalizeArrayBuffer,
      );
    }
    return fullBufferPromise;
  };

  return async (start, end) => {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start
    ) {
      return null;
    }

    if (typeof file?.slice === "function") {
      const slice = file.slice(start, end);
      if (typeof slice?.arrayBuffer === "function") {
        const buffer = normalizeArrayBuffer(await slice.arrayBuffer());
        if (buffer) return buffer;
      }
    }

    const buffer = await readFullBuffer();
    return buffer?.slice(start, end) ?? null;
  };
}

async function findLastRecordOffset(
  readRange,
  endExclusive,
  signature,
  minimumBytes,
  validate = null,
) {
  let searchEnd = endExclusive;
  while (searchEnd >= minimumBytes) {
    const start = Math.max(0, searchEnd - ZIP_SCAN_CHUNK_BYTES);
    const bytes = await readRange(start, searchEnd);
    if (!bytes) return -1;
    const view = new DataView(bytes);
    for (let offset = bytes.byteLength - minimumBytes; offset >= 0; offset--) {
      if (view.getUint32(offset, true) !== signature) continue;
      const absoluteOffset = start + offset;
      if (!validate || (await validate(absoluteOffset))) {
        return absoluteOffset;
      }
    }
    if (start === 0) break;
    searchEnd = start + minimumBytes - 1;
  }
  return -1;
}

function safeBigIntToNumber(value) {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

async function parseZip64Record(readRange, recordOffset, locatorOffset) {
  if (recordOffset < 0 || recordOffset + ZIP64_EOCD_MIN_BYTES > locatorOffset) {
    return null;
  }
  const record = await readRange(
    recordOffset,
    recordOffset + ZIP64_EOCD_MIN_BYTES,
  );
  if (!record || record.byteLength < ZIP64_EOCD_MIN_BYTES) return null;

  const view = new DataView(record);
  if (view.getUint32(0, true) !== ZIP64_EOCD_SIGNATURE) return null;
  const recordPayloadBytes = safeBigIntToNumber(view.getBigUint64(4, true));
  if (
    recordPayloadBytes == null ||
    recordPayloadBytes < 44 ||
    recordOffset + 12 + recordPayloadBytes !== locatorOffset
  ) {
    return null;
  }

  return {
    recordOffset,
    entryCount: view.getBigUint64(32, true),
    centralDirectorySize: view.getBigUint64(40, true),
  };
}

async function readZip64Info(readRange, eocdOffset) {
  const locatorOffset = eocdOffset - ZIP64_LOCATOR_BYTES;
  if (locatorOffset < 0) return null;
  const locator = await readRange(locatorOffset, eocdOffset);
  if (!locator || locator.byteLength < ZIP64_LOCATOR_BYTES) return null;

  const locatorView = new DataView(locator);
  if (locatorView.getUint32(0, true) !== ZIP64_LOCATOR_SIGNATURE) return null;
  if (locatorView.getUint32(16, true) > 1) return null;

  const reportedOffset = safeBigIntToNumber(locatorView.getBigUint64(8, true));
  if (reportedOffset != null) {
    const reported = await parseZip64Record(
      readRange,
      reportedOffset,
      locatorOffset,
    );
    if (reported) return reported;
  }

  // Self-extracting archives store ZIP offsets relative to the ZIP payload,
  // not necessarily to byte zero. Find the physical record and require it to
  // end exactly where the ZIP64 locator starts.
  let matched = null;
  await findLastRecordOffset(
    readRange,
    locatorOffset,
    ZIP64_EOCD_SIGNATURE,
    ZIP64_EOCD_MIN_BYTES,
    async (candidateOffset) => {
      matched = await parseZip64Record(
        readRange,
        candidateOffset,
        locatorOffset,
      );
      return matched != null;
    },
  );
  return matched;
}

function createBufferedReader(readRange, fileSize) {
  let cacheStart = -1;
  let cache = null;

  return async (offset, length) => {
    if (
      cache &&
      offset >= cacheStart &&
      offset + length <= cacheStart + cache.byteLength
    ) {
      return cache.slice(offset - cacheStart, offset - cacheStart + length);
    }

    cacheStart = offset;
    cache = await readRange(
      offset,
      Math.min(
        fileSize,
        Math.max(offset + length, offset + ZIP_SCAN_CHUNK_BYTES),
      ),
    );
    if (!cache || cache.byteLength < length) return null;
    return cache.slice(0, length);
  };
}

async function countCentralDirectoryEntries(
  readRange,
  fileSize,
  directoryEnd,
  directorySize,
) {
  const directoryStart = directoryEnd - directorySize;
  if (
    directoryStart < 0 ||
    directoryEnd > fileSize ||
    directoryStart > directoryEnd
  ) {
    return null;
  }

  const readBuffered = createBufferedReader(readRange, fileSize);
  let cursor = directoryStart;
  let count = 0;
  while (cursor + ZIP_CENTRAL_FILE_HEADER_BYTES <= directoryEnd) {
    const header = await readBuffered(cursor, ZIP_CENTRAL_FILE_HEADER_BYTES);
    if (!header) return null;
    const view = new DataView(header);
    if (view.getUint32(0, true) !== ZIP_CENTRAL_FILE_SIGNATURE) break;

    const entryBytes =
      ZIP_CENTRAL_FILE_HEADER_BYTES +
      view.getUint16(28, true) +
      view.getUint16(30, true) +
      view.getUint16(32, true);
    if (cursor + entryBytes > directoryEnd) return null;

    count += 1;
    if (count > IMPORT_LIMITS.maxArchiveEntries) {
      throw tooManyEntriesError(count);
    }
    cursor += entryBytes;
  }
  return count;
}

/**
 * Reads ZIP end records plus bounded central-directory windows so an
 * entry-count bomb can be rejected before JSZip constructs one JavaScript
 * object per central-directory entry.
 *
 * Invalid/non-ZIP inputs are left to the archive parser for its normal error.
 */
export async function preflightZipFile(file) {
  assertImportFileSize(file);
  const size = Number(file?.size);
  if (
    !Number.isFinite(size) ||
    size < ZIP_EOCD_MIN_BYTES ||
    (typeof file?.slice !== "function" &&
      typeof file?.arrayBuffer !== "function")
  ) {
    return null;
  }

  const readRange = createFileRangeReader(file);
  const eocdOffset = await findLastRecordOffset(
    readRange,
    size,
    ZIP_EOCD_SIGNATURE,
    ZIP_EOCD_MIN_BYTES,
  );
  if (eocdOffset < 0) return null;

  const eocd = await readRange(eocdOffset, eocdOffset + ZIP_EOCD_MIN_BYTES);
  if (!eocd || eocd.byteLength < ZIP_EOCD_MIN_BYTES) return null;
  const view = new DataView(eocd);
  const legacyCount = view.getUint16(10, true);
  let entryCount = BigInt(legacyCount);
  let directorySize = view.getUint32(12, true);
  let directoryEnd = eocdOffset;

  const needsZip64 =
    view.getUint16(4, true) === ZIP_UINT16_MAX ||
    view.getUint16(6, true) === ZIP_UINT16_MAX ||
    view.getUint16(8, true) === ZIP_UINT16_MAX ||
    legacyCount === ZIP_UINT16_MAX ||
    directorySize === ZIP_UINT32_MAX ||
    view.getUint32(16, true) === ZIP_UINT32_MAX;
  if (needsZip64) {
    const zip64 = await readZip64Info(readRange, eocdOffset);
    if (!zip64) return null;
    entryCount = zip64.entryCount;
    directorySize = safeBigIntToNumber(zip64.centralDirectorySize);
    directoryEnd = zip64.recordOffset;
    if (directorySize == null) return null;
  }

  if (entryCount > BigInt(IMPORT_LIMITS.maxArchiveEntries)) {
    throw tooManyEntriesError(entryCount.toString());
  }

  const scannedCount = await countCentralDirectoryEntries(
    readRange,
    size,
    directoryEnd,
    directorySize,
  );
  if (scannedCount != null) {
    if (scannedCount > IMPORT_LIMITS.maxArchiveEntries) {
      throw tooManyEntriesError(scannedCount);
    }
    entryCount =
      BigInt(scannedCount) > entryCount ? BigInt(scannedCount) : entryCount;
  }

  return { entryCount: Number(entryCount) };
}

function getEntrySize(entry) {
  const size = Number(entry?._data?.uncompressedSize);
  return Number.isFinite(size) && size >= 0 ? size : 0;
}

function entryTooLargeError(entry, size) {
  return new Error(
    `Archive entry "${entry.name}" is too large (${formatMegabytes(size)} MB).`,
  );
}

function archiveTooLargeError() {
  return new Error(
    `Archive expands beyond the ${formatMegabytes(
      IMPORT_LIMITS.maxUncompressedBytes,
    )} MB safety limit.`,
  );
}

export function assertArchiveLimits(zip) {
  const allEntries = Object.values(zip?.files ?? {});
  if (allEntries.length > IMPORT_LIMITS.maxArchiveEntries) {
    throw tooManyEntriesError(allEntries.length);
  }
  const entries = allEntries.filter((entry) => !entry.dir);

  let total = 0;
  for (const entry of entries) {
    const size = getEntrySize(entry);
    if (size > IMPORT_LIMITS.maxSingleEntryBytes) {
      throw entryTooLargeError(entry, size);
    }
    total += size;
    if (total > IMPORT_LIMITS.maxUncompressedBytes) {
      throw archiveTooLargeError();
    }
  }
}

function streamArchiveEntry(entry, onChunk) {
  return new Promise((resolve, reject) => {
    let stream;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      try {
        stream?.pause();
      } catch {
        // Best effort: rejecting stops the caller even if a custom stream
        // implementation does not support pausing.
      }
      reject(error);
    };

    try {
      stream = entry.internalStream("uint8array");
      stream
        .on("data", (chunk) => {
          if (settled) return;
          try {
            const size = Number(chunk?.byteLength ?? chunk?.length);
            if (!Number.isSafeInteger(size) || size < 0) {
              throw new Error(`Archive entry "${entry.name}" is invalid.`);
            }
            onChunk(size);
          } catch (error) {
            fail(error);
          }
        })
        .on("error", fail)
        .on("end", () => {
          if (settled) return;
          settled = true;
          resolve();
        });
      stream.resume();
    } catch (error) {
      fail(error);
    }
  });
}

/**
 * Verifies the bytes actually emitted by JSZip's decompressor. ZIP headers are
 * attacker-controlled, so their advertised uncompressed sizes are only a fast
 * preflight and cannot be the final memory-safety boundary.
 */
export async function verifyArchiveLimits(zip) {
  assertArchiveLimits(zip);

  let total = 0;
  for (const entry of Object.values(zip?.files ?? {})) {
    if (entry.dir) continue;
    let entrySize = 0;
    await streamArchiveEntry(entry, (chunkSize) => {
      entrySize += chunkSize;
      total += chunkSize;
      if (entrySize > IMPORT_LIMITS.maxSingleEntryBytes) {
        throw entryTooLargeError(entry, entrySize);
      }
      if (total > IMPORT_LIMITS.maxUncompressedBytes) {
        throw archiveTooLargeError();
      }
    });
  }
}
