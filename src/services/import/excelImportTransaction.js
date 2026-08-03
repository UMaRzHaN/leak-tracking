import {
  beginImportOperation,
  completeImportOperation,
  updateImportOperation,
} from "@/services/import/importOperationJournal";

const transactionWarnings = new WeakMap();

export function getExcelImportTransactionWarning(result) {
  return result && typeof result === "object"
    ? (transactionWarnings.get(result) ?? null)
    : null;
}

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
  } catch (error) {
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
  } catch (error) {
    error.importCode = "IMPORT_JOURNAL_WRITE_FAILED";
    error.createdPhotoPaths = createdPaths;
    operation = tryUpdateRollbackJournal(operation, createdPaths, error);
    await deleteCreatedPhotos(createdPaths, deletePhoto, error);
    tryCompleteRollbackJournal(operation, error);
    throw error;
  }

  try {
    await commit(photoTransaction.leaks);
  } catch (error) {
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
