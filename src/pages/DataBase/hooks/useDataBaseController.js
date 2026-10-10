import { useState, useCallback } from "react";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useBulkActions } from "./useBulkActions";
import { useDataBaseFilters } from "./useDataBaseFilters";
import { useLeakActions } from "./useLeakActions";

export function useDataBaseController({
  data,
  setData,
  coords,
  sharedFilters,
  configuredMainLocationKey,
  configuredLocationKey,
  configuredLastLocationKey,
  userProfile,
}) {
  const [notification, setNotification] = useState(/** @type {any} */ (null));

  const notify = useCallback((type, message, options = {}) => {
    setNotification({ type, message, ...options });
  }, []);

  const { deletePhoto } = usePhotoStorage();

  const filters = useDataBaseFilters({
    data,
    coords,
    sharedFilters,
    configuredMainLocationKey,
    configuredLocationKey,
    configuredLastLocationKey,
  });
  const actions = useLeakActions({
    data,
    setData,
    notify,
    deletePhoto,
  });
  const bulk = useBulkActions({
    data,
    setData,
    displayed: filters.displayed,
    notify,
    userProfile,
    projectVars: actions.vars,
  });

  return {
    notification,
    clearNotification: () => setNotification(null),
    notify,
    filters,
    actions,
    bulk,
  };
}
