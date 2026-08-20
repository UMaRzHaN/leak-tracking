/**
 * Что делать с отсканированным QR-кодом: синхронизировать или импортировать.
 *
 * Раньше это выбирал человек — двумя кнопками, до того как камера что-либо
 * увидела. Но выбор неверный ведёт не к своему результату, а к ошибке: кнопка
 * синхронизации отвергала чужую базу, кнопка импорта на своей же базе заводила
 * второй проект-двойник. Ответ целиком лежит в самом коде, который к этому
 * моменту уже прочитан.
 *
 * Признак — syncId: он опознаёт базу, а не проект, и переживает переименование.
 * Имя и тип остаются запасным вариантом для проектов, заведённых до появления
 * syncId, — у них его просто нет.
 */

export const SCAN_INTENT_SYNC = "sync";
export const SCAN_INTENT_IMPORT = "import";

function normalize(value) {
  return String(value ?? "").trim();
}

/** Ключ проекта в том же виде, в каком он попадает в QR-код. */
export function buildProjectKey(project) {
  return `${project?.type ?? "unknown"}:${project?.name?.trim().toLowerCase() ?? ""}`;
}

/**
 * @param {{syncId?: string, projectKey?: string}} connection данные из QR-кода
 * @param {{syncId?: string, type?: string, name?: string}|null} activeProject
 * @returns {"sync"|"import"}
 */
export function resolveScanIntent(connection, activeProject) {
  // Импортировать некуда и не с чем сливать: открытого проекта нет.
  if (!activeProject) return SCAN_INTENT_IMPORT;

  const activeSyncId = normalize(activeProject.syncId);
  const incomingSyncId = normalize(connection?.syncId);
  if (activeSyncId && incomingSyncId) {
    return activeSyncId === incomingSyncId
      ? SCAN_INTENT_SYNC
      : SCAN_INTENT_IMPORT;
  }

  // Проект без syncId — заведён до того, как он появился. Сравнивать остаётся
  // по типу и имени: не так надёжно, зато это всё, что о нём известно.
  const incomingKey = normalize(connection?.projectKey);
  if (!incomingKey) return SCAN_INTENT_IMPORT;
  return incomingKey === buildProjectKey(activeProject)
    ? SCAN_INTENT_SYNC
    : SCAN_INTENT_IMPORT;
}
