/**
 * Условия, которые должны сойтись, прежде чем архив вольют в существующий
 * проект.
 *
 * Вынесено из `importIntoExistingProject` отдельно, потому что это отказы, а
 * не работа: каждый из них останавливает импорт до первой записи, и читать их
 * надо списком, а не выуживая из трёхсот строк слияния. Все они бросают
 * исключение с `code` — вызывающая сторона по нему выбирает текст.
 */

import { appError } from "@/utils/appError";

function normalizeType(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function normalizeSyncId(value) {
  return value?.trim().toLowerCase() || null;
}

/**
 * Тип проекта у архива и у текущего проекта должен совпадать.
 *
 * Разные типы — это разные наборы полей и разные выгрузки; влить один в
 * другой значит молча потерять половину записанного.
 */
export function assertProjectTypesMatch(incomingMeta, existingProject) {
  const incomingProjectType = normalizeType(incomingMeta?.project?.type);
  const existingProjectType = normalizeType(existingProject.type);

  if (!incomingProjectType) {
    const error = appError(
      "PROJECT_TYPE_MISSING",
      "Не удалось определить тип проекта в импортируемом архиве",
    );
    error.existingProjectType = existingProjectType;
    throw error;
  }

  if (!existingProjectType) {
    const error = appError(
      "CURRENT_PROJECT_TYPE_MISSING",
      "Не удалось определить тип текущего проекта",
    );
    error.incomingProjectType = incomingProjectType;
    throw error;
  }

  if (incomingProjectType !== existingProjectType) {
    const error = appError(
      "PROJECT_TYPE_MISMATCH",
      "Тип импортируемого проекта не соответствует текущему проекту",
    );
    error.incomingProjectType = incomingProjectType;
    error.existingProjectType = existingProjectType;
    throw error;
  }

  return { incomingProjectType, existingProjectType };
}

/**
 * Разбирает, что делать с идентификатором синхронизации.
 *
 * Синхронизация идёт только между копиями одной базы, поэтому чужой
 * идентификатор — отказ, а не слияние. Перезапись, наоборот, забирает
 * идентификатор архива: она и означает «стать этой копией».
 *
 * @returns {{shouldAdoptSyncId: boolean, shouldReplaceSyncId: boolean}}
 */
export function resolveSyncIdDecision({
  mode,
  isSync,
  incomingMeta,
  existingProject,
  setProjectSyncId,
  replaceProjectSyncId,
}) {
  const incomingSyncId = normalizeSyncId(incomingMeta?.project?.syncId);
  const existingSyncId = normalizeSyncId(existingProject.syncId);

  if (
    isSync &&
    existingSyncId &&
    incomingSyncId &&
    incomingSyncId !== existingSyncId
  ) {
    throw appError(
      "ARCHIVE_OTHER_DATABASE",
      "Архив получен из другой базы данных",
    );
  }
  if (isSync && !existingSyncId && !incomingSyncId) {
    throw appError(
      "ARCHIVE_NO_SYNC_ID",
      "Архив не содержит идентификатор синхронизации",
    );
  }

  const shouldAdoptSyncId = Boolean(
    isSync && !existingSyncId && incomingSyncId,
  );
  const shouldReplaceSyncId =
    mode === "overwrite" &&
    Boolean(incomingSyncId) &&
    incomingSyncId !== existingSyncId;

  if (shouldAdoptSyncId && typeof setProjectSyncId !== "function") {
    throw appError(
      "SYNC_ID_SAVE_FAILED",
      "Не удалось сохранить идентификатор синхронизации",
    );
  }
  if (shouldReplaceSyncId && typeof replaceProjectSyncId !== "function") {
    throw appError(
      "SYNC_ID_REPLACE_FAILED",
      "Не удалось заменить идентификатор синхронизации",
    );
  }

  return { shouldAdoptSyncId, shouldReplaceSyncId };
}

/**
 * Что из архива берётся поверх местного, а что остаётся своим.
 *
 * Три режима расходятся именно здесь: перезапись берёт настройки и параметры
 * архива целиком, слияние — только если они свежее, а синхронизация сверяет
 * отметки времени с обеих сторон. Собрано в одном месте, потому что решение
 * читается только целиком: три условия про настройки, разбросанные по коду
 * слияния, невозможно сверить с тем, что должно получиться.
 */
export function resolveIncomingApplication({
  mode,
  isSync,
  incomingMeta,
  localSettings,
  localSyncState,
  shouldApplyIncomingProjectSettings,
}) {
  const incomingSyncState = incomingMeta?.sync;
  const incomingSettings = incomingMeta?.settings ?? null;
  const hasIncomingSettings = Boolean(incomingSettings);

  const shouldApplyIncomingVars = Boolean(
    isSync &&
    incomingMeta?.vars &&
    (incomingSyncState?.varsUpdatedAt ?? 0) > localSyncState.varsUpdatedAt,
  );

  const shouldApplyIncomingSettings = Boolean(
    mode === "overwrite" ||
    (hasIncomingSettings &&
      mode === "merge" &&
      incomingSettings.updatedAt > localSettings.updatedAt) ||
    (hasIncomingSettings &&
      isSync &&
      shouldApplyIncomingProjectSettings(localSettings, incomingSettings)),
  );

  return {
    incomingSyncState,
    incomingSettings,
    shouldApplyIncomingVars,
    shouldApplyIncomingSettings,
    // Параметры расчёта заменяются только целиком и только перезаписью:
    // смешивать плотности из двух проектов нельзя.
    vars: mode === "overwrite" ? (incomingMeta?.vars ?? null) : null,
  };
}
