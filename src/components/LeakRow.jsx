import { usePhotoSrc } from "../hooks/usePhotoSrc";

export default function LeakRow({ row, onEdit, onRemove }) {
  const photoSrc = usePhotoSrc(row.photo, row.photoUpdatedAt);

  return (
    <div className="card">
      <div>{row.date}</div>
      <strong>#{row.index}</strong>
      <div>
        <b>Бирка | Видео:</b> {row.leak_id} | {row.video_id}
      </div>
      <div>
        {row.location} | {row.object}
      </div>
      <span>
        📍 {row.lat}/{row.lon}
      </span>
      <div>
        <b>Скорость:</b> {row.leak_speed}
      </div>
      <div>
        <b>Станция:</b> {row.station}
      </div>

      <div>
        <b>Компонент:</b> {row.component}
      </div>
      <div>
        <b>Описание утечки:</b> {row.leak_description}
      </div>
      {/* <div style={{ fontSize: 12, color: "#888" }}>
        путь к фото: {String(row.photo)}
      </div>
      {row.photo && !photoSrc && (
        <div style={{ marginTop: 8, opacity: 0.6 }}>
          📷 Фото доступно только в мобильном приложении
        </div>
      )}
      {photoSrc && (
        <img
          src={photoSrc}
          alt="Фото утечки"
          style={{ maxWidth: "100%", borderRadius: 8 }}
        />
      )} */}
      <button onClick={() => onEdit(row)}>✏️ Изменить</button>
      <button onClick={() => onRemove(row.id)}>🗑 Удалить</button>
    </div>
  );
}
