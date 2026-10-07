import { lazy, Suspense, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import LeakCardCompact from "@/features/leakList/LeakCardCompact/LeakCardCompact";
import Notification from "@/components/ui/Notification/Notification";
import Icon from "@/components/ui/Icon/Icon";
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
import { createProjectRound, isInRound } from "@/utils/projectRound";
import s from "./Repairs.module.scss";

const RepairCheck = lazy(() => import("./RepairCheck"));

// Номер и начало обхода ремонтов — как у сверки реестра.
const repairRound = createProjectRound("repair_round_v1");

/** Последнее, что сделали с ремонтом: отметка стадии или устранение. */
function lastRepairActivity(leak) {
  const dates = [getLastRepairStageMark(leak)?.date, getRepairDoneAt(leak)]
    .map((date) => Date.parse(String(date ?? "")))
    .filter(Number.isFinite);
  return dates.length ? new Date(Math.max(...dates)).toISOString() : null;
}

const FILTER = Object.freeze({ DUE: "due", RESOLVED: "resolved", ALL: "all" });

// В работе — сначала идущие ремонты, за ними ждущие МТР, устранённые в конце.
const STAGE_RANK = {
  [REPAIR_STAGE.IN_REPAIR]: 0,
  [REPAIR_STAGE.WAITING_MTR]: 1,
  [REPAIR_STAGE.RESOLVED]: 2,
};

function matches(leak, query) {
  if (!query) return true;
  const haystack = [
    leak.leak_id,
    leak.location,
    leak.object,
    leak.component,
    leak.repair_recommendation,
    leak.materials_equipment,
    getRepairBrigade(leak),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query);
}

/**
 * Обход ремонтов (7b): карточка из обхода мониторинга, но в футере — стадия
 * работ и приёмка. «Принять» у готовых открывает приёмку (7c), у остальных
 * «Отметить» — стадию, бригаду и замечание.
 */
export default function RepairRound({
  data,
  scopedData = data,
  setData,
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
  const [search, setSearch] = useState("");
  const [checkLeak, setCheckLeak] = useState(/** @type {any} */ (null));
  const [notification, setNotification] = useState(/** @type {any} */ (null));

  const repairs = useMemo(() => getRepairLeaks(scopedData), [scopedData]);
  const counts = useMemo(() => {
    const resolved = repairs.filter(
      (leak) => getRepairStage(leak) === REPAIR_STAGE.RESOLVED,
    ).length;
    return { due: repairs.length - resolved, resolved, all: repairs.length };
  }, [repairs]);

  // Ремонты обхода — те, что в работе, и устранённые уже в нём. Проверенным
  // в обходе считается ремонт, который после его начала отметили или закрыли.
  const roundSummary = useMemo(() => {
    const summary = {
      total: 0,
      checked: 0,
      resolved: 0,
      inRepair: 0,
      waiting: 0,
    };
    for (const leak of repairs) {
      const stage = getRepairStage(leak);
      const checked = isInRound(lastRepairActivity(leak), round);
      if (stage === REPAIR_STAGE.RESOLVED && !checked) continue;
      summary.total += 1;
      if (checked) summary.checked += 1;
      if (stage === REPAIR_STAGE.RESOLVED) summary.resolved += 1;
      else if (stage === REPAIR_STAGE.WAITING_MTR) summary.waiting += 1;
      else summary.inRepair += 1;
    }
    return summary;
  }, [repairs, round]);

  const items = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return repairs
      .filter((leak) => {
        const resolved = getRepairStage(leak) === REPAIR_STAGE.RESOLVED;
        if (filter === FILTER.DUE && resolved) return false;
        if (filter === FILTER.RESOLVED && !resolved) return false;
        return matches(leak, query);
      })
      .sort(
        (left, right) =>
          STAGE_RANK[getRepairStage(left)] - STAGE_RANK[getRepairStage(right)],
      );
  }, [repairs, filter, search]);

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
    const checked = isInRound(lastRepairActivity(leak), round);
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
          checked: roundSummary.checked,
          total: roundSummary.total,
        }}
        stats={[
          {
            key: "resolved",
            label: t("repairs.stages.resolved"),
            value: roundSummary.resolved,
            tone: "resolved",
          },
          {
            key: "in_repair",
            label: t("repairs.stages.in_repair"),
            value: roundSummary.inRepair,
            tone: "repair",
          },
          {
            key: "waiting",
            label: t("repairs.stages.waiting_mtr"),
            value: roundSummary.waiting,
            tone: "open",
          },
        ]}
        showCompletion={Boolean(
          round &&
          (round.completedAt ||
            (roundSummary.total > 0 &&
              roundSummary.checked === roundSummary.total)),
        )}
        hasRound={Boolean(round)}
        onStartRound={() => setConfirmNew(true)}
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

      <div className={s.search}>
        <Icon name="search" size={18} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("repairs.round.search")}
          aria-label={t("repairs.round.search")}
          enterKeyHint="search"
        />
      </div>

      <div className={s.filters}>
        {[
          [FILTER.DUE, t("repairs.round.due"), counts.due],
          [FILTER.RESOLVED, t("repairs.round.resolved"), counts.resolved],
          [FILTER.ALL, t("repairs.round.all"), counts.all],
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
            {search ? t("repairs.round.searchEmpty") : t("repairs.round.empty")}
          </p>
        ) : (
          items.map((leak) => {
            const footer = footerOf(leak);
            const stage = getRepairStage(leak);
            return (
              <article key={leak.id} className={s.item}>
                <LeakCardCompact
                  leak={leak}
                  className={s.card}
                  badge={getRepairStageMeta(stage, t)}
                  extraChips={splitMaterials(leak.materials_equipment)}
                  // Тап раскрывает карточку, как в остальных списках; свайп
                  // влево — проверка ремонта (7c), как кнопка в футере; у
                  // устранённой проверять нечего.
                  onOpenDetails={
                    stage === REPAIR_STAGE.RESOLVED
                      ? undefined
                      : () => setCheckLeak(leak)
                  }
                  onMonitor={
                    stage === REPAIR_STAGE.RESOLVED
                      ? undefined
                      : () => setCheckLeak(leak)
                  }
                  onPickStatus={() => {
                    if (stage !== REPAIR_STAGE.RESOLVED) setCheckLeak(leak);
                  }}
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
                  {stage !== REPAIR_STAGE.RESOLVED && (
                    <button
                      type="button"
                      className={s.acceptBtn}
                      onClick={() => setCheckLeak(leak)}
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

      <Suspense fallback={null}>
        {checkLeak && (
          <RepairCheck
            leak={checkLeak}
            data={data}
            setData={setData}
            userProfile={userProfile}
            onSaved={() => {
              // Первая проверка без начатого обхода начинает первый — иначе
              // отметка ушла бы в никуда и ремонт не встал бы в проверенные.
              if (!round) setRound(repairRound.start(projectId));
              setCheckLeak(null);
            }}
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
          setRound(repairRound.start(projectId));
          setFilter(FILTER.DUE);
          setConfirmNew(false);
        }}
        onCancel={() => setConfirmNew(false)}
      />

      <ConfirmSheet
        open={confirmMerge}
        title={t("repairs.round.mergeTitle", {
          number: (round?.number ?? 1) - 1,
        })}
        description={t("repairs.round.mergeDescription")}
        confirmLabel={t("repairs.round.mergeConfirm")}
        onConfirm={() => {
          setConfirmMerge(false);
          const merged = repairRound.merge(projectId);
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
