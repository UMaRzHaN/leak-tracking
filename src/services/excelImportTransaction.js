export async function runExcelImportTransaction({
  persistPhotos,
  commit,
  rollbackState,
  deletePhoto,
}) {
  let photoTransaction;
  let commitStarted = false;

  try {
    photoTransaction = await persistPhotos();
    commitStarted = true;
    await commit(photoTransaction.leaks);
    return photoTransaction.leaks;
  } catch (error) {
    const createdPaths =
      photoTransaction?.createdPaths ?? error.createdPhotoPaths ?? [];

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
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length) error.photoRollbackErrors = failed;
    }
    throw error;
  }
}
