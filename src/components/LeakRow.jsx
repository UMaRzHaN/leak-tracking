import { usePhotoSrc } from "../hooks/usePhotoSrc";

export default function LeakRow({ row, onEdit, onRemove }) {
  const photoSrc = usePhotoSrc(row.photo);

  return (
    <div className="card" style={{ margin: "10px 0" }}>
      <strong>#{row.index}</strong>
      <div>
        <b> X/Y:</b> {row.latitude}/{row.longitude}
      </div>
      <div>
        <b> Дата:</b> {row.date}
      </div>
      <div>
        <b>Бирка / видео:</b> {row.leak_id} / {row.video_id}
      </div>
      <div>
        <b>Скорость:</b> {row.leak_speed}
      </div>
      <div>
        <b>Станция:</b> {row.station}
      </div>
      <div>
        <b>Локация / объект:</b> {row.location} / {row.object}
      </div>
      <div>
        <b>Компонент:</b> {row.component}
      </div>
      <div>
        <b>Описание утечки:</b> {row.leak_description}
      </div>
      <div>
        <b>Причина утечки:</b> {row.leak_cause}
      </div>
      <div>
        <b>Технологическое решение:</b> {row.technological_solution}
      </div>
      <div>
        <b>Решение / План устранения</b> {row.repair_recommendation}
      </div>
      <div>
        <b>МТР ремонта (предполагаемый)</b> {row.materials_equipment}
      </div>
      <div>
        <b>Примечание:</b> {row.note}
      </div>
      {photoSrc && (
        <img
          src={photoSrc}
          alt="Фото утечки"
          style={{ maxWidth: 300, marginTop: 8 }}
        />
      )}
      <button onClick={() => onEdit(row)}>✏️ Изменить</button>
      <button onClick={() => onRemove(row.id)}>🗑 Удалить</button>
    </div>
  );
}
