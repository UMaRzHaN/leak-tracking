import { buildLeakHistoryChanges } from "@/utils/historyChanges";
import { STATUS } from "@/utils/status";

const STATUS_NOTE_FIELDS = [{ key: "materials_equipment" }, { key: "note" }];

function lifecycleTime(now) {
  const timestamp = typeof now === "number" ? now : Date.now();
  return { timestamp, iso: new Date(timestamp).toISOString() };
}

function withStatusHistory(before, after, { to, user, iso, changes = [] }) {
  return {
    ...after,
    history: [
      ...(before.history ?? []),
      {
        action: "status_changed",
        to,
        date: iso,
        user,
        ...(changes.length > 0 ? { changes } : {}),
      },
    ],
  };
}

export function getOrphanedOriginalPhoto(leak) {
  if (
    leak?.status !== STATUS.RESOLVED ||
    !leak.photo ||
    !leak.photo_after ||
    leak.photo === leak.photo_after
  ) {
    return null;
  }
  return leak.photo;
}

export function changeLeakStatus(leak, status, { user, now } = {}) {
  const { timestamp, iso } = lifecycleTime(now);
  const after = {
    ...leak,
    ...(leak.status === STATUS.RESOLVED
      ? { photo: leak.photo_after ?? leak.photo, photo_after: null }
      : {}),
    status,
    updatedAt: timestamp,
  };

  return withStatusHistory(leak, after, { to: status, user, iso });
}

export function resolveLeakRecord(leak, draft = {}, { user, now } = {}) {
  const { timestamp, iso } = lifecycleTime(now);
  const after = {
    ...leak,
    status: STATUS.RESOLVED,
    resolvedAt: timestamp,
    photo_after: draft.photo_after ?? leak.photo_after,
    materials_equipment: draft.materials_equipment ?? leak.materials_equipment,
    note: draft.note ?? leak.note,
    updatedAt: timestamp,
  };
  const changes = buildLeakHistoryChanges({
    before: leak,
    after,
    fields: STATUS_NOTE_FIELDS,
    includeKeys: ["photo_after"],
  });

  return withStatusHistory(leak, after, {
    to: STATUS.RESOLVED,
    user,
    iso,
    changes,
  });
}

export function startLeakRepair(leak, draft = {}, { user, now } = {}) {
  const { timestamp, iso } = lifecycleTime(now);
  const after = {
    ...leak,
    ...(leak.status === STATUS.RESOLVED
      ? { photo: leak.photo_after ?? leak.photo, photo_after: null }
      : {}),
    status: STATUS.IN_PROGRESS,
    resolvedAt: null,
    repairAt: timestamp,
    photo_repair: draft.photo_repair ?? leak.photo_repair,
    materials_equipment: draft.materials_equipment ?? leak.materials_equipment,
    note: draft.note ?? leak.note,
    updatedAt: timestamp,
  };
  const changes = buildLeakHistoryChanges({
    before: leak,
    after,
    fields: STATUS_NOTE_FIELDS,
    includeKeys: ["photo_repair"],
  });

  return withStatusHistory(leak, after, {
    to: STATUS.IN_PROGRESS,
    user,
    iso,
    changes,
  });
}

export function collectLeakPhotoPaths(leak) {
  const paths = new Set(
    [leak?.photo, leak?.photo_after, leak?.photo_repair].filter(Boolean),
  );
  for (const record of leak?.monitoringRecords ?? []) {
    if (record?.photo) paths.add(record.photo);
  }
  return [...paths];
}
