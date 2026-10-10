import { errorText } from "@/utils/appError";
import { useState, useCallback, useMemo } from "react";
import { hapticSuccess } from "@/utils/haptics";
import { useLanguage } from "@/app/hooks/useLanguage";
import {
  buildLeakCalculationParams,
  updateLeakCalculationParams,
  findCalculationBlocker,
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

  /*
   * Правило одно на все массовые действия: они применяются к выбранным И
   * видимым. Выбор, скрытый фильтром, сохраняется — сменили отбор, вернулись,
   * и он на месте, — но действовать вслепую по записям, которых человек не
   * видит, нельзя. Сколько таких, говорит плашка у панели действий.
   */
  const actionableIds = useMemo(
    () =>
      new Set(
        displayed
          .filter((item) => selectedIds.has(item.id))
          .map((item) => item.id),
      ),
    [displayed, selectedIds],
  );
  const hiddenSelectedCount = selectedIds.size - actionableIds.size;

  /** Снимает с выбора только то, к чему действие применилось. */
  const clearActionable = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      actionableIds.forEach((id) => next.delete(id));
      return next;
    });
  }, [actionableIds]);

  const bulkCalculationVars = useMemo(() => {
    const firstSelected = data.find((item) => actionableIds.has(item.id));
    return firstSelected
      ? buildLeakCalculationParams(firstSelected, projectVars)
      : projectVars;
  }, [actionableIds, data, projectVars]);

  const handleBulkCalculationSave = useCallback(
    async (calculationParams) => {
      if (!actionableIds.size) return;
      if (!requireHistoryUser()) return false;

      // Параметры одни на все выбранные: вне допустимых значений расчёт
      // молча вернул бы записи с прежними выбросами, а счётчик назвал бы их
      // пересчитанными.
      const selected = data.filter((item) => actionableIds.has(item.id));
      if (
        selected.some(
          (item) =>
            findCalculationBlocker(item, projectVars, calculationParams)
              ?.key === "params",
        )
      ) {
        notify("error", t("database.paramsInvalid"));
        return false;
      }

      const now = Date.now();
      let changed = 0;
      const next = data.map((item) => {
        if (!actionableIds.has(item.id)) return item;
        // Розовому мешку нужны давление и температура записи: где их нет,
        // запись остаётся как была и в «изменено» не считается.
        if (findCalculationBlocker(item, projectVars, calculationParams)) {
          return item;
        }
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
        clearActionable();
        return true;
      }

      try {
        await setData(next);
        hapticSuccess();
        notify("success", t("database.paramsUpdated", { changed }));
        clearActionable();
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
      actionableIds,
      clearActionable,
      data,
      historyUser,
      notify,
      projectVars,
      requireHistoryUser,
      setData,
      t,
    ],
  );

  const allDisplayedSelected =
    displayed.length > 0 && displayed.every((item) => selectedIds.has(item.id));
  const actionableSelected = useMemo(
    () => displayed.filter((item) => actionableIds.has(item.id)),
    [actionableIds, displayed],
  );

  return {
    selectedIds,
    // Счётчик панели — то, к чему применится действие; скрытые — отдельно.
    selectedCount: actionableIds.size,
    hiddenSelectedCount,
    actionableSelected,
    clearActionable,
    allDisplayedSelected,
    clearSelection,
    deselectId,
    toggleSelected,
    selectDisplayed,
    bulkCalculationVars,
    handleBulkCalculationSave,
  };
}
