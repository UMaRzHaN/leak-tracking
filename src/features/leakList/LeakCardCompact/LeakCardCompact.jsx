import { memo, useState } from "react";
import { useSwipeCard } from "@/hooks/useSwipeCard";
import { STATUS_META } from "@/utils/status";
import { PRIORITY_META } from "@/utils/priority";
import { timeAgo } from "@/utils/timeAgo";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import s from "./LeakCardCompact.module.scss";

/* ── Compact number formatter ── */
function fmtNum(n, decimals = 1) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(decimals)} млн.`;
  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(decimals)} тыс.`;
  return v.toLocaleString("ru-RU", { maximumFractionDigits: decimals });
}

/* ── Urgency by age (ignored for resolved leaks) ── */
function urgencyOf(createdAt, status) {
  if (status === "resolved") return "resolved";
  const ms = Date.now() - Number(new Date(createdAt));
  if (ms < 86_400_000)         return "fresh";    // < 24 ч  → синяя
  if (ms < 7 * 86_400_000)     return "warning";  // 1–7 дн  → янтарная
  return "danger";                                 // > 7 дн  → красная пульс
}

function LeakCardCompact({
  leak,
  onPickStatus,
  onOpenDetails,
  nearbyDist,
  selected = false,
  onToggleSelect,
}) {
  const { swipeState, swipeOffset, close, handlers } = useSwipeCard({
    leak,
    onOpenDetails,
    onPickStatus,
  });

  const swiping    = swipeOffset !== 0;
  const goingLeft  = swipeState === "left"  || swipeOffset < -30;
  const goingRight = swipeState === "right" || swipeOffset > 30;

  const status     = leak.status ?? "open";
  const meta       = STATUS_META[status];
  const ago        = timeAgo(leak.createdAt);
  const urgency    = urgencyOf(leak.createdAt, status);

  const [viewerIndex, setViewerIndex] = useState(null);

  const photoSrc      = usePhotoSrc(leak.photo ?? null);
  const photoAfterSrc = usePhotoSrc(status === "resolved" ? (leak.photo_after ?? null) : null);

  const emissions = fmtNum(leak.Emissions_t_CO2eq_year, 2);
  const methane   = fmtNum(leak.Total_Annual_Methane_Loss_m3_y, 0);

  const comparePairs = [
    photoSrc      ? { src: photoSrc,      label: "До"    } : null,
    photoAfterSrc ? { src: photoAfterSrc, label: "После" } : null,
  ].filter(Boolean);

  const showBook  = status === "resolved" && comparePairs.length === 2;
  const hasPhoto  = Boolean(photoSrc) || (status === "resolved" && Boolean(photoAfterSrc));
  const hasChips  = leak.leak_speed != null || leak.pressure != null ||
                    nearbyDist != null || emissions != null || methane != null;
  const hasFooter = hasChips || hasPhoto;

  const viewerPhotos = showBook ? comparePairs.map((p) => p.src) : [(photoSrc || photoAfterSrc)].filter(Boolean);
  const viewerLabels = showBook ? comparePairs.map((p) => p.label) : [];

  return (
    <>
      <div className={s.wrapper} onClick={close}>

        {/* ── Swipe hint: right → open details ── */}
        {goingRight && (
          <div className={s.hintRight}>
            <span className={s.hintIcon}>→</span>
            <span className={s.hintText}>Открыть</span>
          </div>
        )}

        {/* ── Swipe hint: left → status picker ── */}
        {goingLeft && (
          <div className={s.hintLeft}>
            <span className={s.hintIcon}>☰</span>
            <span className={s.hintText}>Статус</span>
          </div>
        )}

        {/* ── Card ── */}
        <div
          className={`${s.card} ${selected ? s.selected : ""} ${goingLeft ? s.swipeLeft : ""} ${goingRight ? s.swipeRight : ""}`}
          data-urgency={urgency}
          data-priority={leak.priority ?? "none"}
          data-selected={selected ? "true" : "false"}
          style={{
            transform:  `translateX(${swipeOffset}px)`,
            transition: swiping ? "none" : "transform var(--t-spring)",
          }}
          {...handlers}
        >
          {/* ── Head: selection + status + ID + time ── */}
          <div className={s.head} style={{ background: meta.bg }}>
            {onToggleSelect && (
              <button
                type="button"
                className={`${s.selectToggle} ${selected ? s.selectToggleActive : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(leak.id);
                }}
                aria-pressed={selected}
                aria-label={selected ? "Убрать из выбора" : "Выбрать утечку"}
                title={selected ? "Убрать из выбора" : "Выбрать утечку"}
              >
                <span className={s.selectToggleMark}>{selected ? "✓" : ""}</span>
              </button>
            )}

            <span
              className={s.statusPill}
              style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
            >
              {meta.label}
            </span>
            {leak.priority && PRIORITY_META[leak.priority] && (
              <span
                className={s.priorityPill}
                style={{
                  color: PRIORITY_META[leak.priority].color,
                  background: PRIORITY_META[leak.priority].bg,
                  borderColor: PRIORITY_META[leak.priority].border,
                }}
              >
                {PRIORITY_META[leak.priority].short}
              </span>
            )}
            <span className={s.id}>№ {leak.leak_id ?? leak.index}</span>
            <span className={s.time}>{ago ?? leak.date}</span>
          </div>

          {/* ── Body ── */}
          <div className={s.body}>
            {(leak.object || leak.component) && (
              <div className={s.titleBlock}>
                {leak.object    && <span className={s.objectName}>{leak.object}</span>}
                {leak.component && <span className={s.component}>{leak.component}</span>}
              </div>
            )}
            {(leak.location || leak.field) && (
              <div className={s.locationRow}>
                <span className={s.locationPin}>◉</span>
                <span className={s.locationText}>
                  {[leak.field, leak.location].filter(Boolean).join(" · ")}
                </span>
              </div>
            )}
            {leak.leak_description && (
              <p className={s.desc}>{leak.leak_description}</p>
            )}
          </div>

          {/* ── Footer: chips + photo thumb ── */}
          {hasFooter && (
            <div className={s.foot}>
              <div className={s.chips}>
                {nearbyDist != null && (
                  <span className={s.chipNear}>📍 {nearbyDist} м</span>
                )}
                {leak.leak_speed != null && (
                  <span className={s.chip}>{leak.leak_speed} л/мин</span>
                )}
                {methane != null && (
                  <span className={s.chipCalc}>~{methane} м³/г</span>
                )}
                {emissions != null && (
                  <span className={s.chipCalc}>~{emissions} т CO₂-экв/год</span>
                )}
              </div>
              {showBook ? (
                <div
                  className={s.photoStack}
                  onClick={(e) => { e.stopPropagation(); setViewerIndex(0); }}
                >
                  <div className={s.photoStackBack}>
                    <img src={photoAfterSrc} alt="После" className={s.photoStackImg} loading="lazy" draggable={false} />
                  </div>
                  <div className={s.photoStackFront}>
                    <img src={photoSrc} alt="До" className={s.photoStackImg} loading="lazy" draggable={false} />
                    <span className={s.photoStackLabel}>До</span>
                  </div>
                </div>
              ) : hasPhoto && (
                <div
                  className={s.photoThumb}
                  onClick={(e) => { e.stopPropagation(); setViewerIndex(0); }}
                >
                  <img src={photoSrc || photoAfterSrc} alt="" className={s.photoThumbImg} loading="lazy" draggable={false} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {viewerIndex !== null && (
        <PhotoViewer
          photos={viewerPhotos}
          labels={viewerLabels}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  );
}

export default memo(LeakCardCompact);
