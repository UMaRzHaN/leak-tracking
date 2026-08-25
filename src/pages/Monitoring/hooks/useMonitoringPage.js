import { errorText } from "@/utils/appError";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import { usePhotoRequirements } from "@/app/project/hooks/usePhotoRequirements";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useDataBaseFilters } from "@/pages/DataBase/hooks/useDataBaseFilters";
import { STATUS } from "@/utils/status";
import { MONITORING_RESULT, isMonitoringDue } from "@/utils/monitoring";
import {
  completeMonitoringRound,
  createMonitoringRound,
  readMonitoringRound,
  saveMonitoringRound,
} from "@/utils/monitoringRound";
import { dataUrlToBlob } from "@/utils/photoConversion";
import { buildReopenedLeak } from "@/utils/reopenLeak";
import {
  changeLeakStatus,
  deleteLeakPhotosIfUnreferenced,
  deletePhotoIfUnreferenced,
  getOrphanedOriginalPhoto,
  resolveLeakRecord,
  startLeakRepair,
} from "@/domain/leakLifecycle";
import {
  buildMonitoringPatch,
  createMonitoringDraft,
  getInitialMonitoringResult,
  getMonitoringCounts,
  getMonitoringItems,
  getMonitoringPhotoPathsToKeep,
  getMonitoringRoundSummary,
  getNextMonitoringRoundNumber,
} from "../monitoringDomain";
import { MONITORING_FILTER as FILTERS } from "@/domain/leakFilters";
import { ignoredError } from "@/utils/ignoredError";

export function useMonitoringPage({
  data,
  setData,
  coords,
  sharedFilters,
  requestedLeakId,
  requestedLeakIds = [],
  onRequestedLeakConsumed,
  onRequestedLeaksConsumed,
  userProfile,
}) {
  const { lang, t } = useLanguage();
  const { activeProject } = useProjectData();
  const projectConfig = useProjectConfig();
  const { vars } = useProjectVars(activeProject?.id ?? null);
  const { monitoringPhotoRequired: photoRequired } = usePhotoRequirements(
    activeProject?.id ?? null,
  );
  const { deletePhoto, savePhoto } = usePhotoStorage();
  const listRef = useRef(null);
  const profileName = userProfile?.name?.trim() ?? "";
  const [monitoringRound, setMonitoringRound] = useState(() =>
    readMonitoringRound(activeProject?.id ?? null),
  );
  const [listHeight, setListHeight] = useState(420);
  const [localMonitoringFilter, setLocalMonitoringFilter] = useState(
    FILTERS.DUE,
  );
  const monitoringFilter =
    sharedFilters?.monitoringFilter ?? localMonitoringFilter;
  const setMonitoringFilter =
    sharedFilters?.setMonitoringFilter ?? setLocalMonitoringFilter;
  const [drafts, setDrafts] = useState({});
  const [activeLeak, setActiveLeak] = useState(null);
  const [pickerLeak, setPickerLeak] = useState(null);
  const [resolveLeak, setResolveLeak] = useState(null);
  const [repairLeak, setRepairLeak] = useState(null);
  const [reopenLeak, setReopenLeak] = useState(null);
  const [pendingMonitoringReopen, setPendingMonitoringReopen] = useState(null);
  const [monitorLeak, setMonitorLeak] = useState(null);
  const [monitorQueueIds, setMonitorQueueIds] = useState([]);
  const [monitorQueueTotal, setMonitorQueueTotal] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [roundConfirmOpen, setRoundConfirmOpen] = useState(false);
  const [pendingRoundLeakId, setPendingRoundLeakId] = useState(null);
  const [repeatConfirmLeak, setRepeatConfirmLeak] = useState(null);
  const [notification, setNotification] = useState(null);
  const filters = useDataBaseFilters({
    data,
    coords,
    sharedFilters,
    configuredMainLocationKey: projectConfig.system.location.main,
    configuredLocationKey: projectConfig.system.location.secondary,
    configuredLastLocationKey: projectConfig.system.location.last,
  });
  const monitoringRoundId = monitoringRound?.id ?? null;
  const monitoringRoundNumber = monitoringRound?.number ?? null;
  const hasMonitoringRound = Boolean(monitoringRoundId);
  const isRoundCompleted = Boolean(monitoringRound?.completedAt);
  const hasActiveMonitoringRound = hasMonitoringRound && !isRoundCompleted;

  const globalRoundSummary = useMemo(
    () =>
      getMonitoringRoundSummary(data, monitoringRoundId, monitoringRoundNumber),
    [data, monitoringRoundId, monitoringRoundNumber],
  );
  const allTagsChecked =
    hasMonitoringRound &&
    globalRoundSummary.total > 0 &&
    globalRoundSummary.due === 0;
  const displayRoundSummary =
    isRoundCompleted && monitoringRound?.summary
      ? monitoringRound.summary
      : globalRoundSummary;
  const showCompletion = isRoundCompleted || allTagsChecked;

  const nextMonitoringRoundNumber = useMemo(
    () => getNextMonitoringRoundNumber(data, monitoringRound?.number),
    [data, monitoringRound?.number],
  );

  useEffect(() => {
    setMonitoringRound(readMonitoringRound(activeProject?.id ?? null));
  }, [activeProject?.id]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return undefined;

    const updateListHeight = () => {
      setListHeight(Math.max(1, Math.floor(node.clientHeight)));
    };
    updateListHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateListHeight);
      return () => window.removeEventListener("resize", updateListHeight);
    }

    const observer = new ResizeObserver(updateListHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const startNewRound = () => {
    const next = createMonitoringRound(nextMonitoringRoundNumber);
    const pendingLeak = data.find((leak) => leak.id === pendingRoundLeakId);
    saveMonitoringRound(activeProject?.id ?? null, next);
    setMonitoringRound(next);
    setMonitoringFilter(FILTERS.DUE);
    if (pendingLeak) {
      setDrafts((prev) => ({
        ...prev,
        [pendingLeak.id]: createMonitoringDraft(
          pendingLeak,
          prev[pendingLeak.id],
        ),
      }));
      setMonitorLeak(pendingLeak);
    } else {
      setMonitorQueueIds([]);
      setMonitorQueueTotal(0);
      setMonitorLeak(null);
    }
    setSubmitted(false);
    setPendingRoundLeakId(null);
    setRoundConfirmOpen(false);
  };

  const finishRound = () => {
    if (!allTagsChecked || isRoundCompleted) return;
    const completed = completeMonitoringRound(
      monitoringRound,
      new Date().toISOString(),
      globalRoundSummary,
    );
    if (!completed) return;
    saveMonitoringRound(activeProject?.id ?? null, completed);
    setMonitoringRound(completed);
    setMonitoringFilter(FILTERS.CHECKED);
    setNotification({
      type: "success",
      message: t("monitoring.roundCompletedNotice"),
    });
  };

  const updateDraft = useCallback((id, patch) => {
    setDrafts((previous) => ({
      ...previous,
      [id]: createMonitoringDraft(null, {
        ...(previous[id] ?? {}),
        ...patch,
      }),
    }));
  }, []);

  const showMonitoringSheet = useCallback(
    (leak) => {
      setSubmitted(false);
      updateDraft(leak.id, {
        result: getInitialMonitoringResult(leak),
        materials_equipment: leak.materials_equipment ?? "",
      });
      setMonitorLeak(leak);
    },
    [updateDraft],
  );

  const openMonitoringSheet = useCallback(
    (leak) => {
      if (!leak) return;
      if (!hasActiveMonitoringRound) {
        setPendingRoundLeakId(leak.id);
        setRoundConfirmOpen(true);
        return;
      }
      if (!isMonitoringDue(leak, monitoringRoundId, monitoringRoundNumber)) {
        setRepeatConfirmLeak(leak);
        return;
      }
      showMonitoringSheet(leak);
    },
    [
      hasActiveMonitoringRound,
      monitoringRoundId,
      monitoringRoundNumber,
      showMonitoringSheet,
    ],
  );

  useEffect(() => {
    if (requestedLeakId == null) return;
    const leak = data.find((item) => item.id === requestedLeakId);
    if (leak) openMonitoringSheet(leak);
    onRequestedLeakConsumed?.();
  }, [data, openMonitoringSheet, requestedLeakId, onRequestedLeakConsumed]);

  useEffect(() => {
    if (!requestedLeakIds.length) return;
    const ids = requestedLeakIds.filter((id) =>
      data.some((item) => item.id === id),
    );
    if (!ids.length) {
      onRequestedLeaksConsumed?.();
      return;
    }
    setMonitorQueueIds(ids);
    setMonitorQueueTotal(ids.length);
    const first = data.find((item) => item.id === ids[0]);
    if (first) openMonitoringSheet(first);
    onRequestedLeaksConsumed?.();
  }, [data, openMonitoringSheet, requestedLeakIds, onRequestedLeaksConsumed]);

  // Shape kept as-is so every consumer of `texts` is untouched; only where
  // the strings come from has changed.
  const texts = useMemo(
    () => ({
      title: t("monitoring.title"),
      due: t("monitoring.due"),
      checked: t("monitoring.checked"),
      allTags: t("monitoring.allTags"),
      lastCheck: t("monitoring.lastCheck"),
      never: t("monitoring.never"),
      detectedBy: t("monitoring.detectedBy"),
      result: t("monitoring.result"),
      currentState: t("monitoring.currentState"),
      comment: t("monitoring.comment"),
      commentPlaceholder: t("monitoring.commentPlaceholder"),
      materials: t("monitoring.materials"),
      materialsPlaceholder: t("monitoring.materialsPlaceholder"),
      photo: t("monitoring.photo"),
      check: t("monitoring.check"),
      leakNumber: t("monitoring.leakNumber"),
      close: t("monitoring.close"),
      save: t("monitoring.save"),
      saving: t("monitoring.saving"),
      saveFailed: t("monitoring.saveFailed"),
      required: t("monitoring.required"),
      photoRequired: t("monitoring.photoRequired"),
      startRequired: t("monitoring.startRequired"),
      saved: t("monitoring.saved"),
      empty: t("monitoring.empty"),
      searchEmpty: t("monitoring.searchEmpty"),
      noActiveRound: t("monitoring.noActiveRound"),
      startRound: t("monitoring.startRound"),
      newRound: t("monitoring.newRound"),
      finishRound: t("monitoring.finishRound"),
      roundReady: t("monitoring.roundReady"),
      roundCompleted: t("monitoring.roundCompleted"),
      completed: t("monitoring.completed"),
      openResult: t("monitoring.openResult"),
      repairResult: t("monitoring.repairResult"),
      resolvedResult: t("monitoring.resolvedResult"),
    }),
    [t],
  );
  const requireHistoryUser = useCallback(() => {
    if (profileName) return true;
    setNotification({ type: "error", message: texts.required });
    return false;
  }, [profileName, texts.required]);

  const items = useMemo(() => {
    return getMonitoringItems(
      filters.displayed,
      monitoringFilter,
      monitoringRoundId,
      monitoringRoundNumber,
    );
  }, [
    filters.displayed,
    monitoringFilter,
    monitoringRoundId,
    monitoringRoundNumber,
  ]);

  const counts = useMemo(
    () =>
      getMonitoringCounts(
        filters.displayed,
        monitoringRoundId,
        monitoringRoundNumber,
      ),
    [filters.displayed, monitoringRoundId, monitoringRoundNumber],
  );

  const finishMonitoringSave = async ({
    leak,
    draft,
    photoPath,
    reopenDraft = null,
  }) => {
    const displacedPhotoPaths = new Set();
    if (reopenDraft && leak.status === STATUS.RESOLVED && leak.photo_after) {
      displacedPhotoPaths.add(leak.photo);
    }
    if (draft.result === MONITORING_RESULT.STILL_LEAKING && photoPath) {
      displacedPhotoPaths.add(leak.photo);
      if (leak.status === STATUS.RESOLVED) {
        displacedPhotoPaths.add(leak.photo_after);
      }
    }
    const updated = data.map((item) =>
      item.id === leak.id
        ? (() => {
            const source = reopenDraft
              ? buildReopenedLeak({
                  leak: item,
                  draft: reopenDraft,
                  vars,
                  user: profileName,
                })
              : item;
            return buildMonitoringPatch({
              leak: source,
              draft,
              monitoredBy: profileName,
              photoPath,
              roundId: monitoringRoundId,
              roundNumber: monitoringRound?.number ?? 1,
            });
          })()
        : item,
    );

    try {
      await setData(updated, reopenDraft ? { optimistic: false } : undefined);
    } catch (error) {
      if (photoPath) {
        await deletePhotoIfUnreferenced(photoPath, data, deletePhoto).catch(
          ignoredError("monitoring.photoCleanup"),
        );
      }
      throw error;
    }
    for (const displacedPath of displacedPhotoPaths) {
      await deletePhotoIfUnreferenced(
        displacedPath,
        updated,
        deletePhoto,
      ).catch(ignoredError("monitoring.photoCleanup"));
    }
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[leak.id];
      return next;
    });
    const remainingQueue = monitorQueueIds.filter((id) => id !== leak.id);
    const nextQueueLeak = remainingQueue.length
      ? updated.find((item) => item.id === remainingQueue[0])
      : null;
    setMonitorQueueIds(remainingQueue);
    if (nextQueueLeak) {
      updateDraft(nextQueueLeak.id, {
        materials_equipment: nextQueueLeak.materials_equipment ?? "",
      });
      setMonitorLeak(nextQueueLeak);
    } else {
      setMonitorLeak(null);
      setMonitorQueueTotal(0);
    }
    setSubmitted(false);
    setNotification({ type: "success", message: texts.saved });
  };

  const saveRecord = async (leak) => {
    if (isSaving) return;
    setSubmitted(true);

    if (!hasActiveMonitoringRound) {
      setNotification({ type: "error", message: texts.startRequired });
      setRoundConfirmOpen(true);
      return;
    }

    if (!profileName) {
      setNotification({ type: "error", message: texts.required });
      return;
    }

    const draft = drafts[leak.id] ?? {
      result: getInitialMonitoringResult(leak),
      comment: "",
      materials_equipment: leak.materials_equipment ?? "",
      photo: null,
    };

    if (photoRequired && !draft.photo?.raw) {
      setNotification({ type: "error", message: texts.photoRequired });
      return;
    }

    if (
      leak.status === STATUS.RESOLVED &&
      draft.result === MONITORING_RESULT.STILL_LEAKING
    ) {
      setPendingMonitoringReopen({ leak, draft });
      return;
    }

    setIsSaving(true);
    try {
      const rawPhoto =
        draft.photo?.raw ??
        (draft.photo?.src ? dataUrlToBlob(draft.photo.src) : null);
      const photoPath = rawPhoto
        ? await savePhoto(
            rawPhoto,
            `${leak.id}_monitoring_${Date.now()}`,
            getMonitoringPhotoPathsToKeep(leak),
            { cleanupOldVersions: false },
          )
        : null;
      if (rawPhoto && !photoPath) {
        throw new Error(t("monitoring.photoSaveFailed"));
      }
      await finishMonitoringSave({ leak, draft, photoPath });
    } catch (error) {
      setNotification({
        type: "error",
        message: `${texts.saveFailed}: ${errorText(error, t)}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMonitoringReopenConfirm = async (reopenDraft) => {
    if (isSaving) return;
    if (!requireHistoryUser()) return;
    const pending = pendingMonitoringReopen;
    setPendingMonitoringReopen(null);
    if (!pending) return;

    setIsSaving(true);
    try {
      const rawPhoto =
        pending.draft.photo?.raw ??
        (pending.draft.photo?.src
          ? dataUrlToBlob(pending.draft.photo.src)
          : null);
      const photoPath = rawPhoto
        ? await savePhoto(
            rawPhoto,
            `${pending.leak.id}_monitoring_${Date.now()}`,
            getMonitoringPhotoPathsToKeep(pending.leak),
            { cleanupOldVersions: false },
          )
        : null;
      if (rawPhoto && !photoPath) {
        throw new Error(t("monitoring.photoSaveFailed"));
      }
      await finishMonitoringSave({
        leak: pending.leak,
        draft: pending.draft,
        photoPath,
        reopenDraft,
      });
    } catch (error) {
      setNotification({
        type: "error",
        message: `${texts.saveFailed}: ${errorText(error, t)}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const saveLeak = async (nextLeak, options) => {
    await setData(
      data.map((item) => (item.id === nextLeak.id ? nextLeak : item)),
      options,
    );
    setActiveLeak((current) =>
      current?.id === nextLeak.id ? nextLeak : current,
    );
  };

  const deleteLeak = async (id) => {
    const target = data.find((item) => item.id === id);
    const next = data.filter((item) => item.id !== id);
    await setData(next);
    setActiveLeak(null);
    await deleteLeakPhotosIfUnreferenced(target, next, deletePhoto).catch(
      ignoredError("monitoring.photoCleanup"),
    );
  };

  const handlePickStatus = (leak) => {
    if (!requireHistoryUser()) return;
    setPickerLeak(leak);
  };

  const handleStatusSelect = async (newStatus) => {
    const leak = pickerLeak;
    setPickerLeak(null);
    if (!leak || newStatus === leak.status) return;
    if (!requireHistoryUser()) return;

    if (newStatus === STATUS.RESOLVED) {
      setResolveLeak(leak);
      return;
    }

    if (newStatus === STATUS.IN_PROGRESS) {
      setRepairLeak(leak);
      return;
    }

    if (newStatus === STATUS.OPEN && leak.status === STATUS.RESOLVED) {
      setReopenLeak(leak);
      return;
    }

    const orphanedPhoto = getOrphanedOriginalPhoto(leak);

    const next = data.map((item) =>
      item.id === leak.id
        ? changeLeakStatus(item, newStatus, {
            user: profileName,
          })
        : item,
    );
    await setData(next);

    await deletePhotoIfUnreferenced(orphanedPhoto, next, deletePhoto).catch(
      ignoredError("monitoring.photoCleanup"),
    );
  };

  const handleResolveConfirm = async ({
    photo_after,
    materials_equipment,
    note,
  }) => {
    const leak = resolveLeak;
    if (!leak) return;
    if (!requireHistoryUser()) return;

    try {
      const next = data.map((item) =>
        item.id === leak.id
          ? resolveLeakRecord(
              item,
              { photo_after, materials_equipment, note },
              { user: profileName },
            )
          : item,
      );
      await setData(next);
      setResolveLeak(null);
      if (leak.photo_after && leak.photo_after !== photo_after) {
        await deletePhotoIfUnreferenced(
          leak.photo_after,
          next,
          deletePhoto,
        ).catch(ignoredError("monitoring.photoCleanup"));
      }
    } catch (error) {
      if (photo_after && photo_after !== leak.photo_after) {
        deletePhotoIfUnreferenced(photo_after, data, deletePhoto).catch(
          ignoredError("monitoring.photoCleanup"),
        );
      }
      throw error;
    }
  };

  const handleRepairConfirm = async ({
    photo_repair,
    materials_equipment,
    note,
  }) => {
    const leak = repairLeak;
    if (!leak) return;
    if (!requireHistoryUser()) return;

    const orphanedPhoto = getOrphanedOriginalPhoto(leak);
    try {
      const next = data.map((item) =>
        item.id === leak.id
          ? startLeakRepair(
              item,
              { photo_repair, materials_equipment, note },
              { user: profileName },
            )
          : item,
      );
      await setData(next);
      setRepairLeak(null);
      if (leak.photo_repair && leak.photo_repair !== photo_repair) {
        await deletePhotoIfUnreferenced(
          leak.photo_repair,
          next,
          deletePhoto,
        ).catch(ignoredError("monitoring.photoCleanup"));
      }
      await deletePhotoIfUnreferenced(orphanedPhoto, next, deletePhoto).catch(
        ignoredError("monitoring.photoCleanup"),
      );
    } catch (error) {
      if (photo_repair && photo_repair !== leak.photo_repair) {
        deletePhotoIfUnreferenced(photo_repair, data, deletePhoto).catch(
          ignoredError("monitoring.photoCleanup"),
        );
      }
      throw error;
    }
  };

  const handleReopenConfirm = async (draft) => {
    const leak = reopenLeak;
    if (!leak) return;
    if (!requireHistoryUser()) return;

    const orphanedPhoto = getOrphanedOriginalPhoto(leak);
    const next = data.map((item) =>
      item.id === leak.id
        ? buildReopenedLeak({
            leak: item,
            draft,
            vars,
            user: profileName,
          })
        : item,
    );
    await setData(next, { optimistic: false });
    setReopenLeak(null);
    await deletePhotoIfUnreferenced(orphanedPhoto, next, deletePhoto).catch(
      ignoredError("monitoring.photoCleanup"),
    );
  };

  return {
    activeLeak,
    counts,
    deleteLeak,
    displayRoundSummary,
    drafts,
    filters,
    finishRound,
    handleMonitoringReopenConfirm,
    handlePickStatus,
    handleReopenConfirm,
    handleRepairConfirm,
    handleResolveConfirm,
    handleStatusSelect,
    hasActiveMonitoringRound,
    hasMonitoringRound,
    isSaving,
    items,
    lang,
    listHeight,
    listRef,
    monitoringFilter,
    monitoringRound,
    monitoringRoundId,
    monitoringRoundNumber,
    monitorLeak,
    monitorQueueIds,
    monitorQueueTotal,
    notification,
    openMonitoringSheet,
    pendingMonitoringReopen,
    photoRequired,
    pickerLeak,
    projectConfig,
    reopenLeak,
    repairLeak,
    repeatConfirmLeak,
    resolveLeak,
    roundConfirmOpen,
    saveLeak,
    saveRecord,
    setActiveLeak,
    setMonitorLeak,
    setMonitorQueueIds,
    setMonitorQueueTotal,
    setMonitoringFilter,
    setNotification,
    setPendingMonitoringReopen,
    setPendingRoundLeakId,
    setPickerLeak,
    setReopenLeak,
    setRepairLeak,
    setRepeatConfirmLeak,
    setResolveLeak,
    setRoundConfirmOpen,
    setSubmitted,
    showCompletion,
    showMonitoringSheet,
    startNewRound,
    submitted,
    texts,
    updateDraft,
    vars,
  };
}
