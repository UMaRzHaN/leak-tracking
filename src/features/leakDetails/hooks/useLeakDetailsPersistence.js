import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { isPinkBagEquipment } from "@/utils/calculations/calculations";
import {
  getStatusRepairMilestones,
  withEditedRepairPhotos,
} from "@/domain/leakEvents";
import { isValidLatitude, isValidLongitude } from "@/utils/coordinates";
import {
  CALCULATION_PARAM_KEYS,
  CALCULATION_PARAMS_VERSION,
  calculateLeakWithSnapshot,
} from "@/utils/calculationParams";
import { priorityFromSpeed } from "@/utils/priority";
import { normalizeNumber } from "@/utils/normalize/normalizeNumber";
import { buildLeakHistoryChanges } from "@/utils/historyChanges";
import {
  cleanupUncommittedPhotoReplacements,
  persistPhotoReplacements,
  replaceLeakInCollection,
} from "../utils/persistPhotoReplacements";
import { fromEntries } from "@/utils/fromEntries";
import { applyRecordEdits } from "@/domain/recordEdits";

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
  recordEdits = /** @type {Record<string, Record<string, any>>} */ ({}),
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
    const { repairPhoto, resolvedPhoto } = getStatusRepairMilestones(leak);
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
      // Координаты, поставленные кнопкой «по GPS», несут свой радиус.
      const coordsEditedByHand = dirtyFields.some(
        ({ key }) => key === "lat" || key === "lng",
      );

      const base = {
        ...leak,
        ...textPatch,
        ...(coordsEditedByHand
          ? {
              coords_accuracy: Number.isFinite(localEdit.__gps?.accuracy)
                ? Math.round(localEdit.__gps.accuracy)
                : undefined,
            }
          : {}),
        photo: photoPath ?? leak.photo,
        // Правка снимка починки — не новый ремонт, а исправление вложения у
        // того, который уже был: меняется событие, а не поле записи. У записи
        // без события — заведённой до ленты или устранённой обходом — менять
        // нечего, и снимок остаётся там, где у неё и лежал.
        ...withEditedRepairPhotos(leak, {
          repairPhoto: photoRepairPath,
          afterPhoto: photoAfterPath,
        }),
        calculationParams: localCalcParams,
        calculationVersion: CALCULATION_PARAMS_VERSION,
        updatedAt: Date.now(),
      };
      const withCalc =
        measurementChanged || calcParamsDirty
          ? calculateLeakWithSnapshot(base, vars, localCalcParams)
          : base;
      const withSpeed = speedChanged
        ? { ...withCalc, priority: priorityFromSpeed(withCalc[speedKey]) }
        : withCalc;
      // Исправленные осмотры и ремонты; итог последнего осмотра ведёт статус.
      const { leak: withoutHistory, changes: recordChanges } = applyRecordEdits(
        withSpeed,
        recordEdits,
      );
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
      const changes = [...fieldChanges, ...calcChanges, ...recordChanges];
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
          [isAfterDirty, resolvedPhoto, photoAfterPath],
          [isRepairDirty, repairPhoto, photoRepairPath],
        ],
        deletePhoto,
      });
    } catch (/** @type {any} */ error) {
      await cleanupUncommittedPhotoReplacements({
        value: leak,
        referenceLeaks: allLeaks,
        replacements: [
          [isPhotoDirty, leak.photo, photoPath],
          [isAfterDirty, resolvedPhoto, photoAfterPath],
          [isRepairDirty, repairPhoto, photoRepairPath],
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

  return {
    saving,
    handleSave,
  };
}
