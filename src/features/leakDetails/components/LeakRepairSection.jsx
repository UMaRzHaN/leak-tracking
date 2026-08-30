import { useState } from "react";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

function PhotoComparison({
  photoBefore,
  photoRepair,
  photoAfter,
  localeTexts,
}) {
  const srcBefore = usePhotoSrc(photoBefore ?? null);
  const srcRepair = usePhotoSrc(photoRepair ?? null);
  const srcAfter = usePhotoSrc(photoAfter ?? null);
  const [viewer, setViewer] = useState(/** @type {string|null} */ (null));

  const hasBefore = Boolean(photoBefore);
  const hasRepair = Boolean(photoRepair);
  const hasAfter = Boolean(photoAfter);
  if (!hasBefore && !hasRepair && !hasAfter) return null;

  const slots = [
    { key: "before", label: localeTexts.photo.before, src: srcBefore },
    { key: "repair", label: localeTexts.photo.repair, src: srcRepair },
    { key: "after", label: localeTexts.photo.after, src: srcAfter },
  ].filter(({ key, src }) => key === "before" || Boolean(src));

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

      {viewer === "before" && srcBefore && (
        <PhotoViewer src={srcBefore} onClose={() => setViewer(null)} />
      )}
      {viewer === "repair" && srcRepair && (
        <PhotoViewer src={srcRepair} onClose={() => setViewer(null)} />
      )}
      {viewer === "after" && srcAfter && (
        <PhotoViewer src={srcAfter} onClose={() => setViewer(null)} />
      )}
    </>
  );
}

export default function LeakRepairSection({ data, localeTexts }) {
  const photoAfter = data.status === "resolved" ? data.photo_after : null;
  const photoRepair = data.photo_repair;
  const hasPhotos =
    Boolean(data.photo) || Boolean(photoRepair) || Boolean(photoAfter);

  return (
    <div className={s.tabPane}>
      {hasPhotos ? (
        <PhotoComparison
          photoBefore={data.photo}
          photoRepair={photoRepair}
          photoAfter={photoAfter}
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
