import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { isPinkBagEquipment } from "@/utils/calculations/calculations";
import { isValidLatitude, isValidLongitude } from "@/utils/coordinates";
import {
  CALCULATION_PARAM_KEYS,
  CALCULATION_PARAMS_VERSION,
  calculateLeakWithSnapshot,
} from "@/utils/calculationParams";
import { STATUS } from "@/utils/status";
import { priorityFromSpeed } from "@/utils/priority";
import { normalizeNumber } from "@/utils/normalize/normalizeNumber";
import { buildLeakHistoryChanges } from "@/utils/historyChanges";
import { buildReopenedLeak } from "@/utils/reopenLeak";
import {
  changeLeakStatus,
  deletePhotoIfUnreferenced,
  getOrphanedOriginalPhoto,
  resolveLeakRecord,
  startLeakRepair,
} from "@/domain/leakLifecycle";
import {
  cleanupUncommittedPhotoReplacements,
  persistPhotoReplacements,
  replaceLeakInCollection,
} from "../utils/persistPhotoReplacements";

export function useLeakDetailsPersistence({
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
  paramsTab,
}) {
  const { t } = useLanguage();

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;

    if (!requireHistoryUser()) return;

    if (
      !isPinkBagEquipment(localCalcParams.equipmentType) &&
      localCalcParams.serial_number == null
    ) {
      setActiveTab(paramsTab);
      setNotification({
        type: "error",
        message: t("leakDetails.enterSerialNumber"),
      });
      return;
    }

    const lat = Number(localEdit.lat ?? leak.lat);
    const lng = Number(localEdit.lng ?? leak.lng);

    if (Number.isFinite(lat) && !isValidLatitude(lat)) {
      setNotification({
        type: "error",
        message: t("addLeak.validation.lat", { lat }),
      });
      return;
    }

    if (Number.isFinite(lng) && !isValidLongitude(lng)) {
      setNotification({
        type: "error",
        message: t("addLeak.validation.lng", /** @type {any} */ ({ lng })),
      });
      return;
    }

    setSaving(true);
    setNotification(null);
    let photoPath;
    let photoAfterPath;
    let photoRepairPath;
    try {
      photoPath = await savePhoto();
      photoAfterPath = await savePhotoAfter();
      photoRepairPath = await savePhotoRepair();

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

      await persistPhotoReplacements({
        save: onSave,
        value: withPriority,
        referenceLeaks: replaceLeakInCollection(allLeaks, withPriority),
        replacements: [
          [isPhotoDirty, leak.photo, photoPath],
          [isAfterDirty, leak.photo_after, photoAfterPath],
          [isRepairDirty, leak.photo_repair, photoRepairPath],
        ],
        deletePhoto,
      });
    } catch (error) {
      await cleanupUncommittedPhotoReplacements({
        value: leak,
        referenceLeaks: allLeaks,
        replacements: [
          [isPhotoDirty, leak.photo, photoPath],
          [isAfterDirty, leak.photo_after, photoAfterPath],
          [isRepairDirty, leak.photo_repair, photoRepairPath],
        ],
        deletePhoto,
      });
      if (error?.name === "AbortError") return;
      setNotification({
        type: "error",
        message: t("leakDetails.saveError"),
      });
    } finally {
      setSaving(false);
    }
  };
  const reportSaveError = () => {
    setNotification({
      type: "error",
      message: t("leakDetails.saveError"),
    });
  };

  const handleStatusChange = () => setStatusPickerOpen(true);

  const handleStatusSelect = async (newStatus) => {
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
    try {
      const next = changeLeakStatus(leak, newStatus, { user: historyUser });
      const nextData = replaceLeakInCollection(allLeaks, next);
      await onSave(next);
      await deletePhotoIfUnreferenced(
        orphanedPhoto,
        nextData,
        deletePhoto,
      ).catch(() => {});
    } catch {
      reportSaveError();
    }
  };

  const handleResolveConfirm = async ({
    photo_after,
    materials_equipment,
    note,
  }) => {
    if (!requireHistoryUser()) return;
    try {
      const next = resolveLeakRecord(
        leak,
        { photo_after, materials_equipment, note },
        { user: historyUser },
      );
      const nextData = replaceLeakInCollection(allLeaks, next);
      await onSave(next);
      setResolveOpen(false);
      if (leak.photo_after && leak.photo_after !== photo_after) {
        await deletePhotoIfUnreferenced(
          leak.photo_after,
          nextData,
          deletePhoto,
        ).catch(() => {});
      }
    } catch {
      if (photo_after && photo_after !== leak.photo_after) {
        await deletePhotoIfUnreferenced(
          photo_after,
          allLeaks,
          deletePhoto,
        ).catch(() => {});
      }
      reportSaveError();
    }
  };

  const handleRepairConfirm = async ({
    photo_repair,
    materials_equipment,
    note,
  }) => {
    if (!requireHistoryUser()) return;
    const orphanedPhoto = getOrphanedOriginalPhoto(leak);
    try {
      const next = startLeakRepair(
        leak,
        { photo_repair, materials_equipment, note },
        { user: historyUser },
      );
      const nextData = replaceLeakInCollection(allLeaks, next);
      await onSave(next);
      setRepairOpen(false);
      if (leak.photo_repair && leak.photo_repair !== photo_repair) {
        await deletePhotoIfUnreferenced(
          leak.photo_repair,
          nextData,
          deletePhoto,
        ).catch(() => {});
      }
      await deletePhotoIfUnreferenced(
        orphanedPhoto,
        nextData,
        deletePhoto,
      ).catch(() => {});
    } catch {
      if (photo_repair && photo_repair !== leak.photo_repair) {
        await deletePhotoIfUnreferenced(
          photo_repair,
          allLeaks,
          deletePhoto,
        ).catch(() => {});
      }
      reportSaveError();
    }
  };

  const handleReopenConfirm = async (draft) => {
    if (!requireHistoryUser()) return;
    const next = buildReopenedLeak({ leak, draft, vars, user: historyUser });
    const nextData = replaceLeakInCollection(allLeaks, next);
    const orphanedPhoto = getOrphanedOriginalPhoto(leak);
    try {
      await onSave(next, { optimistic: false });
      setReopenOpen(false);
      await deletePhotoIfUnreferenced(
        orphanedPhoto,
        nextData,
        deletePhoto,
      ).catch(() => {});
    } catch {
      reportSaveError();
    }
  };

  return {
    saving,
    handleSave,
    handleStatusChange,
    handleStatusSelect,
    handleResolveConfirm,
    handleRepairConfirm,
    handleReopenConfirm,
  };
}
