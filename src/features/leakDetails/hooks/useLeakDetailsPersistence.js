import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { isPinkBagEquipment } from "@/utils/calculations/calculations";
import {
  LEAK_EVENT_TYPES,
  getRepairDonePhoto,
  getRepairPhoto,
  withReplacedRepairPhoto,
} from "@/domain/leakEvents";
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
import { ignoredError } from "@/utils/ignoredError";
import { fromEntries } from "@/utils/fromEntries";

/**
 * Куда лечь заменённым снимкам починки.
 *
 * Возвращает либо новую ленту, либо вехи — смотря есть ли событие, которому
 * снимок принадлежит.
 */
function repairPhotoPatch(leak, photoRepairPath, photoAfterPath) {
  let events = /** @type {any[]|null} */ (null);
  const patch = {};

  for (const [path, type, field] of [
    [photoRepairPath, LEAK_EVENT_TYPES.REPAIR_STARTED, "photo_repair"],
    [photoAfterPath, LEAK_EVENT_TYPES.REPAIR_DONE, "photo_after"],
  ]) {
    if (!path) continue;
    const next = withReplacedRepairPhoto({ ...leak, events }, type, path);
    if (next) events = next;
    else patch[field] = path;
  }

  return events ? { ...patch, events } : patch;
}

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
      const textPatch = fromEntries(
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

      // Правка координаты руками отменяет радиус приёмника: он измерял ту
      // точку, а не эту. Оставить его — выдать вписанное значение за снятое,
      // и на карте такая точка выглядела бы достовернее, чем она есть.
      const coordsEditedByHand = dirtyFields.some(
        ({ key }) => key === "lat" || key === "lng",
      );

      const base = {
        ...leak,
        ...textPatch,
        ...(coordsEditedByHand ? { coords_accuracy: undefined } : {}),
        photo: photoPath ?? leak.photo,
        // Правка снимка починки — не новый ремонт, а исправление вложения у
        // того, который уже был: меняется событие, а не поле записи. У записи
        // без события — заведённой до ленты или устранённой обходом — менять
        // нечего, и снимок остаётся там, где у неё и лежал.
        ...repairPhotoPatch(leak, photoRepairPath, photoAfterPath),
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
          [isAfterDirty, getRepairDonePhoto(leak), photoAfterPath],
          [isRepairDirty, getRepairPhoto(leak), photoRepairPath],
        ],
        deletePhoto,
      });
    } catch (/** @type {any} */ error) {
      await cleanupUncommittedPhotoReplacements({
        value: leak,
        referenceLeaks: allLeaks,
        replacements: [
          [isPhotoDirty, leak.photo, photoPath],
          [isAfterDirty, getRepairDonePhoto(leak), photoAfterPath],
          [isRepairDirty, getRepairPhoto(leak), photoRepairPath],
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
      ).catch(ignoredError("leakDetails.photoCleanup"));
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
      if (
        getRepairDonePhoto(leak) &&
        getRepairDonePhoto(leak) !== photo_after
      ) {
        await deletePhotoIfUnreferenced(
          getRepairDonePhoto(leak),
          nextData,
          deletePhoto,
        ).catch(ignoredError("leakDetails.photoCleanup"));
      }
    } catch {
      if (photo_after && photo_after !== getRepairDonePhoto(leak)) {
        await deletePhotoIfUnreferenced(
          photo_after,
          allLeaks,
          deletePhoto,
        ).catch(ignoredError("leakDetails.photoCleanup"));
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
      if (getRepairPhoto(leak) && getRepairPhoto(leak) !== photo_repair) {
        await deletePhotoIfUnreferenced(
          getRepairPhoto(leak),
          nextData,
          deletePhoto,
        ).catch(ignoredError("leakDetails.photoCleanup"));
      }
      await deletePhotoIfUnreferenced(
        orphanedPhoto,
        nextData,
        deletePhoto,
      ).catch(ignoredError("leakDetails.photoCleanup"));
    } catch {
      if (photo_repair && photo_repair !== getRepairPhoto(leak)) {
        await deletePhotoIfUnreferenced(
          photo_repair,
          allLeaks,
          deletePhoto,
        ).catch(ignoredError("leakDetails.photoCleanup"));
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
      ).catch(ignoredError("leakDetails.photoCleanup"));
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
