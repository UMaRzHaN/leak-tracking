import { useSwipeCard } from "../../hooks/useSwipeCard";
import { STATUS_META } from "../../utils/status";
import { timeAgo } from "../../utils/timeAgo";
import { tileForLatLng } from "../../utils/mapTile";
import s from "./LeakCardCompact.module.scss";

export default function LeakCardCompact({ leak, onRemove, onOpenDetails, nearbyDist }) {
  const { swipeState, swipeOffset, close, handlers } = useSwipeCard({
    leak,
    onOpenDetails,
    onRemove,
  });

  const swiping    = swipeOffset !== 0;
  const goingLeft  = swipeState === "left"  || swipeOffset < -30;
  const goingRight = swipeState === "right" || swipeOffset > 30;

  const status = leak.status ?? "open";
  const meta   = STATUS_META[status];
  const ago    = timeAgo(leak.id);
  const tile   = (leak.lat && leak.lng)
    ? tileForLatLng(Number(leak.lat), Number(leak.lng), 15)
    : null;

  const hasChips  = leak.leak_speed != null || leak.pressure != null || nearbyDist != null;
  const hasFooter = hasChips || tile;

  return (
    <div className={s.wrapper} onClick={close}>

      {/* ── Swipe reveal panels ── */}
      {goingRight && (
        <div className={s.hintRight}>
          <span className={s.hintIcon}>→</span>
          <span className={s.hintText}>Открыть</span>
        </div>
      )}
      {goingLeft && onRemove && (
        <div className={s.hintLeft}>
          <span className={s.hintIcon}>✕</span>
          <span className={s.hintText}>Удалить</span>
        </div>
      )}

      {/* ── Card ── */}
      <div
        className={`${s.card} ${goingLeft ? s.swipeLeft : ""} ${goingRight ? s.swipeRight : ""}`}
        data-status={status}
        style={{
          transform:  `translateX(${swipeOffset}px)`,
          transition: swiping ? "none" : "transform var(--t-spring)",
        }}
        {...handlers}
      >
        {/* ── Head: status + ID + time ── */}
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
          {/* Object + component */}
          {(leak.object || leak.component) && (
            <div className={s.titleBlock}>
              {leak.object && <span className={s.objectName}>{leak.object}</span>}
              {leak.component && <span className={s.component}>{leak.component}</span>}
            </div>
          )}

          {/* Location */}
          {(leak.location || leak.field) && (
            <div className={s.locationRow}>
              <span className={s.locationPin}>◉</span>
              <span className={s.locationText}>
                {[leak.field, leak.location].filter(Boolean).join(" · ")}
              </span>
            </div>
          )}

          {/* Description */}
          {leak.leak_description && (
            <p className={s.desc}>{leak.leak_description}</p>
          )}
        </div>

        {/* ── Footer: chips + map ── */}
        {hasFooter && (
          <div className={s.foot}>
            <div className={s.chips}>
              {nearbyDist != null && (
                <span className={s.chipNear}>📍 {nearbyDist} м</span>
              )}
              {leak.pressure != null && (
                <span className={s.chip}>{leak.pressure} атм</span>
              )}
              {leak.leak_speed != null && (
                <span className={s.chip}>{leak.leak_speed} м³/ч</span>
              )}
            </div>

            {tile && (
              <div className={s.mapThumb} aria-hidden="true">
                <img
                  src={tile.url}
                  width={256}
                  height={256}
                  loading="lazy"
                  alt=""
                  style={{
                    position: "absolute",
                    left: 34 - tile.offsetX,
                    top: 24 - tile.offsetY,
                  }}
                  draggable={false}
                />
                <span className={s.mapPin} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
