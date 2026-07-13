import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

export default function EditPhotoRow({
  srcBefore,
  srcAfter,
  srcRepair,
  onEditBefore,
  onPickBefore,
  onEditAfter,
  onPickAfter,
  onEditRepair,
  onPickRepair,
  isNative = false,
  showAfter = true,
  showRepair = false,
}) {
  const { lang, t } = useLanguage();
  const [activeSlot, setActiveSlot] = useState(null);

  const slots = [
    {
      key: "before",
      label: t("leakDetails.photo.before", { defaultValue: "До" }),
      src: srcBefore,
      onCamera: onEditBefore,
      onGallery: onPickBefore,
    },
    {
      key: "repair",
      label: lang === "ru" ? "В ремонте" : "Under repair",
      src: srcRepair,
      onCamera: onEditRepair,
      onGallery: onPickRepair,
    },
    {
      key: "after",
      label: t("leakDetails.photo.after", { defaultValue: "После" }),
      src: srcAfter,
      onCamera: onEditAfter,
      onGallery: onPickAfter,
    },
  ];

  const visibleSlots = slots.filter((slot) => {
    if (slot.key === "after") return showAfter;
    if (slot.key === "repair") return showRepair;
    return true;
  });

  const selectedSlot = visibleSlots.find((slot) => slot.key === activeSlot);

  const runAction = (action) => {
    setActiveSlot(null);
    action?.();
  };

  return (
    <>
      <div
        className={`${s.editPhotoRow} ${
          visibleSlots.length === 1 ? s.editPhotoRowSingle : ""
        }`}
      >
        {visibleSlots.map(({ key, label, src }) => (
          <div key={key} className={s.editPhotoSlot}>
            <span className={s.photoCompareLabel}>{label}</span>
            <button
              type="button"
              className={s.editPhotoThumb}
              onClick={() => setActiveSlot(key)}
            >
              {src ? (
                <img
                  src={src}
                  alt={label}
                  className={s.photoCompareImg}
                  draggable={false}
                />
              ) : (
                <div className={s.editPhotoEmpty}>
                  <span>📷</span>
                  <span className={s.editPhotoHint}>
                    {t("leakDetails.photoAction.add", {
                      defaultValue: "добавить",
                    })}
                  </span>
                </div>
              )}
              <span className={s.editPhotoBadge}>✎</span>
            </button>
          </div>
        ))}
      </div>

      {selectedSlot && (
        <div
          className={s.photoActionOverlay}
          onClick={() => setActiveSlot(null)}
        >
          <div
            className={s.photoActionSheet}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={s.photoActionHandle} />
            <div className={s.photoActionTitle}>{selectedSlot.label}</div>
            {isNative && (
              <button
                type="button"
                className={s.photoActionBtn}
                onClick={() => runAction(selectedSlot.onCamera)}
              >
                <span className={s.photoActionIcon}>📷</span>
                {t("leakDetails.photoAction.camera", {
                  defaultValue: "Камера",
                })}
              </button>
            )}
            <button
              type="button"
              className={s.photoActionBtn}
              onClick={() => runAction(selectedSlot.onGallery)}
            >
              <span className={s.photoActionIcon}>🖼️</span>
              {t("leakDetails.photoAction.gallery", {
                defaultValue: "Выбрать из галереи",
              })}
            </button>
            <button
              type="button"
              className={s.photoActionCancel}
              onClick={() => setActiveSlot(null)}
            >
              <span className={s.photoActionIcon}>✕</span>
              {t("leakDetails.photoAction.cancel", {
                defaultValue: "Отмена",
              })}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
