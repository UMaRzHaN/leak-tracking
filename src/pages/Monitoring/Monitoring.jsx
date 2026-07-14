import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { STATUS } from "@/utils/status";
import {
  MONITORING_RESULT,
  MONITORING_RESULT_ORDER,
  formatMonitoringDate,
  getLastMonitoringRecord,
  getMonitoringResultLabel,
  isMonitoringDue,
} from "@/utils/monitoring";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { dataUrlToBlob } from "@/utils/photoConversion";
import { buildLeakHistoryChanges } from "@/utils/historyChanges";
import { buildReopenedLeak } from "@/utils/reopenLeak";
import {
  completeMonitoringRound,
  createMonitoringRound,
  readMonitoringRound,
  saveMonitoringRound,
} from "@/utils/monitoringRound";
import { useProjectData } from "@/app/project/ProjectContext";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import LeakCardCompact from "@/features/leakList/LeakCardCompact/LeakCardCompact";
import VirtualizedLeakList from "@/features/leakList/VirtualizedLeakList/VirtualizedLeakList";
import Notification from "@/components/ui/Notification/Notification";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import FilterBar from "@/pages/DataBase/components/FilterBar";
import { useDataBaseFilters } from "@/pages/DataBase/hooks/useDataBaseFilters";
import PhotoInput from "@/features/photos/PhotoInput/PhotoInput";
import s from "./Monitoring.module.scss";

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

const FILTERS = {
  DUE: "due",
  CHECKED: "checked",
  ALL: "all",
};

function formatRoundPeriod(startedAt, completedAt, lang) {
  const started = new Date(startedAt);
  if (!Number.isFinite(started.getTime())) return "";
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  const date = started.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const formatTime = (value) =>
    new Date(value).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${date}, ${formatTime(startedAt)}${
    completedAt ? `–${formatTime(completedAt)}` : ""
  }`;
}

const STATUS_TO_MONITORING_RESULT = {
  [STATUS.OPEN]: MONITORING_RESULT.STILL_LEAKING,
  [STATUS.IN_PROGRESS]: MONITORING_RESULT.NEEDS_RECHECK,
  [STATUS.RESOLVED]: MONITORING_RESULT.RESOLVED,
};

function getCurrentMonitoringResult(leak) {
  return STATUS_TO_MONITORING_RESULT[leak?.status ?? STATUS.OPEN];
}

function getInitialMonitoringResult(leak) {
  return getCurrentMonitoringResult(leak) ?? MONITORING_RESULT.STILL_LEAKING;
}

export function getMonitoringPhotoPathsToKeep(leak) {
  return [
    leak?.photo,
    leak?.photo_after,
    leak?.photo_repair,
    ...(Array.isArray(leak?.monitoringRecords)
      ? leak.monitoringRecords.map((record) => record?.photo)
      : []),
  ].filter(Boolean);
}

export function buildMonitoringPatch({
  leak,
  draft,
  monitoredBy,
  lang,
  photoPath,
  roundId,
  roundNumber,
}) {
  const now = new Date();
  const result = draft.result || MONITORING_RESULT.STILL_LEAKING;
  const materialsEquipment = draft.materials_equipment?.trim() || undefined;
  const previousMaterialsEquipment =
    leak.materials_equipment?.trim() || undefined;
  const materialsChanged = materialsEquipment !== previousMaterialsEquipment;
  const record = {
    id: `${leak.id}-${now.getTime()}`,
    date: now.toISOString(),
    roundId,
    roundNumber,
    monitoredBy: monitoredBy.trim(),
    result,
    photo: photoPath,
    ...(materialsChanged
      ? {
          materials_equipment: materialsEquipment ?? null,
          materialsChanged: true,
        }
      : {}),
    comment: draft.comment?.trim() || undefined,
  };

  const nextStatus =
    result === MONITORING_RESULT.RESOLVED
      ? STATUS.RESOLVED
      : result === MONITORING_RESULT.NEEDS_RECHECK
        ? STATUS.IN_PROGRESS
        : STATUS.OPEN;
  const statusPatch =
    nextStatus === STATUS.RESOLVED
      ? {
          status: nextStatus,
          resolvedAt: now.getTime(),
          photo_after: photoPath ?? leak.photo_after,
        }
      : {
          status: nextStatus,
          resolvedAt: null,
          ...(nextStatus === STATUS.IN_PROGRESS
            ? {
                repairAt: now.getTime(),
                photo_repair: photoPath ?? leak.photo_repair,
              }
            : {}),
        };
  const nextLeakForChanges = {
    ...leak,
    ...statusPatch,
    materials_equipment: materialsEquipment,
  };
  const changes = buildLeakHistoryChanges({
    before: leak,
    after: nextLeakForChanges,
    fields: [{ key: "materials_equipment" }],
  });

  return {
    ...leak,
    ...statusPatch,
    materials_equipment: materialsEquipment,
    updatedAt: now.getTime(),
    monitoringRecords: [...(leak.monitoringRecords ?? []), record],
    history: [
      ...(leak.history ?? []),
      {
        action: "monitoring",
        date: record.date,
        to: nextStatus,
        user: record.monitoredBy || undefined,
        text: [getMonitoringResultLabel(result, lang), record.comment || ""]
          .filter(Boolean)
          .join(" "),
        ...(changes.length > 0 ? { changes } : {}),
      },
    ],
  };
}

function MonitoringSheet({
  leak,
  draft,
  texts,
  lang,
  progress,
  submitted,
  onChange,
  onSave,
  onClose,
}) {
  return (
    <div className={s.sheetOverlay} onClick={onClose}>
      <div className={s.sheet} onClick={(event) => event.stopPropagation()}>
        <div className={s.sheetHandle} />
        <div className={s.sheetHeader}>
          <div className={s.sheetTitleBlock}>
            <div className={s.sheetTitleRow}>
              <h2>{texts.check}</h2>
              {progress && progress.total > 1 && (
                <span className={s.progressBadge}>
                  {progress.current} / {progress.total}
                </span>
              )}
            </div>
            <p>
              {texts.leakNumber} {leak?.leak_id ?? leak?.index ?? "—"}
            </p>
          </div>
          <button type="button" className={s.sheetCloseBtn} onClick={onClose}>
            {texts.close}
          </button>
        </div>

        <label className={s.field}>
          <span>{texts.result}</span>
          <select
            value={draft.result}
            onChange={(event) => onChange({ result: event.target.value })}
          >
            {MONITORING_RESULT_ORDER.map((result) => {
              const current = result === getCurrentMonitoringResult(leak);
              const label = getMonitoringResultLabel(result, lang);
              return (
                <option key={result} value={result}>
                  {current ? `${label} (${texts.currentState})` : label}
                </option>
              );
            })}
          </select>
        </label>

        <label className={s.field}>
          <span>{texts.comment}</span>
          <textarea
            value={draft.comment}
            onChange={(event) => onChange({ comment: event.target.value })}
            placeholder={texts.commentPlaceholder}
            rows={2}
          />
        </label>

        <label className={s.field}>
          <span>{texts.materials}</span>
          <textarea
            value={draft.materials_equipment ?? ""}
            onChange={(event) =>
              onChange({ materials_equipment: event.target.value })
            }
            placeholder={texts.materialsPlaceholder}
            rows={2}
          />
        </label>

        <PhotoInput
          value={draft.photo}
          onChange={(photo) => onChange({ photo })}
          label={texts.photo}
          required
          compact
          error={submitted && !draft.photo?.raw}
        />

        <button type="button" className={s.saveBtn} onClick={onSave}>
          {texts.save}
        </button>
      </div>
    </div>
  );
}

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
  const { lang } = useLanguage();
  const { activeProject } = useProjectData();
  const { vars } = useProjectVars(activeProject?.id ?? null);
  const { deletePhoto, savePhoto } = usePhotoStorage();
  const listRef = useRef(null);
  const profileName = userProfile?.name?.trim() ?? "";
  const [monitoringRound, setMonitoringRound] = useState(() =>
    readMonitoringRound(activeProject?.id ?? null),
  );
  const [listHeight, setListHeight] = useState(420);
  const [filter, setFilter] = useState(FILTERS.DUE);
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
  const [roundConfirmOpen, setRoundConfirmOpen] = useState(false);
  const [pendingRoundLeakId, setPendingRoundLeakId] = useState(null);
  const [repeatConfirmLeak, setRepeatConfirmLeak] = useState(null);
  const [notification, setNotification] = useState(null);
  const filters = useDataBaseFilters({ data, coords, sharedFilters });
  const monitoringRoundId = monitoringRound?.id ?? null;
  const monitoringRoundNumber = monitoringRound?.number ?? null;
  const hasMonitoringRound = Boolean(monitoringRoundId);
  const isRoundCompleted = Boolean(monitoringRound?.completedAt);
  const hasActiveMonitoringRound = hasMonitoringRound && !isRoundCompleted;

  const globalRoundSummary = useMemo(() => {
    const due = hasMonitoringRound
      ? data.filter((leak) =>
          isMonitoringDue(leak, monitoringRoundId, monitoringRoundNumber),
        ).length
      : data.length;
    return {
      total: data.length,
      due,
      checked: Math.max(0, data.length - due),
      open: data.filter((leak) => (leak.status ?? STATUS.OPEN) === STATUS.OPEN)
        .length,
      inProgress: data.filter((leak) => leak.status === STATUS.IN_PROGRESS)
        .length,
      resolved: data.filter((leak) => leak.status === STATUS.RESOLVED).length,
    };
  }, [data, hasMonitoringRound, monitoringRoundId, monitoringRoundNumber]);
  const allTagsChecked =
    hasMonitoringRound &&
    globalRoundSummary.total > 0 &&
    globalRoundSummary.due === 0;
  const displayRoundSummary =
    isRoundCompleted && monitoringRound?.summary
      ? monitoringRound.summary
      : globalRoundSummary;
  const showCompletion = isRoundCompleted || allTagsChecked;

  const nextMonitoringRoundNumber = useMemo(() => {
    const maxRecordNumber = data.reduce((max, leak) => {
      const records = Array.isArray(leak.monitoringRecords)
        ? leak.monitoringRecords
        : [];
      return records.reduce((recordMax, record) => {
        const value = Number(record?.roundNumber);
        return Number.isFinite(value) && value > recordMax ? value : recordMax;
      }, max);
    }, 0);

    return Math.max(Number(monitoringRound?.number) || 0, maxRecordNumber) + 1;
  }, [data, monitoringRound?.number]);

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
    setFilter(FILTERS.DUE);
    if (pendingLeak) {
      setDrafts((prev) => ({
        ...prev,
        [pendingLeak.id]: {
          result: getInitialMonitoringResult(pendingLeak),
          comment: "",
          materials_equipment: pendingLeak.materials_equipment ?? "",
          photo: null,
          ...(prev[pendingLeak.id] ?? {}),
        },
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
    setFilter(FILTERS.CHECKED);
    setNotification({
      type: "success",
      message: lang === "ru" ? "Обход успешно завершён" : "Round completed",
    });
  };

  const showMonitoringSheet = (leak) => {
    setSubmitted(false);
    updateDraft(leak.id, {
      result: getInitialMonitoringResult(leak),
      materials_equipment: leak.materials_equipment ?? "",
    });
    setMonitorLeak(leak);
  };

  const openMonitoringSheet = (leak) => {
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
  };

  useEffect(() => {
    if (requestedLeakId == null) return;
    const leak = data.find((item) => item.id === requestedLeakId);
    if (leak) openMonitoringSheet(leak);
    onRequestedLeakConsumed?.();
    // openMonitoringSheet intentionally uses current draft state; requested id is one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, requestedLeakId, onRequestedLeakConsumed]);

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
    // openMonitoringSheet intentionally uses current draft state; requested ids are one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, requestedLeakIds, onRequestedLeaksConsumed]);

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
            result: "Результат",
            currentState: "текущее состояние",
            comment: "Комментарий",
            commentPlaceholder: "Дополнительные сведения по проверке",
            materials: "МТР (материалы и оборудование)",
            materialsPlaceholder: "Материалы, оборудование, выполненные работы",
            photo: "Фото мониторинга",
            check: "Проверить",
            leakNumber: "№",
            close: "Закрыть",
            save: "Сохранить",
            required: "Заполните имя пользователя в профиле",
            photoRequired: "Добавьте фото мониторинга",
            startRequired: "Сначала начните обход мониторинга",
            saved: "Результат мониторинга сохранен",
            empty: "Нет утечек для выбранного фильтра",
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
            result: "Result",
            currentState: "current state",
            comment: "Comment",
            commentPlaceholder: "Additional check details",
            materials: "Materials and equipment",
            materialsPlaceholder: "Materials, equipment, completed work",
            photo: "Monitoring photo",
            check: "Check",
            leakNumber: "№",
            close: "Close",
            save: "Save",
            required: "Fill in the user name in profile",
            photoRequired: "Add a monitoring photo",
            startRequired: "Start a monitoring round first",
            saved: "Monitoring result saved",
            empty: "No leaks for the selected filter",
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
    const sorted = [...filters.displayed].sort((left, right) => {
      const leftDue =
        hasMonitoringRound &&
        isMonitoringDue(left, monitoringRoundId, monitoringRoundNumber);
      const rightDue =
        hasMonitoringRound &&
        isMonitoringDue(right, monitoringRoundId, monitoringRoundNumber);
      if (leftDue !== rightDue) return leftDue ? -1 : 1;
      return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
    });

    if (!hasMonitoringRound) return sorted;
    if (filter === FILTERS.DUE)
      return sorted.filter((leak) =>
        isMonitoringDue(leak, monitoringRoundId, monitoringRoundNumber),
      );
    if (filter === FILTERS.CHECKED)
      return sorted.filter(
        (leak) =>
          !isMonitoringDue(leak, monitoringRoundId, monitoringRoundNumber),
      );
    return sorted;
  }, [
    filters.displayed,
    filter,
    hasMonitoringRound,
    monitoringRoundId,
    monitoringRoundNumber,
  ]);

  const counts = useMemo(
    () => ({
      due: hasMonitoringRound
        ? filters.displayed.filter((leak) =>
            isMonitoringDue(leak, monitoringRoundId, monitoringRoundNumber),
          ).length
        : 0,
      checked: hasMonitoringRound
        ? filters.displayed.filter(
            (leak) =>
              !isMonitoringDue(leak, monitoringRoundId, monitoringRoundNumber),
          ).length
        : 0,
      all: filters.displayed.length,
    }),
    [
      filters.displayed,
      hasMonitoringRound,
      monitoringRoundId,
      monitoringRoundNumber,
    ],
  );

  const updateDraft = (id, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        result: MONITORING_RESULT.STILL_LEAKING,
        comment: "",
        materials_equipment: "",
        photo: null,
        ...(prev[id] ?? {}),
        ...patch,
      },
    }));
  };

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

    await setData(updated);
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

    if (!draft.photo?.raw) {
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

    const rawPhoto = draft.photo.raw ?? dataUrlToBlob(draft.photo.src);
    const photoPath = await savePhoto(
      rawPhoto,
      `${leak.id}_monitoring_${Date.now()}`,
      getMonitoringPhotoPathsToKeep(leak),
    );
    await finishMonitoringSave({ leak, draft, photoPath });
  };

  const handleMonitoringReopenConfirm = async (reopenDraft) => {
    const pending = pendingMonitoringReopen;
    setPendingMonitoringReopen(null);
    if (!pending) return;

    const rawPhoto =
      pending.draft.photo.raw ?? dataUrlToBlob(pending.draft.photo.src);
    const photoPath = await savePhoto(
      rawPhoto,
      `${pending.leak.id}_monitoring_${Date.now()}`,
      getMonitoringPhotoPathsToKeep(pending.leak),
    );
    await finishMonitoringSave({
      leak: pending.leak,
      draft: pending.draft,
      photoPath,
      reopenDraft,
    });
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
    await setData(data.filter((item) => item.id !== id));
    setActiveLeak(null);
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

    const photoUpdate =
      leak.status === STATUS.RESOLVED
        ? { photo: leak.photo_after ?? leak.photo, photo_after: null }
        : {};
    const orphanedPhoto =
      leak.status === STATUS.RESOLVED && leak.photo_after ? leak.photo : null;
    const repairAt = Date.now();
    const now = new Date(repairAt).toISOString();

    await setData(
      data.map((item) =>
        item.id === leak.id
          ? {
              ...item,
              ...photoUpdate,
              status: newStatus,
              updatedAt: Date.now(),
              history: [
                ...(item.history ?? []),
                {
                  action: "status_changed",
                  to: newStatus,
                  date: now,
                  user: profileName || undefined,
                },
              ],
            }
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
    setResolveLeak(null);
    if (!leak) return;

    const now = new Date().toISOString();
    await setData(
      data.map((item) =>
        item.id === leak.id
          ? {
              ...item,
              status: STATUS.RESOLVED,
              resolvedAt: Date.now(),
              photo_after: photo_after ?? item.photo_after,
              materials_equipment:
                materials_equipment ?? item.materials_equipment,
              note: note ?? item.note,
              updatedAt: Date.now(),
              history: [
                ...(item.history ?? []),
                {
                  action: "status_changed",
                  to: STATUS.RESOLVED,
                  date: now,
                  user: profileName || undefined,
                },
              ],
            }
          : item,
      ),
    );
  };

  const handleRepairConfirm = async ({
    photo_repair,
    materials_equipment,
    note,
  }) => {
    const leak = repairLeak;
    setRepairLeak(null);
    if (!leak) return;

    const now = new Date().toISOString();
    const orphanedPhoto =
      leak.status === STATUS.RESOLVED && leak.photo_after ? leak.photo : null;
    await setData(
      data.map((item) =>
        item.id === leak.id
          ? {
              ...item,
              ...(item.status === STATUS.RESOLVED
                ? { photo: item.photo_after ?? item.photo, photo_after: null }
                : {}),
              status: STATUS.IN_PROGRESS,
              resolvedAt: null,
              repairAt,
              photo_repair: photo_repair ?? item.photo_repair,
              materials_equipment:
                materials_equipment ?? item.materials_equipment,
              note: note ?? item.note,
              updatedAt: Date.now(),
              history: [
                ...(item.history ?? []),
                {
                  action: "status_changed",
                  to: STATUS.IN_PROGRESS,
                  date: now,
                  user: profileName || undefined,
                },
              ],
            }
          : item,
      ),
    );
    if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
  };

  const handleReopenConfirm = async (draft) => {
    const leak = reopenLeak;
    setReopenLeak(null);
    if (!leak) return;

    const orphanedPhoto =
      leak.status === STATUS.RESOLVED && leak.photo_after ? leak.photo : null;
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
    if (orphanedPhoto) deletePhoto(orphanedPhoto).catch(() => {});
  };

  const renderMonitoringItem = (leak) => {
    const last = getLastMonitoringRecord(leak);
    const isDue =
      hasActiveMonitoringRound &&
      isMonitoringDue(leak, monitoringRoundId, monitoringRoundNumber);
    return (
      <article className={s.monitoringItem}>
        <LeakCardCompact
          leak={leak}
          className={s.monitoringCard}
          onOpenDetails={setActiveLeak}
          onPickStatus={setPickerLeak}
          onMonitor={openMonitoringSheet}
          nearbyDist={leak._nearbyDist}
        />

        <div className={s.monitoringBar}>
          <div className={s.monitoringBarText}>
            <span className={isDue ? s.dueText : s.okText}>
              {last
                ? `${texts.lastCheck}: ${formatMonitoringDate(last.date, lang)}`
                : texts.never}
            </span>
            {last && (
              <strong>{getMonitoringResultLabel(last.result, lang)}</strong>
            )}
            {leak.detectedBy && <em>{leak.detectedBy}</em>}
          </div>

          <button
            type="button"
            className={s.checkBtn}
            onClick={() => openMonitoringSheet(leak)}
          >
            {texts.check}
          </button>
        </div>
      </article>
    );
  };

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
        onConfirm={() => {
          const leak = repeatConfirmLeak;
          setRepeatConfirmLeak(null);
          if (leak) showMonitoringSheet(leak);
        }}
        onCancel={() => setRepeatConfirmLeak(null)}
      />

      <header className={s.header}>
        <div>
          {monitoringRound?.startedAt ? (
            <div className={s.roundMeta}>
              <span className={s.roundBadge}>
                {lang === "ru" ? "Обход" : "Round"} №
                {monitoringRound.number ?? 1}
              </span>
              <span className={s.roundSeparator}>·</span>
              <span>
                {formatRoundPeriod(
                  monitoringRound.startedAt,
                  monitoringRound.completedAt,
                  lang,
                )}
              </span>
            </div>
          ) : (
            <p>{texts.noActiveRound}</p>
          )}
        </div>
        {!showCompletion && (
          <button
            type="button"
            className={s.newRoundBtn}
            onClick={() => {
              setPendingRoundLeakId(null);
              setRoundConfirmOpen(true);
            }}
          >
            {hasMonitoringRound ? texts.newRound : texts.startRound}
          </button>
        )}
      </header>

      {showCompletion && (
        <section
          className={`${s.completionCard} ${
            isRoundCompleted ? s.completionCardDone : ""
          }`}
          aria-live="polite"
        >
          <div className={s.completionSummary}>
            <span className={s.completionIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="m7.5 12.5 3 3 6-7" />
              </svg>
            </span>
            <div className={s.completionHeading}>
              <strong>
                {isRoundCompleted ? texts.roundCompleted : texts.roundReady}
              </strong>
              <span>
                {displayRoundSummary.checked}/{displayRoundSummary.total}
              </span>
            </div>
          </div>
          <div className={s.completionStats}>
            <span className={s.completionStat}>
              <i className={s.statOpen} />
              <small>{texts.openResult}</small>
              <strong>{displayRoundSummary.open}</strong>
            </span>
            <span className={s.completionStat}>
              <i className={s.statRepair} />
              <small>{texts.repairResult}</small>
              <strong>{displayRoundSummary.inProgress}</strong>
            </span>
            <span className={s.completionStat}>
              <i className={s.statResolved} />
              <small>{texts.resolvedResult}</small>
              <strong>{displayRoundSummary.resolved}</strong>
            </span>
          </div>
          <button
            type="button"
            className={s.completionAction}
            onClick={() => {
              if (isRoundCompleted) {
                setPendingRoundLeakId(null);
                setRoundConfirmOpen(true);
              } else {
                finishRound();
              }
            }}
          >
            {isRoundCompleted ? texts.newRound : texts.finishRound}
          </button>
        </section>
      )}

      <div className={s.sharedFilterBar}>
        <FilterBar
          search={filters.search}
          setSearch={filters.setSearch}
          statusFilter={filters.statusFilter}
          setFilter={filters.setFilter}
          priorityFilter={filters.priorityFilter}
          setPriorityFilter={filters.setPriorityFilter}
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
              (hasMonitoringRound ? filter : FILTERS.ALL) === id
                ? s.filterBtnActive
                : ""
            }`}
            onClick={() => setFilter(id)}
          >
            <span>{label}</span>
            <strong>{count}</strong>
          </button>
        ))}
      </div>

      <section ref={listRef} className={s.list}>
        {items.length === 0 ? (
          <div className={s.empty}>{texts.empty}</div>
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
            draft={
              drafts[monitorLeak.id] ?? {
                result: getInitialMonitoringResult(monitorLeak),
                comment: "",
                materials_equipment: monitorLeak.materials_equipment ?? "",
                photo: null,
              }
            }
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
