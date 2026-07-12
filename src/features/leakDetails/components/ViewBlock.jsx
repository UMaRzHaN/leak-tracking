import { useMemo, useState, useRef } from "react";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import { getPriorityMeta } from "@/utils/priority";
import { useLanguage } from "@/app/hooks/useLanguage";
import { formatLeakDate } from "@/utils/locale";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

const ACTION_ICONS = {
  created: "✦",
  status_changed: "⇄",
  edited: "✎",
  comment: "💬",
};

const STATUS_COLORS = {
  open: "var(--c-open)",
  in_progress: "var(--c-progress)",
  resolved: "var(--c-resolved)",
};

const IDENTIFIER_KEYS = new Set(["leak_id", "video_id"]);

function fmtDate(iso, lang) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(iso, lang) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return null;

  if (diff < 60_000) return lang === "ru" ? "только что" : "just now";
  if (diff < 3_600_000) {
    const n = Math.floor(diff / 60_000);
    return lang === "ru" ? `${n} мин назад` : `${n} min ago`;
  }
  if (diff < 86_400_000) {
    const n = Math.floor(diff / 3_600_000);
    return lang === "ru" ? `${n} ч назад` : `${n} h ago`;
  }
  if (diff < 7 * 86_400_000) {
    const n = Math.floor(diff / 86_400_000);
    return lang === "ru" ? `${n} дн назад` : `${n} d ago`;
  }
  return null;
}

function splitFields(fields) {
  return {
    text: fields.filter((f) => !f.numeric && !f.multiline),
    // coord fields (lat/lng) stay in the info tab, not the params grid
    numeric: fields.filter((f) => f.numeric && !f.coord),
    coords: fields.filter((f) => f.coord),
    multi: fields.filter((f) => !f.numeric && f.multiline),
  };
}

function translateFieldLabel(key, fallbackLabel, t, lang) {
  const explicitLabels = {
    date: lang === "ru" ? "Дата" : "Date",
    lat: lang === "ru" ? "Широта (X)" : "Latitude (X)",
    lng: lang === "ru" ? "Долгота (Y)" : "Longitude (Y)",
  };

  return t(`addLeak.fields.${key}.label`, {
    defaultValue: explicitLabels[key] ?? fallbackLabel,
  });
}

function formatHistoryValue(key, value, kind, lang) {
  if (kind === "photo") {
    return value
      ? lang === "ru"
        ? "фото есть"
        : "photo"
      : lang === "ru"
        ? "нет фото"
        : "no photo";
  }

  if (value == null || value === "") return lang === "ru" ? "пусто" : "empty";
  if (value === "[changed]") return lang === "ru" ? "изменено" : "changed";
  if (key === "date") return formatLeakDate(value, {}, lang);
  if (IDENTIFIER_KEYS.has(key)) return String(value);
  if (typeof value === "number") {
    return value.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
  }

  return String(value);
}

function getHistoryChangeLabel(change, fields, localeTexts, t, lang) {
  if (change.key === "photo") return localeTexts.photo.before;
  if (change.key === "photo_after") return localeTexts.photo.after;
  if (change.key === "priority") return localeTexts.priority;

  const field = fields.find((item) => item.key === change.key);
  return translateFieldLabel(change.key, field?.label ?? change.key, t, lang);
}

function CommentInput({ onSubmit, localeTexts }) {
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
      <button
        type="button"
        className={s.addCommentBtn}
        onClick={() => {
          setOpen(true);
          setTimeout(() => ref.current?.focus(), 50);
        }}
      >
        {localeTexts.comment.add}
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
        placeholder={localeTexts.comment.placeholder}
        rows={3}
      />
      <div className={s.commentActions}>
        <button
          type="button"
          className={s.commentCancel}
          onClick={() => {
            setText("");
            setOpen(false);
          }}
        >
          {localeTexts.comment.cancel}
        </button>
        <button
          type="button"
          className={s.commentSubmit}
          onClick={submit}
          disabled={!text.trim()}
        >
          {localeTexts.comment.save}
        </button>
      </div>
    </div>
  );
}

function PhotoComparison({
  photoBefore,
  photoAfter,
  allowAfter = true,
  localeTexts,
}) {
  const srcBefore = usePhotoSrc(photoBefore ?? null);
  const srcAfter = usePhotoSrc(photoAfter ?? null);
  const [viewer, setViewer] = useState(null); // "before" | "after" | null

  const hasBefore = Boolean(photoBefore);
  const hasAfter = allowAfter && Boolean(photoAfter);
  if (!hasBefore && !hasAfter) return null;

  return (
    <>
      <div
        className={`${s.photoCompare} ${allowAfter ? "" : s.photoCompareSingle}`}
      >
        {[
          { key: "before", label: localeTexts.photo.before, src: srcBefore },
          { key: "after", label: localeTexts.photo.after, src: srcAfter },
        ]
          .filter(({ key }) => allowAfter || key !== "after")
          .map(({ key, label, src }) => (
            <div key={key} className={s.photoCompareSlot}>
              <span className={s.photoCompareLabel}>{label}</span>
              {src ? (
                <button
                  type="button"
                  className={s.photoCompareThumb}
                  onClick={() => setViewer(key)}
                >
                  <img
                    src={src}
                    alt={label}
                    className={s.photoCompareImg}
                    draggable={false}
                  />
                </button>
              ) : (
                <div className={s.photoComparePlaceholder}>
                  {localeTexts.photo.noPhoto}
                </div>
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

export default function ViewBlock({
  data,
  activeTab,
  projectConfig,
  onAddComment,
}) {
  const { t, lang } = useLanguage();

  const localeTexts = useMemo(
    () => ({
      priority: t("leakDetails.priority"),

      actions: {
        created: t("leakDetails.actions.created"),
        status_changed: t("leakDetails.actions.status_changed"),
        edited: t("leakDetails.actions.edited"),
        comment: t("leakDetails.actions.comment"),
      },

      statuses: {
        open: t("leakDetails.statuses.open"),
        in_progress: t("leakDetails.statuses.in_progress"),
        resolved: t("leakDetails.statuses.resolved"),
      },

      comment: {
        add: t("leakDetails.comment.add"),
        placeholder: t("leakDetails.comment.placeholder"),
        cancel: t("leakDetails.comment.cancel"),
        save: t("leakDetails.comment.save"),
      },

      photo: {
        before: t("leakDetails.photo.before"),
        after: t("leakDetails.photo.after"),
        noPhoto: t("leakDetails.photo.noPhoto"),
      },

      empty: {
        info: t("leakDetails.empty.info"),
        photo: t("leakDetails.empty.photo"),
        params: t("leakDetails.empty.params"),
        coords: t("leakDetails.empty.coords"),
        history: t("leakDetails.empty.history"),
      },
    }),
    [t],
  );
  const fields = useMemo(() => {
    const all = projectConfig.system.fields ?? [];
    return all
      .filter((f) => f.viewable !== false)
      .sort((a, b) => (a.viewOrder ?? 999) - (b.viewOrder ?? 999));
  }, [projectConfig]);

  const { text, numeric, coords, multi } = useMemo(
    () => splitFields(fields),
    [fields],
  );
  const history = Array.isArray(data.history)
    ? [...data.history].reverse()
    : [];

  if (activeTab === "info") {
    const infoFields = [...text, ...multi];
    const hasAny = infoFields.some(
      (f) => data[f.key] != null && data[f.key] !== "",
    );
    return (
      <div className={s.tabPane}>
        {/* ── Приоритет (только отображение) ── */}
        {data.priority &&
          getPriorityMeta(data.priority, t, lang) &&
          (() => {
            const m = getPriorityMeta(data.priority, t, lang);
            return (
              <div className={s.priorityRow}>
                <span className={s.priorityRowLabel}>
                  {localeTexts.priority}
                </span>
                <span
                  className={s.priorityBtn}
                  style={{
                    background: m.bg,
                    color: m.color,
                    borderColor: m.border,
                  }}
                >
                  {m.short}
                </span>
              </div>
            );
          })()}

        {hasAny ? (
          infoFields.map(({ key, label, multiline }) => {
            const val = data[key];
            if (val == null || val === "") return null;
            return (
              <div
                key={key}
                className={`${s.fieldRow} ${multiline ? s.fieldRowMulti : ""}`}
              >
                <span className={s.fieldLabel}>
                  {translateFieldLabel(key, label, t, lang)}
                </span>
                <span
                  className={`${s.fieldValue} ${multiline ? s.fieldValueMulti : ""}`}
                >
                  {key === "date" ? formatLeakDate(val, {}, lang) : String(val)}
                </span>
              </div>
            );
          })
        ) : (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📋</span>
            <p>{localeTexts.empty.info}</p>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === "photo") {
    const allowAfter = data.status === "resolved";
    const hasPhotos =
      Boolean(data.photo) || (allowAfter && Boolean(data.photo_after));
    return (
      <div className={s.tabPane}>
        {hasPhotos ? (
          <PhotoComparison
            photoBefore={data.photo}
            photoAfter={allowAfter ? data.photo_after : null}
            allowAfter={allowAfter}
            localeTexts={localeTexts}
          />
        ) : (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📷</span>
            <p>{localeTexts.empty.photo}</p>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === "params") {
    const hasAny = numeric.some(
      (f) => data[f.key] != null && data[f.key] !== "",
    );
    return (
      <div className={s.tabPane}>
        {hasAny ? (
          <div className={s.paramsGrid}>
            {numeric.map(({ key, label }) => {
              const raw = data[key];
              if (raw == null || raw === "") return null;
              const num = Number(raw);
              const display =
                IDENTIFIER_KEYS.has(key) || isNaN(num)
                  ? String(raw)
                  : num.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
              return (
                <div key={key} className={s.paramCard}>
                  <span className={s.paramLabel}>
                    {translateFieldLabel(key, label, t, lang)}
                  </span>
                  <span className={s.paramValue}>{display}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📊</span>
            <p>{localeTexts.empty.params}</p>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === "coords") {
    const hasCoords = coords.some(
      (f) => data[f.key] != null && data[f.key] !== "",
    );
    return (
      <div className={s.tabPane}>
        {hasCoords ? (
          coords.map(({ key, label }) => {
            const val = data[key];
            if (val == null || val === "") return null;
            return (
              <div key={key} className={s.fieldRow}>
                <span className={s.fieldLabel}>
                  {translateFieldLabel(key, label, t, lang)}
                </span>
                <span className={s.fieldValue}>{Number(val).toFixed(6)}</span>
              </div>
            );
          })
        ) : (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📍</span>
            <p>{localeTexts.empty.coords}</p>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === "log") {
    return (
      <div className={s.tabPane}>
        {onAddComment && (
          <CommentInput onSubmit={onAddComment} localeTexts={localeTexts} />
        )}
        {history.length > 0 ? (
          history.map((entry, i) => {
            const rel = relativeTime(entry.date, lang);
            const abs = fmtDate(entry.date, lang);
            const toColor = entry.to ? STATUS_COLORS[entry.to] : null;
            const icon = ACTION_ICONS[entry.action] ?? "•";
            const changes = Array.isArray(entry.changes) ? entry.changes : [];
            return (
              <div key={i} className={s.logEntry}>
                <div className={s.logDotWrap}>
                  <span
                    className={s.logDot}
                    style={
                      toColor
                        ? { background: toColor, borderColor: toColor }
                        : undefined
                    }
                  >
                    {icon}
                  </span>
                  {i < history.length - 1 && <span className={s.logLine} />}
                </div>
                <div className={s.logBody}>
                  <span className={s.logAction}>
                    {localeTexts.actions[entry.action] ?? entry.action}
                  </span>
                  {entry.to && (
                    <span
                      className={s.logStatus}
                      style={toColor ? { color: toColor } : undefined}
                    >
                      {localeTexts.statuses[entry.to] ?? entry.to}
                    </span>
                  )}
                  {entry.text && (
                    <span className={s.logCommentText}>{entry.text}</span>
                  )}
                  {changes.length > 0 && (
                    <div className={s.logChanges}>
                      {changes.map((change, changeIndex) => (
                        <div
                          key={`${change.key}-${changeIndex}`}
                          className={s.logChange}
                        >
                          <span className={s.logChangeLabel}>
                            {getHistoryChangeLabel(
                              change,
                              fields,
                              localeTexts,
                              t,
                              lang,
                            )}
                          </span>
                          <span className={s.logChangeValue}>
                            {formatHistoryValue(
                              change.key,
                              change.from,
                              change.kind,
                              lang,
                            )}
                          </span>
                          <span className={s.logChangeArrow}>→</span>
                          <span className={s.logChangeValue}>
                            {formatHistoryValue(
                              change.key,
                              change.to,
                              change.kind,
                              lang,
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <span className={s.logDate}>
                    {rel ? (
                      <>
                        {rel} · <span className={s.logDateAbs}>{abs}</span>
                      </>
                    ) : (
                      abs
                    )}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>🕐</span>
            <p>{localeTexts.empty.history}</p>
          </div>
        )}
      </div>
    );
  }

  return null;
}
