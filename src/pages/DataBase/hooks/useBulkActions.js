import { useState, useCallback } from "react";
import { STATUS } from "@/utils/status";
import { hapticSuccess } from "@/utils/haptics";
import { useLanguage } from "@/app/hooks/useLanguage";
import { buildLeakHistoryChanges } from "@/utils/historyChanges";

const STATUS_NOTE_FIELDS = [{ key: "materials_equipment" }, { key: "note" }];

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
  deletePhoto = () => Promise.resolve(),
}) {
  const { lang, t } = useLanguage();
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [resolveQueue, setResolveQueue] = useState([]);
  const [resolveTotal, setResolveTotal] = useState(0);

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

  const handleBulkStatusChange = useCallback(
    async (status) => {
      if (!selectedIds.size) return;

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

      const orphanedPhotos = affected
        .filter(
          (item) =>
            item.status === STATUS.RESOLVED && item.photo_after && item.photo,
        )
        .map((item) => item.photo);
      const now = new Date().toISOString();
      const next = data.map((item) =>
        selectedIds.has(item.id) && (item.status ?? STATUS.OPEN) !== status
          ? {
              ...item,
              ...(item.status === STATUS.RESOLVED
                ? { photo: item.photo_after ?? item.photo, photo_after: null }
                : {}),
              status,
              updatedAt: Date.now(),
              history: [
                ...(item.history ?? []),
                { action: "status_changed", to: status, date: now },
              ],
            }
          : item,
      );

      try {
        await setData(next);
        hapticSuccess();
        for (const path of orphanedPhotos) deletePhoto(path).catch(() => {});
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
    [clearSelection, data, deletePhoto, lang, notify, selectedIds, setData, t],
  );

  const handleSequentialResolveConfirm = useCallback(
    async ({ photo_after, materials_equipment, note }) => {
      const leak = resolveQueue[0];
      if (!leak) return;

      const now = new Date().toISOString();
      const next = data.map((item) =>
        item.id === leak.id
          ? (() => {
              const after = {
                ...item,
                status: STATUS.RESOLVED,
                resolvedAt: Date.now(),
                ...(photo_after != null && { photo_after }),
                ...(materials_equipment != null && { materials_equipment }),
                ...(note != null && { note }),
                updatedAt: Date.now(),
              };
              const changes = buildLeakHistoryChanges({
                before: item,
                after,
                fields: STATUS_NOTE_FIELDS,
              });
              return {
                ...after,
                history: [
                  ...(item.history ?? []),
                  {
                    action: "status_changed",
                    to: STATUS.RESOLVED,
                    date: now,
                    ...(changes.length > 0 ? { changes } : {}),
                  },
                ],
              };
            })()
          : item,
      );

      try {
        await setData(next);
        hapticSuccess();
      } catch (err) {
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
      lang,
      notify,
      resolveQueue,
      resolveTotal,
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
    resolveQueue,
    resolveTotal,
    handleBulkStatusChange,
    handleSequentialResolveConfirm,
    cancelBulkResolve: () => {
      setResolveQueue([]);
      setResolveTotal(0);
    },
  };
}
