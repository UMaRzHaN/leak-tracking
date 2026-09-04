import { RECORD_SYNC_IGNORED_KEYS, stableSyncValue } from "./syncConflictValue";
import { normalizeLeakFieldVersions } from "@/services/storage/leakFieldVersions";
import { parseTime } from "./projectMeta";
import {
  comparableExcelDate,
  findByRoundAndTime,
  isEmptyMergeValue,
  sameMonitoringRound,
} from "./mergeValues";
import { matchHumanDate } from "@/utils/humanDate";

/**
 * Записи, у которых слияние идёт по полям, а не заменой свежайшей целиком.
 * Событие осмотра — это запись обхода с дописанным типом, и разбирать их
 * по-разному значило бы завести для одной формы два несогласованных правила.
 */
function mergesFieldByField(arrayKey) {
  return arrayKey === "monitoringRecords" || arrayKey === "events";
}

function getRecordMergeIdentity(record, index, arrayKey) {
  if (arrayKey === "events") {
    // Номер обязателен для всех, кроме событий, восстановленных из архива
    // прежней сборки: у них его не было. Запасное опознание — по типу и
    // моменту: два ремонта одной утечки в одну миллисекунду не начинаются.
    if (record?.id != null) return `id:${String(record.id)}`;
    return `event:${String(record?.type ?? "")}|${getRecordDateIdentity(record?.date)}`;
  }
  if (arrayKey === "monitoringRecords" && record?.id != null) {
    return `id:${String(record.id)}`;
  }
  if (arrayKey === "monitoringRecords" && record?.photo) {
    return `monitoring-photo:${String(record.photo)}`;
  }
  if (arrayKey === "monitoringRecords" && record?.date) {
    return `monitoring:${getRecordDateIdentity(record.date)}|${String(record?.result ?? "")}`;
  }
  if (arrayKey === "history" && record?.date) {
    return [
      "history",
      getRecordDateIdentity(record.date),
      record?.action ?? "",
      record?.to ?? "",
      record?.text ?? "",
      record?.user ?? "",
      JSON.stringify(record?.changes ?? []),
    ]
      .map(String)
      .join("|");
  }
  if (record?.id != null) return `id:${String(record.id)}`;
  return `index:${index}`;
}

function getRecordDateIdentity(value) {
  const time = parseTime(value);
  if (time > 0) return String(time);
  const human = matchHumanDate(value);
  if (!human) return String(value ?? "").trim();
  return `${human.year}-${human.month}-${human.day}`;
}

function recordHasFieldVersions(record) {
  return (
    Object.keys(normalizeLeakFieldVersions(record?._fieldUpdatedAt)).length > 0
  );
}

function getRecordFieldVersion(record, key) {
  const versions = normalizeLeakFieldVersions(record?._fieldUpdatedAt);
  return (
    versions[key] ??
    Math.max(parseTime(record?.updatedAt), parseTime(record?.createdAt))
  );
}

function isMonitoringMergeField(key) {
  return !new Set([
    "id",
    "roundId",
    "roundNumber",
    "updatedAt",
    "createdAt",
    "_fieldUpdatedAt",
  ]).has(key);
}

function mergeVersionedMonitoringRecord(current, incoming) {
  const currentVersions = normalizeLeakFieldVersions(current?._fieldUpdatedAt);
  const incomingVersions = normalizeLeakFieldVersions(
    incoming?._fieldUpdatedAt,
  );
  const next = { ...current };
  const mergedVersions = { ...currentVersions };
  const keys = new Set([
    ...Object.keys(current ?? {}),
    ...Object.keys(incoming ?? {}),
    ...Object.keys(currentVersions),
    ...Object.keys(incomingVersions),
  ]);

  for (const key of keys) {
    if (!isMonitoringMergeField(key)) continue;
    const currentHasValue = hasOwn(current ?? {}, key);
    const incomingHasValue = hasOwn(incoming ?? {}, key);
    const currentVersion = getRecordFieldVersion(current, key);
    const incomingVersion = getRecordFieldVersion(incoming, key);
    mergedVersions[key] = Math.max(currentVersion, incomingVersion);
    const incomingWins =
      incomingVersion > currentVersion ||
      (incomingVersion === currentVersion &&
        stableSyncValue(
          incomingHasValue,
          incoming?.[key],
          RECORD_SYNC_IGNORED_KEYS,
        ) >
          stableSyncValue(
            currentHasValue,
            current?.[key],
            RECORD_SYNC_IGNORED_KEYS,
          ));
    if (!incomingWins) continue;
    if (incomingHasValue) next[key] = incoming[key];
    else delete next[key];
  }

  next.id = current?.id ?? incoming?.id;
  if (current?.roundId != null) next.roundId = current.roundId;
  else if (incoming?.roundId != null) next.roundId = incoming.roundId;
  if (current?.roundNumber != null) next.roundNumber = current.roundNumber;
  else if (incoming?.roundNumber != null)
    next.roundNumber = incoming.roundNumber;
  next.updatedAt = Math.max(
    parseTime(current?.updatedAt),
    parseTime(incoming?.updatedAt),
  );
  next._fieldUpdatedAt = mergedVersions;
  return next;
}

function mergeMixedMonitoringRecord(current, incoming) {
  const currentVersioned = recordHasFieldVersions(current);
  const versioned = currentVersioned ? current : incoming;
  const legacy = currentVersioned ? incoming : current;
  const versions = normalizeLeakFieldVersions(versioned?._fieldUpdatedAt);
  const next = { ...versioned };

  for (const [key, value] of Object.entries(legacy ?? {})) {
    if (!isMonitoringMergeField(key)) continue;
    const explicitlyVersioned = hasOwn(versions, key);
    if (explicitlyVersioned) continue;
    if (!hasOwn(next, key) || isEmptyMergeValue(next[key])) {
      if (!isEmptyMergeValue(value)) next[key] = value;
    }
  }

  next.id = current?.id ?? incoming?.id;
  if (current?.roundId != null) next.roundId = current.roundId;
  if (current?.roundNumber != null) next.roundNumber = current.roundNumber;
  return next;
}

function mergeMonitoringRecord(current, incoming) {
  const currentVersioned = recordHasFieldVersions(current);
  const incomingVersioned = recordHasFieldVersions(incoming);
  if (currentVersioned && incomingVersioned) {
    return mergeVersionedMonitoringRecord(current, incoming);
  }
  if (currentVersioned || incomingVersioned) {
    return mergeMixedMonitoringRecord(current, incoming);
  }

  const currentTime = Math.max(
    parseTime(current?.updatedAt),
    parseTime(current?.date),
  );
  const incomingTime = Math.max(
    parseTime(incoming?.updatedAt),
    parseTime(incoming?.date),
  );
  const preferred = incomingTime > currentTime ? incoming : current;
  const fallback = preferred === incoming ? current : incoming;
  const next = { ...fallback };
  for (const [key, value] of Object.entries(preferred ?? {})) {
    if (!isEmptyMergeValue(value)) next[key] = value;
  }

  // Photo repository paths are device-local implementation details. During an
  // import/sync the incoming photo has already been restored into this device's
  // storage, so retain that valid restored path even when the logical record
  // timestamp is equal to the local record timestamp.
  if (!isEmptyMergeValue(incoming?.photo)) {
    next.photo = incoming.photo;
  }
  if (!isEmptyMergeValue(incoming?.previousPhoto)) {
    next.previousPhoto = incoming.previousPhoto;
  }

  next.id = current?.id ?? incoming?.id;
  return next;
}

export function mergeRecordArray(
  existingRecords = [],
  incomingRecords = [],
  arrayKey,
  options = {},
) {
  const merged = [...existingRecords];
  const indexByIdentity = new Map();

  merged.forEach((record, index) => {
    indexByIdentity.set(getRecordMergeIdentity(record, index, arrayKey), index);
  });

  incomingRecords.forEach((record, index) => {
    const identity = getRecordMergeIdentity(record, index, arrayKey);
    let existingIndex = indexByIdentity.get(identity);
    let matchedExcelCalendarRow = false;

    // Prefer the exported timestamp when it is available. Date-only workbooks
    // still need the legacy calendar-day fallback, but a timed record must never
    // overwrite the first monitoring entry from the same day.
    if (options.source === "excel" && arrayKey === "monitoringRecords") {
      const recordHasTimeOfDay = (() => {
        const parsed = new Date(record?.date);
        if (!Number.isFinite(parsed.getTime())) return false;
        const isLocalMidnight =
          parsed.getHours() === 0 &&
          parsed.getMinutes() === 0 &&
          parsed.getSeconds() === 0 &&
          parsed.getMilliseconds() === 0;
        const isUtcMidnight =
          parsed.getUTCHours() === 0 &&
          parsed.getUTCMinutes() === 0 &&
          parsed.getUTCSeconds() === 0 &&
          parsed.getUTCMilliseconds() === 0;
        return !isLocalMidnight && !isUtcMidnight;
      })();
      const matchesExcelCalendarRow = (current) =>
        sameMonitoringRound(current, record) &&
        comparableExcelDate(current?.date) ===
          comparableExcelDate(record?.date);

      if (existingIndex != null) {
        matchedExcelCalendarRow = matchesExcelCalendarRow(
          merged[existingIndex],
        );
      } else {
        existingIndex = findByRoundAndTime(merged, record);
        if (existingIndex < 0 && !recordHasTimeOfDay) {
          existingIndex = merged.findIndex(matchesExcelCalendarRow);
        }
        matchedExcelCalendarRow = existingIndex >= 0;
        if (existingIndex < 0) existingIndex = undefined;
      }
    }

    // То же узнавание для архива. Идентификатор записи зависит от того, где
    // её завели: приложение пишет `<id утечки>-<время>`, разбор листа —
    // `excel-<тег>-round-<N>-<строка>`. Проект приходит на телефоны обоими
    // путями, и при обмене архивом один обход приезжал дважды. Сравнение по
    // миллисекунде безопасно: на ней построен и сам идентификатор.
    if (existingIndex == null && arrayKey === "monitoringRecords") {
      const found = findByRoundAndTime(merged, record);
      if (found >= 0) existingIndex = found;
    }

    if (existingIndex == null) {
      indexByIdentity.set(identity, merged.length);
      merged.push(record);
      return;
    }

    const current = merged[existingIndex];
    if (mergesFieldByField(arrayKey) && options.source !== "excel") {
      merged[existingIndex] = mergeMonitoringRecord(current, record);
      return;
    }
    if (
      matchedExcelCalendarRow ||
      parseTime(record?.date) >= parseTime(current?.date)
    ) {
      const next = { ...current };
      for (const [key, value] of Object.entries(record ?? {})) {
        if (arrayKey === "history" && key === "user") continue;
        if (arrayKey === "monitoringRecords" && key === "date") continue;
        if (
          key === "date" &&
          getRecordDateIdentity(current?.date) === getRecordDateIdentity(value)
        ) {
          continue;
        }
        if (!isEmptyMergeValue(value)) next[key] = value;
      }
      if (current?.id != null) next.id = current.id;
      else delete next.id;
      if (current?.roundId != null) next.roundId = current.roundId;
      else delete next.roundId;
      if (current?.roundNumber != null) next.roundNumber = current.roundNumber;
      else delete next.roundNumber;
      merged[existingIndex] = next;
    }
  });

  return merged.sort(
    (left, right) => parseTime(left?.date) - parseTime(right?.date),
  );
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}
