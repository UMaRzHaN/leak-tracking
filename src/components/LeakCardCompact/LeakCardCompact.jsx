import { useSwipeCard } from "../../hooks/useSwipeCard";
import s from "./LeakCardCompact.module.scss";

export default function LeakCardCompact({ leak, onRemove, onOpenDetails }) {
  const { swipeState, close, handlers } = useSwipeCard({
    leak,
    onOpenDetails,
    onRemove,
  });

  return (
    <div className={s.swipeWrapper} onClick={close}>
      {/* 👉 SWIPE RIGHT → DETAILS */}
      {swipeState === "right" && (
        <div className={s.swipeHintRight}>
          <span>ℹ️</span>
          <span>Подробнее</span>
        </div>
      )}

      {swipeState === "left" && onRemove && (
        <div className={s.swipeHintLeft}>
          <span>🗑</span>
          <span>Удалить</span>
        </div>
      )}
      {/* CARD */}
      <div
        className={`${s.card} ${
          swipeState === "left"
            ? s.swipedLeft
            : swipeState === "right"
              ? s.swipedRight
              : ""
        }`}
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
