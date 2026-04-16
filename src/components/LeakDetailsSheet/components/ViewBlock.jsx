import { useMemo } from "react";
import s from "../LeakDetailsSheet.module.scss";

const ACTION_LABELS = {
  created:        "Запись создана",
  status_changed: "Статус изменён",
  edited:         "Данные изменены",
};

const STATUS_TO_RU = {
  open:        "Открыта",
  in_progress: "В работе",
  resolved:    "Устранена",
};

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function splitFields(fields) {
  return {
    text:    fields.filter((f) => !f.numeric && !f.multiline),
    // coord fields (lat/lng) stay in the info tab, not the params grid
    numeric: fields.filter((f) =>  f.numeric && !f.coord),
    coords:  fields.filter((f) =>  f.coord),
    multi:   fields.filter((f) => !f.numeric && f.multiline),
  };
}

export default function ViewBlock({ data, activeTab, projectConfig }) {
  const fields = useMemo(() => {
    const all = projectConfig.system.fields ?? [];
    return all
      .filter((f) => f.viewable !== false)
      .sort((a, b) => (a.viewOrder ?? 999) - (b.viewOrder ?? 999));
  }, [projectConfig]);

  const { text, numeric, coords, multi } = useMemo(() => splitFields(fields), [fields]);
  const history = Array.isArray(data.history) ? [...data.history].reverse() : [];

  if (activeTab === "info") {
    const infoFields = [...text, ...multi];
    const hasAny = infoFields.some((f) => data[f.key] != null && data[f.key] !== "");
    return (
      <div className={s.tabPane}>
        {hasAny ? infoFields.map(({ key, label, multiline }) => {
          const val = data[key];
          if (val == null || val === "") return null;
          return (
            <div key={key} className={`${s.fieldRow} ${multiline ? s.fieldRowMulti : ""}`}>
              <span className={s.fieldLabel}>{label}</span>
              <span className={`${s.fieldValue} ${multiline ? s.fieldValueMulti : ""}`}>
                {String(val)}
              </span>
            </div>
          );
        }) : (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📋</span>
            <p>Нет данных</p>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === "params") {
    const hasAny = numeric.some((f) => data[f.key] != null && data[f.key] !== "");
    return (
      <div className={s.tabPane}>
        {hasAny ? (
          <div className={s.paramsGrid}>
            {numeric.map(({ key, label }) => {
              const raw = data[key];
              if (raw == null || raw === "") return null;
              const num = Number(raw);
              const display = isNaN(num) ? String(raw) : num.toLocaleString("ru-RU");
              return (
                <div key={key} className={s.paramCard}>
                  <span className={s.paramLabel}>{label}</span>
                  <span className={s.paramValue}>{display}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📊</span>
            <p>Параметры не заданы</p>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === "coords") {
    const hasCoords = coords.some((f) => data[f.key] != null && data[f.key] !== "");
    return (
      <div className={s.tabPane}>
        {hasCoords ? coords.map(({ key, label }) => {
          const val = data[key];
          if (val == null || val === "") return null;
          return (
            <div key={key} className={s.fieldRow}>
              <span className={s.fieldLabel}>{label}</span>
              <span className={s.fieldValue}>{Number(val).toFixed(6)}</span>
            </div>
          );
        }) : (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📍</span>
            <p>Координаты не заданы</p>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === "log") {
    return (
      <div className={s.tabPane}>
        {history.length > 0 ? history.map((entry, i) => (
          <div key={i} className={s.logEntry}>
            <div className={s.logDotWrap}>
              <span className={s.logDot} />
              {i < history.length - 1 && <span className={s.logLine} />}
            </div>
            <div className={s.logBody}>
              <span className={s.logAction}>
                {ACTION_LABELS[entry.action] ?? entry.action}
                {entry.to ? ` → ${STATUS_TO_RU[entry.to] ?? entry.to}` : ""}
              </span>
              <span className={s.logDate}>{fmtDate(entry.date)}</span>
            </div>
          </div>
        )) : (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>🕐</span>
            <p>История пуста</p>
          </div>
        )}
      </div>
    );
  }

  return null;
}
