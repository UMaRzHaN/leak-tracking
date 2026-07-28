import { useRenderMetric } from "@/utils/renderMetrics";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { STATUS } from "@/utils/status";
import { MONITORING_RESULT, isMonitoringDue } from "@/utils/monitoring";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { dataUrlToBlob } from "@/utils/photoConversion";
import { buildReopenedLeak } from "@/utils/reopenLeak";
import {
  completeMonitoringRound,
  createMonitoringRound,
  readMonitoringRound,
  saveMonitoringRound,
} from "@/utils/monitoringRound";
import { useProjectData } from "@/app/project/ProjectContext";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import { usePhotoRequirements } from "@/app/project/hooks/usePhotoRequirements";
import {
  changeLeakStatus,
  collectLeakPhotoPaths,
  getOrphanedOriginalPhoto,
  resolveLeakRecord,
  startLeakRepair,
} from "@/domain/leakLifecycle";
import VirtualizedLeakList from "@/features/leakList/VirtualizedLeakList/VirtualizedLeakList";
import Notification from "@/components/ui/Notification/Notification";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import FilterBar from "@/pages/DataBase/components/FilterBar";
import { useDataBaseFilters } from "@/pages/DataBase/hooks/useDataBaseFilters";
import MonitoringSheet from "./MonitoringSheet";
import MonitoringListItem from "./MonitoringListItem";
import MonitoringRoundOverview from "./MonitoringRoundOverview";
import {
  MONITORING_FILTER as FILTERS,
  buildMonitoringPatch,
  createMonitoringDraft,
  getInitialMonitoringResult,
  getMonitoringCounts,
  getMonitoringItems,
  getMonitoringRoundSummary,
  getMonitoringPhotoPathsToKeep,
  getNextMonitoringRoundNumber,
} from "./monitoringDomain";
import s from "./Monitoring.module.scss";

export {
  buildMonitoringPatch,
  getMonitoringPhotoPathsToKeep,
} from "./monitoringDomain";

const LeakDetailsSheet = lazy(
  () => import("@/features/leakDetails/LeakDetailsSheet"),
);
const StatusPickerModal = lazy(
  () => import("@/features/status/StatusPickerModal/StatusPickerModal"),
);
const ResolveModal = lazy(
  () => import("@/features/resolve/ResolveModal/ResolveModal"),
);
const ReopenLeakModal = lazy(
  () => import("@/features/status/ReopenLeakModal/ReopenLeakModal"),
);

export default function Monitoring({
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
  useRenderMetric("Monitoring");

  const { lang } = useLanguage();
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
      message: lang === "ru" ? "Обход успешно завершён" : "Round completed",
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

  const texts = useMemo(
    () =>
      lang === "ru"
        ? {
            title: "Мониторинг",
            due: "К проверке",
            checked: "Проверено",
            allTags: "Все теги",
            lastCheck: "Последняя проверка",
            never: "Не проверялась",
            detectedBy: "Зафиксировал",
            result: "Утечка есть?",
            currentState: "текущее состояние",
            comment: "Комментарий",
            commentPlaceholder: "Дополнительные сведения по проверке",
            materials: "МТР (материалы и оборудование)",
            materialsPlaceholder: "Материалы и оборудование",
            photo: "Фото мониторинга",
            check: "Проверить",
            leakNumber: "№",
            close: "Закрыть",
            save: "Сохранить",
            saving: "Сохранение…",
            saveFailed: "Не удалось сохранить результат мониторинга",
            required: "Заполните имя пользователя в профиле",
            photoRequired: "Добавьте фото мониторинга",
            startRequired: "Сначала начните обход мониторинга",
            saved: "Результат мониторинга сохранен",
            empty: "Нет утечек для выбранного фильтра",
            searchEmpty: "Ничего не найдено",
            noActiveRound:
              "Активного обхода нет. Начните мониторинг, чтобы сформировать список к проверке.",
            startRound: "Начать мониторинг",
            newRound: "Новый обход",
            finishRound: "Завершить обход",
            roundReady: "Все теги проверены",
            roundCompleted: "Обход завершён",
            completed: "Завершён",
            openResult: "Открыто",
            repairResult: "В ремонте",
            resolvedResult: "Устранено",
          }
        : {
            title: "Monitoring",
            due: "Due",
            checked: "Checked",
            allTags: "All tags",
            lastCheck: "Last check",
            never: "Never checked",
            detectedBy: "Detected by",
            result: "Is there a leak?",
            currentState: "current state",
            comment: "Comment",
            commentPlaceholder: "Additional check details",
            materials: "Materials and equipment",
            materialsPlaceholder: "Materials and equipment",
            photo: "Monitoring photo",
            check: "Check",
            leakNumber: "№",
            close: "Close",
            save: "Save",
            saving: "Saving…",
            saveFailed: "Failed to save monitoring result",
            required: "Fill in the user name in profile",
            photoRequired: "Add a monitoring photo",
            startRequired: "Start a monitoring round first",
            saved: "Monitoring result saved",
            empty: "No leaks for the selected filter",
            searchEmpty: "Nothing found",
            noActiveRound:
              "No active round. Start monitoring to build the due list.",
            startRound: "Start monitoring",
            newRound: "New round",
            finishRound: "Complete round",
            roundReady: "All tags checked",
            roundCompleted: "Round completed",
            completed: "Completed",
            openResult: "Open",
            repairResult: "In repair",
            resolvedResult: "Resolved",
          },
    [lang],
  );

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
    reopenDraft,
  }) => {
    const orphanedPhoto =
      reopenDraft && leak.status === STATUS.RESOLVED && leak.photo_after
        ? leak.photo
        : null;
    const updated = data.map((item) =>
      item.id === leak.id
        ? (() => {
            const source = reopenDraft
              ? buildReopenedLeak({
                  leak: item,
                  draft: reopenDraft,
                  vars,
                  user: profileName || undefined,
                })
              : item;
            return buildMonitoringPatch({
              leak: source,
              draft,
              monitoredBy: profileName,
              lang,
              photoPath,
              roundId: monitoringRoundId,
              roundNumber: monitoringRound?.number ?? 1,
            });
          })()
        : item,
    );

    try {
      await setData(updated);
    } catch (error) {
      if (photoPath) {
        await deletePhoto(photoPath).catch(() => {});
      }
      throw error;
    }
    if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
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
        throw new Error(
          lang === "ru"
            ? "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0444\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u044e \u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433\u0430"
            : "Failed to save the monitoring photo",
        );
      }
      await finishMonitoringSave({ leak, draft, photoPath });
    } catch (error) {
      setNotification({
        type: "error",
        message: `${texts.saveFailed}: ${error.message}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMonitoringReopenConfirm = async (reopenDraft) => {
    if (isSaving) return;
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
        throw new Error(
          lang === "ru"
            ? "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0444\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u044e \u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433\u0430"
            : "Failed to save the monitoring photo",
        );
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
        message: `${texts.saveFailed}: ${error.message}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const saveLeak = async (nextLeak) => {
    await setData(
      data.map((item) => (item.id === nextLeak.id ? nextLeak : item)),
    );
    setActiveLeak((current) =>
      current?.id === nextLeak.id ? nextLeak : current,
    );
  };

  const deleteLeak = async (id) => {
    const target = data.find((item) => item.id === id);
    await setData(data.filter((item) => item.id !== id));
    setActiveLeak(null);
    for (const path of collectLeakPhotoPaths(target)) {
      deletePhoto(path).catch(() => {});
    }
  };

  const handleStatusSelect = async (newStatus) => {
    const leak = pickerLeak;
    setPickerLeak(null);
    if (!leak || newStatus === leak.status) return;

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

    await setData(
      data.map((item) =>
        item.id === leak.id
          ? changeLeakStatus(item, newStatus, {
              user: profileName || undefined,
            })
          : item,
      ),
    );

    if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
  };

  const handleResolveConfirm = async ({
    photo_after,
    materials_equipment,
    note,
  }) => {
    const leak = resolveLeak;
    if (!leak) return;

    try {
      await setData(
        data.map((item) =>
          item.id === leak.id
            ? resolveLeakRecord(
                item,
                { photo_after, materials_equipment, note },
                { user: profileName || undefined },
              )
            : item,
        ),
      );
      setResolveLeak(null);
      if (leak.photo_after && leak.photo_after !== photo_after) {
        deletePhoto(leak.photo_after).catch(() => {});
      }
    } catch (error) {
      if (photo_after && photo_after !== leak.photo_after) {
        deletePhoto(photo_after).catch(() => {});
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

    const orphanedPhoto = getOrphanedOriginalPhoto(leak);
    try {
      await setData(
        data.map((item) =>
          item.id === leak.id
            ? startLeakRepair(
                item,
                { photo_repair, materials_equipment, note },
                { user: profileName || undefined },
              )
            : item,
        ),
      );
      setRepairLeak(null);
      if (leak.photo_repair && leak.photo_repair !== photo_repair) {
        deletePhoto(leak.photo_repair).catch(() => {});
      }
      if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
    } catch (error) {
      if (photo_repair && photo_repair !== leak.photo_repair) {
        deletePhoto(photo_repair).catch(() => {});
      }
      throw error;
    }
  };

  const handleReopenConfirm = async (draft) => {
    const leak = reopenLeak;
    if (!leak) return;

    const orphanedPhoto = getOrphanedOriginalPhoto(leak);
    await setData(
      data.map((item) =>
        item.id === leak.id
          ? buildReopenedLeak({
              leak: item,
              draft,
              vars,
              user: profileName || undefined,
            })
          : item,
      ),
    );
    setReopenLeak(null);
    if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
  };

  const renderMonitoringItem = useCallback(
    (leak) => (
      <MonitoringListItem
        leak={leak}
        lang={lang}
        texts={texts}
        roundId={monitoringRoundId}
        roundNumber={monitoringRoundNumber}
        hasActiveRound={hasActiveMonitoringRound}
        onOpenDetails={setActiveLeak}
        onPickStatus={setPickerLeak}
        onMonitor={openMonitoringSheet}
      />
    ),
    [
      lang,
      texts,
      monitoringRoundId,
      monitoringRoundNumber,
      hasActiveMonitoringRound,
      openMonitoringSheet,
    ],
  );
  return (
    <div className={`${s.page} content`}>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />
      <ConfirmSheet
        open={roundConfirmOpen}
        title={
          hasMonitoringRound
            ? lang === "ru"
              ? "Начать новый обход?"
              : "Start a new round?"
            : lang === "ru"
              ? "Начать мониторинг?"
              : "Start monitoring?"
        }
        description={
          lang === "ru"
            ? "Список к проверке будет сформирован заново. Уже сохраненные результаты мониторинга останутся в истории утечек."
            : "The due list will be rebuilt. Already saved monitoring results will remain in each leak history."
        }
        confirmLabel={lang === "ru" ? "Начать обход" : "Start round"}
        cancelLabel={lang === "ru" ? "Отмена" : "Cancel"}
        onConfirm={startNewRound}
        onCancel={() => {
          setPendingRoundLeakId(null);
          setMonitorQueueIds([]);
          setMonitorQueueTotal(0);
          setRoundConfirmOpen(false);
        }}
      />
      <ConfirmSheet
        open={Boolean(repeatConfirmLeak)}
        title={
          lang === "ru"
            ? "Тег уже проверен в этом обходе"
            : "Tag already checked in this round"
        }
        description={
          lang === "ru"
            ? "Для этого тега уже сохранён результат мониторинга. Выполнить повторную проверку?"
            : "A monitoring result has already been saved for this tag. Check it again?"
        }
        confirmLabel={lang === "ru" ? "Проверить повторно" : "Check again"}
        cancelLabel={lang === "ru" ? "Отмена" : "Cancel"}
        secondaryActionLabel={
          lang === "ru" ? "Начать новый обход" : "Start a new round"
        }
        onSecondaryAction={() => {
          const leak = repeatConfirmLeak;
          setRepeatConfirmLeak(null);
          setPendingRoundLeakId(leak?.id ?? null);
          setRoundConfirmOpen(true);
        }}
        onConfirm={() => {
          const leak = repeatConfirmLeak;
          setRepeatConfirmLeak(null);
          if (leak) showMonitoringSheet(leak);
        }}
        onCancel={() => setRepeatConfirmLeak(null)}
      />

      <MonitoringRoundOverview
        round={monitoringRound}
        lang={lang}
        texts={texts}
        summary={displayRoundSummary}
        showCompletion={showCompletion}
        hasRound={hasMonitoringRound}
        onStartRound={() => {
          setPendingRoundLeakId(null);
          setRoundConfirmOpen(true);
        }}
        onFinishRound={finishRound}
      />

      <div className={s.sharedFilterBar}>
        <FilterBar
          search={filters.search}
          setSearch={filters.setSearch}
          statusFilter={filters.statusFilter}
          setFilter={filters.setFilter}
          priorityFilter={filters.priorityFilter}
          setPriorityFilter={filters.setPriorityFilter}
          mainLocationFilter={filters.mainLocationFilter}
          setMainLocationFilter={filters.setMainLocationFilter}
          mainLocationKey={filters.mainLocationKey}
          mainLocationLabel={projectConfig.system.location.main_label}
          mainLocationOptions={filters.mainLocationOptions}
          locationFilter={filters.locationFilter}
          setLocationFilter={filters.setLocationFilter}
          locationKey={filters.locationKey}
          locationLabel={projectConfig.system.location.label}
          locationOptions={filters.locationOptions}
          nearbyFilter={filters.nearbyFilter}
          setNearbyFilter={filters.setNearbyFilter}
          nearbyRadius={filters.nearbyRadius}
          setNearbyRadius={filters.setNearbyRadius}
          nearbyRadiusOptions={filters.nearbyRadiusOptions}
          counts={filters.counts}
          hasGps={filters.hasGps}
        />
      </div>

      <div className={s.filters}>
        {[
          [FILTERS.DUE, texts.due, counts.due],
          [FILTERS.CHECKED, texts.checked, counts.checked],
          [FILTERS.ALL, texts.allTags, counts.all],
        ].map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            className={`${s.filterBtn} ${
              (hasMonitoringRound ? monitoringFilter : FILTERS.ALL) === id
                ? s.filterBtnActive
                : ""
            }`}
            aria-pressed={
              (hasMonitoringRound ? monitoringFilter : FILTERS.ALL) === id
            }
            onClick={() => setMonitoringFilter(id)}
          >
            <span>{label}</span>
            <strong>{count}</strong>
          </button>
        ))}
      </div>

      <section ref={listRef} className={s.list}>
        {items.length === 0 ? (
          <div className={s.empty}>
            {filters.search ? texts.searchEmpty : texts.empty}
          </div>
        ) : (
          <VirtualizedLeakList
            items={items}
            height={listHeight}
            bottomPadding={88}
            renderItem={renderMonitoringItem}
          />
        )}
      </section>

      <Suspense fallback={null}>
        {activeLeak && (
          <LeakDetailsSheet
            leak={activeLeak}
            onClose={() => setActiveLeak(null)}
            onSave={saveLeak}
            onDelete={deleteLeak}
            userProfile={userProfile}
          />
        )}

        {monitorLeak && !pendingMonitoringReopen && (
          <MonitoringSheet
            leak={monitorLeak}
            draft={drafts[monitorLeak.id] ?? createMonitoringDraft(monitorLeak)}
            texts={texts}
            lang={lang}
            progress={
              monitorQueueTotal > 1
                ? {
                    current: monitorQueueTotal - monitorQueueIds.length + 1,
                    total: monitorQueueTotal,
                  }
                : null
            }
            submitted={submitted}
            saving={isSaving}
            photoRequired={photoRequired}
            onChange={(patch) => updateDraft(monitorLeak.id, patch)}
            onSave={() => saveRecord(monitorLeak)}
            onClose={() => {
              setSubmitted(false);
              setMonitorLeak(null);
              setMonitorQueueIds([]);
              setMonitorQueueTotal(0);
            }}
          />
        )}

        {pickerLeak && (
          <StatusPickerModal
            current={pickerLeak.status ?? STATUS.OPEN}
            onSelect={handleStatusSelect}
            onClose={() => setPickerLeak(null)}
          />
        )}

        {resolveLeak && (
          <ResolveModal
            leak={resolveLeak}
            onConfirm={handleResolveConfirm}
            onClose={() => setResolveLeak(null)}
          />
        )}

        {repairLeak && (
          <ResolveModal
            leak={repairLeak}
            mode="repair"
            onConfirm={handleRepairConfirm}
            onClose={() => setRepairLeak(null)}
          />
        )}

        {reopenLeak && (
          <ReopenLeakModal
            leak={reopenLeak}
            vars={vars}
            onConfirm={handleReopenConfirm}
            onClose={() => setReopenLeak(null)}
          />
        )}

        {pendingMonitoringReopen && (
          <ReopenLeakModal
            leak={pendingMonitoringReopen.leak}
            vars={vars}
            onConfirm={handleMonitoringReopenConfirm}
            onClose={() => setPendingMonitoringReopen(null)}
          />
        )}
      </Suspense>
    </div>
  );
}
