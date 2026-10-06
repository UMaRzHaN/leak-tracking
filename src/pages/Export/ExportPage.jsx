import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import { useExcelExportMode } from "@/app/project/hooks/useExcelExportMode";
import Notification from "@/components/ui/Notification/Notification";
import Icon from "@/components/ui/Icon/Icon";
import { useDataBaseExport } from "@/pages/DataBase/hooks/useDataBaseExport";
import { EXCEL_MONITORING_EXPORT_MODE } from "@/utils/excelExportMode";
import { formatMonitoringDate } from "@/utils/monitoring";
import { hasComponentRegistry } from "@/configs/componentRegistry.config";
import { useRegistryLocationSource } from "@/hooks/useRegistryLocationSource";
import { countExportSections } from "./exportSections";
import {
  PERIOD,
  daysIn,
  filterByPeriod,
  periodRange,
  shownRange,
  pushExportHistory,
  readExportHistory,
  readExportSheets,
  saveExportSheets,
} from "./exportPeriod";
import s from "./ExportPage.module.scss";

/**
 * Экспорт отчёта (8a → 8b). Собирает выгрузку из решений, видных сразу:
 * период, область, как писать обходы. Внизу — сколько записей и снимков
 * попадёт в файл. Сам файл делает прежняя выгрузка Excel-архива; после неё
 * экран показывает итог и последние выгрузки на этом устройстве.
 */
export default function ExportPage({ data = [], scopedData = data, onBack }) {
  const { t, lang } = useLanguage();
  const { activeProject } = useProjectData();
  const { monitoringExportMode, setMonitoringExportMode } = useExcelExportMode(
    activeProject?.id ?? null,
  );
  const [period, setPeriod] = useState(/** @type {string} */ (PERIOD.ALL));
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [scopeOnly, setScopeOnly] = useState(scopedData.length !== data.length);
  // Что включить в файл (8a). «Утечки» и «История» — всегда: первое — сам
  // отчёт, второе — откуда взялось каждое значение в нём. Выбор запоминается
  // по проекту, чтобы не выставлять его каждый раз.
  const [choice, setChoice] = useState(() =>
    readExportSheets(activeProject?.id),
  );
  useEffect(() => {
    setChoice(readExportSheets(activeProject?.id));
  }, [activeProject?.id]);
  const updateChoice = (change) =>
    setChoice((value) => {
      const next = change(value);
      saveExportSheets(activeProject?.id, next);
      return next;
    });
  const toggleSection = (key) =>
    updateChoice((value) => ({ ...value, [key]: !value[key] }));
  const togglePhotos = (key) =>
    updateChoice((value) => ({
      ...value,
      photos: { ...value.photos, [key]: !value.photos[key] },
    }));
  const [notification, setNotification] = useState(/** @type {any} */ (null));
  const [done, setDone] = useState(/** @type {any} */ (null));
  const [history, setHistory] = useState(() =>
    readExportHistory(activeProject?.id),
  );

  // Инвентаризация — только у проектов с реестром; карточки читаются,
  // лишь пока экран открыт.
  const hasRegistry = hasComponentRegistry(activeProject);
  const components = useRegistryLocationSource(hasRegistry);
  const componentPhotos = useMemo(
    () => components.filter((component) => component?.photo).length,
    [components],
  );

  const source = scopeOnly ? scopedData : data;
  const range = useMemo(() => periodRange(period, custom), [period, custom]);
  const leaks = useMemo(() => filterByPeriod(source, range), [source, range]);
  const covered = useMemo(() => shownRange(range, leaks), [range, leaks]);
  const counts = useMemo(() => countExportSections(leaks), [leaks]);
  const withInventory = hasRegistry && choice.inventory;

  // Листы в том порядке, в каком они лягут в книгу.
  const sections =
    /** @type {Array<{key: string, label: string, rows?: number, photos?: number}>} */ (
      [
        {
          key: "leaks",
          label: t("export.sheetLeaks"),
          rows: counts.leaks.rows,
          photos: counts.leaks.photos,
        },
        { key: "history", label: t("export.sheetHistory") },
        choice.repairs && {
          key: "repairs",
          label: t("export.sheetRepairs"),
          rows: counts.repairs.rows,
          photos: counts.repairs.photos,
        },
        choice.monitoring && {
          key: "monitoring",
          label: t("export.sheetMonitoring"),
          rows: counts.monitoring.rows,
          photos: counts.monitoring.photos,
        },
        choice.materials && {
          key: "materials",
          label: t("export.sheetMaterials"),
          rows: counts.materials.rows,
        },
        withInventory && {
          key: "inventory",
          label: t("export.sheetInventory"),
          rows: components.length,
          photos: componentPhotos,
        },
      ].filter(Boolean)
    );
  const photos = sections.reduce(
    (sum, section) =>
      section.photos && choice.photos[section.key] ? sum + section.photos : sum,
    0,
  );
  const sheetCount = sections.filter(
    (section) => section.key !== "inventory",
  ).length;
  const allOn =
    choice.repairs &&
    choice.monitoring &&
    choice.materials &&
    (!hasRegistry || choice.inventory);

  const sheets = useMemo(
    () => ({
      repairs: choice.repairs,
      monitoring: choice.monitoring,
      materials: choice.materials,
    }),
    [choice.repairs, choice.monitoring, choice.materials],
  );
  const photoSections = useMemo(
    () => ({
      leaks: choice.photos.leaks,
      repairs: choice.photos.repairs,
      monitoring: choice.photos.monitoring,
    }),
    [choice.photos.leaks, choice.photos.repairs, choice.photos.monitoring],
  );
  const inventory = useMemo(
    () => (withInventory ? { withPhotos: choice.photos.inventory } : null),
    [withInventory, choice.photos.inventory],
  );

  const notify = useCallback(
    (type, message, options = {}) =>
      setNotification({ type, message, ...options }),
    [],
  );
  const onDone = useCallback(
    (result) => {
      const entry = {
        name:
          result?.fileName ??
          result?.path?.split("/").pop() ??
          t("export.report"),
        date: new Date().toISOString(),
        rows: leaks.length,
        photos,
      };
      setHistory(pushExportHistory(activeProject?.id, entry));
      setDone({ ...entry, message: result?.message });
    },
    [activeProject?.id, leaks.length, photos, t],
  );
  const { handleExport, isExporting } = useDataBaseExport({
    displayed: leaks,
    notify,
    onDone,
    sheets,
    photoSections,
    inventory,
  });

  const header = (
    <header className={s.header}>
      <button
        type="button"
        className={s.back}
        onClick={done ? () => setDone(null) : onBack}
        aria-label={t("leakDetails.back")}
      >
        <Icon name="chevronLeft" size={20} strokeWidth={2} />
      </button>
      <div>
        <p className={s.caption}>{activeProject?.name}</p>
        <h1>{t("export.title")}</h1>
      </div>
    </header>
  );

  return (
    <div className={s.page}>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />
      {header}

      {done ? (
        <div className={s.body}>
          <section className={s.doneCard} role="status">
            <div className={s.doneHead}>
              <span className={s.doneIcon}>
                <Icon name="check" size={18} strokeWidth={2.4} />
              </span>
              <strong>{t("export.done")}</strong>
            </div>
            <div className={s.file}>
              <span className={s.fileBadge}>ZIP</span>
              <span>
                <strong>{done.name}</strong>
                <small>
                  {t("export.fileMeta", {
                    rows: done.rows,
                    photos: done.photos,
                  })}
                </small>
              </span>
            </div>
            {done.message && <p className={s.doneMessage}>{done.message}</p>}
          </section>
          <History history={history} lang={lang} t={t} />
        </div>
      ) : (
        <div className={s.body}>
          <section className={s.group}>
            <h2>{t("export.period")}</h2>
            <div className={s.pills}>
              {[
                PERIOD.TODAY,
                PERIOD.WEEK,
                PERIOD.MONTH,
                PERIOD.CUSTOM,
                PERIOD.ALL,
              ].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={period === value}
                  className={period === value ? s.pillOn : s.pill}
                  onClick={() => setPeriod(value)}
                >
                  {t(`export.periods.${value}`)}
                </button>
              ))}
            </div>
            {covered && (
              <div className={s.rangeLine}>
                <Icon name="calendar" size={18} strokeWidth={1.8} />
                <strong>{formatRange(covered, lang)}</strong>
                <small>{t("export.days", { count: daysIn(covered) })}</small>
              </div>
            )}
            {period === PERIOD.CUSTOM && (
              <div className={s.dates}>
                <label>
                  <span>{t("export.from")}</span>
                  <input
                    type="date"
                    value={custom.from}
                    onChange={(event) =>
                      setCustom((value) => ({
                        ...value,
                        from: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t("export.to")}</span>
                  <input
                    type="date"
                    value={custom.to}
                    onChange={(event) =>
                      setCustom((value) => ({
                        ...value,
                        to: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            )}
          </section>

          <section className={s.group}>
            <div className={s.groupHead}>
              <h2>{t("export.include")}</h2>
              <button
                type="button"
                className={s.linkButton}
                disabled={allOn}
                onClick={() =>
                  updateChoice((value) => ({
                    ...value,
                    repairs: true,
                    monitoring: true,
                    materials: true,
                    inventory: hasRegistry ? true : value.inventory,
                  }))
                }
              >
                {t("export.all")}
              </button>
            </div>
            <div className={s.pills}>
              <IncludeChip
                label={t("export.chips.leaks")}
                count={counts.leaks.rows}
                on
                locked
              />
              <IncludeChip
                label={t("export.chips.repairs")}
                count={counts.repairs.rows}
                on={choice.repairs}
                onToggle={() => toggleSection("repairs")}
              />
              <IncludeChip
                label={t("export.chips.materials")}
                count={counts.materials.rows}
                on={choice.materials}
                onToggle={() => toggleSection("materials")}
              />
              <IncludeChip
                label={t("export.chips.monitoring")}
                count={counts.monitoring.rows}
                on={choice.monitoring}
                onToggle={() => toggleSection("monitoring")}
              />
              {hasRegistry && (
                <IncludeChip
                  label={t("export.chips.inventory")}
                  count={components.length}
                  on={choice.inventory}
                  onToggle={() => toggleSection("inventory")}
                />
              )}
            </div>
          </section>

          <section className={s.group}>
            <div className={s.groupHead}>
              <h2>{t("export.contents")}</h2>
              <small>{t("export.photosBySection")}</small>
            </div>
            <div className={s.card}>
              {sections.map((section, index) => (
                <div key={section.key} className={s.row}>
                  <span className={s.rowNum}>{index + 1}</span>
                  <strong>{section.label}</strong>
                  {section.rows != null && <small>{section.rows}</small>}
                  {section.photos ? (
                    <button
                      type="button"
                      className={
                        choice.photos[section.key] ? s.photoChipOn : s.photoChip
                      }
                      aria-pressed={choice.photos[section.key]}
                      aria-label={t("export.photosOf", {
                        section: section.label,
                      })}
                      onClick={() => togglePhotos(section.key)}
                    >
                      {choice.photos[section.key] && (
                        <Icon name="check" size={13} strokeWidth={2.6} />
                      )}
                      {t("export.photoCount", { count: section.photos })}
                    </button>
                  ) : (
                    <small className={s.noPhoto}>{t("export.noPhoto")}</small>
                  )}
                </div>
              ))}
              {choice.monitoring && (
                <div className={`${s.row} ${s.subRow}`}>
                  <span className={s.subLabel}>
                    {t("export.sheetMonitoring")}
                  </span>
                  <div className={s.segment} role="radiogroup">
                    {[
                      [
                        EXCEL_MONITORING_EXPORT_MODE.FULL,
                        t("export.monitoringFull"),
                      ],
                      [
                        EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND,
                        t("export.monitoringLatest"),
                      ],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={monitoringExportMode === value}
                        className={
                          monitoringExportMode === value ? s.segmentOn : ""
                        }
                        onClick={() => setMonitoringExportMode(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className={s.group}>
            <h2>{t("export.scopeAndFormat")}</h2>
            <div className={s.card}>
              <button
                type="button"
                className={s.row}
                role="switch"
                aria-checked={scopeOnly}
                disabled={scopedData.length === data.length}
                onClick={() => setScopeOnly((value) => !value)}
              >
                <Icon name="folder" size={18} strokeWidth={1.7} />
                <strong>
                  {scopeOnly
                    ? t("export.scopeSelected", { count: scopedData.length })
                    : t("export.scopeAll", { count: data.length })}
                </strong>
                <span className={scopeOnly ? s.switchOn : s.switchOff} />
              </button>
              <div className={s.row}>
                <Icon name="document" size={18} strokeWidth={1.7} />
                <strong>{t("export.format")}</strong>
                <small className={s.formatValue}>
                  {t("export.formatValue")}
                </small>
              </div>
            </div>
          </section>

          <History history={history} lang={lang} t={t} />
        </div>
      )}

      {!done && (
        <footer className={s.footer}>
          <p>
            <strong>{t("export.total", { rows: leaks.length, photos })}</strong>
            <small>{t("export.sheetCount", { count: sheetCount })}</small>
          </p>
          <button
            type="button"
            className={s.primary}
            disabled={isExporting || leaks.length === 0}
            onClick={handleExport}
          >
            <Icon name="download" size={20} strokeWidth={2} />
            {isExporting ? t("export.building") : t("export.build")}
          </button>
        </footer>
      )}
    </div>
  );
}

/** Чип раздела в «Что включить» (8a). «Утечки» включены всегда. */
function IncludeChip({ label, count, on, locked = false, onToggle = null }) {
  return (
    <button
      type="button"
      className={on ? s.pillOn : s.pill}
      aria-pressed={on}
      disabled={locked}
      onClick={onToggle ?? undefined}
    >
      {on && <Icon name="check" size={14} strokeWidth={2.6} />}
      {label}
      {count > 0 && <span className={s.pillCount}>{count}</span>}
    </button>
  );
}

/** «1 — 31 марта 2026»: общий месяц и год не повторяются. */
function formatRange({ from, to }, lang) {
  const format = new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  try {
    return format.formatRange(new Date(from), new Date(to));
  } catch {
    return `${format.format(new Date(from))} — ${format.format(new Date(to))}`;
  }
}

function History({ history, lang, t }) {
  if (!history.length) return null;
  return (
    <section className={s.group}>
      <h2>{t("export.history")}</h2>
      <div className={s.card}>
        {history.slice(0, 5).map((entry, index) => (
          <div key={`${entry.date}-${index}`} className={s.row}>
            <span className={s.fileBadgeSmall}>ZIP</span>
            <span className={s.historyText}>
              <strong>{entry.name}</strong>
              <small>
                {t("export.fileMeta", {
                  rows: entry.rows,
                  photos: entry.photos,
                })}
              </small>
            </span>
            <small>{formatMonitoringDate(entry.date, lang)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
