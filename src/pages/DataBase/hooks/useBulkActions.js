import { useState, useCallback, useMemo } from "react";
import { STATUS } from "@/utils/status";
import { hapticSuccess } from "@/utils/haptics";
import { useLanguage } from "@/app/hooks/useLanguage";
import { pluralRecords } from "@/pages/DataBase/pluralRecords";
import {
  changeLeakStatus,
  deletePhotoIfUnreferenced,
  getOrphanedOriginalPhoto,
  resolveLeakRecord,
  startLeakRepair,
} from "@/domain/leakLifecycle";
import {
  buildLeakCalculationParams,
  updateLeakCalculationParams,
} from "@/utils/calculationParams";
import { ignoredError } from "@/utils/ignoredError";

/** @type {(path: string) => Promise<void>} */
const noopDeletePhoto = async () => {};

export function useBulkActions({
  data,
  setData,
  displayed,
  notify,
  deletePhoto = noopDeletePhoto,
  userProfile,
  projectVars = {},
}) {
  const { t, intlLocale } = useLanguage();
  const historyUser = userProfile?.name?.trim() || undefined;
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [resolveQueue, setResolveQueue] = useState([]);
  const [resolveTotal, setResolveTotal] = useState(0);
  const [repairQueue, setRepairQueue] = useState([]);
  const [repairTotal, setRepairTotal] = useState(0);
  const requireHistoryUser = useCallback(() => {
    if (historyUser) return true;
    notify("error", t("database.fillUserName"));
    return false;
  }, [historyUser, notify, t]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const deselectId = useCallback((id) => {
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleSelected = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectDisplayed = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      displayed.forEach((item) => next.add(item.id));
      return next;
    });
  }, [displayed]);

  const bulkCalculationVars = useMemo(() => {
    const firstSelected = data.find((item) => selectedIds.has(item.id));
    return firstSelected
      ? buildLeakCalculationParams(firstSelected, projectVars)
      : projectVars;
  }, [data, projectVars, selectedIds]);

  const handleBulkCalculationSave = useCallback(
    async (calculationParams) => {
      if (!selectedIds.size) return;
      if (!requireHistoryUser()) return false;

      const now = Date.now();
      let changed = 0;
      const next = data.map((item) => {
        if (!selectedIds.has(item.id)) return item;
        const updated = updateLeakCalculationParams(
          item,
          projectVars,
          calculationParams,
          { user: historyUser, now },
        );
        if (updated !== item) changed += 1;
        return updated;
      });

      if (changed === 0) {
        notify("info", t("database.paramsAlreadyApplied"));
        clearSelection();
        return true;
      }

      try {
        await setData(next);
        hapticSuccess();
        notify("success", t("database.paramsUpdated", { changed }));
        clearSelection();
        return true;
      } catch (error) {
        notify(
          "error",
          t("database.paramsUpdateFailed", { message: error.message }),
        );
        return false;
      }
    },
    [
      clearSelection,
      data,
      historyUser,
      notify,
      projectVars,
      requireHistoryUser,
      selectedIds,
      setData,
      t,
    ],
  );

  const handleBulkStatusChange = useCallback(
    async (status) => {
      if (!selectedIds.size) return;
      if (!requireHistoryUser()) return;

      const affected = data.filter(
        (item) =>
          selectedIds.has(item.id) && (item.status ?? STATUS.OPEN) !== status,
      );
      if (affected.length === 0) {
        clearSelection();
        return;
      }

      if (status === STATUS.RESOLVED) {
        setResolveQueue(affected);
        setResolveTotal(affected.length);
        return;
      }

      if (status === STATUS.IN_PROGRESS) {
        setRepairQueue(affected);
        setRepairTotal(affected.length);
        return;
      }

      const orphanedPhotos = affected
        .map(getOrphanedOriginalPhoto)
        .filter(Boolean);
      const now = Date.now();
      const next = data.map((item) =>
        selectedIds.has(item.id) && (item.status ?? STATUS.OPEN) !== status
          ? changeLeakStatus(item, status, { user: historyUser, now })
          : item,
      );

      try {
        await setData(next);
        hapticSuccess();
        for (const path of orphanedPhotos) {
          await deletePhotoIfUnreferenced(path, next, deletePhoto).catch(
            ignoredError("database.photoCleanup"),
          );
        }
        notify(
          "success",
          t("database.bulk.statusChanged", {
            count: affected.length,
            records: pluralRecords(
              affected.length,
              t,
              intlLocale,
              "database.bulk.records",
            ),
          }),
        );
        clearSelection();
      } catch (err) {
        notify("error", t("database.bulk.saveError", { message: err.message }));
      }
    },
    [
      clearSelection,
      data,
      deletePhoto,
      historyUser,
      intlLocale,
      notify,
      requireHistoryUser,
      selectedIds,
      setData,
      t,
    ],
  );

  const handleSequentialResolveConfirm = useCallback(
    async ({ photo_after, materials_equipment, note }) => {
      const leak = resolveQueue[0];
      if (!leak) return;
      if (!requireHistoryUser()) return;

      const next = data.map((item) =>
        item.id === leak.id
          ? resolveLeakRecord(
              item,
              { photo_after, materials_equipment, note },
              { user: historyUser },
            )
          : item,
      );

      try {
        await setData(next);
        hapticSuccess();
        if (leak.photo_after && leak.photo_after !== photo_after) {
          await deletePhotoIfUnreferenced(
            leak.photo_after,
            next,
            deletePhoto,
          ).catch(ignoredError("database.photoCleanup"));
        }
      } catch (err) {
        if (photo_after && photo_after !== leak.photo_after) {
          await deletePhotoIfUnreferenced(photo_after, data, deletePhoto).catch(
            ignoredError("database.photoCleanup"),
          );
        }
        notify("error", t("database.bulk.saveError", { message: err.message }));
        return;
      }

      const remaining = resolveQueue.slice(1);
      setResolveQueue(remaining);
      if (remaining.length === 0) {
        notify(
          "success",
          t("database.bulk.resolved", {
            count: resolveTotal,
            records: pluralRecords(
              resolveTotal,
              t,
              intlLocale,
              "database.bulk.records",
            ),
          }),
        );
        clearSelection();
        setResolveTotal(0);
      }
    },
    [
      clearSelection,
      data,
      deletePhoto,
      historyUser,
      intlLocale,
      notify,
      requireHistoryUser,
      resolveQueue,
      resolveTotal,
      setData,
      t,
    ],
  );

  const handleSequentialRepairConfirm = useCallback(
    async ({ photo_repair, materials_equipment, note }) => {
      const leak = repairQueue[0];
      if (!leak) return;
      if (!requireHistoryUser()) return;

      const orphanedPhoto = getOrphanedOriginalPhoto(leak);
      const next = data.map((item) =>
        item.id === leak.id
          ? startLeakRepair(
              item,
              { photo_repair, materials_equipment, note },
              { user: historyUser },
            )
          : item,
      );

      try {
        await setData(next);
        hapticSuccess();
        if (leak.photo_repair && leak.photo_repair !== photo_repair) {
          await deletePhotoIfUnreferenced(
            leak.photo_repair,
            next,
            deletePhoto,
          ).catch(ignoredError("database.photoCleanup"));
        }
        await deletePhotoIfUnreferenced(orphanedPhoto, next, deletePhoto).catch(
          ignoredError("database.photoCleanup"),
        );
      } catch (err) {
        if (photo_repair && photo_repair !== leak.photo_repair) {
          await deletePhotoIfUnreferenced(
            photo_repair,
            data,
            deletePhoto,
          ).catch(ignoredError("database.photoCleanup"));
        }
        notify("error", t("database.bulk.saveError", { message: err.message }));
        return;
      }

      const remaining = repairQueue.slice(1);
      setRepairQueue(remaining);
      if (remaining.length === 0) {
        notify(
          "success",
          t("database.bulk.statusChanged", {
            count: repairTotal,
            records: pluralRecords(
              repairTotal,
              t,
              intlLocale,
              "database.bulk.records",
            ),
          }),
        );
        clearSelection();
        setRepairTotal(0);
      }
    },
    [
      clearSelection,
      data,
      deletePhoto,
      historyUser,
      intlLocale,
      notify,
      requireHistoryUser,
      repairQueue,
      repairTotal,
      setData,
      t,
    ],
  );

  const selectedCount = selectedIds.size;
  const allDisplayedSelected =
    displayed.length > 0 && displayed.every((item) => selectedIds.has(item.id));

  return {
    selectedIds,
    selectedCount,
    allDisplayedSelected,
    clearSelection,
    deselectId,
    toggleSelected,
    selectDisplayed,
    bulkCalculationVars,
    handleBulkCalculationSave,
    resolveQueue,
    resolveTotal,
    repairQueue,
    repairTotal,
    handleBulkStatusChange,
    handleSequentialResolveConfirm,
    handleSequentialRepairConfirm,
    cancelBulkResolve: () => {
      setResolveQueue([]);
      setResolveTotal(0);
    },
    cancelBulkRepair: () => {
      setRepairQueue([]);
      setRepairTotal(0);
    },
  };
}
