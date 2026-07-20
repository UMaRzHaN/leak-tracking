export async function persistPhotoReplacements({
  save,
  value,
  replacements,
  deletePhoto,
}) {
  await save(value);

  for (const [changed, previousPath, nextPath] of replacements) {
    if (changed && previousPath && previousPath !== nextPath) {
      await deletePhoto(previousPath).catch(() => {});
    }
  }
}
