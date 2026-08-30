import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useLeakPhotoActions } from "./useLeakPhotoActions";
import { useLeakDetailsForm } from "./useLeakDetailsForm";
import { useLeakDetailsPersistence } from "./useLeakDetailsPersistence";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import { useProjectData } from "@/app/project/ProjectContext";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { STATUS } from "@/utils/status";
import { timeAgo } from "@/utils/timeAgo";
import { hapticWarning } from "@/utils/haptics";

const DELETE_ARM_MS = 3000;

export const MODE = { VIEW: "view", EDIT: "edit" };
export const TAB = {
  PHOTO: "photo",
  INFO: "info",
  PARAMS: "params",
  COORDS: "coords",
  MONITORING: "monitoring",
  LOG: "log",
};

export function useLeakDetailsSheet({
  leak,
  allLeaks,
  onClose,
  onSave,
  onDelete,
  userProfile,
}) {
  const { lang, t } = useLanguage();
  const historyUser = userProfile?.name?.trim() ?? "";
  const projectConfig = useProjectConfig();
  const { activeProject } = useProjectData();
  const { vars } = useProjectVars(
    activeProject?.id ?? null,
    projectConfig.vars,
  );

  const editFields = useMemo(() => {
    const fields = projectConfig.system.fields ?? [];
    return fields
      .filter((field) => field.editable !== false)
      .sort(
        (left, right) => (left.editOrder ?? 999) - (right.editOrder ?? 999),
      );
  }, [projectConfig]);

  const { deletePhoto } = usePhotoStorage();
  const [mode, setMode] = useState(MODE.VIEW);
  const [activeTab, setActiveTab] = useState(TAB.INFO);
  const [notification, setNotification] = useState(/** @type {any} */ (null));
  const [viewerOpen, setViewerOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  const deleteTimerRef = useRef(
    /** @type {ReturnType<typeof setTimeout>|undefined} */ (undefined),
  );
  const {
    fileInputRef,
    fileInputAfterRef,
    fileInputRepairRef,
    src,
    srcAfter,
    srcRepair,
    isNative,
    isPhotoDirty,
    isAfterDirty,
    isRepairDirty,
    changePhoto,
    choosePhoto,
    savePhoto,
    resetPhoto,
    changePhotoAfter,
    choosePhotoAfter,
    savePhotoAfter,
    resetPhotoAfter,
    changePhotoRepair,
    choosePhotoRepair,
    savePhotoRepair,
    resetPhotoRepair,
  } = useLeakPhotoActions(leak);

  const {
    localEdit,
    setLocalEdit,
    localCalcParams,
    setLocalCalcParams,
    originalCalcParams,
    dirtyFields,
    calcParamsDirty,
    isDirty,
    resetDraft,
  } = useLeakDetailsForm({
    leak,
    editFields,
    vars,
    photoActions: {
      isPhotoDirty,
      isAfterDirty,
      isRepairDirty,
      resetPhoto,
      resetPhotoAfter,
      resetPhotoRepair,
    },
    onLeakChange: useCallback(() => {
      setMode(MODE.VIEW);
      setActiveTab(TAB.INFO);
      setCloseConfirmOpen(false);
    }, []),
  });

  const requireHistoryUser = useCallback(() => {
    if (historyUser) return true;
    hapticWarning();
    setNotification({
      type: "error",
      message: t("leakDetails.fillUserName"),
    });
    return false;
  }, [historyUser, t]);

  useEffect(() => {
    const handler = (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setCloseConfirmOpen(true);
      return;
    }

    onClose();
  }, [isDirty, onClose]);

  const confirmClose = useCallback(() => {
    setCloseConfirmOpen(false);
    onClose();
  }, [onClose]);

  const cancelClose = useCallback(() => {
    setCloseConfirmOpen(false);
  }, []);

  const {
    saving,
    handleSave,
    handleStatusChange,
    handleStatusSelect,
    handleResolveConfirm,
    handleRepairConfirm,
    handleReopenConfirm,
  } = useLeakDetailsPersistence({
    leak,
    allLeaks,
    onSave,
    deletePhoto,
    historyUser,
    vars,
    editFields,
    localEdit,
    localCalcParams,
    dirtyFields,
    calcParamsDirty,
    originalCalcParams,
    isPhotoDirty,
    isAfterDirty,
    isRepairDirty,
    savePhoto,
    savePhotoAfter,
    savePhotoRepair,
    setNotification,
    setActiveTab,
    requireHistoryUser,
    setStatusPickerOpen,
    setResolveOpen,
    setRepairOpen,
    setReopenOpen,
    paramsTab: TAB.PARAMS,
  });

  const handleEdit = () => {
    if (activeTab === TAB.LOG) setActiveTab(TAB.INFO);
    setMode(MODE.EDIT);
  };

  const handleCancel = () => {
    resetPhoto();
    resetPhotoAfter();
    resetPhotoRepair();
    setCloseConfirmOpen(false);
    resetDraft();
    setMode(MODE.VIEW);
  };

  const armDelete = useCallback(() => {
    hapticWarning();
    setDeleteArmed(true);
    deleteTimerRef.current = setTimeout(
      () => setDeleteArmed(false),
      DELETE_ARM_MS,
    );
  }, []);

  const confirmDelete = useCallback(() => {
    clearTimeout(deleteTimerRef.current);
    setDeleteArmed(false);
    onDelete?.(leak.id);
  }, [leak.id, onDelete]);

  const disarmDelete = useCallback(() => {
    clearTimeout(deleteTimerRef.current);
    setDeleteArmed(false);
  }, []);

  useEffect(() => () => clearTimeout(deleteTimerRef.current), []);
  useEffect(() => {
    if (mode !== MODE.VIEW) disarmDelete();
  }, [mode, disarmDelete]);

  const status = leak.status ?? "open";
  const ago = timeAgo(leak.createdAt, lang);

  const tabs =
    mode === MODE.VIEW
      ? [
          { id: TAB.INFO, label: t("leakDetails.tabs.info") },
          { id: TAB.PHOTO, label: t("leakDetails.tabs.photos") },
          {
            id: TAB.PARAMS,
            label: t("leakDetails.tabs.parameters"),
          },
          {
            id: TAB.COORDS,
            label: t("leakDetails.tabs.coordinates"),
          },
          {
            id: TAB.MONITORING,
            label: t("leakDetails.tabs.monitoring"),
          },
          { id: TAB.LOG, label: t("leakDetails.tabs.log") },
        ]
      : [
          { id: TAB.INFO, label: t("leakDetails.tabs.main") },
          { id: TAB.PHOTO, label: t("leakDetails.tabs.photos") },
          {
            id: TAB.PARAMS,
            label: t("leakDetails.tabs.parameters"),
          },
          {
            id: TAB.COORDS,
            label: t("leakDetails.tabs.coordinates"),
          },
        ];

  return {
    mode,
    activeTab,
    setActiveTab,
    localEdit,
    setLocalEdit,
    localCalcParams,
    setLocalCalcParams,
    saving,
    notification,
    setNotification,
    viewerOpen,
    setViewerOpen,
    closeConfirmOpen,
    deleteArmed,
    resolveOpen,
    setResolveOpen,
    repairOpen,
    setRepairOpen,
    reopenOpen,
    setReopenOpen,
    statusPickerOpen,
    setStatusPickerOpen,
    fileInputRef,
    fileInputAfterRef,
    fileInputRepairRef,
    src,
    srcAfter,
    srcRepair,
    isNative,
    isDirty,
    projectConfig,
    vars,
    status,
    ago,
    TABS: tabs,
    STATUS,
    MODE,
    handleSave,
    handleClose,
    confirmClose,
    cancelClose,
    handleStatusChange,
    handleStatusSelect,
    handleResolveConfirm,
    handleRepairConfirm,
    handleReopenConfirm,
    handleEdit,
    handleCancel,
    armDelete,
    confirmDelete,
    changePhoto,
    choosePhoto,
    changePhotoAfter,
    choosePhotoAfter,
    changePhotoRepair,
    choosePhotoRepair,
  };
}
