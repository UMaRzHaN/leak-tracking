import { isNative } from "@/utils/platform";
import { Directory } from "@capacitor/filesystem";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { PROJECT_META } from "@/configs/projects";
import { logger } from "@/utils/logger";
import { isValidLatitude, isValidLongitude } from "@/utils/coordinates";
import { requestPersistentStorage } from "@/services/storage/persistentStorage";
import {
  getWebProjectDataReadFailurePolicy,
  isProjectDataReadWarningBlocking,
} from "@/repositories/projectDataReadState";
import {
  deleteNativeProjectStorage,
  isMissingNativeFileError,
  loadNativeProject,
  readNativeSnapshot,
  saveNativeProject,
  writeNativeProjectSnapshot,
} from "@/repositories/nativeLeakStorage";
import { createNativeSqliteMutation } from "@/repositories/nativeSqliteMutation";
import {
  compareWebEnvelopes,
  createWebEnvelope,
  LEGACY_WEB_ENVELOPE,
  normalizeWebEnvelope,
  sameWebEnvelope,
} from "@/repositories/webProjectEnvelope";
import {
  clearLegacyLocalStorageEnvelope,
  purgeWebProject,
  readLegacyLocalStorageEnvelope,
  readMirrorData,
  readMirrorDataRevision,
  assertLeakDataUnchanged,
  rememberLeakDataRevision,
  readWebData,
  readWebDataRevision,
  writeLegacyLocalStorageEnvelope,
  writeMirrorData,
  writeWebData,
} from "@/repositories/webProjectEnvelopeStore";

const VALID_STATUSES = new Set(["open", "in_progress", "resolved"]);
const PRESERVED_INVALID_RECORDS = Symbol("preservedInvalidLeakRecords");
const WEB_READ_WARNING = Symbol("webProjectDataReadWarning");
const EMBEDDED_SYNC_STATE = Symbol("embeddedProjectSyncState");

export class ProjectDataReadError extends Error {
  /** @param {string} message @param {any} [options] */
  constructor(
    message,
    { cause, source, code, recoveryData, blocksWrites } = {},
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProjectDataReadError";
    this.code = code ?? "PROJECT_DATA_READ_FAILED";
    this.source = source ?? "unknown";
    if (recoveryData !== undefined) this.recoveryData = recoveryData;
    if (blocksWrites !== undefined) this.blocksWrites = Boolean(blocksWrites);
  }
}

export class ProjectDataWriteError extends Error {
  /** @param {string} message @param {any} [options] */
  constructor(message, { cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProjectDataWriteError";
    this.code = "PROJECT_DATA_WRITE_FAILED";
  }
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeOptionalNumber(value) {
  if (value == null) return value ?? null;
  return isFiniteNumber(value) ? value : undefined;
}

function isValidPhotoPath(value) {
  return (
    value == null ||
    (typeof value === "string" &&
      (value.startsWith("idb://") ||
        value.startsWith("data://") ||
        value.startsWith("zip:") ||
        value.startsWith("data:image/") ||
        value.startsWith("Documents/")))
  );
}

function normalizeLeakRecord(item) {
  if (!item || typeof item !== "object") return null;
  if (!(typeof item.id === "string" || typeof item.id === "number"))
    return null;

  const lat = normalizeOptionalNumber(item.lat);
  const lng = normalizeOptionalNumber(item.lng);
  if (item.lat != null && lat === undefined) return null;
  if (item.lng != null && lng === undefined) return null;
  if (lat != null && !isValidLatitude(lat)) return null;
  if (lng != null && !isValidLongitude(lng)) return null;

  const status = item.status ?? "open";
  if (!VALID_STATUSES.has(status)) return null;
  if (
    !isValidPhotoPath(item.photo) ||
    !isValidPhotoPath(item.photo_after) ||
    !isValidPhotoPath(item.photo_repair)
  ) {
    return null;
  }

  const normalized = {
    ...item,
    status,
  };
  if (item.lat !== undefined) normalized.lat = lat;
  if (item.lng !== undefined) normalized.lng = lng;
  return normalized;
}

function filterValidLeaks(arr, source) {
  if (!Array.isArray(arr)) return [];
  const valid = [];
  const preservedInvalid = [];
  const invalid = [];
  const seenIds = new Set();
  for (const item of arr) {
    const normalized = normalizeLeakRecord(item);
    const canonicalId = normalized ? String(normalized.id) : null;
    if (normalized && !seenIds.has(canonicalId)) {
      seenIds.add(canonicalId);
      valid.push(normalized);
    } else {
      invalid.push(item?.id ?? "?");
      preservedInvalid.push(item);
    }
  }
  if (invalid.length) {
    logger.warn(
      `[LeakRepository] ${source}: hid ${invalid.length} invalid records from the UI and preserved them in storage (id: ${invalid.join(", ")})`,
    );
  }
  if (preservedInvalid.length) {
    Object.defineProperty(valid, PRESERVED_INVALID_RECORDS, {
      value: preservedInvalid,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return valid;
}

export function getPreservedInvalidLeakRecords(leaks) {
  const preserved = leaks?.[PRESERVED_INVALID_RECORDS];
  return Array.isArray(preserved) ? preserved : [];
}

export function getProjectDataReadWarning(leaks) {
  return leaks?.[WEB_READ_WARNING] ?? null;
}

export { isProjectDataReadWarningBlocking };

function getLegacyNativeCandidates(legacyStorageType) {
  if (!PROJECT_META[legacyStorageType]) return [];
  const dataDirectory = `LeakReports/${legacyStorageType}/data`;
  return [
    {
      path: `${dataDirectory}/data.json`,
      directory: Directory.Data,
    },
    {
      path: `${dataDirectory}/${legacyStorageType}.json`,
      directory: Directory.Data,
    },
    {
      path: `${dataDirectory}/data.json`,
      directory: Directory.Documents,
    },
    {
      path: `${dataDirectory}/${legacyStorageType}.json`,
      directory: Directory.Documents,
    },
  ];
}

async function recoverLegacyNativeArray(
  folderName,
  legacyStorageType,
  currentMainPath,
) {
  const candidates = getLegacyNativeCandidates(legacyStorageType);
  for (const candidate of candidates) {
    if (
      candidate.path === currentMainPath &&
      candidate.directory === Directory.Data
    ) {
      continue;
    }

    let legacyData;
    try {
      legacyData = (
        await readNativeSnapshot(candidate.path, candidate.directory)
      ).data;
    } catch (error) {
      if (isMissingNativeFileError(error)) continue;
      throw new ProjectDataReadError(
        `Legacy project data could not be read from "${candidate.path}"`,
        { cause: error, source: "native-legacy" },
      );
    }

    try {
      await writeNativeProjectSnapshot(folderName, legacyData);
    } catch (error) {
      logger.warn(
        `[LeakRepository] Read legacy data from "${candidate.path}", but could not copy it to current storage:`,
        error,
      );
    }
    return { data: legacyData, source: candidate.path };
  }
  return null;
}

function attachEmbeddedSyncState(leaks, syncState) {
  if (syncState != null) {
    Object.defineProperty(leaks, EMBEDDED_SYNC_STATE, {
      value: syncState,
      enumerable: false,
    });
  }
  return leaks;
}

export function getEmbeddedProjectSyncState(leaks) {
  return leaks?.[EMBEDDED_SYNC_STATE] ?? null;
}

export const LeakRepository = {
  async getAll({ projectId, folderName, legacyStorageType = null }) {
    if (isNative) {
      try {
        const loaded = await loadNativeProject(folderName);
        if (loaded) {
          if (loaded.recovered) {
            logger.warn(
              `[LeakRepository] Recovered project data from "${loaded.source}" after failing to read the main snapshot.`,
              loaded.mainError,
            );
          }
          return attachEmbeddedSyncState(
            filterValidLeaks(loaded.state.data, loaded.source),
            loaded.state.syncState,
          );
        }

        const recovered = await recoverLegacyNativeArray(
          folderName,
          legacyStorageType,
          `LeakReports/${folderName}/data/data.json`,
        );
        if (!recovered) return [];
        logger.warn(
          `[LeakRepository] Migrated legacy native data from "${recovered.source}" without deleting the source file.`,
        );
        return filterValidLeaks(recovered.data, recovered.source);
      } catch (error) {
        if (error instanceof ProjectDataReadError) throw error;
        logger.error(
          `[LeakRepository] Failed to read native project "${folderName}":`,
          error,
        );
        throw new ProjectDataReadError(
          "Project data and its recovery copy could not be read",
          { cause: error, source: "native" },
        );
      }
    }

    let indexedEnvelope = null;
    let mirrorEnvelope = null;
    let indexedDbError = null;
    let mirrorError = null;

    try {
      indexedEnvelope = normalizeWebEnvelope(
        await readWebData(projectId),
        `IndexedDB[${projectId}]`,
      );
    } catch (error) {
      indexedDbError = error;
      logger.error(
        "[LeakRepository] Failed to read the primary IndexedDB store:",
        error,
      );
    }

    try {
      mirrorEnvelope = normalizeWebEnvelope(
        await readMirrorData(projectId),
        `IndexedDB-mirror[${projectId}]`,
      );
    } catch (error) {
      mirrorError = error;
      logger.error("[LeakRepository] Corrupted IndexedDB mirror store:", error);
    }

    // Read-only fallback for projects that predate the IndexedDB mirror
    // store (schema v2): their only secondary copy is a full envelope in
    // localStorage. Nothing writes a full envelope back to localStorage
    // anymore, so this candidate naturally disappears once both IndexedDB
    // copies are repaired below.
    let legacyEnvelope = null;
    let legacyError = null;
    try {
      legacyEnvelope = readLegacyLocalStorageEnvelope(projectId);
    } catch (error) {
      legacyError = error;
      logger.warn(
        "[LeakRepository] Ignoring a corrupted legacy localStorage copy:",
        error,
      );
    }

    const available = [indexedEnvelope, mirrorEnvelope, legacyEnvelope].filter(
      Boolean,
    );
    if (available.length === 0) {
      // When IndexedDB is unavailable entirely, indexedEnvelope/mirrorEnvelope
      // simply resolve to `null` (not an error) — legacyError is then the
      // only signal that this is corrupted data, not a genuinely empty
      // project, and must still surface as a read failure rather than [].
      if (indexedDbError || mirrorError || legacyError) {
        // Name the copy that actually failed. Every copy is unusable here, so
        // this is always a hard read failure regardless of the label — the
        // source only has to be accurate for diagnostics.
        const source = indexedDbError
          ? "indexeddb"
          : mirrorError
            ? "mirror"
            : "localstorage";
        throw new ProjectDataReadError(
          "No valid project data copy is available",
          { cause: indexedDbError ?? mirrorError ?? legacyError, source },
        );
      }
      return [];
    }

    // The IndexedDB mirror store is new in schema v2, so it can never hold
    // pre-versioning data — only the primary store and the legacy
    // localStorage copy can. This conflict check is therefore always about
    // those two, not the mirror store.
    if (
      indexedEnvelope?.[LEGACY_WEB_ENVELOPE] &&
      legacyEnvelope?.[LEGACY_WEB_ENVELOPE] &&
      indexedEnvelope.checksum !== legacyEnvelope.checksum
    ) {
      throw new ProjectDataReadError(
        "Legacy IndexedDB and localStorage copies differ and cannot be ordered safely",
        {
          source: "web-mirrors",
          code: "PROJECT_DATA_CONFLICT",
          recoveryData: {
            indexedDB: indexedEnvelope.data,
            localStorage: legacyEnvelope.data,
          },
        },
      );
    }

    const selected = available.reduce((latest, candidate) =>
      compareWebEnvelopes(candidate, latest) > 0 ? candidate : latest,
    );
    // На этой копии основано унесённое отсюда — а починка ниже умеет не состояться.
    rememberLeakDataRevision(projectId, selected.revision);

    // Repair only stores that were read successfully. A transient read error
    // must never cause an older fallback copy to overwrite an unknown version.
    // Track whether each store actually ends up holding "selected" — if
    // IndexedDB is unavailable, writeWebData/writeMirrorData resolve to
    // `false` without throwing, and that must NOT be treated as success.
    let indexedHoldsSelected = sameWebEnvelope(indexedEnvelope, selected);
    if (!indexedDbError && !indexedHoldsSelected) {
      indexedHoldsSelected = await writeWebData(projectId, selected).catch(
        (error) => {
          logger.warn(
            "[LeakRepository] Failed to repair the primary IndexedDB store:",
            error,
          );
          return false;
        },
      );
    }
    let mirrorHoldsSelected = sameWebEnvelope(mirrorEnvelope, selected);
    if (!mirrorError && !mirrorHoldsSelected) {
      mirrorHoldsSelected = await writeMirrorData(projectId, selected).catch(
        (error) => {
          logger.warn(
            "[LeakRepository] Failed to repair the IndexedDB mirror store:",
            error,
          );
          return false;
        },
      );
    }
    // Only drop the legacy localStorage copy once at least one IndexedDB
    // store is confirmed to hold data at least as fresh as it. If IndexedDB
    // is unavailable entirely, both repairs silently no-op (they resolve
    // `false`, not an error), and the legacy copy is the only durable data —
    // clearing it here would delete the project.
    if (legacyEnvelope && (indexedHoldsSelected || mirrorHoldsSelected)) {
      clearLegacyLocalStorageEnvelope(projectId);
    }

    const readFailurePolicy = getWebProjectDataReadFailurePolicy({
      indexedDbError,
      mirrorError,
    });
    const readWarning = readFailurePolicy
      ? new ProjectDataReadError(
          "Project data was loaded from only one web storage copy",
          {
            ...readFailurePolicy,
            code: "PROJECT_DATA_DEGRADED",
            recoveryData: selected.data,
          },
        )
      : null;
    if (selected.deleted) {
      const empty = [];
      attachEmbeddedSyncState(empty, selected.syncState);
      if (readWarning) {
        Object.defineProperty(empty, WEB_READ_WARNING, {
          value: readWarning,
        });
      }
      return empty;
    }
    const selectedSource =
      selected === indexedEnvelope
        ? "IndexedDB"
        : selected === mirrorEnvelope
          ? "IndexedDB mirror"
          : "legacy localStorage";
    const result = filterValidLeaks(
      selected.data,
      `${selectedSource}[${projectId}]`,
    );
    attachEmbeddedSyncState(result, selected.syncState);
    if (readWarning) {
      Object.defineProperty(result, WEB_READ_WARNING, { value: readWarning });
    }
    return result;
  },

  async saveAll(
    leaks,
    { projectId, folderName, syncState = null, previousLeaks = null },
  ) {
    if (isNative) {
      await saveNativeProject(folderName, leaks, { syncState, previousLeaks });
      return;
    }

    let indexedDbSaved = false;
    let indexedDbError = null;
    // Only the revisions matter here — reading whole envelopes to derive the
    // next one would pull both copies of the project through a structured
    // clone on every save.
    const [indexedRevision, mirrorRevision] = await Promise.all([
      readWebDataRevision(projectId),
      readMirrorDataRevision(projectId),
    ]);
    let legacyEnvelope = null;
    try {
      legacyEnvelope = readLegacyLocalStorageEnvelope(projectId);
    } catch {
      // Ignore a corrupted legacy copy when computing the next revision.
    }
    // Ревизии уже прочитаны выше — ради вычисления следующей. Здесь тот же
    // ответ отвечает и на второй вопрос: не обогнал ли нас кто-то, пока эта
    // вкладка держала набор в памяти. Проверка до записи, потому что после неё
    // чужие правки уже затёрты.
    const knownRevisions = [
      indexedRevision,
      mirrorRevision,
      legacyEnvelope?.revision,
    ];
    assertLeakDataUnchanged(projectId, knownRevisions);

    const envelope = createWebEnvelope(leaks, {
      previousRevisions: knownRevisions,
      syncState,
    });
    // The same diff the native SQLite path uses. Null when the caller cannot
    // say what was persisted before, or when records moved rather than being
    // appended — either way the store falls back to a full snapshot.
    const changes =
      previousLeaks == null
        ? null
        : createNativeSqliteMutation(previousLeaks, leaks);

    try {
      indexedDbSaved = await writeWebData(projectId, envelope, changes);
    } catch (error) {
      indexedDbError = error;
      logger.warn(
        `[LeakRepository] Could not save project "${projectId}" to the primary IndexedDB store:`,
        error,
      );
    }

    let mirrorSaved = false;
    try {
      mirrorSaved = await writeMirrorData(projectId, envelope, changes);
    } catch (error) {
      logger.warn(
        `[LeakRepository] Could not update the IndexedDB mirror store for "${projectId}":`,
        error,
      );
    }

    if (!indexedDbSaved && !mirrorSaved) {
      // Neither IndexedDB store accepted the write — most likely IndexedDB
      // is unavailable in this browser entirely. Fall back to a full
      // envelope in localStorage so the project is still saved somewhere
      // durable, exactly like every web save did before schema v2.
      const legacyFallbackSaved = writeLegacyLocalStorageEnvelope(
        projectId,
        envelope,
      );
      if (!legacyFallbackSaved) {
        throw new ProjectDataWriteError(
          "Project data could not be saved to IndexedDB or localStorage",
          { cause: indexedDbError },
        );
      }
    } else if (legacyEnvelope) {
      // At least one IndexedDB store now holds the new data, so the
      // pre-upgrade localStorage copy (if any) is no longer needed.
      clearLegacyLocalStorageEnvelope(projectId);
    }

    requestPersistentStorage().catch((error) => {
      logger.warn(
        "[LeakRepository] Persistent web storage was not granted:",
        error,
      );
    });
  },

  async clear({ projectId, folderName, syncState = null }) {
    if (isNative) {
      await saveNativeProject(folderName, [], {
        syncState,
        forceSnapshot: true,
      });
      return;
    }
    // Revisions only, as in saveAll — the tombstone just has to outrank every
    // existing copy so a stale one cannot resurrect the project.
    const [indexedRevision, mirrorRevision] = await Promise.all([
      readWebDataRevision(projectId),
      readMirrorDataRevision(projectId),
    ]);
    let legacyEnvelope = null;
    try {
      legacyEnvelope = readLegacyLocalStorageEnvelope(projectId);
    } catch {
      // Ignore a corrupted legacy copy when computing the tombstone revision.
    }
    const tombstone = createWebEnvelope([], {
      deleted: true,
      previousRevisions: [
        indexedRevision,
        mirrorRevision,
        legacyEnvelope?.revision,
      ],
      syncState,
    });
    let indexedDbSaved = false;
    let indexedDbError = null;
    try {
      indexedDbSaved = await writeWebData(projectId, tombstone);
    } catch (error) {
      indexedDbError = error;
    }
    let mirrorSaved = false;
    try {
      mirrorSaved = await writeMirrorData(projectId, tombstone);
    } catch (error) {
      indexedDbError = indexedDbError ?? error;
    }
    if (!indexedDbSaved && !mirrorSaved) {
      const legacyFallbackSaved = writeLegacyLocalStorageEnvelope(
        projectId,
        tombstone,
      );
      if (!legacyFallbackSaved) {
        throw new ProjectDataWriteError(
          "Project deletion could not be persisted",
          {
            cause: indexedDbError,
          },
        );
      }
    } else if (legacyEnvelope) {
      clearLegacyLocalStorageEnvelope(projectId);
    }
  },

  async purge({ projectId, folderName }) {
    if (isNative) {
      const deleted = await deleteNativeProjectStorage(folderName);
      if (!deleted) {
        await saveNativeProject(folderName, [], { forceSnapshot: true });
      }
      return;
    }

    // Все наборы проекта разом: не только записи об утечках, но и реестр
    // компонентов, который лежит в тех же сторах своим ключом. Удалять их по
    // очереди значит уметь остановиться посередине — а реестр, переживший
    // свой проект, достаётся тому, кого заведут следующим под тем же именем.
    let indexedDbError = null;
    try {
      await purgeWebProject(projectId);
    } catch (error) {
      indexedDbError = error;
    }
    let localStorageError = null;
    try {
      localStorage.removeItem(STORAGE_KEYS.PROJECT_DATA(projectId));
    } catch (error) {
      localStorageError = error;
    }
    if (indexedDbError || localStorageError) {
      throw new ProjectDataWriteError("Project data could not be purged", {
        cause: indexedDbError ?? localStorageError,
      });
    }
  },
};
