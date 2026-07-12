import { useState, useCallback } from "react";
import { STATUS } from "@/utils/status";
import { hapticSuccess } from "@/utils/haptics";
import { buildLeakHistoryChanges } from "@/utils/historyChanges";

const STATUS_NOTE_FIELDS = [{ key: "materials_equipment" }, { key: "note" }];

export function useLeakActions({
  data,
  setData,
  notify,
  deletePhoto = () => Promise.resolve(),
}) {
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

      const orphanedPhoto =
        leak.status === STATUS.RESOLVED && leak.photo_after ? leak.photo : null;
      const next = data.map((r) =>
        r.id === leak.id
          ? {
              ...r,
              ...(r.status === STATUS.RESOLVED
                ? {
                    photo: r.photo_after ?? r.photo,
                    photo_after: null,
                  }
                : {}),
              status: newStatus,
              updatedAt: Date.now(),
              history: [
                ...(r.history ?? []),
                {
                  action: "status_changed",
                  to: newStatus,
                  date: new Date().toISOString(),
                },
              ],
            }
          : r,
      );
      try {
        await setData(next);
        hapticSuccess();
        if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
      } catch (err) {
        notify("error", `Ошибка сохранения: ${err.message}`);
      }
    },
    [data, deletePhoto, notify, pickerLeak, setData],
  );

  const handleResolveConfirm = useCallback(
    async ({ photo_after, materials_equipment, note }) => {
      const leak = resolveLeak;
      setResolveLeak(null);
      if (!leak) return;

      const now = new Date().toISOString();
      const next = data.map((r) =>
        r.id === leak.id
          ? (() => {
              const after = {
                ...r,
                status: STATUS.RESOLVED,
                resolvedAt: Date.now(),
                photo_after: photo_after ?? r.photo_after,
                materials_equipment:
                  materials_equipment ?? r.materials_equipment,
                note: note ?? r.note,
                updatedAt: Date.now(),
              };
              const changes = buildLeakHistoryChanges({
                before: r,
                after,
                fields: STATUS_NOTE_FIELDS,
              });
              return {
                ...after,
                history: [
                  ...(r.history ?? []),
                  {
                    action: "status_changed",
                    to: STATUS.RESOLVED,
                    date: now,
                    ...(changes.length > 0 ? { changes } : {}),
                  },
                ],
              };
            })()
          : r,
      );
      try {
        await setData(next);
        hapticSuccess();
      } catch (err) {
        notify("error", `Ошибка сохранения: ${err.message}`);
      }
    },
    [data, notify, resolveLeak, setData],
  );

  const handleSave = useCallback(
    async (updated) => {
      const next = data.map((r) => (r.id === updated.id ? updated : r));
      try {
        await setData(next);
        hapticSuccess();
        setActiveLeak(null);
      } catch (err) {
        notify("error", `Ошибка сохранения: ${err.message}`);
      }
    },
    [data, notify, setData],
  );

  const handleDelete = useCallback(
    async (id, { onDeleted } = {}) => {
      const target = data.find((r) => r.id === id);
      const next = data.filter((r) => r.id !== id);
      try {
        await setData(next);
        hapticSuccess();
        setActiveLeak(null);
        onDeleted?.(id);
        if (target?.photo) deletePhoto(target.photo).catch(() => {});
        if (target?.photo_after)
          deletePhoto(target.photo_after).catch(() => {});
      } catch (err) {
        notify("error", `Ошибка удаления: ${err.message}`);
      }
    },
    [data, deletePhoto, notify, setData],
  );

  return {
    activeLeak,
    setActiveLeak,
    pickerLeak,
    setPickerLeak,
    resolveLeak,
    setResolveLeak,
    handlePickStatus,
    handleStatusSelect,
    handleResolveConfirm,
    handleSave,
    handleDelete,
  };
}
