import { errorText } from "@/utils/appError";
import { useState, useCallback, useMemo } from "react";
import { hapticSuccess } from "@/utils/haptics";
import { useLanguage } from "@/app/hooks/useLanguage";
import {
  buildLeakCalculationParams,
  updateLeakCalculationParams,
} from "@/utils/calculationParams";

export function useBulkActions({
  data,
  setData,
  displayed,
  notify,
  userProfile,
  projectVars = {},
}) {
  const { t } = useLanguage();
  const historyUser = userProfile?.name?.trim() || undefined;
  const [selectedIds, setSelectedIds] = useState(() => new Set());
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
          t("database.paramsUpdateFailed", { message: errorText(error, t) }),
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
  };
}
