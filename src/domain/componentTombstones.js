/**
 * Удалённая карточка компонента.
 *
 * Реестры двух устройств сводятся по идентификаторам карточек, и до сих пор
 * сведение умело только добавлять и обновлять. Из этого следовало неприятное:
 * карточку, удалённую на одном телефоне, возвращал первый же обмен с другим —
 * молча, потому что для второго телефона она просто есть, а «её удалили» ему
 * никто не сказал. Человек удалял её снова, и она возвращалась снова.
 *
 * Поэтому удаление — не исчезновение записи, а запись о том, что её удалили.
 * Надгробие остаётся в списке на месте карточки и ездит вместе с ней: в
 * архиве, в архиве инвентаризации, в локальном обмене по QR. Приехав на второе
 * устройство, оно уносит карточку и там.
 *
 * Надгробие несёт минимум — идентификатор, номер с бирки и момент удаления.
 * Снимок не несёт намеренно: фотография удалённой карточки должна стать
 * сиротой и быть убрана, а не держаться вечно ради записи о том, чего нет.
 *
 * В отличие от утечек, поколений и эпох здесь нет. У утечек выпавшее
 * надгробие — это воскресшая запись об утечке, то есть потерянное
 * свидетельство, и цена ошибки оправдывает сверку эпох между устройствами.
 * Реестр же и без того живёт с тем, что номера совпадают: дубль в нём
 * предупреждает, а не блокирует. Воскресшая карточка — такой же дубль, видимый
 * человеку, а не тихая потеря.
 */

/** Сколько надгробий реестр несёт с собой, прежде чем начнёт забывать старые. */
export const MAX_COMPONENT_TOMBSTONES = 5_000;

export function isComponentTombstone(record) {
  return record?.deleted === true;
}

export function isLiveComponent(record) {
  return Boolean(record) && !isComponentTombstone(record);
}

/** Только карточки — то, что показывают, считают и выгружают. */
export function liveComponents(records = []) {
  return Array.isArray(records) ? records.filter(isLiveComponent) : [];
}

export function componentTombstones(records = []) {
  return Array.isArray(records) ? records.filter(isComponentTombstone) : [];
}

function toTime(value) {
  const time = Number(value ?? 0);
  return Number.isFinite(time) && time > 0 ? time : 0;
}

/**
 * Когда запись в последний раз что-то о себе сообщила: карточка — когда её
 * правили, надгробие — когда карточку удалили. По этому числу сведение и
 * решает, что из двух свежее.
 */
export function componentChangedAt(record) {
  return isComponentTombstone(record)
    ? toTime(record.deletedAt)
    : toTime(record?.updatedAt);
}

/**
 * Надгробие на месте карточки.
 *
 * @param {Record<string, any>} component
 * @param {number} [deletedAt]
 */
export function tombstoneFor(component, deletedAt) {
  const at = toTime(deletedAt) || Date.now();
  return {
    id: component?.id,
    // Номер остаётся: по нему человек узнаёт, какую карточку он удалил, если
    // придётся разбирать расхождение между устройствами.
    component_uid: String(component?.component_uid ?? "").trim(),
    deleted: true,
    deletedAt: at,
    updatedAt: at,
  };
}

/**
 * Заменяет карточку надгробием, оставляя список на месте.
 *
 * @param {Record<string, any>[]} records
 * @param {string} id
 * @param {number} [deletedAt]
 */
export function withComponentRemoved(records, id, deletedAt) {
  return records.map((record) =>
    record?.id === id && isLiveComponent(record)
      ? tombstoneFor(record, deletedAt)
      : record,
  );
}

/**
 * Роняет самые старые надгробия, когда их становится больше, чем реестр
 * согласен носить. Карточки не трогаются никогда — забыть можно только то, что
 * уже удалено.
 *
 * @param {Record<string, any>[]} records
 * @param {number} [limit]
 */
export function compactComponentTombstones(
  records = [],
  limit = MAX_COMPONENT_TOMBSTONES,
) {
  const graves = componentTombstones(records);
  if (graves.length <= limit) return records;

  const kept = new Set(
    [...graves]
      .sort(
        (left, right) => componentChangedAt(right) - componentChangedAt(left),
      )
      .slice(0, limit)
      .map((grave) => grave.id),
  );
  return records.filter(
    (record) => isLiveComponent(record) || kept.has(record.id),
  );
}
