import { getRepairDonePhoto, getRepairPhoto } from "@/domain/leakEvents";
import {
  deletePhotoIfUnreferenced,
  getOrphanedOriginalPhoto,
  resolveLeakRecord,
  startLeakRepair,
} from "@/domain/leakLifecycle";
import { replaceLeakInCollection } from "../utils/persistPhotoReplacements";
import { ignoredError } from "@/utils/ignoredError";

/**
 * Подтверждение устранения и начала починки из карточки.
 *
 * Отделено от сохранения правок: там про поля и снимки формы, здесь про один
 * переход состояния и уборку вытесненного снимка. Снимок ищется через ленту, а
 * не у вехи: после переезда веха пуста, и сравнение с ней всегда ложно.
 */
export function useLeakRepairConfirm({
  allLeaks,
  deletePhoto,
  historyUser,
  leak,
  onSave,
  reportSaveError,
  requireHistoryUser,
  setRepairOpen,
  setResolveOpen,
}) {
  const handleResolveConfirm = async ({
    photo_after,
    materials_equipment,
    note,
  }) => {
    if (!requireHistoryUser()) return;
    try {
      const next = resolveLeakRecord(
        leak,
        { photo_after, materials_equipment, note },
        { user: historyUser },
      );
      const nextData = replaceLeakInCollection(allLeaks, next);
      await onSave(next);
      setResolveOpen(false);
      if (
        getRepairDonePhoto(leak) &&
        getRepairDonePhoto(leak) !== photo_after
      ) {
        await deletePhotoIfUnreferenced(
          getRepairDonePhoto(leak),
          nextData,
          deletePhoto,
        ).catch(ignoredError("leakDetails.photoCleanup"));
      }
    } catch {
      if (photo_after && photo_after !== getRepairDonePhoto(leak)) {
        await deletePhotoIfUnreferenced(
          photo_after,
          allLeaks,
          deletePhoto,
        ).catch(ignoredError("leakDetails.photoCleanup"));
      }
      reportSaveError();
    }
  };

  const handleRepairConfirm = async ({
    photo_repair,
    materials_equipment,
    note,
  }) => {
    if (!requireHistoryUser()) return;
    const orphanedPhoto = getOrphanedOriginalPhoto(leak);
    try {
      const next = startLeakRepair(
        leak,
        { photo_repair, materials_equipment, note },
        { user: historyUser },
      );
      const nextData = replaceLeakInCollection(allLeaks, next);
      await onSave(next);
      setRepairOpen(false);
      if (getRepairPhoto(leak) && getRepairPhoto(leak) !== photo_repair) {
        await deletePhotoIfUnreferenced(
          getRepairPhoto(leak),
          nextData,
          deletePhoto,
        ).catch(ignoredError("leakDetails.photoCleanup"));
      }
      await deletePhotoIfUnreferenced(
        orphanedPhoto,
        nextData,
        deletePhoto,
      ).catch(ignoredError("leakDetails.photoCleanup"));
    } catch {
      if (photo_repair && photo_repair !== getRepairPhoto(leak)) {
        await deletePhotoIfUnreferenced(
          photo_repair,
          allLeaks,
          deletePhoto,
        ).catch(ignoredError("leakDetails.photoCleanup"));
      }
      reportSaveError();
    }
  };

  return { handleRepairConfirm, handleResolveConfirm };
}
