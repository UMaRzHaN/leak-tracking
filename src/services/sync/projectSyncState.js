import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { createIdbConnection } from "@/repositories/idbConnection";
import { logger } from "@/utils/logger";
import {
  nextSyncTimestamp,
  observeSyncTimestamp,
  sanitizeSyncTimestamp,
} from "@/services/sync/syncClock";
import {
  LEAK_FIELD_VERSIONS_KEY,
  normalizeLeakFieldVersions,
} from "@/services/storage/leakFieldVersions";
const SYNC_DB_NAME = "LeakTrackingSyncDB";
const SYNC_STORE_NAME = "projectStates";
export const MAX_PROJECT_TOMBSTONES = 10_000;
export const TOMBSTONES_AFTER_COMPACTION = 5_000;
const LEGACY_SYNC_EPOCH = "legacy";
const syncStateMemory = new Map();
const syncStateMutationQueues = new Map();

// Соединение с базой синхронизации: одно на всех, со сроком ожидания чужой
// вкладки и с отпусканием ради её обновления схемы — см. idbConnection.
const openSyncDb = createIdbConnection(SYNC_DB_NAME, 1, (db) => {
  if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
    db.createObjectStore(SYNC_STORE_NAME, { keyPath: "id" });
  }
});

async function loadDurableSyncState(projectId) {
  const db = await openSyncDb();
  if (!db || !projectId) return null;
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(SYNC_STORE_NAME, "readonly")
      .objectStore(SYNC_STORE_NAME)
      .get(projectId);
    request.onsuccess = () => resolve(request.result?.state ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function persistDurableSyncState(projectId, state) {
  const db = await openSyncDb();
  if (!db || !projectId) return false;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_STORE_NAME, "readwrite");
    transaction.objectStore(SYNC_STORE_NAME).put({ id: projectId, state });
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
async function deleteDurableSyncState(projectId) {
  const db = await openSyncDb();
  if (!db || !projectId) return false;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_STORE_NAME, "readwrite");
    transaction.objectStore(SYNC_STORE_NAME).delete(projectId);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function toTime(value) {
  return observeSyncTimestamp(sanitizeSyncTimestamp(value));
}

function toGeneration(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeEpochId(value, generation) {
  if (generation === 0) return LEGACY_SYNC_EPOCH;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return /^[a-z0-9][a-z0-9._:-]{7,127}$/.test(normalized)
    ? normalized
    : `${LEGACY_SYNC_EPOCH}-${generation}`;
}

function createCompactionEpochId(state, droppedEntries) {
  const hashes = [2166136261, 2246822519, 3266489917, 668265263];
  const update = (text) => {
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      hashes[0] = Math.imul(hashes[0] ^ code, 16777619);
      hashes[1] = Math.imul(hashes[1] ^ code, 2246822519);
      hashes[2] = Math.imul(hashes[2] ^ code, 3266489917);
      hashes[3] = Math.imul(hashes[3] ^ code, 668265263);
    }
  };
  update(`${state.generation}|${state.epochId}|`);
  for (const [identity, deletedAt] of droppedEntries) {
    update(`${identity}:${deletedAt}|`);
  }
  const digest = hashes
    .map((value) => (value >>> 0).toString(16).padStart(8, "0"))
    .join("");
  return `epoch-${state.generation + 1}-${digest}`;
}

export function getLeakSyncIdentity(leak) {
  if (leak?.id != null) return `id:${String(leak.id)}`;
  const leakTag = String(leak?.leak_id ?? "").trim();
  if (leakTag) return `tag:${leakTag}`;
  return null;
}

export function getLeakSyncIdentities(leak) {
  const identities = [];
  if (leak?.id != null) identities.push("id:" + String(leak.id));
  const leakTag = String(leak?.leak_id ?? "").trim();
  if (leakTag) identities.push("tag:" + leakTag);
  return identities;
}

export function getLeakMergeIdentity(leak) {
  return getLeakSyncIdentity(leak);
}

export function getLeakSyncFreshness(leak) {
  const fieldTimes = Object.values(
    normalizeLeakFieldVersions(leak?.[LEAK_FIELD_VERSIONS_KEY]),
  );
  const historyTimes = Array.isArray(leak?.history)
    ? leak.history.map((entry) => toTime(entry?.date))
    : [];
  const monitoringTimes = Array.isArray(leak?.monitoringRecords)
    ? leak.monitoringRecords.map((entry) => toTime(entry?.date))
    : [];
  return Math.max(
    toTime(leak?.updatedAt),
    toTime(leak?.createdAt),
    toTime(leak?.resolvedAt),
    ...fieldTimes,
    ...historyTimes,
    ...monitoringTimes,
  );
}

function normalizeDeleted(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([identity, deletedAt]) => [identity, toTime(deletedAt)])
      .filter(([identity, deletedAt]) => identity && Number(deletedAt) > 0),
  );
}

export function normalizeProjectSyncState(value) {
  const generation = toGeneration(value?.generation);
  return {
    version: 2,
    generation,
    epochId: normalizeEpochId(value?.epochId, generation),
    compactedAt: toTime(value?.compactedAt),
    deleted: normalizeDeleted(value?.deleted),
    varsUpdatedAt: toTime(value?.varsUpdatedAt),
  };
}

export function assertProjectSyncStateCompatible(localValue, incomingValue) {
  const local = normalizeProjectSyncState(localValue);
  const incoming = normalizeProjectSyncState(incomingValue);
  if (
    local.generation === incoming.generation &&
    local.epochId === incoming.epochId
  ) {
    return true;
  }

  const error = new Error(
    "История синхронизации устройств разошлась после очистки удалённых записей. Выполните полную передачу проекта с актуального устройства.",
  );
  error.code = "SYNC_EPOCH_MISMATCH";
  error.localGeneration = local.generation;
  error.incomingGeneration = incoming.generation;
  error.localEpochId = local.epochId;
  error.incomingEpochId = incoming.epochId;
  throw error;
}

function compactDeletedState(state, deletedEntries) {
  if (deletedEntries.length <= MAX_PROJECT_TOMBSTONES) {
    return { ...state, deleted: Object.fromEntries(deletedEntries) };
  }

  const retained = deletedEntries.slice(0, TOMBSTONES_AFTER_COMPACTION);
  const dropped = deletedEntries.slice(TOMBSTONES_AFTER_COMPACTION);
  const newestDroppedAt = dropped[0]?.[1] ?? 0;
  return {
    ...state,
    generation: state.generation + 1,
    epochId: createCompactionEpochId(state, dropped),
    compactedAt: Math.max(state.compactedAt, newestDroppedAt),
    deleted: Object.fromEntries(retained),
  };
}

export function readProjectSyncState(projectId) {
  if (!projectId || typeof localStorage === "undefined") {
    return normalizeProjectSyncState();
  }
  try {
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.PROJECT_SYNC_STATE(projectId)) ??
        "null",
    );
    const state = mergeProjectSyncStates(
      normalizeProjectSyncState(stored),
      syncStateMemory.get(projectId),
    );
    state.varsUpdatedAt = Math.max(
      state.varsUpdatedAt,
      toTime(
        localStorage.getItem(STORAGE_KEYS.PROJECT_VARS_UPDATED_AT(projectId)),
      ),
    );
    return state;
  } catch {
    return normalizeProjectSyncState();
  }
}

export function writeProjectSyncState(projectId, value, liveLeaks = []) {
  if (!projectId || typeof localStorage === "undefined") return;
  const state = normalizeProjectSyncState(value);
  const liveFreshness = new Map(
    liveLeaks.flatMap((leak) =>
      getLeakSyncIdentities(leak).map((identity) => [
        identity,
        getLeakSyncFreshness(leak),
      ]),
    ),
  );
  const deleted = Object.entries(state.deleted)
    .filter(([identity, deletedAt]) => {
      const liveUpdatedAt = liveFreshness.get(identity);
      return liveUpdatedAt == null || deletedAt >= liveUpdatedAt;
    })
    .sort(
      (left, right) =>
        right[1] - left[1] ||
        (String(left[0]) < String(right[0])
          ? -1
          : String(left[0]) > String(right[0])
            ? 1
            : 0),
    );
  // Compaction keeps the newest tombstones and advances a deterministic sync
  // generation. Devices with different generations are rejected before merge
  // instead of risking resurrection or accidental deletion of records.
  const normalized = compactDeletedState(state, deleted);
  try {
    localStorage.setItem(
      STORAGE_KEYS.PROJECT_SYNC_STATE(projectId),
      JSON.stringify(normalized),
    );
    syncStateMemory.delete(projectId);
  } catch (error) {
    syncStateMemory.set(projectId, normalized);
    logger.warn(
      "[projectSyncState] localStorage quota exceeded; using IndexedDB:",
      error,
    );
  }
  const durableWrite = persistDurableSyncState(projectId, normalized).catch(
    (error) => {
      logger.error("[projectSyncState] IndexedDB write failed:", error);
      return false;
    },
  );
  try {
    if (normalized.varsUpdatedAt > 0) {
      localStorage.setItem(
        STORAGE_KEYS.PROJECT_VARS_UPDATED_AT(projectId),
        String(normalized.varsUpdatedAt),
      );
    } else {
      localStorage.removeItem(STORAGE_KEYS.PROJECT_VARS_UPDATED_AT(projectId));
    }
  } catch (error) {
    logger.warn(
      "[projectSyncState] vars timestamp could not be cached:",
      error,
    );
  }
  return durableWrite;
}

export async function readProjectSyncStateAsync(projectId) {
  const immediate = readProjectSyncState(projectId);
  if (!projectId) return immediate;
  try {
    const durable = await loadDurableSyncState(projectId);
    const merged = mergeProjectSyncStates(immediate, durable);
    syncStateMemory.set(projectId, merged);
    return merged;
  } catch (error) {
    logger.warn("[projectSyncState] IndexedDB read failed:", error);
    return immediate;
  }
}
export async function clearProjectSyncState(projectId) {
  if (!projectId) return;
  await syncStateMutationQueues.get(projectId)?.catch(() => undefined);
  syncStateMemory.delete(projectId);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEYS.PROJECT_SYNC_STATE(projectId));
      localStorage.removeItem(STORAGE_KEYS.PROJECT_VARS_UPDATED_AT(projectId));
    } catch (error) {
      logger.warn("[projectSyncState] localStorage cleanup failed:", error);
    }
  }
  try {
    await deleteDurableSyncState(projectId);
  } catch (error) {
    logger.warn("[projectSyncState] IndexedDB cleanup failed:", error);
  }
}

export function mergeProjectSyncStates(...values) {
  const states = values.map(normalizeProjectSyncState);
  const highestGeneration = Math.max(
    0,
    ...states.map((state) => state.generation),
  );
  const candidates = states.filter(
    (state) => state.generation === highestGeneration,
  );
  const selectedEpochId =
    candidates
      .map((state) => state.epochId)
      .sort()
      .at(-1) ?? LEGACY_SYNC_EPOCH;
  const compatible = candidates.filter(
    (state) => state.epochId === selectedEpochId,
  );
  const merged = normalizeProjectSyncState({
    generation: highestGeneration,
    epochId: selectedEpochId,
  });
  for (const state of compatible) {
    merged.varsUpdatedAt = Math.max(merged.varsUpdatedAt, state.varsUpdatedAt);
    merged.compactedAt = Math.max(merged.compactedAt, state.compactedAt);
    for (const [identity, deletedAt] of Object.entries(state.deleted)) {
      merged.deleted[identity] = Math.max(
        merged.deleted[identity] ?? 0,
        deletedAt,
      );
    }
  }
  return merged;
}

export function applyProjectTombstones(leaks, syncState) {
  const deleted = normalizeProjectSyncState(syncState).deleted;
  return leaks.filter((leak) => {
    const deletedAt = Math.max(
      0,
      ...getLeakSyncIdentities(leak).map((identity) => deleted[identity] ?? 0),
    );
    if (!deletedAt) return true;
    return getLeakSyncFreshness(leak) > deletedAt;
  });
}

function mutateProjectSyncState(projectId, mutation) {
  if (!projectId) return Promise.resolve();
  const previous = syncStateMutationQueues.get(projectId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      // Mutations operate on an isolated copy. readProjectSyncStateAsync also
      // caches its result for synchronous readers, so mutating that object in
      // place would publish uncommitted tombstones before project data lands.
      const state = normalizeProjectSyncState(
        await readProjectSyncStateAsync(projectId),
      );
      const result = await mutation(state);
      await writeProjectSyncState(
        projectId,
        result?.state ?? state,
        result?.liveLeaks ?? [],
      );
    });
  syncStateMutationQueues.set(projectId, next);
  const cleanup = () => {
    if (syncStateMutationQueues.get(projectId) === next) {
      syncStateMutationQueues.delete(projectId);
    }
  };
  void next.then(cleanup, cleanup);
  return next;
}
export async function recordLeakDeletions(
  projectId,
  previousLeaks,
  nextLeaks,
  deletedAt,
) {
  if (!projectId) return;
  const effectiveDeletedAt =
    deletedAt == null ? nextSyncTimestamp() : sanitizeSyncTimestamp(deletedAt);
  const nextIdentities = new Set(nextLeaks.flatMap(getLeakSyncIdentities));
  return mutateProjectSyncState(projectId, (state) => {
    for (const leak of previousLeaks) {
      const identities = getLeakSyncIdentities(leak);
      const stillExists = identities.some((identity) =>
        nextIdentities.has(identity),
      );
      if (!stillExists) {
        for (const identity of identities) {
          state.deleted[identity] = Math.max(
            state.deleted[identity] ?? 0,
            effectiveDeletedAt,
          );
        }
      }
    }
    return { state, liveLeaks: nextLeaks };
  });
}

function applyLeakDeletions(state, previousLeaks, nextLeaks, deletedAt) {
  const nextIdentities = new Set(nextLeaks.flatMap(getLeakSyncIdentities));
  for (const leak of previousLeaks) {
    const identities = getLeakSyncIdentities(leak);
    const stillExists = identities.some((identity) =>
      nextIdentities.has(identity),
    );
    if (!stillExists) {
      for (const identity of identities) {
        state.deleted[identity] = Math.max(
          state.deleted[identity] ?? 0,
          deletedAt,
        );
      }
    }
  }
  return state;
}

export function commitLeakDataMutation(
  projectId,
  previousLeaks,
  nextLeaks,
  persistData,
  deletedAt,
) {
  if (!projectId) return Promise.resolve();
  const effectiveDeletedAt =
    deletedAt == null ? nextSyncTimestamp() : sanitizeSyncTimestamp(deletedAt);
  return mutateProjectSyncState(projectId, async (state) => {
    applyLeakDeletions(state, previousLeaks, nextLeaks, effectiveDeletedAt);
    const embeddedState = normalizeProjectSyncState(state);
    await persistData(embeddedState);
    return { state: embeddedState, liveLeaks: nextLeaks };
  });
}

export function restoreEmbeddedProjectSyncState(
  projectId,
  embeddedState,
  liveLeaks = [],
) {
  if (!projectId || embeddedState == null) return Promise.resolve();
  return mutateProjectSyncState(projectId, (state) => ({
    state: mergeProjectSyncStates(state, embeddedState),
    liveLeaks,
  }));
}
export function markProjectVarsUpdated(projectId, updatedAt) {
  if (!projectId) return Promise.resolve();
  const timestamp =
    updatedAt == null ? nextSyncTimestamp() : sanitizeSyncTimestamp(updatedAt);
  // Keep synchronous readers and the UI current without overwriting the
  // authoritative IndexedDB state before it has been loaded.
  if (typeof localStorage !== "undefined" && timestamp > 0) {
    try {
      const current = toTime(
        localStorage.getItem(STORAGE_KEYS.PROJECT_VARS_UPDATED_AT(projectId)),
      );
      localStorage.setItem(
        STORAGE_KEYS.PROJECT_VARS_UPDATED_AT(projectId),
        String(Math.max(current, timestamp)),
      );
    } catch (error) {
      logger.warn(
        "[projectSyncState] vars timestamp could not be cached:",
        error,
      );
    }
  }
  return mutateProjectSyncState(projectId, (state) => {
    state.varsUpdatedAt = Math.max(state.varsUpdatedAt, timestamp);
    return { state };
  });
}
