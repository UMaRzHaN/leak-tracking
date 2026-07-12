import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useEditablePhoto } from "@/hooks/useEditablePhoto";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import { useProjectData } from "@/app/project/ProjectContext";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { calculations } from "@/utils/calculations/calculations";
import { STATUS } from "@/utils/status";
import { priorityFromSpeed } from "@/utils/priority";
import { timeAgo } from "@/utils/timeAgo";
import { normalizeNumber } from "@/utils/normalize/normalizeNumber";
import { hapticWarning } from "@/utils/haptics";
import { buildLeakHistoryChanges } from "@/utils/historyChanges";

const DELETE_ARM_MS = 3000;

export const MODE = { VIEW: "view", EDIT: "edit" };
export const TAB = {
  PHOTO: "photo",
  INFO: "info",
  PARAMS: "params",
  COORDS: "coords",
  LOG: "log",
};

export function useLeakDetailsSheet({ leak, onClose, onSave, onDelete }) {
  const { lang } = useLanguage();
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
  const [localEdit, setLocalEdit] = useState({});
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  const prevLeakIdRef = useRef(null);
  const fileInputRef = useRef(null);
  const fileInputAfterRef = useRef(null);
  const deleteTimerRef = useRef(null);

  const {
    src,
    isDirty: isPhotoDirty,
    changePhoto,
    savePhoto,
    resetPhoto,
    isNative,
  } = useEditablePhoto({
    initialPath: leak.photo,
    leakId: leak.leak_id,
    version: leak.updatedAt,
    excludePaths: leak.photo_after ? [leak.photo_after] : [],
  });

  const afterLeakId = `${leak.leak_id ?? leak.id}_after`;
  const {
    src: srcAfter,
    isDirty: isAfterDirty,
    changePhoto: changePhotoAfter,
    savePhoto: savePhotoAfter,
    resetPhoto: resetPhotoAfter,
  } = useEditablePhoto({
    initialPath: leak.photo_after,
    leakId: afterLeakId,
    version: leak.updatedAt,
    excludePaths: leak.photo ? [leak.photo] : [],
  });

  useEffect(() => {
    const key = `${leak.leak_id}:${leak.updatedAt}`;
    if (prevLeakIdRef.current !== key) {
      const keys = editFields.map((field) => field.key);
      setLocalEdit(
        Object.fromEntries(keys.map((keyName) => [keyName, leak[keyName]])),
      );
      setMode(MODE.VIEW);
      setActiveTab(TAB.INFO);
      setCloseConfirmOpen(false);
      resetPhoto();
      resetPhotoAfter();
      prevLeakIdRef.current = key;
    }
  }, [leak, editFields, resetPhoto, resetPhotoAfter]);

  const dirtyFields = useMemo(
    () => editFields.filter(({ key }) => localEdit[key] !== leak[key]),
    [editFields, localEdit, leak],
  );
  const isDirty = isPhotoDirty || isAfterDirty || dirtyFields.length > 0;

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

  const handleSave = async () => {
    if (saving) return;

    const lat = Number(localEdit.lat ?? leak.lat);
    const lng = Number(localEdit.lng ?? leak.lng);

    if (Number.isFinite(lat) && (lat < -90 || lat > 90)) {
      setNotification({
        type: "error",
        message:
          lang === "ru"
            ? `Широта ${lat} вне допустимого диапазона [-90, 90]`
            : `Latitude ${lat} is outside the allowed range [-90, 90]`,
      });
      return;
    }

    if (Number.isFinite(lng) && (lng < -180 || lng > 180)) {
      setNotification({
        type: "error",
        message:
          lang === "ru"
            ? `Долгота ${lng} вне допустимого диапазона [-180, 180]`
            : `Longitude ${lng} is outside the allowed range [-180, 180]`,
      });
      return;
    }

    setSaving(true);
    setNotification(null);
    try {
      const photoPath = await savePhoto();
      const photoAfterPath = await savePhotoAfter();

      const numericKeys = new Set(
        editFields.filter((field) => field.numeric).map((field) => field.key),
      );
      const textPatch = Object.fromEntries(
        dirtyFields.map(({ key }) => [
          key,
          numericKeys.has(key)
            ? normalizeNumber(localEdit[key])
            : localEdit[key],
        ]),
      );

      const speedKey = "leak_speed";
      const speedChanged = dirtyFields.some(
        ({ key }) =>
          key === speedKey && Number(localEdit[key]) !== Number(leak[key]),
      );

      const base = {
        ...leak,
        ...textPatch,
        photo: photoPath ?? leak.photo,
        photo_after: photoAfterPath ?? leak.photo_after,
        updatedAt: Date.now(),
      };
      const withCalc = speedChanged && vars ? calculations(base, vars) : base;
      const withoutHistory = speedChanged
        ? { ...withCalc, priority: priorityFromSpeed(localEdit[speedKey]) }
        : withCalc;
      const changes = buildLeakHistoryChanges({
        before: leak,
        after: withoutHistory,
        fields: dirtyFields,
        includeKeys: [
          ...(isPhotoDirty ? ["photo"] : []),
          ...(isAfterDirty ? ["photo_after"] : []),
          ...(speedChanged ? ["priority"] : []),
        ],
      });
      const withPriority = {
        ...withoutHistory,
        history: [
          ...(leak.history ?? []),
          { action: "edited", date: new Date().toISOString(), changes },
        ],
      };

      onSave(withPriority);
    } catch {
      setNotification({
        type: "error",
        message: lang === "ru" ? "Ошибка сохранения" : "Save error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = () => setStatusPickerOpen(true);

  const handleStatusSelect = (newStatus) => {
    setStatusPickerOpen(false);
    if (newStatus === leak.status) return;

    if (newStatus === STATUS.RESOLVED) {
      setResolveOpen(true);
      return;
    }

    const photoUpdate =
      leak.status === STATUS.RESOLVED
        ? { photo: leak.photo_after ?? leak.photo, photo_after: null }
        : {};
    const orphanedPhoto =
      leak.status === STATUS.RESOLVED && leak.photo_after ? leak.photo : null;

    onSave({
      ...leak,
      ...photoUpdate,
      status: newStatus,
      updatedAt: Date.now(),
      history: [
        ...(leak.history ?? []),
        {
          action: "status_changed",
          to: newStatus,
          date: new Date().toISOString(),
        },
      ],
    });

    if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
  };

  const handleResolveConfirm = ({ photo_after, materials_equipment, note }) => {
    setResolveOpen(false);
    const now = new Date().toISOString();
    onSave({
      ...leak,
      status: STATUS.RESOLVED,
      resolvedAt: Date.now(),
      photo_after: photo_after ?? leak.photo_after,
      materials_equipment: materials_equipment ?? leak.materials_equipment,
      note: note ?? leak.note,
      updatedAt: Date.now(),
      history: [
        ...(leak.history ?? []),
        { action: "status_changed", to: STATUS.RESOLVED, date: now },
      ],
    });
  };

  const handleAddComment = (text) => {
    onSave({
      ...leak,
      updatedAt: Date.now(),
      history: [
        ...(leak.history ?? []),
        { action: "comment", text, date: new Date().toISOString() },
      ],
    });
  };

  const handleEdit = () => {
    if (activeTab === TAB.LOG) setActiveTab(TAB.INFO);
    setMode(MODE.EDIT);
  };

  const handleCancel = () => {
    resetPhoto();
    resetPhotoAfter();
    setCloseConfirmOpen(false);
    const keys = editFields.map((field) => field.key);
    setLocalEdit(Object.fromEntries(keys.map((key) => [key, leak[key]])));
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
          { id: TAB.INFO, label: lang === "ru" ? "Инфо" : "Info" },
          { id: TAB.PHOTO, label: lang === "ru" ? "Фото" : "Photos" },
          {
            id: TAB.PARAMS,
            label: lang === "ru" ? "Параметры" : "Parameters",
          },
          {
            id: TAB.COORDS,
            label: lang === "ru" ? "Координаты" : "Coordinates",
          },
          { id: TAB.LOG, label: lang === "ru" ? "Лог" : "Log" },
        ]
      : [
          { id: TAB.INFO, label: lang === "ru" ? "Основное" : "Main" },
          { id: TAB.PHOTO, label: lang === "ru" ? "Фото" : "Photos" },
          {
            id: TAB.PARAMS,
            label: lang === "ru" ? "Параметры" : "Parameters",
          },
          {
            id: TAB.COORDS,
            label: lang === "ru" ? "Координаты" : "Coordinates",
          },
        ];

  return {
    mode,
    activeTab,
    setActiveTab,
    localEdit,
    setLocalEdit,
    saving,
    notification,
    setNotification,
    viewerOpen,
    setViewerOpen,
    closeConfirmOpen,
    deleteArmed,
    resolveOpen,
    setResolveOpen,
    statusPickerOpen,
    setStatusPickerOpen,
    fileInputRef,
    fileInputAfterRef,
    src,
    srcAfter,
    isNative,
    isDirty,
    projectConfig,
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
    handleAddComment,
    handleEdit,
    handleCancel,
    armDelete,
    confirmDelete,
    changePhoto,
    changePhotoAfter,
  };
}
