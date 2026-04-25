import s from "../LeakDetailsSheet.module.scss";

export default function EditPhotoRow({ srcBefore, srcAfter, onEditBefore, onEditAfter, showAfter = true }) {
  const slots = [
    { key: "before", label: "До",    src: srcBefore, onEdit: onEditBefore },
    { key: "after",  label: "После", src: srcAfter,  onEdit: onEditAfter  },
  ];

  const visibleSlots = showAfter ? slots : slots.filter((slot) => slot.key !== "after");

  return (
    <div className={`${s.editPhotoRow} ${showAfter ? "" : s.editPhotoRowSingle}`}>
      {visibleSlots.map(({ key, label, src, onEdit }) => (
        <div key={key} className={s.editPhotoSlot}>
          <span className={s.photoCompareLabel}>{label}</span>
          <button type="button" className={s.editPhotoThumb} onClick={onEdit}>
            {src ? (
              <img src={src} alt={label} className={s.photoCompareImg} draggable={false} />
            ) : (
              <div className={s.editPhotoEmpty}>
                <span>📷</span>
                <span className={s.editPhotoHint}>добавить</span>
              </div>
            )}
            <span className={s.editPhotoBadge}>✏</span>
          </button>
        </div>
      ))}
    </div>
  );
}
