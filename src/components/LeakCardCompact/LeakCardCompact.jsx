import { useState } from "react";
import { useSwipeCard } from "../../hooks/useSwipeCard";
import { STATUS_META, STATUS_TRANSITIONS } from "../../utils/status";
import { timeAgo } from "../../utils/timeAgo";
import { usePhotoSrc } from "../../hooks/usePhotoSrc";
import PhotoViewer from "../PhotoViewer/PhotoViewer";
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
function urgencyOf(leakId, status) {
  if (status === "resolved") return "resolved";
  const ms = Date.now() - Number(leakId);
  if (ms < 86_400_000)         return "fresh";    // < 24 ч  → синяя
  if (ms < 7 * 86_400_000)     return "warning";  // 1–7 дн  → янтарная
  return "danger";                                 // > 7 дн  → красная пульс
}

export default function LeakCardCompact({
  leak,
  onStatusChange,
  onOpenDetails,
  nearbyDist,
}) {
  const { swipeState, swipeOffset, close, handlers } = useSwipeCard({
    leak,
    onOpenDetails,
    onStatusChange,
  });

  const swiping    = swipeOffset !== 0;
  const goingLeft  = swipeState === "left"  || swipeOffset < -30;
  const goingRight = swipeState === "right" || swipeOffset > 30;

  const status     = leak.status ?? "open";
  const meta       = STATUS_META[status];
  const transition = STATUS_TRANSITIONS[status];
  const nextMeta   = transition ? STATUS_META[transition.next] : null;
  const ago        = timeAgo(leak.id);
  const urgency    = urgencyOf(leak.id, status);

  const [viewerOpen, setViewerOpen] = useState(false);

  const photoSrc  = usePhotoSrc(leak.photo ?? null);

  const emissions = fmtNum(leak.Emissions_t_CO2eq_year, 2);
  const methane   = fmtNum(leak.Total_Annual_Methane_Loss_m3_y, 0);

  const hasChips  = leak.leak_speed != null || leak.pressure != null ||
                    nearbyDist != null || emissions != null || methane != null;
  const hasPhoto  = Boolean(photoSrc);
  const hasFooter = hasChips || hasPhoto;

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

        {/* ── Swipe hint: left → next status ── */}
        {goingLeft && transition && (
          <div className={s.hintLeft} data-next={transition.next}>
            <span className={s.hintIcon}>{nextMeta?.label ?? "→"}</span>
            <span className={s.hintText}>{transition.action}</span>
          </div>
        )}

        {/* ── Card ── */}
        <div
          className={`${s.card} ${goingLeft ? s.swipeLeft : ""} ${goingRight ? s.swipeRight : ""}`}
          data-urgency={urgency}
          style={{
            transform:  `translateX(${swipeOffset}px)`,
            transition: swiping ? "none" : "transform var(--t-spring)",
          }}
          {...handlers}
        >
          {/* ── Head: status pill + ID + time ── */}
          <div className={s.head} style={{ background: meta.bg }}>
            <span
              className={s.statusPill}
              style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
            >
              {meta.label}
            </span>
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
                  <span className={s.chipCalc}>~{emissions} т CO₂</span>
                )}
              </div>
              {hasPhoto && (
                <div
                  className={s.photoThumb}
                  onClick={(e) => { e.stopPropagation(); setViewerOpen(true); }}
                >
                  <img
                    src={photoSrc}
                    alt=""
                    className={s.photoThumbImg}
                    loading="lazy"
                    draggable={false}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {viewerOpen && (
        <PhotoViewer src={photoSrc} onClose={() => setViewerOpen(false)} />
      )}
    </>
  );
}
