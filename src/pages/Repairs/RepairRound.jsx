import { errorText } from "@/utils/appError";
import { lazy, Suspense, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import LeakCardCompact from "@/features/leakList/LeakCardCompact/LeakCardCompact";
import Notification from "@/components/ui/Notification/Notification";
import FilterBar from "@/pages/DataBase/components/FilterBar";
import { useDataBaseFilters } from "@/pages/DataBase/hooks/useDataBaseFilters";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import {
  REPAIR_STAGE,
  getLastRepairStageMark,
  getRepairBrigade,
  getRepairLeaks,
  getRepairStage,
} from "@/domain/repairStages";
import { getRepairDoneAt } from "@/domain/leakEvents";
import { getRepairStageMeta, splitMaterials } from "@/utils/repairStage";
import { formatMonitoringDate } from "@/utils/monitoring";
import { useProjectData } from "@/app/project/ProjectContext";
import { useRoundPermissions } from "@/app/project/hooks/useAllowNewRounds";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import MonitoringRoundOverview from "@/pages/Monitoring/MonitoringRoundOverview";
import { ROUND_KIND } from "@/app/project/roundConflict";
import { useRoundStartGuard } from "@/app/project/hooks/useRoundStartGuard";
import { mergeRepairRoundWithChecks, repairRound } from "./repairRoundStore";
import RepairLeakDetails from "./RepairLeakDetails";
import {
  REPAIR_ROUND_FILTER as FILTER,
  getRepairRoundItems,
  isRepairChecked,
  repairRoundState,
  summarizeRepairRound,
} from "./repairRoundDomain";
import s from "./Repairs.module.scss";

const RepairCheck = lazy(() => import("./RepairCheck"));

/**
 * Обход ремонтов (7b): карточка из обхода мониторинга, но в футере — стадия
 * работ и приёмка. «Принять» у готовых открывает приёмку (7c), у остальных
 * «Отметить» — стадию, бригаду и замечание.
 */
export default function RepairRound({
  data,
  scopedData = data,
  setData,
  coords = /** @type {any} */ (null),
  sharedFilters = /** @type {any} */ (null),
  userProfile,
}) {
  const { t, lang } = useLanguage();
  const { activeProject } = useProjectData();
  const projectId = activeProject?.id ?? null;
  const [round, setRound] = useState(() => repairRound.read(projectId));
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState(false);
  // Разрешения обхода ремонтов из настроек проекта — как у мониторинга.
  const [allowed] = useRoundPermissions(projectId, "repairs");
  const [filter, setFilter] = useState(/** @type {string} */ (FILTER.DUE));
  const [checkLeak, setCheckLeak] = useState(/** @type {any} */ (null));
  // Повторная проверка уже проверенного в обходе — с подтверждением, как в
  // мониторинге; «Новый обход» из него открывает проверку после старта.
  const [repeatLeak, setRepeatLeak] = useState(/** @type {any} */ (null));
  const [pendingLeak, setPendingLeak] = useState(/** @type {any} */ (null));
  const [detailsLeak, setDetailsLeak] = useState(/** @type {any} */ (null));
  const [notification, setNotification] = useState(/** @type {any} */ (null));

  const repairs = useMemo(() => getRepairLeaks(scopedData), [scopedData]);
  // Панель фильтров — та же, что в обходе мониторинга; отбор идёт по
  // ремонтам, а шапка обхода считает все ремонты, без отбора.
  const projectConfig = useProjectConfig();
  const allRepairs = useMemo(() => getRepairLeaks(data), [data]);
  const filters = useDataBaseFilters({
    data: allRepairs,
    coords,
    sharedFilters,
    configuredMainLocationKey: projectConfig.system.location.main,
    configuredLocationKey: projectConfig.system.location.secondary,
    configuredLastLocationKey: projectConfig.system.location.last,
  });
  const summary = useMemo(
    () => summarizeRepairRound(repairs, round),
    [repairs, round],
  );
  const tabs = useMemo(
    () => summarizeRepairRound(filters.displayed, round),
    [filters.displayed, round],
  );
  const items = useMemo(
    () => getRepairRoundItems(filters.displayed, { filter, round }),
    [filters.displayed, filter, round],
  );
  const roundActive = Boolean(round && !round.completedAt);
  // Пока не завершён обход мониторинга, обход ремонтов не начинается.
  const roundBlocked = useRoundStartGuard(
    projectId,
    ROUND_KIND.REPAIRS,
    setNotification,
  );
  // Как в мониторинге и сверке: без идущего обхода проверка сначала
  // спрашивает, начинать ли новый, а не начинает его молча (и не проходит
  // мимо всякого обхода, когда прошлый завершён).
  const openCheck = (leak) => {
    if (roundActive) {
      if (isRepairChecked(leak, round)) setRepeatLeak(leak);
      else setCheckLeak(leak);
      return;
    }
    if (!allowed.allowNew) {
      const warning = t("repairs.round.disabled");
      return setNotification({ type: "warning", message: warning });
    }
    if (roundBlocked()) return;
    setPendingLeak(leak);
    setConfirmNew(true);
  };

  const footerOf = (leak) => {
    const stage = getRepairStage(leak);
    const mark = getLastRepairStageMark(leak);
    const brigade = getRepairBrigade(leak);
    if (stage === REPAIR_STAGE.RESOLVED) {
      const doneAt = getRepairDoneAt(leak);
      return {
        tone: "ok",
        title: doneAt
          ? t("repairs.round.resolvedAt", {
              date: formatMonitoringDate(doneAt, lang),
            })
          : t("repairs.stages.resolved"),
        meta: brigade,
      };
    }
    const checked = isRepairChecked(leak, round);
    return {
      tone: checked
        ? "ok"
        : stage === REPAIR_STAGE.WAITING_MTR
          ? "warn"
          : "info",
      checked,
      title: mark
        ? t("repairs.round.markedAt", {
            date: formatMonitoringDate(mark.date, lang),
          })
        : t("repairs.round.notMarked"),
      meta: [mark?.note || t(`repairs.stages.${stage}`), brigade]
        .filter(Boolean)
        .join(" · "),
    };
  };

  return (
    <div className={`${s.page} content`}>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      {/* Шапка — та же, что у обхода мониторинга и сверки реестра. */}
      <MonitoringRoundOverview
        round={round}
        lang={lang}
        badge={t("repairs.round.badge")}
        mergeLabel={(number) => t("repairs.round.mergeAction", { number })}
        texts={{
          noActiveRound: t("repairs.round.noRound"),
          newRound: t("repairs.round.newRound"),
          startRound: t("repairs.round.startRound"),
          finishRound: t("repairs.round.finishRound"),
          roundReady: t("repairs.round.roundReady"),
          roundCompleted: t("repairs.round.roundCompleted"),
        }}
        summary={{
          checked: summary.checked,
          total: summary.due + summary.checked,
        }}
        stats={[
          {
            key: "resolved",
            label: t("repairs.stages.resolved"),
            value: summary.resolved,
            tone: "resolved",
          },
          {
            key: "in_repair",
            label: t("repairs.stages.in_repair"),
            value: summary.inRepair,
            tone: "repair",
          },
          {
            key: "waiting",
            label: t("repairs.stages.waiting_mtr"),
            value: summary.waiting,
            tone: "open",
          },
        ]}
        showCompletion={Boolean(
          round &&
          (round.completedAt || (summary.checked > 0 && summary.due === 0)),
        )}
        hasRound={Boolean(round)}
        onStartRound={() => {
          if (!roundBlocked()) setConfirmNew(true);
        }}
        onFinishRound={() => {
          setRound(repairRound.finish(projectId));
          setNotification({
            type: "success",
            message: t("repairs.round.finished"),
          });
        }}
        canStartRound={allowed.allowNew}
        canFinishRound={allowed.allowFinish}
        onMergeRound={
          allowed.allowMerge && round?.previous
            ? () => setConfirmMerge(true)
            : null
        }
      />

      {/* Имена в хуке отбора те же, что у панели: она берёт свои. */}
      <FilterBar {...filters} repairMode />

      <div className={s.filters}>
        {[
          [FILTER.DUE, t("repairs.round.due"), tabs.due],
          [FILTER.CHECKED, t("repairs.round.checked"), tabs.checked],
          [FILTER.ALL, t("repairs.round.all"), tabs.all],
        ].map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            className={`${s.filterBtn} ${filter === id ? s.filterBtnActive : ""}`}
            aria-pressed={filter === id}
            aria-label={`${label} ${count}`}
            onClick={() => setFilter(String(id))}
          >
            <span>{label}</span>
            <strong>{count}</strong>
          </button>
        ))}
      </div>

      <section className={s.list}>
        {items.length === 0 ? (
          <p className={s.empty}>
            {filters.search
              ? t("repairs.round.searchEmpty")
              : t("repairs.round.empty")}
          </p>
        ) : (
          items.map((leak) => {
            const footer = footerOf(leak);
            const stage = getRepairStage(leak);
            // Закрытый до обхода ремонт без фикции проверять нечего.
            const checkable = repairRoundState(leak, round) !== "outside";
            return (
              <article key={leak.id} className={s.item}>
                <LeakCardCompact
                  leak={leak}
                  className={s.card}
                  badge={getRepairStageMeta(stage, t)}
                  extraChips={splitMaterials(leak.materials_equipment)}
                  // Свайп вправо — карточка, влево — проверка ремонта (7c).
                  onOpenDetails={setDetailsLeak}
                  onMonitor={checkable ? openCheck : undefined}
                  monitorLabel={t("repairs.checkSwipe")}
                />
                <div className={s.bar}>
                  <div className={s.barText}>
                    <span className={s[`tone_${footer.tone}`]}>
                      {footer.checked && "✓ "}
                      {footer.title}
                    </span>
                    {footer.meta && (
                      <span className={s.barMeta}>{footer.meta}</span>
                    )}
                  </div>
                  {checkable && (
                    <button
                      type="button"
                      className={s.acceptBtn}
                      onClick={() => openCheck(leak)}
                    >
                      {t("repairs.round.check")}
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>

      <RepairLeakDetails
        leak={detailsLeak}
        data={data}
        setData={setData}
        userProfile={userProfile}
        onChange={setDetailsLeak}
      />

      <Suspense fallback={null}>
        {checkLeak && (
          <RepairCheck
            leak={checkLeak}
            data={data}
            setData={setData}
            userProfile={userProfile}
            onSaved={() => setCheckLeak(null)}
            onClose={() => setCheckLeak(null)}
            onNotify={setNotification}
          />
        )}
      </Suspense>

      <ConfirmSheet
        open={confirmNew}
        title={t("repairs.round.newRoundTitle")}
        description={t("repairs.round.newRoundDescription")}
        confirmLabel={t("repairs.round.newRoundConfirm")}
        onConfirm={() => {
          setConfirmNew(false);
          if (roundBlocked()) return setPendingLeak(null);
          setRound(repairRound.start(projectId));
          setFilter(FILTER.DUE);
          if (pendingLeak) setCheckLeak(pendingLeak);
          setPendingLeak(null);
        }}
        onCancel={() => {
          setConfirmNew(false);
          setPendingLeak(null);
        }}
      />

      <ConfirmSheet
        open={Boolean(repeatLeak)}
        title={t("repairs.round.repeatTitle")}
        description={t("repairs.round.repeatDescription")}
        confirmLabel={t("monitoring.repeatConfirm")}
        secondaryActionLabel={
          allowed.allowNew ? t("monitoring.repeatSecondary") : null
        }
        onSecondaryAction={() => {
          setPendingLeak(repeatLeak);
          setRepeatLeak(null);
          setConfirmNew(true);
        }}
        onConfirm={() => {
          setCheckLeak(repeatLeak);
          setRepeatLeak(null);
        }}
        onCancel={() => setRepeatLeak(null)}
      />

      <ConfirmSheet
        open={confirmMerge}
        title={t("repairs.round.mergeTitle", {
          number: (round?.number ?? 1) - 1,
        })}
        description={t("repairs.round.mergeDescription")}
        confirmLabel={t("repairs.round.mergeConfirm")}
        onConfirm={async () => {
          setConfirmMerge(false);
          // Проверки ошибочного обхода уходят в предыдущий вместе с ним.
          const merged = await mergeRepairRoundWithChecks(
            projectId,
            data,
            setData,
          ).catch((error) => {
            setNotification({
              type: "error",
              message: t("common.saveError", { message: errorText(error, t) }),
            });
            return null;
          });
          if (!merged) return;
          setRound(merged);
          setNotification({
            type: "success",
            message: t("repairs.round.merged", { number: merged.number }),
          });
        }}
        onCancel={() => setConfirmMerge(false)}
      />
    </div>
  );
}
