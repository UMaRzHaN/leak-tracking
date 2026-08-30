import {
  beginImportOperation,
  completeImportOperation,
  updateImportOperation,
} from "@/services/import/importOperationJournal";
import { asError } from "@/utils/appError";

const transactionWarnings = new WeakMap();

export function getExcelImportTransactionWarning(result) {
  return result && typeof result === "object"
    ? (transactionWarnings.get(result) ?? null)
    : null;
}

/**
 * Ошибка импорта с тем, что налипло на неё по дороге.
 *
 * Откат дописывает следы своей работы на саму ошибку: что не удалось откатить,
 * какие фото остались лежать, что случилось с журналом. Читают это на экране
 * настроек, чтобы человек знал, в каком состоянии остался проект.
 *
 * @typedef {Error & {
 *   importCode?: string,
 *   createdPhotoPaths?: string[],
 *   photosPreserved?: boolean,
 *   rollbackError?: unknown,
 *   photoRollbackErrors?: unknown[],
 *   journalRollbackError?: unknown,
 *   journalCompletionError?: unknown,
 * }} ImportFailure
 */

/** @param {ImportFailure} rootError */
async function deleteCreatedPhotos(paths, deletePhoto, rootError) {
  if (typeof deletePhoto !== "function") return;
  const uniquePaths = [...new Set(paths)];
  const results = await Promise.allSettled(
    uniquePaths.map((path) => deletePhoto(path)),
  );
  const failed = results.filter(
    (result) => result.status === "rejected" || result.value !== true,
  );
  if (failed.length) rootError.photoRollbackErrors = failed;
}

/** @param {ImportFailure} rootError */
function tryUpdateRollbackJournal(operation, createdPaths, rootError) {
  try {
    return updateImportOperation(operation, {
      phase: "rolling_back",
      createdPhotoPaths: createdPaths,
    });
  } catch (journalError) {
    rootError.journalRollbackError = journalError;
    return operation;
  }
}

/** @param {ImportFailure} rootError */
function tryCompleteRollbackJournal(operation, rootError) {
  if (rootError.rollbackError || rootError.photoRollbackErrors?.length) return;
  try {
    completeImportOperation(operation);
  } catch (journalError) {
    rootError.journalCompletionError = journalError;
  }
}

export async function runExcelImportTransaction({
  projectId,
  persistPhotos,
  commit,
  rollbackState,
  deletePhoto,
}) {
  // This is intentionally outside every mutation block. If the journal cannot
  // be created, the import must fail before a photo or project record changes.
  let operation = beginImportOperation(projectId);
  let photoTransaction;

  try {
    photoTransaction = await persistPhotos();
  } catch (caught) {
    const error = /** @type {ImportFailure} */ (asError(caught));
    const createdPaths = error.createdPhotoPaths ?? [];
    operation = tryUpdateRollbackJournal(operation, createdPaths, error);
    await deleteCreatedPhotos(createdPaths, deletePhoto, error);
    tryCompleteRollbackJournal(operation, error);
    throw error;
  }

  const createdPaths = photoTransaction?.createdPaths ?? [];
  try {
    operation = updateImportOperation(operation, {
      phase: "committing",
      createdPhotoPaths: createdPaths,
    });
  } catch (caught) {
    const error = /** @type {ImportFailure} */ (asError(caught));
    error.importCode = "IMPORT_JOURNAL_WRITE_FAILED";
    error.createdPhotoPaths = createdPaths;
    operation = tryUpdateRollbackJournal(operation, createdPaths, error);
    await deleteCreatedPhotos(createdPaths, deletePhoto, error);
    tryCompleteRollbackJournal(operation, error);
    throw error;
  }

  try {
    await commit(photoTransaction.leaks);
  } catch (caught) {
    const error = /** @type {ImportFailure} */ (asError(caught));
    operation = tryUpdateRollbackJournal(operation, createdPaths, error);
    try {
      await rollbackState();
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
      error.createdPhotoPaths = createdPaths;
      error.photosPreserved = true;
      throw error;
    }

    await deleteCreatedPhotos(createdPaths, deletePhoto, error);
    tryCompleteRollbackJournal(operation, error);
    throw error;
  }

  try {
    completeImportOperation(operation);
  } catch (journalError) {
    // The project commit is already durable. Rolling it back here would turn a
    // journal cleanup failure into data loss. Keep the journal for recovery and
    // surface a non-fatal warning alongside the committed result.
    transactionWarnings.set(photoTransaction.leaks, {
      code: "IMPORT_JOURNAL_COMPLETION_FAILED",
      error: journalError,
      operation,
    });
  }

  return photoTransaction.leaks;
}

/**
 * Чем закончился откат — приписка к сообщению об ошибке.
 *
 * Человеку мало знать, что импорт не удался: ему нужно знать, в каком
 * состоянии остался проект. Не удалось ли откатить записи, остались ли лежать
 * фото. Три места на экране настроек собирали эту приписку одинаково, каждое
 * своей строкой.
 *
 * @param {unknown} caught
 * @returns {string} пустая строка, когда откатывать было нечего
 */
export function importRollbackNote(caught) {
  const error = /** @type {ImportFailure} */ (asError(caught));
  const rollback = error.rollbackError
    ? `; rollback: ${asError(error.rollbackError).message}`
    : "";
  const photos = error.photoRollbackErrors?.length
    ? `; photo rollback: ${error.photoRollbackErrors.length}`
    : "";
  return `${rollback}${photos}`;
}
