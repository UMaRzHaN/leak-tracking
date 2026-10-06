import { getIntlLocale } from "@/utils/locale";
import { collectLeakPhotoPaths } from "@/domain/leakLifecycle";
import { buildLeakHistoryChanges } from "@/utils/historyChanges";
import {
  MONITORING_RESULT,
  getAllMonitoringRecords,
  getLastMonitoringFlag,
  isMonitoringDue,
} from "@/utils/monitoring";
import { STATUS } from "@/utils/status";
import { MONITORING_FILTER } from "@/domain/leakFilters";
import {
  LEAK_EVENT_TYPES,
  createLeakEvent,
  getLeakEvents,
  getRepairDonePhoto,
  getRepairPhoto,
  sortLeakEvents,
} from "@/domain/leakEvents";

const STATUS_TO_MONITORING_RESULT = {
  [STATUS.OPEN]: MONITORING_RESULT.STILL_LEAKING,
  [STATUS.IN_PROGRESS]: MONITORING_RESULT.NEEDS_RECHECK,
  [STATUS.RESOLVED]: MONITORING_RESULT.RESOLVED,
};

export function formatRoundPeriod(startedAt, completedAt, lang) {
  const started = new Date(startedAt);
  if (!Number.isFinite(started.getTime())) return "";
  const locale = getIntlLocale(lang);
  const date = started.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const formatTime = (value) =>
    new Date(value).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${date}, ${formatTime(startedAt)}${
    completedAt ? `–${formatTime(completedAt)}` : ""
  }`;
}

export function getCurrentMonitoringResult(leak) {
  return STATUS_TO_MONITORING_RESULT[leak?.status ?? STATUS.OPEN];
}

export function getInitialMonitoringResult(leak) {
  return getCurrentMonitoringResult(leak) ?? MONITORING_RESULT.STILL_LEAKING;
}

/**
 * Флаги переносятся с прошлого осмотра: тег и фикция меняются редко, и
 * обходчик правит только то, что изменилось. Впервые — «тег есть, не фикция»,
 * как у обычной записи.
 */
export function getMonitoringFlagDefaults(leak) {
  return {
    physicalTag: getLastMonitoringFlag(leak, "physicalTag") ?? true,
    fiction: getLastMonitoringFlag(leak, "fiction") ?? false,
  };
}

export function createMonitoringDraft(leak, current = {}) {
  return {
    result: getInitialMonitoringResult(leak),
    comment: "",
    materials_equipment: leak?.materials_equipment ?? "",
    ...getMonitoringFlagDefaults(leak),
    photo: null,
    ...current,
  };
}

export function getMonitoringRoundSummary(data, roundId, roundNumber) {
  const leaks = Array.isArray(data) ? data : [];
  const due = roundId
    ? leaks.filter((leak) => isMonitoringDue(leak, roundId, roundNumber)).length
    : leaks.length;

  return {
    total: leaks.length,
    due,
    checked: Math.max(0, leaks.length - due),
    open: leaks.filter((leak) => (leak.status ?? STATUS.OPEN) === STATUS.OPEN)
      .length,
    inProgress: leaks.filter((leak) => leak.status === STATUS.IN_PROGRESS)
      .length,
    resolved: leaks.filter((leak) => leak.status === STATUS.RESOLVED).length,
  };
}

export function getNextMonitoringRoundNumber(data, currentRoundNumber) {
  const maxRecordNumber = (Array.isArray(data) ? data : []).reduce(
    (max, leak) => {
      // Через `getAllMonitoringRecords`: осмотры пишутся в ленту событий, и по
      // одному старому списку устройство без своего обхода снова начинало
      // с №1 — тем же номером, что уже идёт на другом устройстве.
      return getAllMonitoringRecords(leak).reduce((recordMax, record) => {
        const value = Number(record?.roundNumber);
        return Number.isFinite(value) && value > recordMax ? value : recordMax;
      }, max);
    },
    0,
  );

  return Math.max(Number(currentRoundNumber) || 0, maxRecordNumber) + 1;
}

function sortMonitoringItems(items, roundId, roundNumber) {
  return [...items].sort((left, right) => {
    const leftDue =
      Boolean(roundId) && isMonitoringDue(left, roundId, roundNumber);
    const rightDue =
      Boolean(roundId) && isMonitoringDue(right, roundId, roundNumber);
    if (leftDue !== rightDue) return leftDue ? -1 : 1;
    return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
  });
}

export function getMonitoringItems(displayed, filter, roundId, roundNumber) {
  const sorted = sortMonitoringItems(
    Array.isArray(displayed) ? displayed : [],
    roundId,
    roundNumber,
  );
  if (!roundId || filter === MONITORING_FILTER.ALL) return sorted;

  const shouldBeDue = filter === MONITORING_FILTER.DUE;
  return sorted.filter(
    (leak) => isMonitoringDue(leak, roundId, roundNumber) === shouldBeDue,
  );
}

export function getMonitoringCounts(displayed, roundId, roundNumber) {
  const items = Array.isArray(displayed) ? displayed : [];
  if (!roundId) return { due: 0, checked: 0, all: items.length };

  const due = items.filter((leak) =>
    isMonitoringDue(leak, roundId, roundNumber),
  ).length;
  return { due, checked: items.length - due, all: items.length };
}

export function filterLeaksByMonitoring(
  displayed,
  filter,
  roundId,
  roundNumber,
) {
  const items = Array.isArray(displayed) ? displayed : [];
  if (!roundId || filter === MONITORING_FILTER.ALL) return items;

  const shouldBeDue = filter === MONITORING_FILTER.DUE;
  return items.filter(
    (leak) => isMonitoringDue(leak, roundId, roundNumber) === shouldBeDue,
  );
}

export function getMonitoringPhotoPathsToKeep(leak) {
  return collectLeakPhotoPaths(leak);
}

// «Фото до обхода» — последнее, что о записи было известно, а после переезда
// снимок починки лежит в её событии: спросить веху напрямую значит подписать
// обходу первичное фото и выдать его за состояние перед выездом.
function getCurrentLeakPhoto(leak) {
  if (leak?.status === STATUS.RESOLVED) {
    return getRepairDonePhoto(leak) ?? leak.photo ?? null;
  }
  if (leak?.status === STATUS.IN_PROGRESS) {
    return getRepairPhoto(leak) ?? leak.photo ?? null;
  }
  return leak?.photo ?? null;
}

export function buildMonitoringPatch({
  leak,
  draft,
  monitoredBy,
  photoPath,
  roundId,
  roundNumber,
  now = new Date(),
}) {
  const result = draft.result || MONITORING_RESULT.STILL_LEAKING;
  const materialsEquipment = draft.materials_equipment?.trim() || undefined;
  const previousMaterialsEquipment =
    leak.materials_equipment?.trim() || undefined;
  const materialsChanged = materialsEquipment !== previousMaterialsEquipment;
  const previousPhoto = getCurrentLeakPhoto(leak);
  const record = {
    id: `${leak.id}-${now.getTime()}`,
    date: now.toISOString(),
    roundId,
    roundNumber,
    monitoredBy: monitoredBy.trim(),
    result,
    photo: photoPath,
    ...(photoPath && previousPhoto && photoPath !== previousPhoto
      ? { previousPhoto }
      : {}),
    /*
     * МТР пишется всегда, а не только когда его поменяли. Колонка листа обхода
     * отвечает на вопрос «с чем застали утечку в этот раз», и пустая клетка у
     * неизменившегося МТР читалась как «его не было», хотя он был — просто тот
     * же. Признак изменения остаётся отдельным полем, и карточка отличает
     * «вписали новое» от «оставили как есть» по нему, а не по наличию.
     *
     * `null` — это снятое значение: МТР был, обходчик его стёр. Пустая строка
     * и отсутствие поля означали бы одно и то же, а это разные ответы.
     */
    ...(materialsEquipment != null
      ? { materials_equipment: materialsEquipment }
      : materialsChanged
        ? { materials_equipment: null }
        : {}),
    materialsChanged,
    ...(typeof draft.physicalTag === "boolean"
      ? { physicalTag: draft.physicalTag }
      : {}),
    ...(typeof draft.fiction === "boolean" ? { fiction: draft.fiction } : {}),
    comment: draft.comment?.trim() || undefined,
  };

  const nextStatus =
    result === MONITORING_RESULT.RESOLVED
      ? STATUS.RESOLVED
      : result === MONITORING_RESULT.NEEDS_RECHECK
        ? STATUS.IN_PROGRESS
        : STATUS.OPEN;
  // Вехи ремонта обход больше не пишет: снимок он и так кладёт в своё
  // событие, а «фото после ремонта» у устранённой записи карточка берёт
  // оттуда же. Гасятся они по той же причине, что и в жизненном цикле: у
  // записи, заведённой до переезда, старое значение осталось бы висеть и
  // спорить с лентой.
  const statusPatch =
    nextStatus === STATUS.RESOLVED
      ? {
          status: nextStatus,
          resolvedAt: null,
          photo_after: null,
        }
      : {
          status: nextStatus,
          resolvedAt: null,
          photo_after: null,
          ...(nextStatus === STATUS.OPEN
            ? { photo: photoPath ?? leak.photo }
            : {}),
          // Снимок ремонта гасится вместе с датой: поле держит только снимок,
          // поправленный в карточке, и после нового перехода он был бы чужим.
          ...(nextStatus === STATUS.IN_PROGRESS
            ? { repairAt: null, photo_repair: null }
            : {}),
        };
  const nextLeakForChanges = {
    ...leak,
    ...statusPatch,
    materials_equipment: materialsEquipment,
  };
  const changes = buildLeakHistoryChanges({
    before: leak,
    after: nextLeakForChanges,
    fields: [{ key: "materials_equipment" }],
  });

  return {
    ...leak,
    ...statusPatch,
    materials_equipment: materialsEquipment,
    updatedAt: now.getTime(),
    // Обход пишется только в ленту. Двойная запись в `monitoringRecords`
    // держалась ради телефонов прежней сборки: обмен доносил до них обходы
    // единственным известным им способом. Парк обновился — и список остаётся
    // читаемым (миграция вкладывает его в ленту при чтении), но новых записей
    // в него больше не попадает.
    events: sortLeakEvents([
      ...getLeakEvents(leak),
      createLeakEvent({ ...record, type: LEAK_EVENT_TYPES.INSPECTION }),
    ]),
    history: [
      ...(leak.history ?? []),
      {
        action: "monitoring",
        date: record.date,
        to: nextStatus,
        user: record.monitoredBy || undefined,
        ...(record.comment ? { text: record.comment } : {}),
        ...(changes.length > 0 ? { changes } : {}),
      },
    ],
  };
}

/**
 * Слияние текущего обхода с предыдущим: «Новый обход» нажали по ошибке, и
 * № 3 на деле — продолжение № 2. Осмотры текущего обхода переписываются в
 * предыдущий, а предыдущий снова становится текущим и незавершённым.
 *
 * Идентификатор предыдущего берётся у его же осмотров: устройства, начавшие
 * обход каждое у себя, дают ему разные, и выбирается самый частый. Начало —
 * самый ранний из его осмотров, иначе начало текущего.
 *
 * @param {any[]} data
 * @param {{id: string, number: number, startedAt: string}|null} round
 * @returns {{ data: any[], round: {id: string, number: number, startedAt: string}, moved: number }|null}
 *   `moved` — сколько утечек получили осмотры в предыдущий обход.
 *   null — сливать не с чем: это первый обход.
 */
export function mergeRoundIntoPrevious(data, round) {
  const number = Number(round?.number);
  if (!round?.id || !(number > 1)) return null;
  const target = number - 1;
  const leaks = Array.isArray(data) ? data : [];

  const idVotes = new Map();
  let startedAt = Date.parse(round.startedAt);
  for (const leak of leaks) {
    for (const record of getAllMonitoringRecords(leak)) {
      if (Number(record?.roundNumber) !== target) continue;
      if (record.roundId) {
        idVotes.set(record.roundId, (idVotes.get(record.roundId) ?? 0) + 1);
      }
      const time = Date.parse(String(record.date ?? ""));
      if (Number.isFinite(time) && !(time >= startedAt)) startedAt = time;
    }
  }
  const targetId =
    [...idVotes.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    `${round.id}-merged`;

  const inRound = (record) =>
    record?.roundId === round.id || Number(record?.roundNumber) === number;
  let touched = false;
  const move = (record) => {
    if (!inRound(record)) return record;
    touched = true;
    return { ...record, roundId: targetId, roundNumber: target };
  };

  let moved = 0;
  const next = leaks.map((leak) => {
    touched = false;
    const events = getLeakEvents(leak).map((event) =>
      event?.type === LEAK_EVENT_TYPES.INSPECTION ? move(event) : event,
    );
    const legacy = Array.isArray(leak?.monitoringRecords)
      ? leak.monitoringRecords.map(move)
      : leak?.monitoringRecords;
    if (!touched) return leak;
    moved += 1;
    return {
      ...leak,
      ...(Array.isArray(leak?.events) ? { events } : {}),
      ...(Array.isArray(leak?.monitoringRecords)
        ? { monitoringRecords: legacy }
        : {}),
    };
  });

  return {
    data: next,
    round: {
      id: targetId,
      number: target,
      startedAt: Number.isFinite(startedAt)
        ? new Date(startedAt).toISOString()
        : round.startedAt,
    },
    moved,
  };
}
