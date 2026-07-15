import { useState, useCallback } from "react";
import { STATUS } from "@/utils/status";
import { hapticSuccess } from "@/utils/haptics";
import { buildReopenedLeak } from "@/utils/reopenLeak";
import { useProjectData } from "@/app/project/ProjectContext";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import {
  changeLeakStatus,
  collectLeakPhotoPaths,
  getOrphanedOriginalPhoto,
  resolveLeakRecord,
  startLeakRepair,
} from "@/domain/leakLifecycle";

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

      const orphanedPhoto = getOrphanedOriginalPhoto(leak);
      const next = data.map((r) =>
        r.id === leak.id
          ? changeLeakStatus(r, newStatus, { user: historyUser })
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

      const orphanedPhoto = getOrphanedOriginalPhoto(leak);
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
        for (const path of collectLeakPhotoPaths(target)) {
          deletePhoto(path).catch(() => {});
        }
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
