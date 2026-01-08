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
import { normalizeNumber } from "../utils/calculations";
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
  stopVoiceInput,
  startVoiceInput,
  isRecording,
}) {
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});

  /* ===== helpers ===== */
  const handle = (key, value) => {
    const finalValue = NUMBER_FIELDS.includes(key)
      ? normalizeNumber(value)
      : value;

    setForm((prev) => ({
      ...prev,
      [key]: finalValue,
    }));

    // сразу чистим ошибку
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  /* ===== VALIDATION ===== */
  const validate = () => {
    const newErrors = {};

    REQUIRED_FIELDS.forEach((key) => {
      const value = form[key];

      if (value === "" || value === null || value === undefined) {
        newErrors[key] = "Обязательное числовое поле";
      } else if (NUMBER_FIELDS.includes(key) && !Number.isFinite(value)) {
        newErrors[key] = "Введите число";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const add = () => {
    if (!validate()) return;
    onAdd({ ...form, date: new Date().toLocaleDateString() });
    setForm({});
    setErrors({});
  };
  useEffect(() => {
    if (!voiceData) return;

    setForm((prev) => ({
      ...prev,
      ...voiceData,
    }));

    // ⏳ даём React обновить input
    setTimeout(() => {
      clearVoiceData();
    }, 0);
  }, [voiceData, clearVoiceData]);

  /* ===== UI ===== */
  return (
    <div className="card">
      {/* 🎙 Голосовой ввод */}
      <button
        type="button"
        className={`voice-button ${isRecording ? "recording" : ""}`}
        onPointerDown={() => {
          if (!isRecording) startVoiceInput();
        }}
        onPointerUp={() => {
          if (isRecording) stopVoiceInput();
        }}
      >
        {isRecording ? "🎙 Запись…" : "🎙 Удерживай для записи"}
      </button>

      {/* Обязательные поля */}

      {/* Обязательные поля */}
      <div className="form-field">
        <label htmlFor="tag">
          Индивидуальный номер утечки (бирка){" "}
          <span className="required">*</span>
        </label>

        <input
          id="tag"
          type="number"
          inputMode="numeric"
          className={`emojis field ${errors.leak_id ? "input-error" : ""}`}
          placeholder="Введите номер бирки"
          value={form.leak_id ?? ""}
          onChange={(e) => handle("leak_id", e.target.value)}
        />

        {errors.leak_id && <div className="error-text">{errors.leak_id}</div>}
      </div>

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

      {/* ===== ПАРАМЕТРЫ ===== */}
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

      <div className="form-field">
        <label htmlFor="note">Примечание</label>
        <textarea
          id="note"
          placeholder="Введите примечание"
          value={form.note ?? ""}
          onChange={(e) => handle("note", e.target.value)}
        />
      </div>

      {/* ===== СПРАВОЧНИКИ ===== */}
      <div className="form-field">
        <label htmlFor="location">Локация</label>
        <input
          id="location"
          list="locations-list"
          placeholder="Введите локацию"
          value={form.location ?? ""}
          onChange={(e) => handle("location", e.target.value)}
        />
        <datalist id="locations-list">
          {Object.values(locations)
            .flat()
            .map((v, i) => (
              <option key={i} value={v} />
            ))}
        </datalist>
      </div>

      <div className="form-field">
        <label htmlFor="object">Объект</label>
        <input
          id="object"
          list="objects-list"
          placeholder="Введите объект"
          value={form.object ?? ""}
          onChange={(e) => handle("object", e.target.value)}
        />
        <datalist id="objects-list">
          {Object.values(objects)
            .flat()
            .map((v, i) => (
              <option key={i} value={v} />
            ))}
        </datalist>
      </div>

      <div className="form-field">
        <label htmlFor="component">Компонент</label>
        <input
          id="component"
          list="components-list"
          placeholder="Введите компонент"
          value={form.component ?? ""}
          onChange={(e) => handle("component", e.target.value)}
        />
        <datalist id="components-list">
          {Object.values(components)
            .flat()
            .map((v, i) => (
              <option key={i} value={v} />
            ))}
        </datalist>
      </div>

      <div className="form-field">
        <label htmlFor="description">Описание утечки</label>
        <input
          id="description"
          list="description-list"
          placeholder="Введите описание утечки"
          value={form.leak_description ?? ""}
          onChange={(e) => handle("leak_description", e.target.value)}
        />
        <datalist id="description-list">
          {Object.values(description)
            .flat()
            .map((v, i) => (
              <option key={i} value={v} />
            ))}
        </datalist>
      </div>

      <div className="form-field">
        <label htmlFor="leak_cause">Причина утечки</label>
        <input
          id="leak_cause"
          list="cause-list"
          placeholder="Введите причину утечки"
          value={form.leak_cause ?? ""}
          onChange={(e) => handle("leak_cause", e.target.value)}
        />
        <datalist id="cause-list">
          {Object.values(cause)
            .flat()
            .map((v, i) => (
              <option key={i} value={v} />
            ))}
        </datalist>
      </div>

      <div className="form-field">
        <label htmlFor="technological_solution">
          Технологическое решение (техрешение)
        </label>
        <input
          id="technological_solution"
          list="solutions-list"
          placeholder="Введите технологическое решение"
          value={form.technological_solution ?? ""}
          onChange={(e) => handle("technological_solution", e.target.value)}
        />
        <datalist id="solutions-list">
          {Object.values(solutions)
            .flat()
            .map((v, i) => (
              <option key={i} value={v} />
            ))}
        </datalist>
      </div>

      <div className="form-field">
        <label htmlFor="repair_recommendation">
          Решение / План устранения (план устранения)
        </label>
        <input
          id="repair_recommendation"
          list="recommendations-list"
          placeholder="Введите решение / план устранения"
          value={form.repair_recommendation ?? ""}
          onChange={(e) => handle("repair_recommendation", e.target.value)}
        />
        <datalist id="recommendations-list">
          {Object.values(recommendations)
            .flat()
            .map((v, i) => (
              <option key={i} value={v} />
            ))}
        </datalist>
      </div>

      <div className="form-field">
        <label htmlFor="materials_equipment">МТР ремонта (МТР)</label>
        <input
          id="materials_equipment"
          list="materials-list"
          placeholder="Введите МТР ремонта"
          value={form.materials_equipment ?? ""}
          onChange={(e) => handle("materials_equipment", e.target.value)}
        />
        <datalist id="materials-list">
          {Object.values(materials)
            .flat()
            .map((v, i) => (
              <option key={i} value={v} />
            ))}
        </datalist>
      </div>

      <button onClick={add}>💾 Сохранить</button>
    </div>
  );
}
