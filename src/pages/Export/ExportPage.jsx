import { errorText } from "@/utils/appError";
import { formatLocationScopeLabel } from "@/utils/locationScopeLabel";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import Notification from "@/components/ui/Notification/Notification";
import Icon from "@/components/ui/Icon/Icon";
import { useDataBaseExport } from "@/pages/DataBase/hooks/useDataBaseExport";
import { useInventoryExport } from "@/pages/ComponentRegistry/hooks/useInventoryExport";
import RoundModeRow from "./RoundModeRow";
import { hasComponentRegistry } from "@/configs/componentRegistry.config";
import { useRegistryLocationSource } from "@/hooks/useRegistryLocationSource";
import { countExportSections } from "./exportSections";
import { useAcceptances } from "@/utils/acceptanceStorage";
import { getAcceptanceExportRows } from "@/services/excelExport/acceptanceRows";
import {
  PERIOD,
  daysIn,
  filterByPeriod,
  periodRange,
  shownRange,
  pushExportHistory,
  readExportHistory,
  updateExportHistory,
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
export default function ExportPage({
  data = [],
  scopedData = data,
  onBack,
  // Место из шапки (8a): строка области открывает тот же выбор.
  locationScope = /** @type {any} */ (null),
  onLocationScopeOpen = /** @type {(() => void)|undefined} */ (undefined),
}) {
  const { t, lang } = useLanguage();
  const { activeProject } = useProjectData();
  const projectId = activeProject?.id ?? null;
  const [period, setPeriod] = useState(/** @type {string} */ (PERIOD.ALL));
  const [custom, setCustom] = useState({ from: "", to: "" });
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

  // Отчёт — по выбранному месту, как и всё в приложении; сменить место можно
  // прямо отсюда.
  const source = scopedData;
  const scoped = scopedData.length !== data.length;
  const range = useMemo(() => periodRange(period, custom), [period, custom]);
  const leaks = useMemo(() => filterByPeriod(source, range), [source, range]);
  const covered = useMemo(() => shownRange(range, leaks), [range, leaks]);
  const counts = useMemo(() => countExportSections(leaks), [leaks]);
  // Приёмка оборудования — накладные проекта, партии за выбранный период.
  // Места у накладной нет, поэтому выбор места её не сужает.
  const [invoices] = useAcceptances(activeProject?.id ?? null);
  const acceptanceRows = useMemo(
    () => getAcceptanceExportRows(invoices, range),
    [invoices, range],
  );
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
        choice.repairs && {
          key: "repairLog",
          label: t("export.sheetRepairLog"),
          rows: counts.repairLog.rows,
        },
        choice.materials && {
          key: "materials",
          label: t("export.sheetMaterials"),
          rows: counts.materials.rows,
        },
        choice.acceptance && {
          key: "acceptance",
          label: t("export.sheetAcceptance"),
          rows: acceptanceRows.length,
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
    choice.acceptance &&
    (!hasRegistry || choice.inventory);

  const sheets = useMemo(
    () => ({
      repairs: choice.repairs,
      monitoring: choice.monitoring,
      materials: choice.materials,
      acceptance: choice.acceptance,
    }),
    [choice.repairs, choice.monitoring, choice.materials, choice.acceptance],
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
  // Название выгрузки в истории (8b): период и что в неё вошло —
  // «Февраль · утечки, ремонты».
  const includedNames = [
    t("export.chips.leaks"),
    choice.repairs && t("export.chips.repairs"),
    choice.materials && t("export.chips.materials"),
    choice.acceptance && t("export.chips.acceptance"),
    choice.monitoring && t("export.chips.monitoring"),
    withInventory && t("export.chips.inventory"),
  ]
    .filter(Boolean)
    .map((name) => String(name).toLocaleLowerCase(lang));
  const exportTitle = `${periodTitle(period, covered, lang, t)} · ${includedNames.join(", ")}`;
  // Разделы, чьи снимки есть, но в файл не пошли, — о них предупреждение.
  // Строкой, чтобы обработчик ниже не пересоздавался на каждый рендер.
  const skippedPhotosKey = sections
    .filter((section) => section.photos && !choice.photos[section.key])
    .map((section) => t(`export.chips.${section.key}`))
    .join("\n");

  const onDone = useCallback(
    (result) => {
      setNotification(null);
      const entry = {
        name: exportTitle,
        fileName: result?.fileName ?? t("export.report"),
        date: new Date().toISOString(),
        rows: leaks.length,
        photos,
        sheets: sheetCount,
        size: result?.blob?.size ?? null,
        delivery: null,
      };
      setHistory(pushExportHistory(activeProject?.id, entry));
      setDone({
        ...entry,
        seconds: Math.max(
          1,
          Math.round((result?.metrics?.totalMs ?? 0) / 1000),
        ),
        skippedPhotos: skippedPhotosKey.split("\n").filter(Boolean),
        file: result,
      });
    },
    [
      activeProject?.id,
      exportTitle,
      leaks.length,
      photos,
      sheetCount,
      skippedPhotosKey,
      t,
    ],
  );
  const [delivering, setDelivering] = useState(false);
  const deliver = async (how) => {
    if (!done?.file?.blob || delivering) return;
    setDelivering(true);
    try {
      const { saveExportFile, shareExportFile } =
        await import("@/pages/DataBase/excel");
      if (how === "share") {
        const outcome = await shareExportFile(done.file, t);
        if (outcome === "cancelled") return;
        const delivery = outcome === "shared" ? "sent" : "saved";
        setHistory(
          updateExportHistory(activeProject?.id, done.date, { delivery }),
        );
        if (outcome === "downloaded") {
          notify(
            "success",
            t("excelExport.downloaded", { fileName: done.fileName }),
          );
        }
      } else {
        const result = await saveExportFile(done.file, t);
        setHistory(
          updateExportHistory(activeProject?.id, done.date, {
            delivery: "saved",
          }),
        );
        notify("success", result?.message ?? t("database.export.success"));
      }
    } catch (error) {
      notify(
        "error",
        t("database.export.error", { message: errorText(error, t) }),
      );
    } finally {
      setDelivering(false);
    }
  };
  const { handleExport, isExporting } = useDataBaseExport({
    displayed: leaks,
    notify,
    onDone,
    sheets,
    photoSections,
    inventory,
    acceptanceRows: choice.acceptance ? acceptanceRows : null,
    deferDelivery: true,
  });
  // Утечек нет, а реестр заведён: отчёт по утечкам собирать не из чего, и
  // выгружается одна инвентаризация — своим архивом, тем же, что раньше
  // отдавала кнопка XLSX в реестре (его же читает импорт). Чип тут ни при чём:
  // кроме реестра, выгружать нечего.
  const { exportInventory, isExporting: isExportingInventory } =
    useInventoryExport({ project: activeProject, notify });
  const inventoryOnly =
    leaks.length === 0 && hasRegistry && components.length > 0;

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
              <small className={s.doneTime}>
                {t("export.seconds", { count: done.seconds })}
              </small>
            </div>
            <div className={s.file}>
              <span className={s.fileBadge}>ZIP</span>
              <span>
                <strong>{done.fileName}</strong>
                <small>
                  {[
                    done.size != null && formatBytes(done.size, lang, t),
                    t("export.metaRows", { count: done.rows }),
                    t("export.metaSheets", { count: done.sheets }),
                    t("export.metaPhotos", { count: done.photos }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </span>
            </div>
          </section>
          {done.skippedPhotos.length > 0 && (
            <p className={s.warning}>
              <Icon name="info" size={16} strokeWidth={2} />
              <span>
                {t("export.skippedPhotos", {
                  sections: done.skippedPhotos.join(", "),
                })}
              </span>
            </p>
          )}
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
                    acceptance: true,
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
                label={t("export.chips.acceptance")}
                count={acceptanceRows.length}
                on={choice.acceptance}
                onToggle={() => toggleSection("acceptance")}
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
              {/* Листы с обходами — у каждого свой режим (8a). */}
              {choice.monitoring && (
                <RoundModeRow
                  label={t("export.sheetMonitoring")}
                  projectId={projectId}
                />
              )}
              {choice.repairs && (
                <RoundModeRow
                  label={t("export.sheetRepairLog")}
                  projectId={projectId}
                  storageKeyOf={
                    STORAGE_KEYS.PROJECT_EXCEL_REPAIR_LOG_EXPORT_MODE
                  }
                />
              )}
              {withInventory && (
                <RoundModeRow
                  label={t("export.sheetReconcileHistory")}
                  projectId={projectId}
                  storageKeyOf={
                    STORAGE_KEYS.PROJECT_EXCEL_RECONCILE_EXPORT_MODE
                  }
                />
              )}
            </div>
          </section>

          <section className={s.group}>
            <h2>{t("export.scopeAndFormat")}</h2>
            <div className={s.card}>
              <button
                type="button"
                className={s.row}
                onClick={onLocationScopeOpen}
                disabled={!onLocationScopeOpen || !locationScope?.available}
                aria-label={t("export.scopeChange")}
              >
                <Icon name="folder" size={18} strokeWidth={1.7} />
                <strong>
                  {scoped
                    ? t("export.scopeSelected", {
                        place: formatLocationScopeLabel(locationScope, t),
                        count: scopedData.length,
                      })
                    : t("export.scopeAll", { count: data.length })}
                </strong>
                {onLocationScopeOpen && locationScope?.available && (
                  <span className={s.chevron}>
                    <Icon name="chevronRight" size={16} strokeWidth={2} />
                  </span>
                )}
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

      {done && (
        <footer className={s.footer}>
          <button
            type="button"
            className={s.primary}
            disabled={delivering}
            onClick={() => deliver("share")}
          >
            <Icon name="share" size={20} strokeWidth={2} />
            {t("export.send")}
          </button>
          <button
            type="button"
            className={s.secondaryWide}
            disabled={delivering}
            onClick={() => deliver("save")}
          >
            <Icon name="folder" size={18} strokeWidth={1.8} />
            {t("export.saveToFiles")}
          </button>
        </footer>
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
            disabled={
              isExporting ||
              isExportingInventory ||
              (leaks.length === 0 && !inventoryOnly)
            }
            onClick={inventoryOnly ? exportInventory : handleExport}
          >
            <Icon name="download" size={20} strokeWidth={2} />
            {isExporting || isExportingInventory
              ? t("export.building")
              : t("export.build")}
          </button>
        </footer>
      )}
    </div>
  );
}

/** Чип раздела в «Что включить» (8a). «Утечки» включены всегда. */
function IncludeChip({
  label,
  count,
  on,
  locked = false,
  onToggle = /** @type {(() => void)|null} */ (null),
}) {
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
  const day = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" });
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
                {[
                  entry.size != null && formatBytes(entry.size, lang, t),
                  entry.delivery && t(`export.delivery.${entry.delivery}`),
                ]
                  .filter(Boolean)
                  .join(" · ") ||
                  t("export.fileMeta", {
                    rows: entry.rows,
                    photos: entry.photos,
                  })}
              </small>
            </span>
            <small>{day.format(new Date(entry.date)).replace(".", "")}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

/** «143 МБ», «1,4 МБ», «240 КБ». */
function formatBytes(bytes, lang, t) {
  const number = (value, digits) =>
    new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(
      value,
    );
  if (bytes >= 1024 * 1024) {
    const mb = bytes / 1024 / 1024;
    return t("export.mb", { value: number(mb, mb < 10 ? 1 : 0) });
  }
  return t("export.kb", { value: number(Math.max(1, bytes / 1024), 0) });
}

/** Период для названия выгрузки: месяц словом, если он один. */
function periodTitle(period, covered, lang, t) {
  if (period === PERIOD.ALL || !covered) return t("export.periods.all");
  const from = new Date(covered.from);
  const to = new Date(covered.to);
  if (
    from.getMonth() === to.getMonth() &&
    from.getFullYear() === to.getFullYear() &&
    period !== PERIOD.TODAY
  ) {
    const month = new Intl.DateTimeFormat(lang, {
      month: "long",
      ...(from.getFullYear() === new Date().getFullYear()
        ? {}
        : { year: "numeric" }),
    }).format(from);
    return month.charAt(0).toLocaleUpperCase(lang) + month.slice(1);
  }
  return formatRange(covered, lang);
}
