import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildLeakCalculationParams,
  calculationParamsEqual,
} from "@/utils/calculationParams";
import { fromEntries } from "@/utils/fromEntries";
import { hasRecordEdits } from "@/domain/recordEdits";

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
  // Правки записанных осмотров и ремонтов — по ключу записи.
  const [recordEdits, setRecordEdits] = useState(
    /** @type {Record<string, Record<string, any>>} */ ({}),
  );
  const previousRevisionRef = useRef(/** @type {any} */ (null));

  const resetDraft = useCallback(() => {
    const keys = editFields.map((field) => field.key);
    setLocalEdit(fromEntries(keys.map((keyName) => [keyName, leak[keyName]])));
    setLocalCalcParams(buildLeakCalculationParams(leak, vars));
    setRecordEdits({});
  }, [editFields, leak, vars]);

  useEffect(() => {
    const identity = leak.id ?? leak.leak_id ?? leak.index ?? "";
    const revision = `${identity}:${leak.leak_id ?? ""}:${leak.updatedAt ?? ""}`;
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
  const recordsDirty = useMemo(
    () => hasRecordEdits(leak, recordEdits),
    [leak, recordEdits],
  );
  const isDirty =
    recordsDirty ||
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
    recordEdits,
    setRecordEdits,
    resetDraft,
  };
}
