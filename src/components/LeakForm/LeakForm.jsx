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
} from "../../data/dictionaries";
import { normalizeNumber } from "../../utils/normalizeNumber";
import AutocompleteInput from "../Input/AutocompleteInput";
import { useCamera } from "../../hooks/useCamera";

import InputCard from "../Input/InputCard";

const REQUIRED_FIELDS = ["leak_id", "video_id", "leak_speed"];
const NUMBER_FIELDS = [
  "leak_id",
  "video_id",
  "leak_speed",
  "temperature",
  "pressure",
];
const STEP_REQUIRED = {
  2: ["object", "component"],
  3: ["leak_id", "video_id"],
  4: ["leak_speed"],
};
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
  const [step, setStep] = useState(1);

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
    const Date_now = new Date();
    onAdd({
      ...form,
      photo: null,
      _newPhoto: form._newPhoto,
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
      date: Date_now.toLocaleDateString(),
      time: Date_now,
    });

    setForm({ leak_id: "", photoPreview: null, _newPhoto: null });
    setErrors({});
    clearVoiceData?.();
  };

  const clearForm = () => {
    stopVoiceInput?.();

    const STEP_FIELDS = {
      1: ["field", "station", "location"],
      2: ["object", "component", "leak_speed"],
      3: ["leak_id", "video_id", "pressure", "temperature"],
      4: ["leak_description", "leak_cause", "technological_solution"],
      5: ["materials_equipment", "note", "photoPreview", "_newPhoto"],
    };

    setForm((prev) => {
      const copy = { ...prev };
      STEP_FIELDS[step]?.forEach((k) => delete copy[k]);
      return copy;
    });

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
  const validateStep = () => {
    const fields = STEP_REQUIRED[step];
    if (!fields) return true;

    const nextErrors = {};

    fields.forEach((key) => {
      if (!form[key]) {
        nextErrors[key] = "Обязательное поле";
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };
  const nextStep = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(6, s + 1));
  };

  const prevStep = () => {
    setStep((s) => Math.max(1, s - 1));
  };

  return (
    <div className="card" style={{ paddingBottom: 136 }}>
      {/* ===== STEP HEADER ===== */}
      <div className="step-header">
        <div className="step-title">
          Шаг {step} из 5:{" "}
          <span>
            {step === 1 && "Локация"}
            {step === 2 && "Объект и компонент"}
            {step === 3 && "Параметры"}
            {step === 4 && "Описание"}
            {step === 5 && "Материалы и примечание"}
          </span>
        </div>

        <div className="step-progress">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className={`step-dot ${
                step === n ? "active" : step > n ? "done" : ""
              }`}
            />
          ))}
        </div>
      </div>
      {/* 🎙 Голосовой ввод */}

      {step === 1 && (
        <>
          <InputCard
            label="УМГ"
            placeholder="Введите УМГ"
            value={form.field}
            onChange={(v) => handle("field", v)}
          />
          <InputCard
            label="Компрессорная станция"
            placeholder="Введите компрессорную станцию"
            value={form.station}
            onChange={(v) => handle("station", v)}
          />
          <AutocompleteInput
            id="location"
            label="Объект"
            placeholder="Введите объект"
            value={form.location}
            options={Object.values(locations).flat()}
            onChange={(v) => handle("location", v)}
            error={errors.location}
          />
        </>
      )}
      {step === 2 && (
        <>
          <AutocompleteInput
            id="object"
            label="Объект"
            placeholder="Введите объект"
            value={form.object}
            options={Object.values(objects).flat()}
            onChange={(v) => handle("object", v)}
            error={errors.object}
          />
          <InputCard
            label="Бирка"
            placeholder="Введите идентификационный номер бирки"
            value={form.leak_id}
            required
            onChange={(v) => handle("leak_id", v)}
          />
          <AutocompleteInput
            id="component"
            label="Компонент"
            placeholder="Введите компонент"
            value={form.component}
            options={Object.values(components).flat()}
            onChange={(v) => handle("component", v)}
            error={errors.component}
          />
        </>
      )}

      {step === 3 && (
        <>
          <InputCard
            label="Видео"
            type="number"
            placeholder="Введите идентификационный номер видео"
            value={form.video_id}
            onChange={(v) => handle("video_id", v)}
          />
          <InputCard
            label="Давление"
            type="number"
            value={form.pressure}
            onChange={(v) => handle("pressure", v)}
          />
          <InputCard
            label="Температура"
            type="number"
            value={form.temperature}
            onChange={(v) => handle("temperature", v)}
          />
        </>
      )}
      {step === 4 && (
        <>
          <InputCard
            label="Скорость"
            type="number"
            required
            value={form.leak_speed}
            error={errors.leak_speed}
            onChange={(v) => handle("leak_speed", v)}
          />

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
        </>
      )}

      {/* ===== СПРАВОЧНИКИ ===== */}
      {step === 5 && (
        <>
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
        </>
      )}

      {step === 6 && (
        <>
          <InputCard
            label="Примечание"
            as="textarea"
            rows={4}
            placeholder="Введите примечание"
            value={form.note}
            onChange={(v) => handle("note", v)}
          />

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
        </>
      )}
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
        <button className="fab pen" type="button" onClick={clearForm}>
          🧹
        </button>
      </div>
      <div className="leak-form-footer">
        <button type="button" onClick={prevStep} disabled={step === 1}>
          ← Назад
        </button>

        {step < 6 ? (
          <button type="button" onClick={nextStep}>
            Далее →
          </button>
        ) : (
          <button type="button" onClick={add}>
            💾 Сохранить
          </button>
        )}
      </div>
    </div>
  );
}
