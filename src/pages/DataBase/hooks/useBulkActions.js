import { useState, useCallback, useMemo } from "react";
import { STATUS } from "@/utils/status";
import { hapticSuccess } from "@/utils/haptics";
import { useLanguage } from "@/app/hooks/useLanguage";
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

/** @type {(path: string) => Promise<void>} */
const noopDeletePhoto = async () => {};

function pluralLeaks(n, lang) {
  if (lang !== "ru") {
    return n === 1 ? "record" : "records";
  }

  if (n % 10 === 1 && n % 100 !== 11) return "запись";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) {
    return "записи";
  }
  return "записей";
}

export function useBulkActions({
  data,
  setData,
  displayed,
  notify,
  deletePhoto = noopDeletePhoto,
  userProfile,
  projectVars = {},
}) {
  const { lang, t } = useLanguage();
  const historyUser = userProfile?.name?.trim() || undefined;
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [resolveQueue, setResolveQueue] = useState([]);
  const [resolveTotal, setResolveTotal] = useState(0);
  const [repairQueue, setRepairQueue] = useState([]);
  const [repairTotal, setRepairTotal] = useState(0);
  const requireHistoryUser = useCallback(() => {
    if (historyUser) return true;
    notify(
      "error",
      lang === "ru"
        ? "Заполните имя пользователя в профиле"
        : "Fill in the user name in the profile",
    );
    return false;
  }, [historyUser, lang, notify]);

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
        notify(
          "info",
          lang === "ru"
            ? "Выбранные параметры уже применены"
            : "Selected parameters are already applied",
        );
        clearSelection();
        return true;
      }

      try {
        await setData(next);
        hapticSuccess();
        notify(
          "success",
          lang === "ru"
            ? `Параметры и расчёты обновлены: ${changed}`
            : `Parameters and calculations updated: ${changed}`,
        );
        clearSelection();
        return true;
      } catch (error) {
        notify(
          "error",
          lang === "ru"
            ? `Не удалось обновить параметры: ${error.message}`
            : `Failed to update parameters: ${error.message}`,
        );
        return false;
      }
    },
    [
      clearSelection,
      data,
      historyUser,
      lang,
      notify,
      projectVars,
      requireHistoryUser,
      selectedIds,
      setData,
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
            () => {},
          );
        }
        notify(
          "success",
          t("database.bulk.statusChanged", {
            defaultValue: `Status changed for ${affected.length} ${pluralLeaks(
              affected.length,
              lang,
            )}`,
          }),
        );
        clearSelection();
      } catch (err) {
        notify(
          "error",
          t("database.bulk.saveError", {
            defaultValue: `Save error: ${err.message}`,
          }),
        );
      }
    },
    [
      clearSelection,
      data,
      deletePhoto,
      historyUser,
      lang,
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
          ).catch(() => {});
        }
      } catch (err) {
        if (photo_after && photo_after !== leak.photo_after) {
          await deletePhotoIfUnreferenced(photo_after, data, deletePhoto).catch(
            () => {},
          );
        }
        notify(
          "error",
          t("database.bulk.saveError", {
            defaultValue: `Save error: ${err.message}`,
          }),
        );
        return;
      }

      const remaining = resolveQueue.slice(1);
      setResolveQueue(remaining);
      if (remaining.length === 0) {
        notify(
          "success",
          t("database.bulk.resolved", {
            defaultValue: `Resolved ${resolveTotal} ${pluralLeaks(
              resolveTotal,
              lang,
            )}`,
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
      lang,
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
          ).catch(() => {});
        }
        await deletePhotoIfUnreferenced(orphanedPhoto, next, deletePhoto).catch(
          () => {},
        );
      } catch (err) {
        if (photo_repair && photo_repair !== leak.photo_repair) {
          await deletePhotoIfUnreferenced(
            photo_repair,
            data,
            deletePhoto,
          ).catch(() => {});
        }
        notify(
          "error",
          t("database.bulk.saveError", {
            defaultValue: `Save error: ${err.message}`,
          }),
        );
        return;
      }

      const remaining = repairQueue.slice(1);
      setRepairQueue(remaining);
      if (remaining.length === 0) {
        notify(
          "success",
          t("database.bulk.statusChanged", {
            defaultValue: `Status changed for ${repairTotal} ${pluralLeaks(
              repairTotal,
              lang,
            )}`,
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
      lang,
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
