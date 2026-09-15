import { getRepairDonePhoto, getRepairPhoto } from "@/domain/leakEvents";
import { useState } from "react";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import { getLatestMonitoringPhotoPath } from "@/utils/monitoring";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

function PhotoComparison({
  photoBefore,
  photoRepair,
  photoAfter,
  photoMonitoring,
  localeTexts,
}) {
  const srcBefore = usePhotoSrc(photoBefore ?? null);
  const srcRepair = usePhotoSrc(photoRepair ?? null);
  const srcAfter = usePhotoSrc(photoAfter ?? null);
  const srcMonitoring = usePhotoSrc(photoMonitoring ?? null);
  const [viewer, setViewer] = useState(/** @type {string|null} */ (null));

  if (!photoBefore && !photoRepair && !photoAfter && !photoMonitoring) {
    return null;
  }

  const slots = [
    { key: "before", label: localeTexts.photo.before, src: srcBefore },
    { key: "repair", label: localeTexts.photo.repair, src: srcRepair },
    { key: "after", label: localeTexts.photo.after, src: srcAfter },
    {
      key: "monitoring",
      label: localeTexts.photo.monitoring,
      src: srcMonitoring,
    },
  ].filter(({ key, src }) => key === "before" || Boolean(src));
  const viewerSrc = slots.find(({ key }) => key === viewer)?.src;

  return (
    <>
      <div
        className={`${s.photoCompare} ${slots.length === 1 ? s.photoCompareSingle : ""}`}
      >
        {slots.map(({ key, label, src }) => (
          <div key={key} className={s.photoCompareSlot}>
            <span className={s.photoCompareLabel}>{label}</span>
            {src ? (
              <button
                type="button"
                className={s.photoCompareThumb}
                onClick={() => setViewer(key)}
              >
                <img
                  src={src}
                  alt={label}
                  className={s.photoCompareImg}
                  draggable={false}
                />
              </button>
            ) : (
              <div className={s.photoComparePlaceholder}>
                {localeTexts.photo.noPhoto}
              </div>
            )}
          </div>
        ))}
      </div>

      {viewerSrc && (
        <PhotoViewer src={viewerSrc} onClose={() => setViewer(null)} />
      )}
    </>
  );
}

export default function LeakRepairSection({ data, localeTexts }) {
  // Через ленту, а не по полю записи: снимок починки живёт в событии, а поле
  // остаётся лишь у записей, заведённых до ленты.
  const photoAfter =
    data.status === "resolved" ? getRepairDonePhoto(data) : null;
  const photoRepair = getRepairPhoto(data);
  // Снимок последнего обхода — своим слотом, если он не повторяет уже
  // показанный. У утечки, которую обход отправил на перепроверку, он
  // единственный: без него вкладка писала «Фото не добавлены», хотя шапка
  // карточки тот же снимок показывала. Устранённая обходом утечка свой осмотр
  // уже показывает как «после», и второй раз он не нужен.
  const latestRoundPhoto = getLatestMonitoringPhotoPath(data);
  const photoMonitoring = [data.photo, photoRepair, photoAfter].includes(
    latestRoundPhoto,
  )
    ? null
    : latestRoundPhoto;
  const hasPhotos = Boolean(
    data.photo || photoRepair || photoAfter || photoMonitoring,
  );

  return (
    <div className={s.tabPane}>
      {hasPhotos ? (
        <PhotoComparison
          photoBefore={data.photo}
          photoRepair={photoRepair}
          photoAfter={photoAfter}
          photoMonitoring={photoMonitoring}
          localeTexts={localeTexts}
        />
      ) : (
        <div className={s.tabEmpty}>
          <span className={s.tabEmptyIcon}>📷</span>
          <p>{localeTexts.empty.photo}</p>
        </div>
      )}
    </div>
  );
}
