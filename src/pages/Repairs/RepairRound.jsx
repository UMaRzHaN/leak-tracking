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
import s from "./Repairs.module.scss";

const RepairCheck = lazy(() => import("./RepairCheck"));

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
  const [filter, setFilter] = useState(/** @type {string} */ (FILTER.DUE));
  const [search, setSearch] = useState("");
  const [checkLeak, setCheckLeak] = useState(/** @type {any} */ (null));
  // Дата обхода — день, когда экран открыли.
  const [openedAt] = useState(() => new Date().toISOString());
  const [notification, setNotification] = useState(/** @type {any} */ (null));

  const repairs = useMemo(() => getRepairLeaks(scopedData), [scopedData]);
  const counts = useMemo(() => {
    const resolved = repairs.filter(
      (leak) => getRepairStage(leak) === REPAIR_STAGE.RESOLVED,
    ).length;
    return { due: repairs.length - resolved, resolved, all: repairs.length };
  }, [repairs]);

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
    return {
      tone: stage === REPAIR_STAGE.WAITING_MTR ? "warn" : "info",
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

      <header className={s.roundHeader}>
        <h1>{t("repairs.round.title")}</h1>
        <span>· {formatMonitoringDate(openedAt, lang)}</span>
      </header>

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
                  collapsible={false}
                  defaultExpanded
                  // Тап и свайп влево — проверка ремонта (7c), как кнопка в
                  // футере; у устранённой проверять нечего.
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
            onClose={() => setCheckLeak(null)}
            onNotify={setNotification}
          />
        )}
      </Suspense>
    </div>
  );
}
