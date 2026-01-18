import { useState } from "react";
import { usePhotoSrc } from "../../hooks/usePhotoSrc";
import { useSwipeActions } from "../../hooks/useSwipeActions";
import "./LeakCardCompact.css";

export default function LeakCardCompact({
  leak,
  onEdit,
  onRemove,
  onOpenPhoto,
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const photoSrc = usePhotoSrc(leak.photo, leak.photoUpdatedAt);
  const swipe = useSwipeActions();

  return (
    <div className="swipe-wrapper">
      {/* SWIPE ACTIONS */}

      {onEdit && onRemove && (
        <div className="swipe-actions">
          <button
            className="swipe-photo"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPhoto({ photoSrc: photoSrc, photo: leak.photo });
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
        className={`leak-card ${actionsOpen ? "swiped" : ""}`}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={() => swipe.onTouchEnd(setActionsOpen)}
      >
        {/* Header */}
        <div className="leak-header">
          <div className="leak-title">
            Бирка №{leak.leak_id} | Видео №{leak.video_id}
          </div>
          <div className="leak-date">{leak.date}</div>
        </div>

        {/* Object */}
        <div className="leak-main">
          КС: {leak.station} | Объект: {leak.object}
        </div>

        {/* Component */}
        <div className="leak-tech">
          <span>🔧 Компонент: {leak.component}</span>
        </div>

        {/* Description */}
        {leak.leak_description && (
          <div className="leak-desc">📝 Описание: {leak.leak_description}</div>
        )}

        {/* Footer */}
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
