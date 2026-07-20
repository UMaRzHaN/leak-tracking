import { STORAGE_KEYS } from "@/app/project/storageKeys";

const MAX_TOMBSTONES = 20_000;

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
  const leakTag = String(leak?.leak_id ?? "").trim();
  if (leakTag) return `tag:${leakTag}`;
  if (leak?.id != null) return `id:${String(leak.id)}`;
  return null;
}

export function getLeakSyncFreshness(leak) {
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
    const state = normalizeProjectSyncState(stored);
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
    liveLeaks
      .map((leak) => [getLeakSyncIdentity(leak), getLeakSyncFreshness(leak)])
      .filter(([identity]) => identity),
  );
  const deleted = Object.entries(state.deleted)
    .filter(([identity, deletedAt]) => {
      const liveUpdatedAt = liveFreshness.get(identity);
      return liveUpdatedAt == null || deletedAt >= liveUpdatedAt;
    })
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_TOMBSTONES);
  const normalized = { ...state, deleted: Object.fromEntries(deleted) };
  localStorage.setItem(
    STORAGE_KEYS.PROJECT_SYNC_STATE(projectId),
    JSON.stringify(normalized),
  );
  if (normalized.varsUpdatedAt > 0) {
    localStorage.setItem(
      STORAGE_KEYS.PROJECT_VARS_UPDATED_AT(projectId),
      String(normalized.varsUpdatedAt),
    );
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
    const identity = getLeakSyncIdentity(leak);
    if (!identity || !deleted[identity]) return true;
    return getLeakSyncFreshness(leak) > deleted[identity];
  });
}

export function recordLeakDeletions(
  projectId,
  previousLeaks,
  nextLeaks,
  deletedAt = Date.now(),
) {
  if (!projectId) return;
  const nextIdentities = new Set(
    nextLeaks.map(getLeakSyncIdentity).filter(Boolean),
  );
  const state = readProjectSyncState(projectId);
  for (const leak of previousLeaks) {
    const identity = getLeakSyncIdentity(leak);
    if (identity && !nextIdentities.has(identity)) {
      state.deleted[identity] = Math.max(
        state.deleted[identity] ?? 0,
        deletedAt,
      );
    }
  }
  writeProjectSyncState(projectId, state, nextLeaks);
}

export function markProjectVarsUpdated(projectId, updatedAt = Date.now()) {
  if (!projectId) return;
  const state = readProjectSyncState(projectId);
  state.varsUpdatedAt = Math.max(state.varsUpdatedAt, toTime(updatedAt));
  writeProjectSyncState(projectId, state);
}
