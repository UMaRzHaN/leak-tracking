import { useState, useCallback } from "react";
import { STATUS } from "../../../utils/status";
import { hapticSuccess } from "../../../utils/haptics";

export function useLeakActions({ data, setData, save, notify, deletePhoto = () => Promise.resolve() }) {
  const [activeLeak, setActiveLeak] = useState(null);
  const [pickerLeak, setPickerLeak] = useState(null);
  const [resolveLeak, setResolveLeak] = useState(null);

  const handlePickStatus = useCallback((leak) => setPickerLeak(leak), []);

  const handleStatusSelect = useCallback(
    async (newStatus) => {
      const leak = pickerLeak;
      setPickerLeak(null);
      if (!leak || newStatus === leak.status) return;

      if (newStatus === STATUS.RESOLVED) {
        setResolveLeak(leak);
        return;
      }

      if (leak.status === STATUS.RESOLVED && leak.photo_after) {
        deletePhoto(leak.photo_after).catch(() => {});
      }
      const next = data.map((r) =>
        r.id === leak.id
          ? {
              ...r,
              ...(r.status === STATUS.RESOLVED ? { photo: r.photo_after ?? r.photo, photo_after: null } : {}),
              status: newStatus,
              updatedAt: Date.now(),
              history: [...(r.history ?? []), { action: "status_changed", to: newStatus, date: new Date().toISOString() }],
            }
          : r,
      );
      try {
        setData(next);
        await save(next);
        hapticSuccess();
      } catch (err) {
        notify("error", "Ошибка сохранения: " + err.message);
      }
    },
    [data, deletePhoto, notify, pickerLeak, save, setData],
  );

  const handleResolveConfirm = useCallback(
    async ({ photo_after, materials_equipment, note }) => {
      const leak = resolveLeak;
      setResolveLeak(null);
      if (!leak) return;

      const now = new Date().toISOString();
      const next = data.map((r) =>
        r.id === leak.id
          ? {
              ...r,
              status: STATUS.RESOLVED,
              resolvedAt: Date.now(),
              photo_after: photo_after ?? r.photo_after,
              materials_equipment: materials_equipment ?? r.materials_equipment,
              note: note ?? r.note,
              updatedAt: Date.now(),
              history: [...(r.history ?? []), { action: "status_changed", to: STATUS.RESOLVED, date: now }],
            }
          : r,
      );
      try {
        setData(next);
        await save(next);
        hapticSuccess();
      } catch (err) {
        notify("error", "Ошибка сохранения: " + err.message);
      }
    },
    [data, notify, resolveLeak, save, setData],
  );

  const handleSave = useCallback(
    async (updated) => {
      const next = data.map((r) => (r.id === updated.id ? updated : r));
      try {
        setData(next);
        await save(next);
        hapticSuccess();
        setActiveLeak(null);
      } catch (err) {
        notify("error", "Ошибка сохранения: " + err.message);
      }
    },
    [data, notify, save, setData],
  );

  const handleDelete = useCallback(
    async (id, { onDeleted } = {}) => {
      const next = data.filter((r) => r.id !== id);
      try {
        setData(next);
        await save(next);
        hapticSuccess();
        setActiveLeak(null);
        onDeleted?.(id);
      } catch (err) {
        notify("error", "Ошибка удаления: " + err.message);
      }
    },
    [data, notify, save, setData],
  );

  return {
    activeLeak, setActiveLeak,
    pickerLeak, setPickerLeak,
    resolveLeak, setResolveLeak,
    handlePickStatus,
    handleStatusSelect,
    handleResolveConfirm,
    handleSave,
    handleDelete,
  };
}
