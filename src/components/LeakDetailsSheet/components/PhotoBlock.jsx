import { STATUS_META } from "../../../utils/status";
import StatusBadge from "../../StatusBadge/StatusBadge";
import s from "../LeakDetailsSheet.module.scss";

/**
 * Hero block: full-width photo (or status-tinted placeholder) with
 * the identity info (№ + time + status badge) overlaid at the bottom.
 */
export default function PhotoBlock({
  src,
  onEdit,
  status = "open",
  identityNum,
  identityTime,
  onStatusChange,
}) {
  const meta    = STATUS_META[status] ?? STATUS_META.open;
  const hasPhoto = Boolean(src);

  return (
    <div className={`${s.hero} ${hasPhoto ? s.heroPhoto : s.heroEmpty}`}>

      {/* ── Background ── */}
      {hasPhoto ? (
        <img src={src} alt="Фото утечки" className={s.heroImg} draggable={false} />
      ) : (
        <div
          className={s.heroPlaceholder}
          style={{ background: `linear-gradient(145deg, ${meta.bg} 0%, var(--c-surface) 100%)` }}
        >
          <span className={s.heroPlaceholderIcon}>📷</span>
          <span className={s.heroPlaceholderText}>Фото не добавлено</span>
        </div>
      )}

      {/* ── Bottom gradient → blends into identity overlay ── */}
      <div className={hasPhoto ? s.heroGradientDark : s.heroGradientLight} />

      {/* ── Identity overlay ── */}
      <div className={s.heroIdentity}>
        <div className={s.heroIdentityLeft}>
          <span className={hasPhoto ? s.heroNumLight : s.heroNum}>{identityNum}</span>
          {identityTime && (
            <span className={hasPhoto ? s.heroTimeLight : s.heroTime}>{identityTime}</span>
          )}
        </div>
        <StatusBadge
          status={status}
          size="md"
          onClick={onStatusChange}
        />
      </div>

      {/* ── Edit photo button (edit mode only) ── */}
      {onEdit && (
        <button className={s.photoEditBtn} onClick={onEdit} type="button">
          ✏ Фото
        </button>
      )}
    </div>
  );
}
