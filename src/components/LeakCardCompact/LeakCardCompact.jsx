import { useSwipeCard } from "../../hooks/useSwipeCard";
import s from "./LeakCardCompact.module.scss";

export default function LeakCardCompact({ leak, onRemove, onOpenDetails }) {
  const { swipeState, swipeOffset, close, handlers } = useSwipeCard({
    leak,
    onOpenDetails,
    onRemove,
  });

  return (
    <div className={s.swipeWrapper} onClick={close}>
      {/* 👉 SWIPE RIGHT → DETAILS */}
      {(swipeState === "right" || swipeOffset > 30) && (
        <div className={s.swipeHintRight}>
          <span>ℹ️</span>
          <span>Подробнее</span>
        </div>
      )}

      {(swipeState === "left" || swipeOffset < -30) && onRemove && (
        <div className={s.swipeHintLeft}>
          <span>🗑</span>
          <span>Удалить</span>
        </div>
      )}
      {/* CARD */}
      <div
        className={`${s.card} ${
          swipeState === "left" || swipeOffset < -30
            ? s.swipedLeft
            : swipeState === "right" || swipeOffset > 30
              ? s.swipedRight
              : ""
        }`}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset === 0 ? "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
        }}
        {...handlers}
      >
        <div className={s.header}>
          <div className={s.title}>Бирка №{leak.leak_id}</div>
          <div className={s.date}>{leak.date}</div>
        </div>

        <div className={s.main}>
          КС: {leak.station} | Объект: {leak.object}
        </div>

        <div className={s.tech}>🔧 Компонент: {leak.component}</div>

        {leak.leak_description && (
          <div className={s.desc}>📝 Описание: {leak.leak_description}</div>
        )}

        <div className={s.footer}>
          <div className={s.coords}>🛠️ МТР: {leak.repair_recommendation}</div>
          <div className={s.speed}>⏲ Скорость {leak.leak_speed}</div>
        </div>
      </div>
    </div>
  );
}
