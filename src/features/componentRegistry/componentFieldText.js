import { COMPONENT_HISTORY_ACTIONS } from "@/domain/componentHistory";
import { formatLeakDate } from "@/utils/locale";

/**
 * Подписи и значения полей компонента.
 *
 * Вынесено из листа карточки: тот про вкладки и вёрстку, а здесь только про
 * то, каким текстом показать ключ, значение и действие в истории.
 */
const DATE_KEYS = new Set(["date", "inspected_at", "installed_at"]);

/** Координаты живут на своей вкладке, а не среди паспортных величин. */
export const COORD_KEYS = new Set(["lat", "lng"]);

export function createActionLabel(t) {
  return (action) =>
    ({
      [COMPONENT_HISTORY_ACTIONS.CREATED]: t("components.historyCreated"),
      [COMPONENT_HISTORY_ACTIONS.EDITED]: t("components.historyEdited"),
      [COMPONENT_HISTORY_ACTIONS.INSPECTED]: t("components.historyInspected"),
    })[action] ?? action;
}

/*
 * Дата внесения и дата инспекции приходят со штампа — строкой ISO; дату
 * монтажа набирает человек в виде ДД.ММ.ГГГГ. formatLeakDate читает обе и
 * возвращает исходную строку, если разобрать её не вышло, — «Invalid Date»
 * в паспорте компонента говорит читающему меньше, чем то, что там написано.
 */
export function createFieldValue(lang) {
  return (key, value) =>
    DATE_KEYS.has(key)
      ? formatLeakDate(
          value,
          { day: "2-digit", month: "2-digit", year: "numeric" },
          lang,
        )
      : String(value);
}

/** Заголовок поля из объявления реестра, а не ключ из кода. */
export function createFieldLabel(fields) {
  return (key) => fields.find((field) => field.key === key)?.label ?? key;
}
