import {
  beginImportOperation,
  completeImportOperation,
  updateImportOperation,
} from "@/services/importOperationJournal";

export async function runExcelImportTransaction({
  projectId,
  persistPhotos,
  commit,
  rollbackState,
  deletePhoto,
}) {
  let photoTransaction;
  let commitStarted = false;
  let operation = beginImportOperation(projectId);

  try {
    photoTransaction = await persistPhotos();
    operation = updateImportOperation(operation, {
      phase: "committing",
      createdPhotoPaths: photoTransaction?.createdPaths ?? [],
    });
    commitStarted = true;
    await commit(photoTransaction.leaks);
    completeImportOperation(operation);
    return photoTransaction.leaks;
  } catch (error) {
    const createdPaths =
      photoTransaction?.createdPaths ?? error.createdPhotoPaths ?? [];
    operation = updateImportOperation(operation, {
      phase: "rolling_back",
      createdPhotoPaths: createdPaths,
    });

    if (commitStarted) {
      try {
        await rollbackState();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        error.createdPhotoPaths = createdPaths;
        error.photosPreserved = true;
        throw error;
      }
    }

    if (typeof deletePhoto === "function") {
      const results = await Promise.allSettled(
        [...new Set(createdPaths)].map((path) => deletePhoto(path)),
      );
      const failed = results.filter(
        (result) => result.status === "rejected" || result.value !== true,
      );
      if (failed.length) error.photoRollbackErrors = failed;
    }
    if (!error.rollbackError && !error.photoRollbackErrors?.length) {
      completeImportOperation(operation);
    }
    throw error;
  }
}
