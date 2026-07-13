import { useState, useCallback } from "react";
import { STATUS } from "@/utils/status";
import { hapticSuccess } from "@/utils/haptics";
import { buildLeakHistoryChanges } from "@/utils/historyChanges";
import { buildReopenedLeak } from "@/utils/reopenLeak";
import { useProjectData } from "@/app/project/ProjectContext";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";

const STATUS_NOTE_FIELDS = [{ key: "materials_equipment" }, { key: "note" }];

export function useLeakActions({
  data,
  setData,
  notify,
  deletePhoto = () => Promise.resolve(),
  userProfile,
}) {
  const [activeLeak, setActiveLeak] = useState(null);
  const [pickerLeak, setPickerLeak] = useState(null);
  const [resolveLeak, setResolveLeak] = useState(null);
  const [repairLeak, setRepairLeak] = useState(null);
  const [reopenLeak, setReopenLeak] = useState(null);
  const { activeProject } = useProjectData();
  const { vars } = useProjectVars(activeProject?.id ?? null);
  const historyUser = userProfile?.name?.trim() || undefined;

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

      if (newStatus === STATUS.IN_PROGRESS) {
        setRepairLeak(leak);
        return;
      }

      if (newStatus === STATUS.OPEN && leak.status === STATUS.RESOLVED) {
        setReopenLeak(leak);
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
                  user: historyUser,
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
    [data, deletePhoto, historyUser, notify, pickerLeak, setData],
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
                    user: historyUser,
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
    [data, historyUser, notify, resolveLeak, setData],
  );

  const handleRepairConfirm = useCallback(
    async ({ photo_repair, materials_equipment, note }) => {
      const leak = repairLeak;
      setRepairLeak(null);
      if (!leak) return;

      const repairAt = Date.now();
      const now = new Date(repairAt).toISOString();
      const orphanedPhoto =
        leak.status === STATUS.RESOLVED && leak.photo_after ? leak.photo : null;
      const next = data.map((r) =>
        r.id === leak.id
          ? (() => {
              const after = {
                ...r,
                ...(r.status === STATUS.RESOLVED
                  ? {
                      photo: r.photo_after ?? r.photo,
                      photo_after: null,
                    }
                  : {}),
                status: STATUS.IN_PROGRESS,
                resolvedAt: null,
                repairAt,
                photo_repair: photo_repair ?? r.photo_repair,
                materials_equipment:
                  materials_equipment ?? r.materials_equipment,
                note: note ?? r.note,
                updatedAt: Date.now(),
              };
              const changes = buildLeakHistoryChanges({
                before: r,
                after,
                fields: STATUS_NOTE_FIELDS,
                includeKeys: ["photo_repair"],
              });
              return {
                ...after,
                history: [
                  ...(r.history ?? []),
                  {
                    action: "status_changed",
                    to: STATUS.IN_PROGRESS,
                    date: now,
                    user: historyUser,
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
        if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
      } catch (err) {
        notify("error", `Ошибка сохранения: ${err.message}`);
      }
    },
    [data, deletePhoto, historyUser, notify, repairLeak, setData],
  );

  const handleReopenConfirm = useCallback(
    async (draft) => {
      const leak = reopenLeak;
      setReopenLeak(null);
      if (!leak) return;

      const orphanedPhoto =
        leak.status === STATUS.RESOLVED && leak.photo_after ? leak.photo : null;
      const next = data.map((r) =>
        r.id === leak.id
          ? buildReopenedLeak({ leak: r, draft, vars, user: historyUser })
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
    [data, deletePhoto, historyUser, notify, reopenLeak, setData, vars],
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
        if (target?.photo_repair)
          deletePhoto(target.photo_repair).catch(() => {});
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
