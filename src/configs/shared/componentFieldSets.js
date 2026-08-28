import {
  COMPONENT_BUILD_FIELDS,
  COMPONENT_IDENTITY_FIELDS,
  COMPONENT_PLACE_FIELDS,
  COMPONENT_PASSPORT_FIELDS,
  COMPONENT_SEARCH_FIELDS_HEAD,
  COMPONENT_SEARCH_FIELDS_TAIL,
  COMPONENT_SIZE_FIELDS,
  COMPONENT_SYSTEM_FIELDS,
  COMPONENT_TYPE_FIELDS,
} from "@/configs/shared/componentFields";
import { TYPE_FIELDS, COORD_FIELDS } from "@/configs/shared/fields";
import { createFieldSets } from "@/configs/shared/fieldRegistry";

/**
 * Поля карточки компонента для одного типа проекта.
 *
 * Всё, что описывает железо, у типов общее — оно и лежит в
 * `shared/componentFields`. Различаются только уровни места: у промысла это
 * Подразделение / Месторождение / Локация, у транспорта — УМГ / Компрессорная
 * станция / Локация, у распределения — Населенный пункт / Район / Адрес.
 * Поэтому уровни приходят снаружи, а не перечисляются здесь.
 *
 * Берутся из них ровно ключ и подпись. Дословно переносить определения полей
 * утечки нельзя: у тех стоит `voice: true`, и карточка получила бы места в
 * `VOICE_FIELDS`, где их отродясь не было, — что голос вправе заполнить в
 * карточке, решает `outputFields` в блоке реестра.
 *
 * @param {{key: string, label: string}[]} locationLevels уровни места этого
 *   типа проекта, от старшего к младшему
 */
export function createComponentFieldSets(locationLevels) {
  const locationFields = locationLevels.map(({ key, label }) => ({
    key,
    label,
    viewable: true,
    editable: true,
    copyable: true,
  }));

  const fieldDefinitions = [
    ...COMPONENT_SYSTEM_FIELDS,
    ...COMPONENT_IDENTITY_FIELDS,
    ...locationFields,
    ...COMPONENT_PLACE_FIELDS,
    ...COMPONENT_TYPE_FIELDS,
    ...COMPONENT_SIZE_FIELDS,
    ...TYPE_FIELDS,
    ...COMPONENT_BUILD_FIELDS,
    ...COMPONENT_PASSPORT_FIELDS,
    ...COORD_FIELDS,
  ];

  // Старший уровень в поиске не участвует: он один на весь проект, и искать по
  // нему — это искать всё.
  const SEARCH_FIELDS = [
    ...COMPONENT_SEARCH_FIELDS_HEAD,
    ...locationLevels.slice(1).map(({ key, label }) => ({ key, label })),
    ...COMPONENT_SEARCH_FIELDS_TAIL,
  ];

  return { ...createFieldSets(fieldDefinitions), SEARCH_FIELDS };
}

/**
 * Единственные две вещи, без которых карточки не существует: номер, который её
 * опознаёт, и снимок, доказывающий, что железо видели.
 *
 * Всё остальное дозаполняется потом — стёртая или закрытая изоляцией табличка
 * не должна останавливать обход. Там, где форма утечки стережёт расчёт, эта
 * стережёт опознание и свидетельство, и больше ничего.
 */
export const COMPONENT_REQUIRED_FIELDS = ["component_uid", "photo"];
