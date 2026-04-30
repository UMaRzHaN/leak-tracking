import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useEditablePhoto } from "../../../hooks/useEditablePhoto";
import { usePhotoStorage } from "../../../hooks/usePhotoStorage";
import { useProjectConfig } from "../../../app/settings/useProjectConfig";
import { useProject } from "../../../app/settings/ProjectContext";
import { useProjectVars } from "../../../app/settings/useProjectVars";
import { calculations } from "../../../utils/calculations/calculations";
import { nextStatus, STATUS } from "../../../utils/status";
import { priorityFromSpeed } from "../../../utils/priority";
import { timeAgo } from "../../../utils/timeAgo";
import { normalizeNumber } from "../../../utils/normalize/normalizeNumber";
import { hapticWarning } from "../../../utils/haptics";

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
  const projectConfig = useProjectConfig();
  const { activeProject } = useProject();
  const { vars } = useProjectVars(activeProject?.id ?? null, projectConfig.vars);

  const EDIT_FIELDS = useMemo(() => {
    const fields = projectConfig.system.fields ?? [];
    return fields
      .filter((f) => f.editable !== false)
      .sort((a, b) => (a.editOrder ?? 999) - (b.editOrder ?? 999));
  }, [projectConfig]);

  const { deletePhoto } = usePhotoStorage();

  const [mode, setMode] = useState(MODE.VIEW);
  const [activeTab, setActiveTab] = useState(TAB.INFO);
  const [localEdit, setLocalEdit] = useState({});
  const [saving, setSaving] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);

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

  /* ── Reset on leak change ── */
  useEffect(() => {
    const key = `${leak.leak_id}:${leak.updatedAt}`;
    if (prevLeakIdRef.current !== key) {
      const keys = EDIT_FIELDS.map((f) => f.key);
      setLocalEdit(Object.fromEntries(keys.map((k) => [k, leak[k]])));
      setMode(MODE.VIEW);
      setActiveTab(TAB.INFO);
      resetPhoto();
      resetPhotoAfter();
      prevLeakIdRef.current = key;
    }
  }, [leak.leak_id, leak.updatedAt, EDIT_FIELDS, resetPhoto, resetPhotoAfter]);

  const dirtyFields = useMemo(
    () => EDIT_FIELDS.filter(({ key }) => localEdit[key] !== leak[key]),
    [localEdit, leak, EDIT_FIELDS],
  );
  const isDirty = isPhotoDirty || isAfterDirty || dirtyFields.length > 0;

  /* ── Unload guard ── */
  useEffect(() => {
    const handler = (e) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleClose = () => {
    if (isDirty && !window.confirm("Изменения не сохранены. Закрыть?")) return;
    onClose();
  };

  const handleSave = async () => {
    if (saving) return;

    const lat = Number(localEdit.lat ?? leak.lat);
    const lng = Number(localEdit.lng ?? leak.lng);
    if (Number.isFinite(lat) && (lat < -90 || lat > 90)) {
      alert(`Широта ${lat} вне допустимого диапазона [-90, 90]`);
      return;
    }
    if (Number.isFinite(lng) && (lng < -180 || lng > 180)) {
      alert(`Долгота ${lng} вне допустимого диапазона [-180, 180]`);
      return;
    }

    setSaving(true);
    try {
      const photoPath = await savePhoto();
      const photoAfterPath = await savePhotoAfter();

      const numericKeys = new Set(
        EDIT_FIELDS.filter((f) => f.numeric).map((f) => f.key),
      );
      const textPatch = Object.fromEntries(
        dirtyFields.map(({ key }) => [
          key,
          numericKeys.has(key) ? normalizeNumber(localEdit[key]) : localEdit[key],
        ]),
      );

      const speedKey = "leak_speed";
      const speedChanged = dirtyFields.some(
        ({ key }) => key === speedKey && Number(localEdit[key]) !== Number(leak[key]),
      );

      const base = {
        ...leak,
        ...textPatch,
        photo: photoPath ?? leak.photo,
        photo_after: photoAfterPath ?? leak.photo_after,
        updatedAt: Date.now(),
        history: [
          ...(leak.history ?? []),
          { action: "edited", date: new Date().toISOString() },
        ],
      };
      const withCalc = speedChanged && vars ? calculations(base, vars) : base;
      const withPriority = speedChanged
        ? { ...withCalc, priority: priorityFromSpeed(localEdit[speedKey]) }
        : withCalc;
      onSave(withPriority);
    } catch {
      alert("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = () => {
    const newStatus = nextStatus(leak.status);
    if (newStatus === STATUS.RESOLVED) { setResolveOpen(true); return; }

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
        { action: "status_changed", to: newStatus, date: new Date().toISOString() },
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
    const keys = EDIT_FIELDS.map((f) => f.key);
    setLocalEdit(Object.fromEntries(keys.map((k) => [k, leak[k]])));
    setMode(MODE.VIEW);
  };

  const armDelete = useCallback(() => {
    hapticWarning();
    setDeleteArmed(true);
    deleteTimerRef.current = setTimeout(() => setDeleteArmed(false), DELETE_ARM_MS);
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
  const ago = timeAgo(leak.createdAt);

  const TABS =
    mode === MODE.VIEW
      ? [
          { id: TAB.INFO, label: "Инфо" },
          { id: TAB.PHOTO, label: "Фото" },
          { id: TAB.PARAMS, label: "Параметры" },
          { id: TAB.COORDS, label: "Координаты" },
          { id: TAB.LOG, label: "Лог" },
        ]
      : [
          { id: TAB.INFO, label: "Основное" },
          { id: TAB.PHOTO, label: "Фото" },
          { id: TAB.PARAMS, label: "Параметры" },
          { id: TAB.COORDS, label: "Координаты" },
        ];

  return {
    mode,
    activeTab,
    setActiveTab,
    localEdit,
    setLocalEdit,
    saving,
    viewerOpen,
    setViewerOpen,
    deleteArmed,
    resolveOpen,
    setResolveOpen,
    fileInputRef,
    fileInputAfterRef,
    src,
    srcAfter,
    isNative,
    isDirty,
    projectConfig,
    status,
    ago,
    TABS,
    STATUS,
    MODE,
    handleSave,
    handleClose,
    handleStatusChange,
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
