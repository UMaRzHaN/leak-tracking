import {
  LEAK_EVENT_TYPES,
  getLeakEvents,
  sortLeakEvents,
} from "./leakEventsCore";
import {
  getRepairDoneAt,
  getRepairStartedAt,
  lastEventValue,
  withReplacedRepairPhoto,
} from "./leakEventsRepairs";

/**
 * Дата и снимок ремонта и устранения по статусу записи.
 *
 * Отдельно от `leakEventsRepairs`: там — что лента знает о починках, здесь —
 * что из этого показывать на месте нынешнего состояния. Карточка, лист
 * «Утечки» и проверка данных спрашивают одно и то же, и ответ живёт один.
 *
 * @typedef {{eventType: string, inspectionResult: string, field: string}} MilestoneKind
 * @typedef {{date: any, photo: string|null, source: "event"|"inspection"|"field"|null}} Milestone
 */

// Результаты осмотра строками, а не из `MONITORING_RESULT`: `utils/monitoring`
// сам читает ленту отсюда, и обратный импорт замкнул бы круг.
/** @type {{repair: MilestoneKind, resolved: MilestoneKind}} */
const MILESTONE_KINDS = {
  repair: {
    eventType: LEAK_EVENT_TYPES.REPAIR_STARTED,
    inspectionResult: "needs_recheck",
    field: "photo_repair",
  },
  resolved: {
    eventType: LEAK_EVENT_TYPES.REPAIR_DONE,
    inspectionResult: "resolved",
    field: "photo_after",
  },
};

/** @type {Milestone} */
const NO_MILESTONE = Object.freeze({ date: null, photo: null, source: null });

function eventTime(event) {
  const time = Date.parse(String(event?.date ?? ""));
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function lastEventWhere(leak, matches) {
  const events = sortLeakEvents(getLeakEvents(leak));
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (matches(events[index])) return events[index];
  }
  return null;
}

/**
 * Переход в состояние: последняя починка своего вида или осмотр с нужным
 * результатом — кто из них свежее.
 *
 * @param {any} leak
 * @param {MilestoneKind} kind
 * @returns {Milestone}
 */
function resolveMilestone(leak, { eventType, inspectionResult, field }) {
  const repair = lastEventWhere(leak, (event) => event?.type === eventType);
  const inspection = lastEventWhere(
    leak,
    (event) =>
      event?.type === LEAK_EVENT_TYPES.INSPECTION &&
      event?.result === inspectionResult,
  );

  if (inspection && (!repair || eventTime(inspection) >= eventTime(repair))) {
    return {
      date: inspection.date ?? null,
      // Снимок, поправленный в карточке, лежит в поле записи: снимок осмотра
      // принадлежит обходу и не переписывается.
      photo: leak?.[field] || inspection.photo || null,
      source: "inspection",
    };
  }
  return {
    date: repair?.date ?? null,
    photo: lastEventValue(leak, eventType, "photo") ?? leak?.[field] ?? null,
    source: repair ? "event" : "field",
  };
}

/**
 * Дата и снимок ремонта и устранения — так, как их показывают карточка и
 * лист «Утечки».
 *
 * Отвечает по статусу: «ремонт» — у записи в ремонте или устранённой,
 * «устранение» — только у устранённой. Открытая запись эти поля не
 * заполняет: прежние ремонты остаются в ленте и в журнале, но на месте
 * нынешнего состояния читались бы как оно.
 *
 * В ремонт и из него выводит не только починка, но и обход: осмотр «на
 * перепроверку» ставит «В ремонте», осмотр «устранена» — «Устранена». Такой
 * осмотр и есть момент перехода, и берутся его дата со временем и снимок —
 * если он свежее последней починки. Иначе утечка, которую отремонтировали,
 * открыли и снова отправили обходом в ремонт, показывала бы прошлый ремонт.
 *
 * Дата, которой нет в ленте, берётся из поля записи или журнала, как у
 * `getRepairStartedAt`; нет и там — остаётся пустой: выдуманный момент ремонта
 * хуже честно неизвестного.
 *
 * @param {any} leak
 */
export function getStatusRepairMilestones(leak) {
  const status = leak?.status;
  const repairing = status === "in_progress" || status === "resolved";
  const resolved = status === "resolved";
  const repair = repairing
    ? resolveMilestone(leak, MILESTONE_KINDS.repair)
    : NO_MILESTONE;
  const done = resolved
    ? resolveMilestone(leak, MILESTONE_KINDS.resolved)
    : NO_MILESTONE;

  return {
    repairAt: repairing ? (repair.date ?? getRepairStartedAt(leak)) : null,
    repairPhoto: repair.photo,
    repairPhotoSource: repair.source,
    resolvedAt: resolved ? (done.date ?? getRepairDoneAt(leak)) : null,
    resolvedPhoto: done.photo,
    resolvedPhotoSource: done.source,
  };
}

/**
 * Куда лечь снимкам ремонта и устранения, заменённым в карточке.
 *
 * Правка снимка — не новый ремонт, а исправление вложения у того перехода,
 * чей снимок карточка показывает. Если это починка — меняется её событие.
 * Если осмотр — его снимок не трогается: он принадлежит обходу, а
 * поправленный ложится в поле записи и показывается вместо снимка осмотра. У
 * записи без события снимок и так живёт в поле.
 *
 * Дальше передаётся лента с уже сделанной правкой. Прежде вместо неё уходил
 * `null`: событие не находилось, снимок молча оседал в поле, которое карточка
 * не показывает, и замена фото ремонта в карточке ничего не меняла.
 *
 * @param {any} leak
 * @param {{repairPhoto?: string|null, afterPhoto?: string|null}} photos
 * @returns {Record<string, any>} поля записи и, если менялось событие, новая лента
 */
export function withEditedRepairPhotos(leak, { repairPhoto, afterPhoto }) {
  const milestones = getStatusRepairMilestones(leak);
  let events = /** @type {any[]|null} */ (null);
  const patch = /** @type {Record<string, any>} */ ({});

  /** @type {[string|null|undefined, MilestoneKind, string|null][]} */
  const edits = [
    [repairPhoto, MILESTONE_KINDS.repair, milestones.repairPhotoSource],
    [afterPhoto, MILESTONE_KINDS.resolved, milestones.resolvedPhotoSource],
  ];
  for (const [path, kind, source] of edits) {
    if (!path) continue;
    const next =
      source === "event"
        ? withReplacedRepairPhoto(
            { ...leak, events: events ?? leak?.events },
            kind.eventType,
            path,
          )
        : null;
    if (next) events = next;
    else patch[kind.field] = path;
  }

  return events ? { ...patch, events } : patch;
}
