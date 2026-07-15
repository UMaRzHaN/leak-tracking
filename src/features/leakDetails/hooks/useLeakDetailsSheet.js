import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useEditablePhoto } from "@/hooks/useEditablePhoto";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import { useProjectData } from "@/app/project/ProjectContext";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { isPinkBagEquipment } from "@/utils/calculations/calculations";
import {
  CALCULATION_PARAM_KEYS,
  CALCULATION_PARAMS_VERSION,
  buildLeakCalculationParams,
  calculateLeakWithSnapshot,
  calculationParamsEqual,
} from "@/utils/calculationParams";
import { STATUS } from "@/utils/status";
import { priorityFromSpeed } from "@/utils/priority";
import { timeAgo } from "@/utils/timeAgo";
import { normalizeNumber } from "@/utils/normalize/normalizeNumber";
import { hapticWarning } from "@/utils/haptics";
import { buildLeakHistoryChanges } from "@/utils/historyChanges";
import { buildReopenedLeak } from "@/utils/reopenLeak";
import {
  changeLeakStatus,
  getOrphanedOriginalPhoto,
  resolveLeakRecord,
  startLeakRepair,
} from "@/domain/leakLifecycle";

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
  onClose,
  onSave,
  onDelete,
  userProfile,
}) {
  const { lang } = useLanguage();
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
  const [localEdit, setLocalEdit] = useState({});
  const [localCalcParams, setLocalCalcParams] = useState({});
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  const prevLeakIdRef = useRef(null);
  const fileInputRef = useRef(null);
  const fileInputAfterRef = useRef(null);
  const fileInputRepairRef = useRef(null);
  const deleteTimerRef = useRef(null);

  const {
    src,
    isDirty: isPhotoDirty,
    changePhoto,
    choosePhoto,
    savePhoto,
    resetPhoto,
    isNative,
  } = useEditablePhoto({
    initialPath: leak.photo,
    leakId: String(leak.id),
    version: leak.updatedAt,
    excludePaths: [leak.photo_after, leak.photo_repair].filter(Boolean),
  });

  const afterLeakId = `${leak.id}_after`;
  const {
    src: srcAfter,
    isDirty: isAfterDirty,
    changePhoto: changePhotoAfter,
    choosePhoto: choosePhotoAfter,
    savePhoto: savePhotoAfter,
    resetPhoto: resetPhotoAfter,
  } = useEditablePhoto({
    initialPath: leak.photo_after,
    leakId: afterLeakId,
    version: leak.updatedAt,
    excludePaths: [leak.photo, leak.photo_repair].filter(Boolean),
  });

  const repairLeakId = `${leak.id}_repair`;
  const {
    src: srcRepair,
    isDirty: isRepairDirty,
    changePhoto: changePhotoRepair,
    choosePhoto: choosePhotoRepair,
    savePhoto: savePhotoRepair,
    resetPhoto: resetPhotoRepair,
  } = useEditablePhoto({
    initialPath: leak.photo_repair,
    leakId: repairLeakId,
    version: leak.updatedAt,
    excludePaths: [leak.photo, leak.photo_after].filter(Boolean),
  });

  useEffect(() => {
    const key = `${leak.leak_id}:${leak.updatedAt}`;
    if (prevLeakIdRef.current !== key) {
      const keys = editFields.map((field) => field.key);
      setLocalEdit(
        Object.fromEntries(keys.map((keyName) => [keyName, leak[keyName]])),
      );
      setLocalCalcParams(buildLeakCalculationParams(leak, vars));
      setMode(MODE.VIEW);
      setActiveTab(TAB.INFO);
      setCloseConfirmOpen(false);
      resetPhoto();
      resetPhotoAfter();
      resetPhotoRepair();
      prevLeakIdRef.current = key;
    }
  }, [leak, editFields, resetPhoto, resetPhotoAfter, resetPhotoRepair, vars]);

  const originalCalcParams = useMemo(
    () => buildLeakCalculationParams(leak, vars),
    [leak, vars],
  );

  const dirtyFields = useMemo(
    () => editFields.filter(({ key }) => localEdit[key] !== leak[key]),
    [editFields, localEdit, leak],
  );
  const calcParamsDirty = !calculationParamsEqual(
    localCalcParams,
    originalCalcParams,
  );
  const isDirty =
    isPhotoDirty ||
    isAfterDirty ||
    isRepairDirty ||
    dirtyFields.length > 0 ||
    calcParamsDirty;

  const requireHistoryUser = useCallback(() => {
    if (historyUser) return true;
    hapticWarning();
    setNotification({
      type: "error",
      message:
        lang === "ru"
          ? "Заполните имя пользователя в профиле"
          : "Fill in the user name in the profile",
    });
    return false;
  }, [historyUser, lang]);

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

    if (!requireHistoryUser()) return;

    if (
      !isPinkBagEquipment(localCalcParams.equipmentType) &&
      localCalcParams.serial_number == null
    ) {
      setActiveTab(TAB.PARAMS);
      setNotification({
        type: "error",
        message:
          lang === "ru"
            ? "Укажите серийный номер оборудования"
            : "Enter the equipment serial number",
      });
      return;
    }

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
      const photoRepairPath = await savePhotoRepair();

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
      const measurementKeys = new Set([speedKey, "pressure", "temperature"]);
      const measurementChanged = dirtyFields.some(({ key }) =>
        measurementKeys.has(key),
      );
      const speedChanged = dirtyFields.some(({ key }) => key === speedKey);

      const base = {
        ...leak,
        ...textPatch,
        photo: photoPath ?? leak.photo,
        photo_after: photoAfterPath ?? leak.photo_after,
        photo_repair: photoRepairPath ?? leak.photo_repair,
        calculationParams: localCalcParams,
        calculationVersion: CALCULATION_PARAMS_VERSION,
        updatedAt: Date.now(),
      };
      const withCalc =
        measurementChanged || calcParamsDirty
          ? calculateLeakWithSnapshot(base, vars, localCalcParams)
          : base;
      const withoutHistory = speedChanged
        ? { ...withCalc, priority: priorityFromSpeed(withCalc[speedKey]) }
        : withCalc;
      const fieldChanges = buildLeakHistoryChanges({
        before: leak,
        after: withoutHistory,
        fields: dirtyFields,
        includeKeys: [
          ...(isPhotoDirty ? ["photo"] : []),
          ...(isAfterDirty ? ["photo_after"] : []),
          ...(isRepairDirty ? ["photo_repair"] : []),
          ...(speedChanged ? ["priority"] : []),
        ],
      });
      const calcChanges = buildLeakHistoryChanges({
        before: originalCalcParams,
        after: localCalcParams,
        fields: CALCULATION_PARAM_KEYS.map((key) => ({ key })),
      });
      const changes = [...fieldChanges, ...calcChanges];
      const withPriority = {
        ...withoutHistory,
        history: [
          ...(leak.history ?? []),
          {
            action: "edited",
            date: new Date().toISOString(),
            user: historyUser,
            changes,
          },
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

    if (!requireHistoryUser()) return;

    if (newStatus === STATUS.RESOLVED) {
      setResolveOpen(true);
      return;
    }

    if (newStatus === STATUS.IN_PROGRESS) {
      setRepairOpen(true);
      return;
    }

    if (newStatus === STATUS.OPEN && leak.status === STATUS.RESOLVED) {
      setReopenOpen(true);
      return;
    }

    const orphanedPhoto = getOrphanedOriginalPhoto(leak);
    onSave(changeLeakStatus(leak, newStatus, { user: historyUser }));

    if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
  };

  const handleResolveConfirm = ({ photo_after, materials_equipment, note }) => {
    if (!requireHistoryUser()) return;
    setResolveOpen(false);
    onSave(
      resolveLeakRecord(
        leak,
        { photo_after, materials_equipment, note },
        { user: historyUser },
      ),
    );
  };

  const handleRepairConfirm = ({ photo_repair, materials_equipment, note }) => {
    if (!requireHistoryUser()) return;
    setRepairOpen(false);
    const orphanedPhoto = getOrphanedOriginalPhoto(leak);
    onSave(
      startLeakRepair(
        leak,
        { photo_repair, materials_equipment, note },
        { user: historyUser },
      ),
    );
    if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
  };

  const handleReopenConfirm = (draft) => {
    if (!requireHistoryUser()) return;
    setReopenOpen(false);
    const next = buildReopenedLeak({ leak, draft, vars, user: historyUser });
    onSave(next);
    const orphanedPhoto = getOrphanedOriginalPhoto(leak);
    if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
  };

  const handleEdit = () => {
    if (activeTab === TAB.LOG) setActiveTab(TAB.INFO);
    setMode(MODE.EDIT);
  };

  const handleCancel = () => {
    resetPhoto();
    resetPhotoAfter();
    resetPhotoRepair();
    setCloseConfirmOpen(false);
    const keys = editFields.map((field) => field.key);
    setLocalEdit(Object.fromEntries(keys.map((key) => [key, leak[key]])));
    setLocalCalcParams(buildLeakCalculationParams(leak, vars));
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
          {
            id: TAB.MONITORING,
            label: lang === "ru" ? "Мониторинг" : "Monitoring",
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
