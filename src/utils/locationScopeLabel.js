/**
 * Подпись выбранного места — та же, что в шапке: «Все», путь через «›» или
 * «Несколько мест». Экран экспорта (8a) показывает её у своей строки области,
 * и две разные подписи одного выбора путали бы.
 *
 * @param {any} locationScope результат `useLocationScope`
 * @param {(key: string) => string} t
 */
export function formatLocationScopeLabel(locationScope, t) {
  const name = (value) => value || t("locationScope.unnamed");
  if (locationScope?.path === null) {
    const selection = locationScope.selection;
    return selection
      ? [...selection.path, selection.values.map(name).join(", ")]
          .map(name)
          .join(" › ")
      : t("locationScope.several");
  }
  const path = locationScope?.path ?? [];
  return path.length === 0
    ? t("locationScope.all")
    : path.map(name).join(" › ");
}
