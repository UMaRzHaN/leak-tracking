import { useState } from "react";
import { isPinkBagEquipment } from "@/utils/calculations/calculations";
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
} from "../utils/persistPhotoReplacements";

export function useLeakDetailsPersistence({
  leak,
  onSave,
  deletePhoto,
  lang,
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
        message: lang === "ru" ? "Ошибка сохранения" : "Save error",
      });
    } finally {
      setSaving(false);
    }
  };
  const reportSaveError = () => {
    setNotification({
      type: "error",
      message:
        lang === "ru"
          ? "\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f"
          : "Save error",
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
      await onSave(next);
      await deletePhotoIfUnreferenced(orphanedPhoto, next, deletePhoto).catch(
        () => {},
      );
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
      await onSave(next);
      setResolveOpen(false);
      if (leak.photo_after && leak.photo_after !== photo_after) {
        await deletePhotoIfUnreferenced(
          leak.photo_after,
          next,
          deletePhoto,
        ).catch(() => {});
      }
    } catch {
      if (photo_after && photo_after !== leak.photo_after) {
        await deletePhoto(photo_after).catch(() => {});
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
      await onSave(next);
      setRepairOpen(false);
      if (leak.photo_repair && leak.photo_repair !== photo_repair) {
        await deletePhotoIfUnreferenced(
          leak.photo_repair,
          next,
          deletePhoto,
        ).catch(() => {});
      }
      await deletePhotoIfUnreferenced(orphanedPhoto, next, deletePhoto).catch(
        () => {},
      );
    } catch {
      if (photo_repair && photo_repair !== leak.photo_repair) {
        await deletePhoto(photo_repair).catch(() => {});
      }
      reportSaveError();
    }
  };

  const handleReopenConfirm = async (draft) => {
    if (!requireHistoryUser()) return;
    const next = buildReopenedLeak({ leak, draft, vars, user: historyUser });
    const orphanedPhoto = getOrphanedOriginalPhoto(leak);
    try {
      await onSave(next, { optimistic: false });
      setReopenOpen(false);
      await deletePhotoIfUnreferenced(orphanedPhoto, next, deletePhoto).catch(
        () => {},
      );
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
