import { errorText } from "@/utils/appError";
import { useState, useCallback } from "react";
import { hapticSuccess } from "@/utils/haptics";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { deleteLeakPhotosIfUnreferenced } from "@/domain/leakLifecycle";
import { ignoredError } from "@/utils/ignoredError";

/** @type {(path: string) => Promise<void>} */
const noopDeletePhoto = async () => {};

export function useLeakActions({
  data,
  setData,
  notify,
  deletePhoto = noopDeletePhoto,
}) {
  const [activeLeak, setActiveLeak] = useState(/** @type {any} */ (null));
  const { t } = useLanguage();
  const { activeProject } = useProjectData();
  const { vars } = useProjectVars(activeProject?.id ?? null);

  const handleSave = useCallback(
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

  const handleDelete = useCallback(
    async (id, options = {}) => {
      const { onDeleted } = /** @type {{onDeleted?: Function}} */ (options);
      const target = data.find((r) => r.id === id);
      const next = data.filter((r) => r.id !== id);
      try {
        await setData(next);
        hapticSuccess();
        setActiveLeak(null);
        onDeleted?.(id);
        await deleteLeakPhotosIfUnreferenced(target, next, deletePhoto).catch(
          ignoredError("database.photoCleanup"),
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
    vars,
    handleSave,
    handleDelete,
  };
}
