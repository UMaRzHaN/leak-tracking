import { getStatusRepairMilestones } from "@/domain/leakEvents";
import { useRef } from "react";
import { useEditablePhoto } from "@/hooks/useEditablePhoto";

export function useLeakPhotoActions(leak) {
  const fileInputRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const fileInputAfterRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const fileInputRepairRef = useRef(
    /** @type {HTMLInputElement|null} */ (null),
  );

  // Правятся те снимки ремонта и устранения, что карточка показывает по
  // статусу, — в том числе снимок осмотра, если переход сделал обход.
  const { repairPhoto, resolvedPhoto } = getStatusRepairMilestones(leak);

  const before = useEditablePhoto({
    initialPath: leak.photo,
    leakId: String(leak.id),
    version: leak.updatedAt,
    excludePaths: [resolvedPhoto, repairPhoto].filter(Boolean),
  });
  const after = useEditablePhoto({
    initialPath: resolvedPhoto,
    leakId: `${leak.id}_after`,
    version: leak.updatedAt,
    excludePaths: [leak.photo, repairPhoto].filter(Boolean),
  });
  const repair = useEditablePhoto({
    initialPath: repairPhoto,
    leakId: `${leak.id}_repair`,
    version: leak.updatedAt,
    excludePaths: [leak.photo, resolvedPhoto].filter(Boolean),
  });

  return {
    fileInputRef,
    fileInputAfterRef,
    fileInputRepairRef,
    src: before.src,
    srcAfter: after.src,
    srcRepair: repair.src,
    isNative: before.isNative,
    isPhotoDirty: before.isDirty,
    isAfterDirty: after.isDirty,
    isRepairDirty: repair.isDirty,
    changePhoto: before.changePhoto,
    choosePhoto: before.choosePhoto,
    savePhoto: before.savePhoto,
    resetPhoto: before.resetPhoto,
    changePhotoAfter: after.changePhoto,
    choosePhotoAfter: after.choosePhoto,
    savePhotoAfter: after.savePhoto,
    resetPhotoAfter: after.resetPhoto,
    changePhotoRepair: repair.changePhoto,
    choosePhotoRepair: repair.choosePhoto,
    savePhotoRepair: repair.savePhoto,
    resetPhotoRepair: repair.resetPhoto,
  };
}
