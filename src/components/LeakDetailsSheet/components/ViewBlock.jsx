import { useMemo, useState, useRef } from "react";
import { usePhotoSrc } from "../../../hooks/usePhotoSrc";
import PhotoViewer from "../../PhotoViewer/PhotoViewer";
import { PRIORITY_ORDER, PRIORITY_META } from "../../../utils/priority";
import s from "../LeakDetailsSheet.module.scss";

const ACTION_LABELS = {
  created:        "Запись создана",
  status_changed: "Статус изменён",
  edited:         "Данные изменены",
  comment:        "Комментарий",
};

const ACTION_ICONS = {
  created:        "✦",
  status_changed: "⇄",
  edited:         "✎",
  comment:        "💬",
};

const STATUS_TO_RU = {
  open:        "Открыта",
  in_progress: "В работе",
  resolved:    "Устранена",
};

const STATUS_COLORS = {
  open:        "var(--c-open)",
  in_progress: "var(--c-progress)",
  resolved:    "var(--c-resolved)",
};

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function relativeTime(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return null;
  if (diff < 60_000) return "только что";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} дн назад`;
  return null;
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

function CommentInput({ onSubmit }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSubmit(t);
    setText("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className={s.addCommentBtn} onClick={() => { setOpen(true); setTimeout(() => ref.current?.focus(), 50); }}>
        + Добавить комментарий
      </button>
    );
  }

  return (
    <div className={s.commentInputWrap}>
      <textarea
        ref={ref}
        className={s.commentTextarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Введите комментарий..."
        rows={3}
      />
      <div className={s.commentActions}>
        <button type="button" className={s.commentCancel} onClick={() => { setText(""); setOpen(false); }}>Отмена</button>
        <button type="button" className={s.commentSubmit} onClick={submit} disabled={!text.trim()}>Сохранить</button>
      </div>
    </div>
  );
}

function PhotoComparison({ photoBefore, photoAfter, allowAfter = true }) {
  const srcBefore = usePhotoSrc(photoBefore ?? null);
  const srcAfter  = usePhotoSrc(photoAfter  ?? null);
  const [viewer, setViewer] = useState(null); // "before" | "after" | null

  const hasBefore = Boolean(photoBefore);
  const hasAfter = allowAfter && Boolean(photoAfter);
  if (!hasBefore && !hasAfter) return null;

  return (
    <>
      <div className={`${s.photoCompare} ${allowAfter ? "" : s.photoCompareSingle}`}>
        {[
          { key: "before", label: "До",    src: srcBefore },
          { key: "after",  label: "После", src: srcAfter  },
        ].filter(({ key }) => allowAfter || key !== "after").map(({ key, label, src }) => (
          <div key={key} className={s.photoCompareSlot}>
            <span className={s.photoCompareLabel}>{label}</span>
            {src ? (
              <button
                type="button"
                className={s.photoCompareThumb}
                onClick={() => setViewer(key)}
              >
                <img src={src} alt={label} className={s.photoCompareImg} draggable={false} />
              </button>
            ) : (
              <div className={s.photoComparePlaceholder}>нет фото</div>
            )}
          </div>
        ))}
      </div>

      {viewer === "before" && srcBefore && (
        <PhotoViewer src={srcBefore} onClose={() => setViewer(null)} />
      )}
      {viewer === "after" && srcAfter && (
        <PhotoViewer src={srcAfter} onClose={() => setViewer(null)} />
      )}
    </>
  );
}

export default function ViewBlock({ data, activeTab, projectConfig, onAddComment, onPriorityChange }) {
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
        {/* ── Приоритет ── */}
        {onPriorityChange && (
          <div className={s.priorityRow}>
            <span className={s.priorityRowLabel}>Приоритет</span>
            <div className={s.priorityPills}>
              {PRIORITY_ORDER.map((p) => {
                const m = PRIORITY_META[p];
                const active = data.priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    className={s.priorityBtn}
                    style={active ? { background: m.bg, color: m.color, borderColor: m.border } : undefined}
                    onClick={() => onPriorityChange(active ? null : p)}
                  >
                    {m.short}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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

  if (activeTab === "photo") {
    const allowAfter = data.status === "resolved";
    const hasPhotos = Boolean(data.photo) || (allowAfter && Boolean(data.photo_after));
    return (
      <div className={s.tabPane}>
        {hasPhotos ? (
          <PhotoComparison
            photoBefore={data.photo}
            photoAfter={allowAfter ? data.photo_after : null}
            allowAfter={allowAfter}
          />
        ) : (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📷</span>
            <p>Фото не добавлены</p>
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
        {onAddComment && (
          <CommentInput onSubmit={onAddComment} />
        )}
        {history.length > 0 ? history.map((entry, i) => {
          const rel = relativeTime(entry.date);
          const abs = fmtDate(entry.date);
          const toColor = entry.to ? STATUS_COLORS[entry.to] : null;
          const icon = ACTION_ICONS[entry.action] ?? "•";
          return (
            <div key={i} className={s.logEntry}>
              <div className={s.logDotWrap}>
                <span
                  className={s.logDot}
                  style={toColor ? { background: toColor, borderColor: toColor } : undefined}
                >
                  {icon}
                </span>
                {i < history.length - 1 && <span className={s.logLine} />}
              </div>
              <div className={s.logBody}>
                <span className={s.logAction}>
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </span>
                {entry.to && (
                  <span
                    className={s.logStatus}
                    style={toColor ? { color: toColor } : undefined}
                  >
                    {STATUS_TO_RU[entry.to] ?? entry.to}
                  </span>
                )}
                {entry.text && (
                  <span className={s.logCommentText}>{entry.text}</span>
                )}
                <span className={s.logDate}>
                  {rel ? <>{rel} · <span className={s.logDateAbs}>{abs}</span></> : abs}
                </span>
              </div>
            </div>
          );
        }) : (
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
