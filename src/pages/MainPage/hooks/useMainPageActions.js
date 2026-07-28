import { useState, useMemo, useCallback } from "react";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { STATUS } from "@/utils/status";
import { hapticSuccess } from "@/utils/haptics";
import { buildReopenedLeak } from "@/utils/reopenLeak";
import { compareLeakIds } from "@/utils/leakOrder";
import { useProjectData } from "@/app/project/ProjectContext";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import {
  changeLeakStatus,
  collectLeakPhotoPaths,
  getOrphanedOriginalPhoto,
  resolveLeakRecord,
  startLeakRepair,
} from "@/domain/leakLifecycle";

const RECENT_COUNT = 8;
const ALL = "all";

export function useMainPageActions({ data, setData, userProfile }) {
  const [activeLeak, setActiveLeak] = useState(null);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [pickerLeak, setPickerLeak] = useState(null);
  const [resolveLeak, setResolveLeak] = useState(null);
  const [repairLeak, setRepairLeak] = useState(null);
  const [reopenLeak, setReopenLeak] = useState(null);
  const [notification, setNotification] = useState(null);
  const { activeProject } = useProjectData();
  const { vars } = useProjectVars(activeProject?.id ?? null);
  const historyUser = userProfile?.name?.trim() || undefined;

  const notify = useCallback(
    (type, message) => setNotification({ type, message }),
    [],
  );

  const { deletePhoto } = usePhotoStorage();

  const stats = useMemo(
    () => ({
      total: data.length,
      open: data.filter((l) => (l.status ?? STATUS.OPEN) === STATUS.OPEN)
        .length,
      inProgress: data.filter((l) => l.status === STATUS.IN_PROGRESS).length,
      resolved: data.filter((l) => l.status === STATUS.RESOLVED).length,
    }),
    [data],
  );

  const toggleFilter = useCallback(
    (key) => setStatusFilter((prev) => (prev === key ? ALL : key)),
    [],
  );

  const recent = useMemo(() => {
    let list = [...data].sort((a, b) => compareLeakIds(b, a));
    if (statusFilter !== ALL) {
      list = list.filter((l) => (l.status ?? STATUS.OPEN) === statusFilter);
    }
    return list.slice(0, RECENT_COUNT);
  }, [data, statusFilter]);

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
        setResolveLeak(null);
        hapticSuccess();
        if (leak.photo_after && leak.photo_after !== photo_after) {
          deletePhoto(leak.photo_after).catch(() => {});
        }
      } catch (err) {
        if (photo_after && photo_after !== leak.photo_after) {
          deletePhoto(photo_after).catch(() => {});
        }
        notify("error", `Ошибка сохранения: ${err.message}`);
      }
    },
    [data, deletePhoto, historyUser, notify, resolveLeak, setData],
  );

  const handleRepairConfirm = useCallback(
    async ({ photo_repair, materials_equipment, note }) => {
      const leak = repairLeak;
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
        setRepairLeak(null);
        hapticSuccess();
        if (leak.photo_repair && leak.photo_repair !== photo_repair) {
          deletePhoto(leak.photo_repair).catch(() => {});
        }
        if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
      } catch (err) {
        if (photo_repair && photo_repair !== leak.photo_repair) {
          deletePhoto(photo_repair).catch(() => {});
        }
        notify("error", `Ошибка сохранения: ${err.message}`);
      }
    },
    [data, deletePhoto, historyUser, notify, repairLeak, setData],
  );

  const handleReopenConfirm = useCallback(
    async (draft) => {
      const leak = reopenLeak;
      if (!leak) return;

      const orphanedPhoto = getOrphanedOriginalPhoto(leak);
      const next = data.map((r) =>
        r.id === leak.id
          ? buildReopenedLeak({ leak: r, draft, vars, user: historyUser })
          : r,
      );

      try {
        await setData(next);
        setReopenLeak(null);
        hapticSuccess();
        if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
      } catch (err) {
        notify("error", `Ошибка сохранения: ${err.message}`);
      }
    },
    [data, deletePhoto, historyUser, notify, reopenLeak, setData, vars],
  );

  const handleSaveLeak = useCallback(
    async (updated) => {
      const next = data.map((r) => (r.id === updated.id ? updated : r));
      try {
        await setData(next);
        hapticSuccess();
        setActiveLeak(null);
      } catch (err) {
        notify("error", `Ошибка сохранения: ${err.message}`);
        throw err;
      }
    },
    [data, notify, setData],
  );

  const handleDeleteLeak = useCallback(
    async (id) => {
      const target = data.find((r) => r.id === id);
      const next = data.filter((r) => r.id !== id);
      try {
        await setData(next);
        hapticSuccess();
        setActiveLeak(null);
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
    statusFilter,
    setStatusFilter,
    pickerLeak,
    setPickerLeak,
    resolveLeak,
    setResolveLeak,
    repairLeak,
    setRepairLeak,
    reopenLeak,
    setReopenLeak,
    vars,
    notification,
    setNotification,
    stats,
    recent,
    RECENT_COUNT,
    ALL,
    toggleFilter,
    handlePickStatus,
    handleStatusSelect,
    handleResolveConfirm,
    handleRepairConfirm,
    handleReopenConfirm,
    handleSaveLeak,
    handleDeleteLeak,
  };
}
