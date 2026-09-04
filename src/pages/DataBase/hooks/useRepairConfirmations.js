import { useCallback } from "react";
import { errorText } from "@/utils/appError";
import { hapticSuccess } from "@/utils/haptics";
import { ignoredError } from "@/utils/ignoredError";
import { getRepairDonePhoto, getRepairPhoto } from "@/domain/leakEvents";
import {
  deletePhotoIfUnreferenced,
  getOrphanedOriginalPhoto,
  resolveLeakRecord,
  startLeakRepair,
} from "@/domain/leakLifecycle";

/**
 * Подтверждение устранения и начала починки из базы.
 *
 * Отделено от остальных действий над записью: здесь всё про один переход —
 * записать событие и убрать снимок, который он вытеснил. Вытесненный снимок
 * ищется через ленту: веха у записи после переезда пуста, и сравнение с ней
 * всегда ложно.
 */
export function useRepairConfirmations({
  data,
  deletePhoto,
  historyUser,
  notify,
  repairLeak,
  requireHistoryUser,
  resolveLeak,
  setData,
  setRepairLeak,
  setResolveLeak,
  t,
}) {
  const handleResolveConfirm = useCallback(
    async ({ photo_after, materials_equipment, note }) => {
      const leak = resolveLeak;
      if (!leak) return;
      if (!requireHistoryUser()) return;

      const next = data.map((r) =>
        r.id === leak.id
          ? resolveLeakRecord(
              r,
              { photo_after, materials_equipment, note },
              { user: historyUser },
            )
          : r,
      );
      try {
        await setData(next);
        setResolveLeak(null);
        hapticSuccess();
        // Прежний снимок спрашивается у ленты: веха больше не пишется, и
        // сравнение с ней объявляло бы заменённым то, чего на записи нет.
        if (
          getRepairDonePhoto(leak) &&
          getRepairDonePhoto(leak) !== photo_after
        ) {
          await deletePhotoIfUnreferenced(
            getRepairDonePhoto(leak),
            next,
            deletePhoto,
          ).catch(ignoredError("database.photoCleanup"));
        }
      } catch (err) {
        if (photo_after && photo_after !== getRepairDonePhoto(leak)) {
          deletePhotoIfUnreferenced(photo_after, data, deletePhoto).catch(
            ignoredError("database.photoCleanup"),
          );
        }
        notify("error", t("common.saveError", { message: errorText(err, t) }));
      }
    },
    [
      setResolveLeak,
      data,
      deletePhoto,
      historyUser,
      notify,
      requireHistoryUser,
      resolveLeak,
      setData,
      t,
    ],
  );

  const handleRepairConfirm = useCallback(
    async ({ photo_repair, materials_equipment, note }) => {
      const leak = repairLeak;
      if (!leak) return;
      if (!requireHistoryUser()) return;

      const orphanedPhoto = getOrphanedOriginalPhoto(leak);
      const next = data.map((r) =>
        r.id === leak.id
          ? startLeakRepair(
              r,
              { photo_repair, materials_equipment, note },
              { user: historyUser },
            )
          : r,
      );
      try {
        await setData(next);
        setRepairLeak(null);
        hapticSuccess();
        if (getRepairPhoto(leak) && getRepairPhoto(leak) !== photo_repair) {
          await deletePhotoIfUnreferenced(
            getRepairPhoto(leak),
            next,
            deletePhoto,
          ).catch(ignoredError("database.photoCleanup"));
        }
        await deletePhotoIfUnreferenced(orphanedPhoto, next, deletePhoto).catch(
          ignoredError("database.photoCleanup"),
        );
      } catch (err) {
        if (photo_repair && photo_repair !== getRepairPhoto(leak)) {
          deletePhotoIfUnreferenced(photo_repair, data, deletePhoto).catch(
            ignoredError("database.photoCleanup"),
          );
        }
        notify("error", t("common.saveError", { message: errorText(err, t) }));
      }
    },
    [
      data,
      deletePhoto,
      historyUser,
      notify,
      repairLeak,
      requireHistoryUser,
      setData,
      setRepairLeak,
      t,
    ],
  );

  return { handleRepairConfirm, handleResolveConfirm };
}
