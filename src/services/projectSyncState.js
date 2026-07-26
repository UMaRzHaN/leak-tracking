import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { logger } from "@/utils/logger";
import {
  LEAK_FIELD_VERSIONS_KEY,
  normalizeLeakFieldVersions,
} from "@/services/leakFieldVersions";
const SYNC_DB_NAME = "LeakTrackingSyncDB";
const SYNC_STORE_NAME = "projectStates";
const syncStateMemory = new Map();
const syncStateMutationQueues = new Map();
let syncDbPromise;

function openSyncDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (syncDbPromise) return syncDbPromise;
  syncDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      syncDbPromise = null;
      reject(request.error);
    };
  });
  return syncDbPromise;
}

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
  if (value == null || value === "") return 0;
  const numeric = Number(value);
  const time =
    typeof value === "number" || Number.isFinite(numeric)
      ? numeric
      : Date.parse(String(value));
  return Number.isFinite(time) && time > 0 ? time : 0;
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
  const leakTag = String(leak?.leak_id ?? "").trim();
  if (leakTag) return `tag:${leakTag}`;
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
      .filter(([identity, deletedAt]) => identity && deletedAt > 0),
  );
}

export function normalizeProjectSyncState(value) {
  return {
    version: 1,
    deleted: normalizeDeleted(value?.deleted),
    varsUpdatedAt: toTime(value?.varsUpdatedAt),
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
    .sort((left, right) => right[1] - left[1]);
  const normalized = { ...state, deleted: Object.fromEntries(deleted) };
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
  const merged = normalizeProjectSyncState();
  for (const value of values) {
    const state = normalizeProjectSyncState(value);
    merged.varsUpdatedAt = Math.max(merged.varsUpdatedAt, state.varsUpdatedAt);
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
      const state = await readProjectSyncStateAsync(projectId);
      const result = mutation(state);
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
  deletedAt = Date.now(),
) {
  if (!projectId) return;
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
            deletedAt,
          );
        }
      }
    }
    return { state, liveLeaks: nextLeaks };
  });
}
export function markProjectVarsUpdated(projectId, updatedAt = Date.now()) {
  if (!projectId) return Promise.resolve();
  const timestamp = toTime(updatedAt);
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
