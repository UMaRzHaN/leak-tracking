import { useCallback, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import { useExcelExportMode } from "@/app/project/hooks/useExcelExportMode";
import Notification from "@/components/ui/Notification/Notification";
import Icon from "@/components/ui/Icon/Icon";
import { useDataBaseExport } from "@/pages/DataBase/hooks/useDataBaseExport";
import { collectLeakPhotoPaths } from "@/domain/leakLifecycle";
import { EXCEL_MONITORING_EXPORT_MODE } from "@/utils/excelExportMode";
import { formatMonitoringDate } from "@/utils/monitoring";
import {
  PERIOD,
  filterByPeriod,
  periodRange,
  pushExportHistory,
  readExportHistory,
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
  const [notification, setNotification] = useState(/** @type {any} */ (null));
  const [done, setDone] = useState(/** @type {any} */ (null));
  const [history, setHistory] = useState(() =>
    readExportHistory(activeProject?.id),
  );

  const source = scopeOnly ? scopedData : data;
  const range = useMemo(() => periodRange(period, custom), [period, custom]);
  const leaks = useMemo(() => filterByPeriod(source, range), [source, range]);
  const photos = useMemo(
    () =>
      leaks.reduce((sum, leak) => sum + collectLeakPhotoPaths(leak).length, 0),
    [leaks],
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
                PERIOD.SHIFT,
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
            <h2>{t("export.contents")}</h2>
            <div className={s.card}>
              <div className={s.row}>
                <span className={s.rowNum}>1</span>
                <strong>{t("export.sheetLeaks")}</strong>
                <small>{leaks.length}</small>
              </div>
              <div className={s.row}>
                <span className={s.rowNum}>2</span>
                <strong>{t("export.sheetMonitoring")}</strong>
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
              <div className={s.row}>
                <span className={s.rowNum}>3</span>
                <strong>{t("export.photos")}</strong>
                <small>{photos}</small>
              </div>
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
