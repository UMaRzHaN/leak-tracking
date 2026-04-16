import { STATUS_META } from "../../../utils/status";
import StatusBadge from "../../StatusBadge/StatusBadge";
import s from "../LeakDetailsSheet.module.scss";

export default function PhotoBlock({
  src,
  onEdit,
  onView,
  status = "open",
  identityNum,
  identityTime,
  onStatusChange,
}) {
  const meta     = STATUS_META[status] ?? STATUS_META.open;
  const hasPhoto = Boolean(src);
  const clickable = onEdit ?? onView;

  return (
    <div className={s.identityRow}>

      {/* ── Thumbnail ── */}
      <div
        className={`${s.thumb} ${clickable ? s.thumbEditable : ""}`}
        onClick={clickable ?? undefined}
        role={clickable ? "button" : undefined}
      >
        {hasPhoto ? (
          <img src={src} alt="Фото утечки" className={s.thumbImg} draggable={false} />
        ) : (
          <div
            className={s.thumbEmpty}
            style={{ background: `linear-gradient(145deg, ${meta.bg} 0%, var(--c-surface2) 100%)` }}
          >
            <span className={s.thumbEmptyIcon}>📷</span>
          </div>
        )}

        {onEdit && (
          <div className={s.thumbEditOverlay}>
            <span className={s.thumbEditIcon}>✏</span>
          </div>
        )}
        {onView && hasPhoto && !onEdit && (
          <div className={s.thumbViewOverlay}>
            <span className={s.thumbEditIcon}>🔍</span>
          </div>
        )}
      </div>

      {/* ── Identity info ── */}
      <div className={s.identityInfo}>
        <span className={s.identityNum}>{identityNum}</span>
        {identityTime && (
          <span className={s.identityTime}>{identityTime}</span>
        )}
        <div className={s.identityBadgeRow}>
          <StatusBadge
            status={status}
            size="md"
            onClick={onStatusChange}
          />
          {onStatusChange && (
            <span className={s.identityHint}>нажмите для смены</span>
          )}
        </div>
      </div>

    </div>
  );
}
