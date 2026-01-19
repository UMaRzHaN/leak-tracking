import { useState, useEffect, useRef } from "react";

import { usePhotoStorage } from "../../hooks/usePhotoStorage";
import { useCamera } from "../../hooks/useCamera";
import EditTextField from "../EditTextField/EditTextField";
// import "./LeakDetailsSheet.css";

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
  const { loadPhoto, savePhoto } = usePhotoStorage();
  const { isNative, takePhoto, pickFromBrowser } = useCamera();

  const [mode, setMode] = useState("view"); // view | edit
  const [localEdit, setLocalEdit] = useState({});
  const fileInputRef = useRef(null);
  /* ===== аналог startEdit ===== */
  useEffect(() => {
    let cancelled = false;

    const initLocalEdit = async () => {
      let photoPreview = null;

      if (leak?.photo) {
        photoPreview = await loadPhoto(leak.photo);
      }

      if (!cancelled) {
        setLocalEdit({
          ...leak,
          photoPreview,
        });
        setMode("view");
      }
    };

    initLocalEdit();

    return () => {
      cancelled = true;
    };
  }, [leak, loadPhoto]);

  /* ===== изменение фото ===== */
  const handleChangePhoto = async (e) => {
    let photo;

    if (isNative) {
      photo = await takePhoto();
    } else {
      const file = e?.target?.files?.[0];
      if (!file) return;
      photo = await pickFromBrowser(file);
    }

    setLocalEdit((prev) => ({
      ...prev,
      _newPhoto: photo,
      photoPreview: photo.webPath,
    }));
  };

  /* ===== сохранение ===== */
  const handleSave = async () => {
    let photo = localEdit.photo;

    if (localEdit._newPhoto) {
      photo = await savePhoto(localEdit._newPhoto, localEdit.leak_id);
    }

    const { photoPreview, _newPhoto, ...clean } = localEdit;

    onSave?.({
      ...clean,
      photo,
      photoUpdatedAt: Date.now(),
    });

    onClose();
  };

  return (
    <div className="details-overlay" onClick={onClose}>
      <div className="details-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="details-handle" />

        <h3 className="details-title">
          {mode === "edit" ? "Редактирование" : "Подробнее"}
        </h3>

        {/* ================= VIEW MODE ================= */}
        {mode === "view" && (
          <>
            {localEdit.photoPreview && (
              <div className="details-photo-wrapper">
                <img
                  src={localEdit.photoPreview}
                  alt="Фото утечки"
                  className="details-photo"
                />
              </div>
            )}

            <div className="details-list">
              {VIEW_FIELDS.map(({ key, label, multiline }) => {
                const value = localEdit[key];

                if (value === undefined || value === null || value === "")
                  return null;

                return (
                  <div
                    key={key}
                    className={`details-row ${multiline ? "multiline" : ""}`}
                  >
                    <span className="details-label">{label}</span>
                    <span className="details-value">{String(value)}</span>
                  </div>
                );
              })}
            </div>

            <div className="details-actions">
              <button
                className="details-btn edit"
                onClick={() => setMode("edit")}
              >
                ✏️ Редактировать
              </button>
              <button className="details-btn close" onClick={onClose}>
                Закрыть
              </button>
            </div>
          </>
        )}

        {/* ================= EDIT MODE ================= */}
        {mode === "edit" && (
          <>
            <EditTextField
              label="Индивидуальный номер утечки"
              value={localEdit.leak_id}
              onChange={(v) => setLocalEdit({ ...localEdit, leak_id: v })}
            />

            <EditTextField
              label="Видео"
              value={localEdit.video_id}
              onChange={(v) => setLocalEdit({ ...localEdit, video_id: v })}
            />

            <EditTextField
              label="Скорость утечки"
              value={localEdit.leak_speed}
              onChange={(v) => setLocalEdit({ ...localEdit, leak_speed: v })}
            />

            <EditTextField
              label="Температура"
              value={localEdit.temperature}
              onChange={(v) => setLocalEdit({ ...localEdit, temperature: v })}
            />

            <EditTextField
              label="Давление"
              value={localEdit.pressure}
              onChange={(v) => setLocalEdit({ ...localEdit, pressure: v })}
            />

            <EditTextField
              label="УМГ"
              value={localEdit.field}
              onChange={(v) => setLocalEdit({ ...localEdit, field: v })}
            />

            <EditTextField
              label="Компрессорная станция"
              value={localEdit.station}
              onChange={(v) => setLocalEdit({ ...localEdit, station: v })}
            />

            <EditTextField
              label="Локация"
              value={localEdit.location}
              onChange={(v) => setLocalEdit({ ...localEdit, location: v })}
            />

            <EditTextField
              label="Объект"
              value={localEdit.object}
              onChange={(v) => setLocalEdit({ ...localEdit, object: v })}
            />

            <EditTextField
              label="Компонент"
              value={localEdit.component}
              onChange={(v) => setLocalEdit({ ...localEdit, component: v })}
            />

            <EditTextField
              label="Описание утечки"
              value={localEdit.leak_description}
              onChange={(v) =>
                setLocalEdit({
                  ...localEdit,
                  leak_description: v,
                })
              }
            />

            <EditTextField
              label="Причина утечки"
              value={localEdit.leak_cause}
              onChange={(v) => setLocalEdit({ ...localEdit, leak_cause: v })}
            />

            <EditTextField
              label="Технологическое решение"
              value={localEdit.technological_solution}
              onChange={(v) =>
                setLocalEdit({
                  ...localEdit,
                  technological_solution: v,
                })
              }
            />

            <EditTextField
              label="Решение / План устранения"
              value={localEdit.repair_recommendation}
              onChange={(v) =>
                setLocalEdit({
                  ...localEdit,
                  repair_recommendation: v,
                })
              }
            />

            <EditTextField
              label="МТР ремонта"
              value={localEdit.materials_equipment}
              onChange={(v) =>
                setLocalEdit({
                  ...localEdit,
                  materials_equipment: v,
                })
              }
            />

            <EditTextField
              label="Примечание"
              value={localEdit.note}
              onChange={(v) => setLocalEdit({ ...localEdit, note: v })}
            />

            {/* ===== ФОТО ===== */}
            <div className="details-actions">
              {!isNative && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleChangePhoto}
                />
              )}

              <button
                className="details-btn edit"
                onClick={() =>
                  isNative ? handleChangePhoto() : fileInputRef.current?.click()
                }
              >
                📷 Изменить фото
              </button>
            </div>

            {localEdit.photoPreview && (
              <img
                src={localEdit.photoPreview}
                alt="Фото утечки"
                className="details-photo"
              />
            )}

            <div className="details-actions">
              <button className="details-btn edit" onClick={handleSave}>
                💾 Сохранить
              </button>

              <button
                className="details-btn close"
                onClick={() => setMode("view")}
              >
                Отмена
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
