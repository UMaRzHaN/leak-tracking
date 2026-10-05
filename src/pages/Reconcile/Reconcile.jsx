import { useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import ComponentCardCompact from "@/features/componentRegistry/ComponentCardCompact";
import ComponentInspectSheet from "@/features/componentRegistry/ComponentInspectSheet";
import { useComponentRegistry } from "@/features/componentRegistry/useComponentRegistry";
import Notification from "@/components/ui/Notification/Notification";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import Icon from "@/components/ui/Icon/Icon";
import {
  canWriteRegistry,
  recordComponentInspected,
} from "@/domain/componentHistory";
import { matchesLeakLocationFilter } from "@/utils/locationFilter";
import { formatMonitoringDate } from "@/utils/monitoring";
import {
  isReconciled,
  readReconcileRound,
  startReconcileRound,
} from "./reconcileRound";
import s from "@/pages/Repairs/Repairs.module.scss";

const FILTER = Object.freeze({ DUE: "due", DONE: "done", ALL: "all" });

function matches(component, query) {
  if (!query) return true;
  return [
    component.component_uid,
    component.scheme_tag,
    component.component,
    component.location,
    component.object,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

/**
 * Сверка реестра (6b): карточка компонента и полоса с датой инспекции и
 * кнопкой «Сверить». Сверить — это осмотр: подтвердить или поправить
 * состояние, и в карточке встанет отметка времени и подпись.
 */
export default function Reconcile({ project, sharedFilters, userProfile }) {
  const { t, lang } = useLanguage();
  const { components, updateComponent, loading } =
    useComponentRegistry(project);
  const [round, setRound] = useState(() => readReconcileRound(project?.id));
  const [filter, setFilter] = useState(/** @type {string} */ (FILTER.DUE));
  const [search, setSearch] = useState("");
  const [inspecting, setInspecting] = useState(/** @type {any} */ (null));
  const [confirmNew, setConfirmNew] = useState(false);
  const [notification, setNotification] = useState(/** @type {any} */ (null));
  const canWrite = canWriteRegistry(userProfile);

  const scoped = useMemo(
    () =>
      components.filter(
        (component) =>
          matchesLeakLocationFilter(
            component,
            sharedFilters?.mainLocationFilter,
          ) &&
          matchesLeakLocationFilter(component, sharedFilters?.locationFilter) &&
          matchesLeakLocationFilter(
            component,
            sharedFilters?.lastLocationFilter,
          ),
      ),
    [components, sharedFilters],
  );
  const counts = useMemo(() => {
    const done = scoped.filter((component) =>
      isReconciled(component, round),
    ).length;
    return { due: scoped.length - done, done, all: scoped.length };
  }, [scoped, round]);
  const items = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return scoped.filter((component) => {
      const done = isReconciled(component, round);
      if (filter === FILTER.DUE && done) return false;
      if (filter === FILTER.DONE && !done) return false;
      return matches(component, query);
    });
  }, [scoped, filter, search, round]);

  const pick = async (status) => {
    const card = inspecting;
    setInspecting(null);
    if (!card) return;
    // Сверка без начатого номера начинает первую — иначе отметка ушла бы
    // в никуда и компонент не встал бы в «Сверено».
    if (!round) setRound(startReconcileRound(project?.id));
    await updateComponent(
      card.id,
      recordComponentInspected(card, { status, user: userProfile?.name }),
    );
    setNotification({ type: "success", message: t("reconcile.saved") });
  };

  return (
    <div className={`${s.page} content`}>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      <header className={s.roundHeaderRow}>
        <div className={s.roundHeader}>
          <h1>
            {round
              ? t("reconcile.title", { number: round.number })
              : t("reconcile.noRound")}
          </h1>
          {round && (
            <span>· {formatMonitoringDate(round.startedAt, lang)}</span>
          )}
        </div>
        <button
          type="button"
          className={s.markBtn}
          onClick={() => setConfirmNew(true)}
        >
          {t("reconcile.newRound")}
        </button>
      </header>

      <div className={s.search}>
        <Icon name="search" size={18} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("reconcile.search")}
          aria-label={t("reconcile.search")}
        />
      </div>

      <div className={s.filters}>
        {[
          [FILTER.DUE, t("reconcile.due"), counts.due],
          [FILTER.DONE, t("reconcile.done"), counts.done],
          [FILTER.ALL, t("reconcile.all"), counts.all],
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

      {!canWrite && (
        <p className={s.hint} role="status">
          {t("components.nameRequired")}
        </p>
      )}

      <section className={s.list}>
        {loading ? null : items.length === 0 ? (
          <p className={s.empty}>
            {search ? t("reconcile.searchEmpty") : t("reconcile.empty")}
          </p>
        ) : (
          items.map((component) => {
            const done = isReconciled(component, round);
            const inspected = component.inspected_at;
            return (
              <article key={component.id} className={s.item}>
                <div className={s.card}>
                  <ComponentCardCompact
                    component={component}
                    onOpenDetails={() => {}}
                    onInspect={canWrite ? setInspecting : undefined}
                  />
                </div>
                <div className={s.bar}>
                  <div className={s.barText}>
                    {done ? (
                      <span className={s.tone_ok}>
                        ✓{" "}
                        {t("reconcile.reconciledAt", {
                          date: formatMonitoringDate(inspected, lang),
                        })}
                      </span>
                    ) : (
                      <span className={inspected ? s.tone_warn : ""}>
                        {inspected
                          ? t("reconcile.inspectedAt", {
                              date: formatMonitoringDate(inspected, lang),
                            })
                          : t("reconcile.never")}
                      </span>
                    )}
                    <span className={s.barMeta}>
                      {[component.component_status, component.createdBy]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  {!done && canWrite && (
                    <button
                      type="button"
                      className={s.acceptBtn}
                      onClick={() => setInspecting(component)}
                    >
                      {t("reconcile.check")}
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>

      {inspecting && (
        <ComponentInspectSheet
          component={inspecting}
          onPick={pick}
          onClose={() => setInspecting(null)}
        />
      )}

      <ConfirmSheet
        open={confirmNew}
        title={t("reconcile.newRoundTitle")}
        description={t("reconcile.newRoundDescription")}
        confirmLabel={t("reconcile.newRoundConfirm")}
        onConfirm={() => {
          setRound(startReconcileRound(project?.id));
          setFilter(FILTER.DUE);
          setConfirmNew(false);
        }}
        onCancel={() => setConfirmNew(false)}
      />
    </div>
  );
}
