import { memo } from "react";
import { useSwipeCard } from "@/hooks/useSwipeCard";
import { timeAgo } from "@/utils/timeAgo";
import s from "./RecentLeaks.module.scss";

const leakLevel = (speed = 0) =>
  speed <= 25 ? "low" : speed >= 100 ? "high" : "medium";

function RecentLeakItem({ leak, onOpenDetails, onRemove }) {
  const { swipeState, swipeOffset, close, handlers } = useSwipeCard({
    leak,
    onOpenDetails,
    onRemove,
  });

  return (
    <div
      className={s.swipeWrapper}
      onClick={() => {
        if (swipeOffset !== 0) close();
      }}
    >
      {/* 👉 SWIPE LEFT → DETAILS */}
      {(swipeState === "right" || swipeOffset < -30) && (
        <div className={s.swipeHintRight}>
          <span>🗑</span>
          <span>Удалить</span>
        </div>
      )}

      {/* 👉 SWIPE RIGHT → DELETE */}
      {(swipeState === "left" || swipeOffset > 30) && onRemove && (
        <div className={s.swipeHintLeft}>
          <span>ℹ️</span>
          <span>Подробнее</span>
        </div>
      )}

      {/* CARD */}
      <div
        className={`${s.card} ${
          swipeState === "right" || swipeOffset > 30
            ? s.swipedLeft // удаление
            : swipeState === "left" || swipeOffset < -30
              ? s.swipedRight // подробнее
              : ""
        }`}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition:
            swipeOffset === 0
              ? "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"
              : "none",
        }}
        {...handlers}
      >
        <div
          className={`${s.leakIcon} ${s[leakLevel(leak.leak_speed)]}`}
          aria-hidden
        />

        <div className={s.leakInfo}>
          <div className={s.leakTitle}>{leak.component}</div>

          <div className={s.leakMeta}>
            <span>
              {leak.location ? leak.location : `Бирка №${leak.leak_id}`}
            </span>
            <span>•</span>

            <span>
              {leak.leak_description
                ? leak.leak_description
                : `Видео: ${leak.video_id}`}
            </span>
            <span>•</span>
            <br />

            <span>
              {leak.Emissions_t_CO2eq_year
                ? Math.ceil(leak.Emissions_t_CO2eq_year)
                    .toLocaleString("ru-RU")
                    .replace(/\s/g, ".") + " (т CO₂-экв/год)"
                : `Скорость: ${leak.leak_speed}`}
            </span>
            <span>•</span>

            <span>{timeAgo(leak.createdAt)}</span>
          </div>
        </div>

        <div className={s.leakArrow} aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              d="M9 6l6 6-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

export default memo(RecentLeakItem);
