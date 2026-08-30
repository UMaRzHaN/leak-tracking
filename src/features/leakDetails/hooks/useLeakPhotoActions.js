import { useRef } from "react";
import { useEditablePhoto } from "@/hooks/useEditablePhoto";

export function useLeakPhotoActions(leak) {
  const fileInputRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const fileInputAfterRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const fileInputRepairRef = useRef(
    /** @type {HTMLInputElement|null} */ (null),
  );

  const before = useEditablePhoto({
    initialPath: leak.photo,
    leakId: String(leak.id),
    version: leak.updatedAt,
    excludePaths: [leak.photo_after, leak.photo_repair].filter(Boolean),
  });
  const after = useEditablePhoto({
    initialPath: leak.photo_after,
    leakId: `${leak.id}_after`,
    version: leak.updatedAt,
    excludePaths: [leak.photo, leak.photo_repair].filter(Boolean),
  });
  const repair = useEditablePhoto({
    initialPath: leak.photo_repair,
    leakId: `${leak.id}_repair`,
    version: leak.updatedAt,
    excludePaths: [leak.photo, leak.photo_after].filter(Boolean),
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
