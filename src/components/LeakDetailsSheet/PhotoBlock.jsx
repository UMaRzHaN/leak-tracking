import s from "./LeakDetailsSheet.module.scss";

export default function PhotoBlock({ src }) {
  return (
    <div className={s.detailsPhotoParent}>
      {src ? (
        <img src={src} alt="Фото утечки" className={s.detailsPhoto} />
      ) : (
        <div className={s.photoPlaceholder}>Фото не добавлено</div>
      )}
    </div>
  );
}
