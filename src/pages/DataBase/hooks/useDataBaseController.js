import { useState, useCallback } from "react";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useBulkActions } from "./useBulkActions";
import { useDataBaseExport } from "./useDataBaseExport";
import { useDataBaseFilters } from "./useDataBaseFilters";
import { useLeakActions } from "./useLeakActions";

export function useDataBaseController({ data, setData, coords }) {
  const [notification, setNotification] = useState(null);
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);

  const notify = useCallback((type, message) => {
    setNotification({ type, message });
  }, []);

  const { deletePhoto } = usePhotoStorage();

  const filters = useDataBaseFilters({ data, coords });
  const actions = useLeakActions({ data, setData, notify, deletePhoto });
  const bulk = useBulkActions({
    data,
    setData,
    displayed: filters.displayed,
    notify,
    deletePhoto,
  });
  const { handleExport } = useDataBaseExport({
    displayed: filters.displayed,
    notify,
  });

  const handleBulkPickerSelect = useCallback(
    (status) => {
      setBulkPickerOpen(false);
      bulk.handleBulkStatusChange(status);
    },
    [bulk],
  );

  return {
    notification,
    clearNotification: () => setNotification(null),
    bulkPickerOpen,
    openBulkPicker: () => setBulkPickerOpen(true),
    closeBulkPicker: () => setBulkPickerOpen(false),
    handleBulkPickerSelect,
    notify,
    filters,
    actions,
    bulk,
    handleExport,
  };
}
