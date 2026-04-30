import { useState, useMemo, useCallback } from "react";
import { useProjectData } from "../../../app/hooks/useProjectData";
import { usePhotoStorage } from "../../../hooks/usePhotoStorage";
import { STATUS } from "../../../utils/status";
import { hapticSuccess } from "../../../utils/haptics";

const RECENT_COUNT = 8;
const ALL = "all";

export function useMainPageActions({ data, setData }) {
  const [activeLeak, setActiveLeak] = useState(null);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [pickerLeak, setPickerLeak] = useState(null);
  const [resolveLeak, setResolveLeak] = useState(null);
  const [notification, setNotification] = useState(null);

  const notify = useCallback(
    (type, message) => setNotification({ type, message }),
    [],
  );

  const { save } = useProjectData();
  const { deletePhoto } = usePhotoStorage();

  /* ── Stats ── */
  const stats = useMemo(
    () => ({
      total: data.length,
      open: data.filter((l) => (l.status ?? STATUS.OPEN) === STATUS.OPEN).length,
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
    let list = [...data].sort((a, b) => b.id - a.id);
    if (statusFilter !== ALL) {
      list = list.filter((l) => (l.status ?? STATUS.OPEN) === statusFilter);
    }
    return list.slice(0, RECENT_COUNT);
  }, [data, statusFilter]);

  /* ── Status picker ── */
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
                ? { photo: r.photo_after ?? r.photo, photo_after: null }
                : {}),
              status: newStatus,
              updatedAt: Date.now(),
              history: [
                ...(r.history ?? []),
                { action: "status_changed", to: newStatus, date: new Date().toISOString() },
              ],
            }
          : r,
      );

      try {
        setData(next);
        await save(next);
        hapticSuccess();
        if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
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
              history: [
                ...(r.history ?? []),
                { action: "status_changed", to: STATUS.RESOLVED, date: now },
              ],
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

  const handleSaveLeak = useCallback(
    async (updated) => {
      const next = data.map((r) => (r.id === updated.id ? updated : r));
      try {
        await setData(next);
        hapticSuccess();
        setActiveLeak(null);
      } catch (err) {
        notify("error", "Ошибка сохранения: " + err.message);
      }
    },
    [data, notify, setData],
  );

  const handleDeleteLeak = useCallback(
    async (id) => {
      const next = data.filter((r) => r.id !== id);
      try {
        await setData(next);
        hapticSuccess();
        setActiveLeak(null);
      } catch (err) {
        notify("error", "Ошибка удаления: " + err.message);
      }
    },
    [data, notify, setData],
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
    notification,
    setNotification,
    notify,
    stats,
    recent,
    RECENT_COUNT,
    ALL,
    toggleFilter,
    handlePickStatus,
    handleStatusSelect,
    handleResolveConfirm,
    handleSaveLeak,
    handleDeleteLeak,
  };
}
