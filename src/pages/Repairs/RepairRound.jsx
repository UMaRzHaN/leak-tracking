import { lazy, Suspense, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import LeakCardCompact from "@/features/leakList/LeakCardCompact/LeakCardCompact";
import Notification from "@/components/ui/Notification/Notification";
import Icon from "@/components/ui/Icon/Icon";
import {
  resolveLeakRecord,
  deletePhotoIfUnreferenced,
} from "@/domain/leakLifecycle";
import {
  REPAIR_STAGE,
  getLastRepairStageMark,
  getRepairBrigade,
  getRepairLeaks,
  getRepairStage,
  markRepairStage,
} from "@/domain/repairStages";
import { getRepairDoneAt } from "@/domain/leakEvents";
import { getRepairStageMeta, splitMaterials } from "@/utils/repairStage";
import { formatMonitoringDate } from "@/utils/monitoring";
import { errorText } from "@/utils/appError";
import { useProjectData } from "@/app/project/ProjectContext";
import { useAcceptances } from "@/utils/acceptanceStorage";
import { receivedItems } from "@/domain/equipmentAcceptance";
import { ignoredError } from "@/utils/ignoredError";
import s from "./Repairs.module.scss";

const RepairMarkSheet = lazy(() => import("./RepairMarkSheet"));
const AcceptRepairScreen = lazy(() => import("./AcceptRepairScreen"));

const FILTER = Object.freeze({ DUE: "due", ACCEPTED: "accepted", ALL: "all" });

// К приёмке — первыми готовые, за ними идущие работы и ждущие МТР.
const STAGE_RANK = {
  [REPAIR_STAGE.READY]: 0,
  [REPAIR_STAGE.IN_REPAIR]: 1,
  [REPAIR_STAGE.WAITING_MTR]: 2,
  [REPAIR_STAGE.ACCEPTED]: 3,
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
  const { deletePhoto } = usePhotoStorage();
  const { activeProject } = useProjectData();
  // «МТР по факту» в приёмке — из того, что принято по накладным (7f).
  const [invoices] = useAcceptances(activeProject?.id ?? null);
  const acceptanceItems = useMemo(() => receivedItems(invoices), [invoices]);
  const [filter, setFilter] = useState(/** @type {string} */ (FILTER.DUE));
  const [search, setSearch] = useState("");
  const [markLeak, setMarkLeak] = useState(/** @type {any} */ (null));
  const [acceptLeak, setAcceptLeak] = useState(/** @type {any} */ (null));
  const [saving, setSaving] = useState(false);
  // Дата обхода — день, когда экран открыли.
  const [openedAt] = useState(() => new Date().toISOString());
  const [notification, setNotification] = useState(/** @type {any} */ (null));
  const user = userProfile?.name?.trim() || undefined;

  const repairs = useMemo(() => getRepairLeaks(scopedData), [scopedData]);
  const counts = useMemo(() => {
    const accepted = repairs.filter(
      (leak) => getRepairStage(leak) === REPAIR_STAGE.ACCEPTED,
    ).length;
    return { due: repairs.length - accepted, accepted, all: repairs.length };
  }, [repairs]);

  const items = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return repairs
      .filter((leak) => {
        const accepted = getRepairStage(leak) === REPAIR_STAGE.ACCEPTED;
        if (filter === FILTER.DUE && accepted) return false;
        if (filter === FILTER.ACCEPTED && !accepted) return false;
        return matches(leak, query);
      })
      .sort(
        (left, right) =>
          STAGE_RANK[getRepairStage(left)] - STAGE_RANK[getRepairStage(right)],
      );
  }, [repairs, filter, search]);

  // Каждое изменение пишется во весь проект, а не в отфильтрованный список:
  // иначе сохранение стёрло бы всё, что вне выбранного места.
  const update = async (leak, change) => {
    if (!user) {
      setNotification({ type: "error", message: t("database.fillUserName") });
      return false;
    }
    setSaving(true);
    try {
      await setData(
        data.map((record) => (record.id === leak.id ? change(record) : record)),
      );
      return true;
    } catch (error) {
      setNotification({
        type: "error",
        message: t("common.saveError", { message: errorText(error, t) }),
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const footerOf = (leak) => {
    const stage = getRepairStage(leak);
    const mark = getLastRepairStageMark(leak);
    const brigade = getRepairBrigade(leak);
    if (stage === REPAIR_STAGE.ACCEPTED) {
      return {
        tone: "ok",
        title: t("repairs.round.acceptedAt", {
          date: formatMonitoringDate(getRepairDoneAt(leak), lang),
        }),
        meta: brigade,
      };
    }
    if (stage === REPAIR_STAGE.READY) {
      return {
        tone: "ok",
        title: mark
          ? t("repairs.round.doneAt", {
              date: formatMonitoringDate(mark.date, lang),
            })
          : t("repairs.stages.ready"),
        meta: [t("repairs.round.awaiting"), brigade]
          .filter(Boolean)
          .join(" · "),
        accept: true,
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
          [FILTER.ACCEPTED, t("repairs.round.accepted"), counts.accepted],
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
                  // Свайп ведёт туда же, куда кнопка в футере: в обходе
                  // ремонтов у карточки одно действие.
                  onOpenDetails={() =>
                    footer.accept ? setAcceptLeak(leak) : setMarkLeak(leak)
                  }
                  onMonitor={() => setMarkLeak(leak)}
                  onPickStatus={() => setMarkLeak(leak)}
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
                  {stage !== REPAIR_STAGE.ACCEPTED && (
                    <button
                      type="button"
                      className={footer.accept ? s.acceptBtn : s.markBtn}
                      onClick={() =>
                        footer.accept ? setAcceptLeak(leak) : setMarkLeak(leak)
                      }
                    >
                      {footer.accept
                        ? t("repairs.round.accept")
                        : t("repairs.round.mark")}
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>

      <Suspense fallback={null}>
        {markLeak && (
          <RepairMarkSheet
            leak={markLeak}
            saving={saving}
            onClose={() => setMarkLeak(null)}
            onSave={async (mark) => {
              const saved = await update(markLeak, (record) =>
                markRepairStage(record, mark, { user }),
              );
              if (saved) {
                setMarkLeak(null);
                setNotification({
                  type: "success",
                  message: t("repairs.mark.saved"),
                });
              }
            }}
          />
        )}

        {acceptLeak && (
          <AcceptRepairScreen
            leak={acceptLeak}
            items={acceptanceItems}
            saving={saving}
            onClose={() => setAcceptLeak(null)}
            onReturn={async ({ brigade, note }) => {
              const saved = await update(acceptLeak, (record) =>
                markRepairStage(
                  record,
                  { stage: REPAIR_STAGE.IN_REPAIR, brigade, note },
                  { user },
                ),
              );
              if (saved) {
                setAcceptLeak(null);
                setNotification({
                  type: "success",
                  message: t("repairs.accept.returned"),
                });
              }
            }}
            onAccept={async ({
              photo_after,
              materials_equipment,
              note,
              brigade,
            }) => {
              const saved = await update(acceptLeak, (record) =>
                resolveLeakRecord(
                  brigade && brigade !== getRepairBrigade(record)
                    ? markRepairStage(
                        record,
                        { stage: REPAIR_STAGE.READY, brigade },
                        { user },
                      )
                    : record,
                  { photo_after, materials_equipment, note },
                  { user },
                ),
              );
              if (saved) {
                setAcceptLeak(null);
                setNotification({
                  type: "success",
                  message: t("repairs.accept.saved"),
                });
              } else {
                // Снимок уже лежит в хранилище, а запись его не получила.
                deletePhotoIfUnreferenced(photo_after, data, deletePhoto).catch(
                  ignoredError("repairs.photoCleanup"),
                );
              }
            }}
          />
        )}
      </Suspense>
    </div>
  );
}
