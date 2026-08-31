import { STORAGE_KEYS } from "@/app/project/storageKeys";

/**
 * Скрытые поля проекта — те, что человек убрал из формы и из выгрузки.
 *
 * Два независимых списка: у утечки и у карточки компонента имена полей
 * пересекаются (`location`, `object`, `component` есть и там и там), и общий
 * список скрывал бы поле разом на обоих экранах.
 *
 * Читается и вне React: колонки выгрузки реестра собираются в сервисе, куда
 * хук не дотянется.
 */
export const HIDDEN_FIELD_SCOPES = {
  LEAKS: "leaks",
  COMPONENTS: "components",
};

export function hiddenFieldsStorageKey(projectId, scope) {
  if (!projectId) return null;
  return scope === HIDDEN_FIELD_SCOPES.COMPONENTS
    ? STORAGE_KEYS.PROJECT_HIDDEN_COMPONENT_FIELDS(projectId)
    : STORAGE_KEYS.PROJECT_HIDDEN_FIELDS(projectId);
}

/**
 * @param {string|null} projectId
 * @param {string} [scope]
 * @returns {Set<string>}
 */
export function readHiddenFields(projectId, scope = HIDDEN_FIELD_SCOPES.LEAKS) {
  const key = hiddenFieldsStorageKey(projectId, scope);
  if (!key) return new Set();
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}
