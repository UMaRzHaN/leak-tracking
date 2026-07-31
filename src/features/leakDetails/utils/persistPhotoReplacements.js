import { deletePhotoIfUnreferenced } from "@/domain/leakLifecycle";

export async function cleanupUncommittedPhotoReplacements({
  value,
  replacements,
  deletePhoto,
}) {
  const paths = new Set(
    replacements
      .filter(
        ([changed, previousPath, nextPath]) =>
          changed && nextPath && previousPath !== nextPath,
      )
      .map(([, , nextPath]) => nextPath),
  );

  for (const path of paths) {
    await deletePhotoIfUnreferenced(path, value, deletePhoto).catch(() => {});
  }
}

export async function persistPhotoReplacements({
  save,
  value,
  replacements,
  deletePhoto,
}) {
  await save(value);

  for (const [changed, previousPath, nextPath] of replacements) {
    if (changed && previousPath && previousPath !== nextPath) {
      await deletePhotoIfUnreferenced(previousPath, value, deletePhoto).catch(
        () => {},
      );
    }
  }
}
