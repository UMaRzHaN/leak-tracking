import { useState, useEffect } from "react";
import {
  locations,
  objects,
  components,
  description,
  cause,
  solutions,
  recommendations,
  materials,
} from "../data/dictionaries";
import { normalizeNumber } from "../utils/normalizeNumber";
import AutocompleteInput from "./AutocompleteInput";
import { useCamera } from "../hooks/useCamera";

const REQUIRED_FIELDS = ["leak_id", "video_id", "leak_speed"];
const NUMBER_FIELDS = [
  "leak_id",
  "video_id",
  "leak_speed",
  "temperature",
  "pressure",
];
export default function LeakForm({
  onAdd,
  voiceData,
  clearVoiceData,
  startVoiceInput,
  stopVoiceInput,
  coords,
}) {
  const [form, setForm] = useState({
    leak_id: "",
    photoPreview: null, // webPath
    photo: null, // объект photo
  });

  const [errors, setErrors] = useState({});
  const { isNative, takePhoto, pickFromBrowser } = useCamera();

  /* =========================
     HELPERS
     ========================= */
  const handlePhoto = async (file) => {
    const photo = isNative ? await takePhoto() : await pickFromBrowser(file);

    setForm((prev) => ({
      ...prev,
      _newPhoto: photo, // 🔑 ОБЯЗАТЕЛЬНО
      photoPreview: photo.webPath, // 👁 preview
    }));
  };

  /* =========================
     INPUT HANDLER
  ========================= */
  const handle = (key, value) => {
    const finalValue = NUMBER_FIELDS.includes(key)
      ? normalizeNumber(value)
      : value;

    setForm((prev) => ({ ...prev, [key]: finalValue }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  /* =========================
     VALIDATION
  ========================= */
  const validate = () => {
    const nextErrors = {};

    REQUIRED_FIELDS.forEach((key) => {
      const value = form[key];

      if (value === "" || value == null) {
        nextErrors[key] = "Обязательное числовое поле";
        return;
      }

      if (NUMBER_FIELDS.includes(key)) {
        const num = Number(value);
        if (!Number.isFinite(num)) {
          nextErrors[key] = "Введите число";
        }
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  /* =========================
     ACTIONS
  ========================= */
  const add = () => {
    if (!validate()) return;

    onAdd({
      ...form,
      photo: null,
      _newPhoto: form._newPhoto,
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
      date: new Date().toLocaleDateString(),
    });

    setForm({ leak_id: "", photoPreview: null, _newPhoto: null });
    setErrors({});
    clearVoiceData?.();
  };

  const clearForm = () => {
    stopVoiceInput?.();
    setForm({ leak_id: "", photoPreview: null });
    setErrors({});
    clearVoiceData?.();
  };

  /* =========================
     VOICE DATA
  ========================= */
  useEffect(() => {
    if (!voiceData) return;

    setForm((prev) => ({ ...prev, ...voiceData }));
    setTimeout(() => clearVoiceData?.(), 0);
  }, [voiceData, clearVoiceData]);

  const isWeb = !isNative;
  const onPhotoClick = async (e) => {
    if (isWeb) {
      handlePhoto(e.target.files[0]);
    } else {
      handlePhoto(); // камера (Capacitor)
    }
  };

  /* =========================
     UI
  ========================= */
  return (
    <div className="card" style={{ paddingBottom: 136 }}>
      {/* 🎙 Голосовой ввод */}
      <div className="floating-actions">
        <button
          className="fab mic"
          onPointerDown={startVoiceInput}
          onPointerUp={stopVoiceInput}
          onPointerCancel={stopVoiceInput}
          onPointerLeave={stopVoiceInput}
        >
          🎙
        </button>
        <button
          className="fab pen"
          id="fixed"
          type="button"
          onClick={clearForm}
        >
          🧹
        </button>
      </div>
      <div className="form-field">
        <label htmlFor="field">УМГ</label>
        <input
          id="field"
          placeholder="Введите УМГ"
          value={form.field ?? ""}
          onChange={(e) => handle("field", e.target.value)}
        />
      </div>
      <div className="form-field">
        <label htmlFor="station">Компрессорная станция</label>
        <input
          id="station"
          placeholder="Введите компрессорная станция"
          value={form.station ?? ""}
          onChange={(e) => handle("station", e.target.value)}
        />
      </div>
      <AutocompleteInput
        id="location"
        label="Локация"
        placeholder="Введите локацию"
        value={form.location}
        options={Object.values(locations).flat()}
        onChange={(v) => handle("location", v)}
        error={errors.location}
      />
      <AutocompleteInput
        id="object"
        label="Объект"
        placeholder="Введите объект"
        value={form.object}
        options={Object.values(objects).flat()}
        onChange={(v) => handle("object", v)}
        error={errors.object}
      />
      <div className="form-field">
        <label htmlFor="leak_id">
          Индивидуальный номер утечки (бирка)
          <span className="required">*</span>
        </label>

        <input
          id="leak_id"
          type="number"
          inputMode="numeric"
          className={`emojis field ${errors.leak_id ? "input-error" : ""}`}
          placeholder="Введите номер бирки"
          value={form.leak_id ?? ""}
          onChange={(e) => handle("leak_id", e.target.value)}
        />

        {errors.leak_id && <div className="error-text">{errors.leak_id}</div>}
      </div>
      <AutocompleteInput
        id="component"
        label="Компонент"
        placeholder="Введите компонент"
        value={form.component}
        options={Object.values(components).flat()}
        onChange={(v) => handle("component", v)}
        error={errors.component}
      />
      {/* Обязательные поля */}
      <div className="form-field">
        <label htmlFor="video">
          Индивидуальный номер видео (видео)<span className="required">*</span>
        </label>

        <input
          id="video"
          type="number"
          inputMode="numeric"
          className={`emojis ${errors.video_id ? "input-error" : ""}`}
          placeholder="Введите номер видео"
          value={form.video_id ?? ""}
          onChange={(e) => handle("video_id", e.target.value)}
        />
      </div>
      {/* ===== ПАРАМЕТРЫ ===== */}
      <div className="form-field">
        <label htmlFor="pressure">Давление </label>
        <input
          className="emojis"
          id="pressure"
          type="number"
          inputMode="numeric"
          placeholder="Введите давление"
          value={form.pressure ?? ""}
          onChange={(e) => handle("pressure", e.target.value)}
        />
      </div>
      <div className="form-field">
        <label htmlFor="temperature">Температура </label>
        <input
          className="emojis"
          id="temperature"
          type="number"
          inputMode="numeric"
          placeholder="Введите температуру"
          value={form.temperature ?? ""}
          onChange={(e) => handle("temperature", e.target.value)}
        />
      </div>
      <div className="form-field">
        <label htmlFor="speed">
          Скорость утечки (скорость)<span className="required">*</span>
        </label>

        <input
          id="speed"
          type="number"
          inputMode="decimal"
          step="any"
          className={`emojis ${errors.leak_speed ? "input-error" : ""}`}
          placeholder="Введите скорость"
          value={form.leak_speed ?? ""}
          onChange={(e) => handle("leak_speed", e.target.value)}
        />
      </div>
      {/* ===== СПРАВОЧНИКИ ===== */}
      <AutocompleteInput
        id="description"
        label="Описание утечки"
        placeholder="Введите описание утечки"
        value={form.leak_description}
        options={Object.values(description).flat()}
        onChange={(v) => handle("leak_description", v)}
        error={errors.leak_description}
      />
      <AutocompleteInput
        id="leak_cause"
        label="Причина утечки"
        placeholder="Введите причину утечки"
        value={form.leak_cause}
        options={Object.values(cause).flat()}
        onChange={(v) => handle("leak_cause", v)}
        error={errors.leak_cause}
      />
      <AutocompleteInput
        id="technological_solution"
        label="Технологическое решение (техрешение)"
        placeholder="Введите технологическое решение"
        value={form.technological_solution}
        options={Object.values(solutions).flat()}
        onChange={(v) => handle("technological_solution", v)}
        error={errors.technological_solution}
      />
      <AutocompleteInput
        id="repair_recommendation"
        label="Решение / План устранения (план устранения)"
        placeholder="Введите решение / план устранения"
        value={form.repair_recommendation}
        options={Object.values(recommendations).flat()}
        onChange={(v) => handle("repair_recommendation", v)}
        error={errors.repair_recommendation}
      />
      <AutocompleteInput
        id="materials_equipment"
        label="МТР ремонта (МТР)"
        placeholder="Введите МТР ремонта"
        value={form.materials_equipment}
        options={Object.values(materials).flat()}
        onChange={(v) => handle("materials_equipment", v)}
        error={errors.materials_equipment}
      />
      <div className="form-field">
        <label htmlFor="note">Примечание</label>
        <textarea
          id="note"
          placeholder="Введите примечание"
          value={form.note ?? ""}
          onChange={(e) => handle("note", e.target.value)}
        />
      </div>

      {isWeb ? (
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPhotoClick}
        />
      ) : (
        <button type="button" onClick={onPhotoClick}>
          📷 Сделать фото
        </button>
      )}
      {form.photoPreview && (
        <img
          src={form.photoPreview}
          alt="Фото утечки"
          style={{
            maxWidth: 200,
            maxHeight: 200,
            objectFit: "cover",
            borderRadius: 8,
          }}
        />
      )}
      <button onClick={add}>💾 Сохранить</button>
    </div>
  );
}
