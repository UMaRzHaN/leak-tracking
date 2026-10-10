import { errorText } from "@/utils/appError";
import { useState, useMemo, useCallback } from "react";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { STATUS } from "@/utils/status";
import { hapticSuccess } from "@/utils/haptics";
import { compareLeakRecency } from "@/utils/leakOrder";
import { useLanguage } from "@/app/hooks/useLanguage";
import { deleteLeakPhotosIfUnreferenced } from "@/domain/leakLifecycle";
import { ignoredError } from "@/utils/ignoredError";

const RECENT_COUNT = 8;
const ALL = "all";

// `data` is the whole project and `scopedData` is what the selected location
// leaves visible. Every mutation below rebuilds the list from `data` and hands
// it to setData, so it has to stay the full one — writing back a scoped list
// would delete every leak outside the folder. Only the summary and the recent
// list read the scoped view.
export function useMainPageActions({ data, scopedData = data, setData }) {
  const [activeLeak, setActiveLeak] = useState(/** @type {any} */ (null));
  // Чипы статусов на главной мониторинга (5a). На главной LDAR чипов нет, и
  // фильтр там всегда «все».
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [notification, setNotification] = useState(/** @type {any} */ (null));
  const { t } = useLanguage();

  const notify = useCallback(
    (type, message) => setNotification({ type, message }),
    [],
  );

  const { deletePhoto } = usePhotoStorage();

  const stats = useMemo(
    () => ({
      total: scopedData.length,
      open: scopedData.filter((l) => (l.status ?? STATUS.OPEN) === STATUS.OPEN)
        .length,
      inProgress: scopedData.filter((l) => l.status === STATUS.IN_PROGRESS)
        .length,
      resolved: scopedData.filter((l) => l.status === STATUS.RESOLVED).length,
    }),
    [scopedData],
  );

  const recent = useMemo(() => {
    let list = [...scopedData].sort(compareLeakRecency);
    if (statusFilter !== ALL) {
      list = list.filter((l) => (l.status ?? STATUS.OPEN) === statusFilter);
    }
    return list.slice(0, RECENT_COUNT);
  }, [scopedData, statusFilter]);

  const handleSaveLeak = useCallback(
    async (updated, options) => {
      const next = data.map((r) => (r.id === updated.id ? updated : r));
      try {
        await setData(next, options);
        hapticSuccess();
        setActiveLeak(null);
      } catch (err) {
        notify("error", t("common.saveError", { message: errorText(err, t) }));
        throw err;
      }
    },
    [data, notify, setData, t],
  );

  const handleDeleteLeak = useCallback(
    async (id) => {
      const target = data.find((r) => r.id === id);
      const next = data.filter((r) => r.id !== id);
      try {
        await setData(next);
        hapticSuccess();
        setActiveLeak(null);
        await deleteLeakPhotosIfUnreferenced(target, next, deletePhoto).catch(
          ignoredError("mainPage.photoCleanup"),
        );
      } catch (err) {
        notify(
          "error",
          t("common.deleteError", { message: errorText(err, t) }),
        );
      }
    },
    [data, deletePhoto, notify, setData, t],
  );

  return {
    activeLeak,
    setActiveLeak,
    statusFilter,
    setStatusFilter,
    notification,
    setNotification,
    stats,
    recent,
    RECENT_COUNT,
    ALL,
    handleSaveLeak,
    handleDeleteLeak,
  };
}
