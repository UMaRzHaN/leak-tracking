import { useState, useCallback } from "react";
import { STATUS } from "../../../utils/status";
import { hapticSuccess } from "../../../utils/haptics";

function pluralLeaks(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "запись";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "записи";
  return "записей";
}

export function useBulkActions({ data, setData, save, displayed, notify, deletePhoto = () => Promise.resolve() }) {
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
      displayed.forEach((l) => next.add(l.id));
      return next;
    });
  }, [displayed]);

  const handleBulkStatusChange = useCallback(
    async (status) => {
      if (!selectedIds.size) return;

      if (status === STATUS.RESOLVED) {
        const affected = data.filter((item) => selectedIds.has(item.id));
        setResolveQueue(affected);
        setResolveTotal(affected.length);
        return;
      }

      const affected = data.filter((item) => selectedIds.has(item.id));
      for (const item of affected) {
        if (item.status === STATUS.RESOLVED && item.photo_after) {
          deletePhoto(item.photo_after).catch(() => {});
        }
      }
      const now = new Date().toISOString();
      const next = data.map((item) =>
        selectedIds.has(item.id)
          ? {
              ...item,
              ...(item.status === STATUS.RESOLVED ? { photo: item.photo_after ?? item.photo, photo_after: null } : {}),
              status,
              updatedAt: Date.now(),
              history: [...(item.history ?? []), { action: "status_changed", to: status, date: now }],
            }
          : item,
      );

      try {
        setData(next);
        await save(next);
        hapticSuccess();
        notify("success", `Статус изменён у ${affected.length} ${pluralLeaks(affected.length)}`);
        clearSelection();
      } catch (err) {
        notify("error", "Ошибка сохранения: " + err.message);
      }
    },
    [clearSelection, data, deletePhoto, notify, save, selectedIds, setData],
  );

  const handleSequentialResolveConfirm = useCallback(
    async ({ photo_after, materials_equipment, note }) => {
      const leak = resolveQueue[0];
      if (!leak) return;

      const now = new Date().toISOString();
      const next = data.map((item) =>
        item.id === leak.id
          ? {
              ...item,
              status: STATUS.RESOLVED,
              resolvedAt: Date.now(),
              ...(photo_after != null && { photo_after }),
              ...(materials_equipment != null && { materials_equipment }),
              ...(note != null && { note }),
              updatedAt: Date.now(),
              history: [...(item.history ?? []), { action: "status_changed", to: STATUS.RESOLVED, date: now }],
            }
          : item,
      );

      try {
        setData(next);
        await save(next);
        hapticSuccess();
      } catch (err) {
        notify("error", "Ошибка сохранения: " + err.message);
        return;
      }

      const remaining = resolveQueue.slice(1);
      setResolveQueue(remaining);
      if (remaining.length === 0) {
        notify("success", `Устранено ${resolveTotal} ${pluralLeaks(resolveTotal)}`);
        clearSelection();
        setResolveTotal(0);
      }
    },
    [clearSelection, data, notify, resolveQueue, resolveTotal, save, setData],
  );

  const selectedCount = selectedIds.size;
  const allDisplayedSelected = displayed.length > 0 && displayed.every((l) => selectedIds.has(l.id));

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
    cancelBulkResolve: () => { setResolveQueue([]); setResolveTotal(0); },
  };
}
