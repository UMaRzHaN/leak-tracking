import { useState, useEffect, useRef } from "react";
import { usePhotoStorage } from "../../hooks/usePhotoStorage";
import { useCamera } from "../../hooks/useCamera";
import EditTextField from "../EditTextField/EditTextField";
import s from "./LeakDetailsSheet.module.scss";

const EDIT_FIELDS = [
  { key: "leak_id", label: "Индивидуальный номер утечки" },
  { key: "video_id", label: "Видео" },
  { key: "leak_speed", label: "Скорость утечки" },
  { key: "temperature", label: "Температура" },
  { key: "pressure", label: "Давление" },
  { key: "field", label: "УМГ" },
  { key: "station", label: "Компрессорная станция" },
  { key: "location", label: "Локация" },
  { key: "object", label: "Объект" },
  { key: "component", label: "Компонент" },
  {
    key: "leak_description",
    label: "Описание утечки",
  },
  {
    key: "leak_cause",
    label: "Причина утечки",
  },
  {
    key: "technological_solution",
    label: "Технологическое решение",
  },
  {
    key: "repair_recommendation",
    label: "Решение / План устранения",
  },
  {
    key: "materials_equipment",
    label: "МТР ремонта",
  },
  {
    key: "note",
    label: "Примечание",
    multiline: true,
  },
];

const VIEW_FIELDS = [
  { key: "date", label: "Дата" },
  { key: "field", label: "УМГ" },
  { key: "station", label: "Компрессорная станция" },
  { key: "location", label: "Локация" },
  { key: "object", label: "Объект" },
  { key: "component", label: "Компонент" },

  { key: "leak_id", label: "Бирка" },
  { key: "video_id", label: "Видео" },

  {
    key: "leak_description",
    label: "Описание утечки",
    multiline: true,
  },
  {
    key: "leak_cause",
    label: "Причина утечки",
    multiline: true,
  },
  {
    key: "technological_solution",
    label: "Технологическое решение",
    multiline: true,
  },
  {
    key: "repair_recommendation",
    label: "Решение / План устранения",
    multiline: true,
  },
  {
    key: "materials_equipment",
    label: "Материалы и оборудование",
    multiline: true,
  },
  {
    key: "note",
    label: "Примечание",
    multiline: true,
  },

  { key: "leak_speed", label: "Скорость утечки" },
  { key: "leak_speed_kg", label: "Скорость (кг/ч)" },
  { key: "pressure", label: "Давление" },
  { key: "temperature", label: "Температура" },
];

export default function LeakDetailsSheet({ leak, onClose, onSave }) {
  const {
    loadPhoto,
    savePhoto,
    photoPreview,
    setPhotoPreview, // 🔑 ВАЖНО
  } = usePhotoStorage();
  const { isNative, takePhoto, pickFromBrowser } = useCamera();

  const [mode, setMode] = useState("view"); // view | edit
  const [localEdit, setLocalEdit] = useState({});
  const fileInputRef = useRef(null);
  /* ===== аналог startEdit ===== */

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (leak?.photo) {
        await loadPhoto(leak.photo); // ✅ ЗАГРУЖАЕТ preview
      } else {
        setPhotoPreview(null);
      }

      if (!cancelled) {
        setLocalEdit({ ...leak });
        setMode("view");
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [leak, loadPhoto, setPhotoPreview]);
  useEffect(() => {
    if (!leak?.photo) return;

    loadPhoto(leak.photo);
  }, [leak?.photo, loadPhoto]);
  /* ===== изменение фото ===== */
  const handleChangePhoto = async (e) => {
    let result;

    if (isNative) {
      result = await takePhoto();
    } else {
      const file = e?.target?.files?.[0];
      if (!file) return;
      result = await pickFromBrowser(file);
    }

    if (!result?.preview) return;

    setLocalEdit((prev) => ({
      ...prev,
      _newPhoto: result.raw,
    }));

    setPhotoPreview(result.preview);
  };

  /* ===== сохранение ===== */
  const handleSave = async () => {
    let photo = localEdit.photo;

    if (localEdit._newPhoto) {
      photo = await savePhoto(localEdit._newPhoto, localEdit.leak_id);
    }

    const { photoPreview, _newPhoto, ...clean } = localEdit;

    onSave({
      ...leak,
      ...clean,
      photo,
    });

    onClose();
  };
  useEffect(() => {
    return () => setPhotoPreview(null);
  }, [setPhotoPreview]);
  const isDirty = Boolean(localEdit._newPhoto);

  return (
    <div
      className={s.detailsOverlay}
      onClick={() => {
        if (isDirty && !window.confirm("Изменения не сохранены. Закрыть?"))
          return;
        onClose();
      }}
    >
      <div className={s.detailsSheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.detailsHandle} onClick={onClose} />

        {/* ===== VIEW MODE ===== */}
        {mode === "view" && (
          <>
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="Фото утечки"
                className={s.detailsPhoto}
              />
            ) : (
              <div className={s.photoPlaceholder}>Фото не добавлено</div>
            )}

            <div className={s.detailsList}>
              {VIEW_FIELDS.map(({ key, label, multiline }) => {
                const value = localEdit[key];
                if (value === null || value === undefined) return null;

                return (
                  <div
                    key={key}
                    className={`${s.detailsRow} ${
                      multiline ? s.multiline : ""
                    }`}
                  >
                    <span className={s.detailsLabel}>{label}</span>
                    <span className={s.detailsValue}>{String(value)}</span>
                  </div>
                );
              })}
            </div>
            <div className={s.detailsActions} id={s.view}>
              <button
                type="button"
                className={`${s.detailsBtn} ${s.edit}`}
                onClick={() => setMode("edit")}
              >
                ✏️ Редактировать
              </button>

              <button
                type="button"
                className={`${s.detailsBtn} ${s.close}`}
                onClick={() => {
                  if (
                    isDirty &&
                    !window.confirm("Изменения не сохранены. Закрыть?")
                  )
                    return;
                  onClose();
                }}
              >
                Закрыть
              </button>
            </div>
          </>
        )}

        {/* ===== EDIT MODE ===== */}
        {mode === "edit" && (
          <div className={s.editBlock}>
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="Фото утечки"
                className={s.detailsPhoto}
              />
            ) : (
              <div className={s.photoPlaceholder}>Фото не добавлено</div>
            )}
            {EDIT_FIELDS.map(({ key, label, multiline }) => (
              <EditTextField
                key={key} // ✅ только для React
                name={key} // ✅ НОВЫЙ проп
                label={label}
                multiline={multiline}
                value={localEdit[key] ?? ""}
                onChange={(v) =>
                  setLocalEdit((prev) => ({
                    ...prev,
                    [key]: v,
                  }))
                }
              />
            ))}
            {
              <div className={s.detailsActions}>
                {/* ===== CHANGE PHOTO ===== */}
                {!isNative && (
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handleChangePhoto}
                  />
                )}

                <button
                  type="button"
                  className={`${s.detailsBtn} ${s.edit}`}
                  onClick={() =>
                    isNative
                      ? handleChangePhoto()
                      : fileInputRef.current?.click()
                  }
                >
                  📷 Изменить
                </button>

                <button
                  type="button"
                  className={`${s.detailsBtn} ${s.edit}`}
                  onClick={handleSave}
                >
                  💾 Сохранить
                </button>

                <button
                  onClick={() => {
                    loadPhoto(leak.photo);
                    setMode("view");
                  }}
                >
                  Отмена
                </button>
              </div>
            }
          </div>
        )}
      </div>
    </div>
  );
}
