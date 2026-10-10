import { LEAK_EVENT_TYPES, getLeakEvents } from "./leakEventsCore";
import { MONITORING_RESULT, getMonitoringRecords } from "@/utils/monitoring";
import { STATUS } from "@/utils/status";

/**
 * Правка уже записанных осмотров и проверок ремонта из карточки утечки.
 *
 * Правятся ответы и текст: итог осмотра, физ. тег, фикция, МТР, комментарий;
 * у ремонта — бригада, МТР, замечание, физ. тег. Дата, кто проверял, номер
 * обхода и снимки остаются как записаны: по ним считают зачёт в обходе и
 * порядок ленты, и задним числом их не переписывают.
 *
 * Итог самого последнего осмотра решает статус утечки — как новый осмотр:
 * исправили «утечки нет» на «утечка есть», и устранённая утечка снова
 * открыта. Старые осмотры и осмотр, после которого был ремонт, статус не
 * трогают: его с тех пор решало уже другое.
 */
export const RECORD_KIND = Object.freeze({
  INSPECTION: "inspection",
  REPAIR: "repair",
});

export const RECORD_EDIT_KEYS = Object.freeze({
  [RECORD_KIND.INSPECTION]: [
    "result",
    "physicalTag",
    "fiction",
    "materials_equipment",
    "comment",
  ],
  [RECORD_KIND.REPAIR]: [
    "brigade",
    "materials_equipment",
    "note",
    "physicalTag",
  ],
});

const REPAIR_TYPES = new Set([
  LEAK_EVENT_TYPES.REPAIR_STARTED,
  LEAK_EVENT_TYPES.REPAIR_STAGE,
  LEAK_EVENT_TYPES.REPAIR_DONE,
]);

const STATUS_BY_RESULT = {
  [MONITORING_RESULT.RESOLVED]: STATUS.RESOLVED,
  [MONITORING_RESULT.NEEDS_RECHECK]: STATUS.IN_PROGRESS,
  [MONITORING_RESULT.STILL_LEAKING]: STATUS.OPEN,
};

/** Ключ записи для правок: номер, а у записей без него — дата. */
export function recordKey(record) {
  return String(record?.id ?? record?.date ?? "");
}

const byDateDesc = (left, right) =>
  Date.parse(String(right.date)) - Date.parse(String(left.date));

/** Осмотры, которые можно править, — новые сверху. */
export function editableInspections(leak) {
  return [...getMonitoringRecords(leak)].sort(byDateDesc);
}

/** События ремонта, которые можно править, — новые сверху. */
export function editableRepairs(leak) {
  return getLeakEvents(leak)
    .filter((event) => REPAIR_TYPES.has(event?.type) && event?.date)
    .sort(byDateDesc);
}

function normalize(key, value) {
  if (key === "physicalTag" || key === "fiction") {
    return typeof value === "boolean" ? value : undefined;
  }
  if (typeof value === "string") return value.trim() || undefined;
  return value ?? undefined;
}

const same = (left, right) => (left ?? null) === (right ?? null);

/**
 * Что правка в самом деле меняет у записи: пара «было → стало» на ключ.
 *
 * @param {any} record
 * @param {Record<string, any>|undefined} patch
 * @param {string[]} keys
 */
function diffRecord(record, patch, keys) {
  if (!patch) return [];
  return keys
    .filter((key) => key in patch)
    .map((key) => ({
      key,
      from: normalize(key, record?.[key]),
      to: normalize(key, patch[key]),
    }))
    .filter(({ from, to }) => !same(from, to));
}

function kindOf(record) {
  return REPAIR_TYPES.has(record?.type)
    ? RECORD_KIND.REPAIR
    : RECORD_KIND.INSPECTION;
}

/** Есть ли в черновике хоть одна настоящая правка. */
export function hasRecordEdits(leak, edits) {
  if (!edits || Object.keys(edits).length === 0) return false;
  return [...editableInspections(leak), ...editableRepairs(leak)].some(
    (record) =>
      diffRecord(
        record,
        edits[recordKey(record)],
        RECORD_EDIT_KEYS[kindOf(record)],
      ).length > 0,
  );
}

function applyDiff(record, diff) {
  const next = { ...record };
  for (const { key, to } of diff) {
    if (to === undefined) delete next[key];
    else next[key] = to;
  }
  // МТР в осмотре пишется всегда, а показывается по признаку изменения:
  // исправленный МТР — изменение, иначе карточка его не покажет.
  if (diff.some(({ key }) => key === "materials_equipment")) {
    next.materialsChanged = true;
  }
  return next;
}

/**
 * Применяет черновик правок к записи утечки.
 *
 * @param {any} leak
 * @param {Record<string, Record<string, any>>} edits правки по `recordKey`
 * @returns {{ leak: any, changes: any[] }} запись и изменения для лога
 */
export function applyRecordEdits(leak, edits) {
  if (!edits || Object.keys(edits).length === 0) return { leak, changes: [] };

  const changes = [];
  const diffs = new Map();
  for (const record of [
    ...editableInspections(leak),
    ...editableRepairs(leak),
  ]) {
    const key = recordKey(record);
    if (diffs.has(key)) continue;
    const kind = kindOf(record);
    const diff = diffRecord(record, edits[key], RECORD_EDIT_KEYS[kind]);
    if (diff.length === 0) continue;
    diffs.set(key, diff);
    // Обход пишется и в ленту, и в старый список одной записью — в лог она
    // попадает один раз.
    for (const change of diff) {
      changes.push({ ...change, record: { kind, date: record.date } });
    }
  }
  if (diffs.size === 0) return { leak, changes: [] };

  const patch = (record) => {
    const diff = diffs.get(recordKey(record));
    return diff ? applyDiff(record, diff) : record;
  };
  let next = {
    ...leak,
    ...(Array.isArray(leak?.events) ? { events: leak.events.map(patch) } : {}),
    ...(Array.isArray(leak?.monitoringRecords)
      ? { monitoringRecords: leak.monitoringRecords.map(patch) }
      : {}),
  };

  const latest = editableInspections(next)[0];
  const resultEdited = diffs
    .get(recordKey(latest))
    ?.some(({ key }) => key === "result");
  const repairedSince = editableRepairs(next).some(
    (event) => Date.parse(event.date) > Date.parse(String(latest?.date)),
  );
  const status = STATUS_BY_RESULT[latest?.result];
  if (resultEdited && !repairedSince && status && status !== leak?.status) {
    changes.push({ key: "status", from: leak?.status ?? null, to: status });
    const photo = beforePhotoFor(next, latest, status);
    if (photo !== next.photo) {
      changes.push({
        key: "photo",
        kind: "photo",
        from: Boolean(next.photo),
        to: Boolean(photo),
      });
    }
    next = {
      ...next,
      status,
      photo,
      resolvedAt: null,
      // Снимки ремонта и устранения, поправленные в карточке, принадлежали
      // прежнему переходу — как и при новом осмотре, они гаснут.
      photo_after: null,
      ...(status === STATUS.IN_PROGRESS
        ? { repairAt: null, photo_repair: null }
        : {}),
    };
  }

  return { leak: next, changes };
}

/**
 * Снимок «до» после исправленного итога — как его поставил бы сам осмотр.
 *
 * «Утечка есть» делает снимок осмотра снимком утечки, а прежний помнит в
 * `previousPhoto`. Ушёл итог с «утечка есть» — снимок осмотра больше не
 * «до» (он теперь снимок перехода в ремонт или устранения, и стоял бы в
 * двух слотах сразу), и возвращается прежний. Пришёл — снимок осмотра встаёт
 * на место «до».
 *
 * @param {any} leak
 * @param {any} inspection последний осмотр, уже с исправленным итогом
 * @param {string} status
 */
function beforePhotoFor(leak, inspection, status) {
  if (status === STATUS.OPEN) return inspection.photo || leak.photo;
  const ownPhoto = Boolean(inspection.photo) && leak.photo === inspection.photo;
  return ownPhoto && inspection.previousPhoto
    ? inspection.previousPhoto
    : leak.photo;
}
