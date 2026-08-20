import { deletePhotoIfUnreferenced } from "@/domain/leakLifecycle";
import { ignoredError } from "@/utils/ignoredError";

export function replaceLeakInCollection(leaks, value) {
  if (!Array.isArray(leaks)) return value ? [value] : [];
  if (!value || typeof value !== "object") return [...leaks];

  let replaced = false;
  const next = leaks.map((leak) => {
    const matches =
      value.id != null
        ? leak?.id === value.id
        : leak === value ||
          (value.leak_id != null && leak?.leak_id === value.leak_id);
    if (!matches) return leak;
    replaced = true;
    return value;
  });

  return replaced ? next : [...next, value];
}

export async function cleanupUncommittedPhotoReplacements({
  referenceLeaks,
  value,
  replacements,
  deletePhoto,
}) {
  const references = Array.isArray(referenceLeaks)
    ? referenceLeaks
    : value
      ? [value]
      : [];
  const paths = new Set(
    replacements
      .filter(
        ([changed, previousPath, nextPath]) =>
          changed && nextPath && previousPath !== nextPath,
      )
      .map(([, , nextPath]) => nextPath),
  );

  for (const path of paths) {
    await deletePhotoIfUnreferenced(path, references, deletePhoto).catch(
      ignoredError("leakDetails.photoCleanup"),
    );
  }
}

export async function persistPhotoReplacements({
  save,
  value,
  referenceLeaks,
  replacements,
  deletePhoto,
}) {
  await save(value);

  const references = Array.isArray(referenceLeaks)
    ? referenceLeaks
    : value
      ? [value]
      : [];
  for (const [changed, previousPath, nextPath] of replacements) {
    if (changed && previousPath && previousPath !== nextPath) {
      await deletePhotoIfUnreferenced(
        previousPath,
        references,
        deletePhoto,
      ).catch(ignoredError("leakDetails.photoCleanup"));
    }
  }
}
