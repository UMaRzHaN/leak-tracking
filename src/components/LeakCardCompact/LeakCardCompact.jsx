import { useState } from "react";
import { usePhotoSrc } from "../../hooks/usePhotoSrc";
import { useSwipeActions } from "../../hooks/useSwipeActions";
import "./LeakCardCompact.css";

export default function LeakCardCompact({
  leak,
  onEdit,
  onRemove,
  onOpenPhoto,
  onOpenDetails,
}) {
  const [swipeState, setSwipeState] = useState(null);
  // null | "left" | "right"

  const photoSrc = usePhotoSrc(leak.photo, leak.photoUpdatedAt);

  const swipe = useSwipeActions({
    // 👈 справа → налево — показываем кнопки
    onSwipeLeft: () => {
      setSwipeState("left");
    },

    // 👉 слева → направо
    onSwipeRight: () => {
      if (swipeState === "left") {
        setSwipeState(null); // закрываем кнопки
      } else {
        setSwipeState("right"); // сдвигаем карточку вправо
        setTimeout(() => {
          onOpenDetails?.(leak);
          setSwipeState(null);
        }, 200);
      }
    },
  });

  return (
    <div
      className={`swipe-wrapper ${swipeState === "right" ? "hint-right" : ""}`}
    >
      {/* 👉 ПОДСКАЗКА */}
      <div className="swipe-hint swipe-hint-right">
        <span>Подробнее</span>
      </div>

      {/* ACTION BUTTONS */}
      {onEdit && onRemove && (
        <div className="swipe-actions">
          <button
            className="swipe-photo"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPhoto({ photoSrc, photo: leak.photo });
            }}
          >
            📷
          </button>
          <button className="swipe-edit" onClick={() => onEdit(leak)}>
            ✏️
          </button>
          <button className="swipe-delete" onClick={() => onRemove(leak.id)}>
            🗑
          </button>
        </div>
      )}

      {/* CARD */}
      <div
        className={`leak-card ${
          swipeState === "left"
            ? "swiped-left"
            : swipeState === "right"
              ? "swiped-right"
              : ""
        }`}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
        onMouseDown={swipe.onMouseDown}
        onMouseMove={swipe.onMouseMove}
        onMouseUp={swipe.onMouseUp}
      >
        {/* content */}
        <div className="leak-header">
          <div className="leak-title">
            Бирка №{leak.leak_id} | Видео №{leak.video_id}
          </div>
          <div className="leak-date">{leak.date}</div>
        </div>

        <div className="leak-main">
          КС: {leak.station} | Объект: {leak.object}
        </div>

        <div className="leak-tech">🔧 Компонент: {leak.component}</div>

        {leak.leak_description && (
          <div className="leak-desc">📝 Описание: {leak.leak_description}</div>
        )}

        <div className="leak-footer">
          <div className="leak-coords">
            📍 {leak.lat} / {leak.lon}
          </div>
          <div className="leak-speed">⏲ Скорость {leak.leak_speed}</div>
        </div>
      </div>
    </div>
  );
}
