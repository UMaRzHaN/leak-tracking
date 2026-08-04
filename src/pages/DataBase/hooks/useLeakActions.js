import { useState, useCallback } from "react";
import { STATUS } from "@/utils/status";
import { hapticSuccess } from "@/utils/haptics";
import { buildReopenedLeak } from "@/utils/reopenLeak";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import {
  changeLeakStatus,
  deleteLeakPhotosIfUnreferenced,
  deletePhotoIfUnreferenced,
  getOrphanedOriginalPhoto,
  resolveLeakRecord,
  startLeakRepair,
} from "@/domain/leakLifecycle";

/** @type {(path: string) => Promise<void>} */
const noopDeletePhoto = async () => {};

export function useLeakActions({
  data,
  setData,
  notify,
  deletePhoto = noopDeletePhoto,
  userProfile,
}) {
  const [activeLeak, setActiveLeak] = useState(null);
  const [pickerLeak, setPickerLeak] = useState(null);
  const [resolveLeak, setResolveLeak] = useState(null);
  const [repairLeak, setRepairLeak] = useState(null);
  const [reopenLeak, setReopenLeak] = useState(null);
  const { t } = useLanguage();
  const { activeProject } = useProjectData();
  const { vars } = useProjectVars(activeProject?.id ?? null);
  const historyUser = userProfile?.name?.trim() || undefined;
  const requireHistoryUser = useCallback(() => {
    if (historyUser) return true;
    notify("error", t("database.fillUserName"));
    return false;
  }, [historyUser, notify, t]);

  const handlePickStatus = useCallback(
    (leak) => {
      if (!requireHistoryUser()) return;
      setPickerLeak(leak);
    },
    [requireHistoryUser],
  );

  const handleStatusSelect = useCallback(
    async (newStatus) => {
      const leak = pickerLeak;
      setPickerLeak(null);
      if (!leak || newStatus === leak.status) return;
      if (!requireHistoryUser()) return;

      if (newStatus === STATUS.RESOLVED) {
        setResolveLeak(leak);
        return;
      }

      if (newStatus === STATUS.IN_PROGRESS) {
        setRepairLeak(leak);
        return;
      }

      if (newStatus === STATUS.OPEN && leak.status === STATUS.RESOLVED) {
        setReopenLeak(leak);
        return;
      }

      const orphanedPhoto = getOrphanedOriginalPhoto(leak);
      try {
        // Inside the try: the lifecycle rejects a transition that skips a
        // step, and that rejection belongs in a notification like any other
        // failure rather than escaping as an unhandled rejection.
        const next = data.map((r) =>
          r.id === leak.id
            ? changeLeakStatus(r, newStatus, { user: historyUser })
            : r,
        );
        await setData(next);
        hapticSuccess();
        await deletePhotoIfUnreferenced(orphanedPhoto, next, deletePhoto).catch(
          () => {},
        );
      } catch (err) {
        notify("error", t("common.saveError", { message: err.message }));
      }
    },
    [
      data,
      deletePhoto,
      historyUser,
      notify,
      pickerLeak,
      requireHistoryUser,
      setData,
      t,
    ],
  );

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
        if (leak.photo_after && leak.photo_after !== photo_after) {
          await deletePhotoIfUnreferenced(
            leak.photo_after,
            next,
            deletePhoto,
          ).catch(() => {});
        }
      } catch (err) {
        if (photo_after && photo_after !== leak.photo_after) {
          deletePhotoIfUnreferenced(photo_after, data, deletePhoto).catch(
            () => {},
          );
        }
        notify("error", t("common.saveError", { message: err.message }));
      }
    },
    [
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
        if (leak.photo_repair && leak.photo_repair !== photo_repair) {
          await deletePhotoIfUnreferenced(
            leak.photo_repair,
            next,
            deletePhoto,
          ).catch(() => {});
        }
        await deletePhotoIfUnreferenced(orphanedPhoto, next, deletePhoto).catch(
          () => {},
        );
      } catch (err) {
        if (photo_repair && photo_repair !== leak.photo_repair) {
          deletePhotoIfUnreferenced(photo_repair, data, deletePhoto).catch(
            () => {},
          );
        }
        notify("error", t("common.saveError", { message: err.message }));
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
      t,
    ],
  );

  const handleReopenConfirm = useCallback(
    async (draft) => {
      const leak = reopenLeak;
      if (!leak) return;
      if (!requireHistoryUser()) return;

      const orphanedPhoto = getOrphanedOriginalPhoto(leak);
      const next = data.map((r) =>
        r.id === leak.id
          ? buildReopenedLeak({ leak: r, draft, vars, user: historyUser })
          : r,
      );

      try {
        await setData(next, { optimistic: false });
        setReopenLeak(null);
        hapticSuccess();
        await deletePhotoIfUnreferenced(orphanedPhoto, next, deletePhoto).catch(
          () => {},
        );
      } catch (err) {
        notify("error", t("common.saveError", { message: err.message }));
      }
    },
    [
      data,
      deletePhoto,
      historyUser,
      notify,
      reopenLeak,
      requireHistoryUser,
      setData,
      t,
      vars,
    ],
  );

  const handleSave = useCallback(
    async (updated, options) => {
      const next = data.map((r) => (r.id === updated.id ? updated : r));
      try {
        await setData(next, options);
        hapticSuccess();
        setActiveLeak(null);
      } catch (err) {
        notify("error", t("common.saveError", { message: err.message }));
        throw err;
      }
    },
    [data, notify, setData, t],
  );

  const handleDelete = useCallback(
    async (id, options = {}) => {
      const { onDeleted } = /** @type {{onDeleted?: Function}} */ (options);
      const target = data.find((r) => r.id === id);
      const next = data.filter((r) => r.id !== id);
      try {
        await setData(next);
        hapticSuccess();
        setActiveLeak(null);
        onDeleted?.(id);
        await deleteLeakPhotosIfUnreferenced(target, next, deletePhoto).catch(
          () => {},
        );
      } catch (err) {
        notify("error", t("common.deleteError", { message: err.message }));
      }
    },
    [data, deletePhoto, notify, setData, t],
  );

  return {
    activeLeak,
    setActiveLeak,
    pickerLeak,
    setPickerLeak,
    resolveLeak,
    setResolveLeak,
    repairLeak,
    setRepairLeak,
    reopenLeak,
    setReopenLeak,
    vars,
    handlePickStatus,
    handleStatusSelect,
    handleResolveConfirm,
    handleRepairConfirm,
    handleReopenConfirm,
    handleSave,
    handleDelete,
  };
}
