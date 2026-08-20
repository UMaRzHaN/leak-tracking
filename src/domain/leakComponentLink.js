/**
 * Связь утечки с карточкой компонента.
 *
 * Компонент — постоянный объект учёта, утечка — событие на нём. Ключи у обеих
 * сущностей намеренно общие (`component`, `actuator_type`, `connection_type`,
 * `installation_type`), поэтому связь — это прямое копирование, а не таблица
 * соответствий.
 *
 * Копируется паспорт железа: что это, какой привод, как присоединено, как
 * установлено. Обходчик стоит у оборудования, карточка на него уже заведена —
 * переписывать это с бирки второй раз незачем.
 */

/** Паспортные поля, которые у карточки и у утечки означают одно и то же. */
export const LINKED_COMPONENT_FIELDS = Object.freeze([
  "component",
  "actuator_type",
  "connection_type",
  "installation_type",
]);

/** Чем утечка ссылается на карточку. */
export const LINK_FIELDS = Object.freeze(["component_id", "component_uid"]);

function filled(value) {
  return value != null && String(value).trim() !== "";
}

/**
 * Пришивает утечку к карточке и переносит паспортные поля.
 *
 * Координаты переносятся **только если у утечки своих нет**. Свой фикс — это
 * свидетельство: где нашли, там и нашли. Но утечка без координат выпадает с
 * карты совсем, и если приёмник промолчал, координаты железа — лучшее, что
 * можно поставить вместо ничего.
 *
 * Снимок не переносится никогда. На карточке снят компонент, а от утечки нужен
 * снимок утечки; подставить одно вместо другого значит выдать фотографию
 * исправного железа за доказательство пропуска.
 *
 * @param {object} leak
 * @param {object} component
 * @returns {object} новая утечка; исходная не меняется
 */
export function linkLeakToComponent(leak, component) {
  if (!component?.id) return leak;

  const linked = { ...leak };
  linked.component_id = component.id;
  linked.component_uid = component.component_uid ?? "";

  for (const key of LINKED_COMPONENT_FIELDS) {
    if (filled(component[key])) linked[key] = component[key];
  }

  const hasOwnFix = filled(leak?.lat) && filled(leak?.lng);
  if (!hasOwnFix && filled(component.lat) && filled(component.lng)) {
    linked.lat = component.lat;
    linked.lng = component.lng;
  }

  return linked;
}

/**
 * Снимает связь, оставляя перенесённое на месте.
 *
 * Открепляют, когда выбрали не ту карточку, — но стирать вместе со ссылкой всё
 * заполненное нельзя: часть могла быть написана руками до выбора или исправлена
 * после. Пустые поля человек уберёт сам, потерянные не вернёт никто.
 */
export function unlinkLeakComponent(leak) {
  if (!leak || !isLinkedToComponent(leak)) return leak;
  const rest = { ...leak };
  for (const key of LINK_FIELDS) delete rest[key];
  return rest;
}

export function isLinkedToComponent(leak) {
  return filled(leak?.component_id);
}

/**
 * Как подписать связь одной строкой.
 *
 * Номер впереди наименования: обходчик ищет глазами номер с бирки, а не слово
 * «Задвижка», которых на площадке сотни.
 */
export function describeLinkedComponent(leak) {
  if (!isLinkedToComponent(leak)) return "";
  const uid = String(leak.component_uid ?? "").trim();
  const name = String(leak.component ?? "").trim();
  if (uid && name) return `№${uid} · ${name}`;
  return uid ? `№${uid}` : name;
}
