import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildLeakCalculationParams,
  calculationParamsEqual,
} from "@/utils/calculationParams";

export function useLeakDetailsForm({
  leak,
  editFields,
  vars,
  photoActions,
  onLeakChange,
}) {
  const {
    isPhotoDirty,
    isAfterDirty,
    isRepairDirty,
    resetPhoto,
    resetPhotoAfter,
    resetPhotoRepair,
  } = photoActions;
  const [localEdit, setLocalEdit] = useState({});
  const [localCalcParams, setLocalCalcParams] = useState({});
  const previousRevisionRef = useRef(null);

  const resetDraft = useCallback(() => {
    const keys = editFields.map((field) => field.key);
    setLocalEdit(
      Object.fromEntries(keys.map((keyName) => [keyName, leak[keyName]])),
    );
    setLocalCalcParams(buildLeakCalculationParams(leak, vars));
  }, [editFields, leak, vars]);

  useEffect(() => {
    const revision = `${leak.leak_id}:${leak.updatedAt}`;
    if (previousRevisionRef.current === revision) return;
    resetDraft();
    resetPhoto();
    resetPhotoAfter();
    resetPhotoRepair();
    onLeakChange();
    previousRevisionRef.current = revision;
  }, [
    leak,
    editFields,
    vars,
    resetPhoto,
    resetPhotoAfter,
    resetPhotoRepair,
    resetDraft,
    onLeakChange,
  ]);

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

  return {
    localEdit,
    setLocalEdit,
    localCalcParams,
    setLocalCalcParams,
    originalCalcParams,
    dirtyFields,
    calcParamsDirty,
    isDirty,
    resetDraft,
  };
}
