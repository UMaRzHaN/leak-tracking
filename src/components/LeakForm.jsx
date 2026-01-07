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
  onVoiceInput,
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
      } else if (NUMBER_FIELDS.includes(key) && typeof value !== "number") {
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
    if (voiceData) {
      setForm((prev) => ({ ...prev, ...voiceData }));
      clearVoiceData();
    }
  }, [voiceData, clearVoiceData]);

  /* ===== UI ===== */
  return (
    <div className="card">
      {/* 🎙 Голосовой ввод */}
      <button type="button" className="voice-button" onClick={onVoiceInput}>
        🎙️ Голосовой ввод
      </button>

      {/* Обязательные поля */}

      {/* Обязательные поля */}
      <input
        id="tag"
        type="number"
        inputMode="numeric"
        className={`emojis ${errors.leak_id ? "input-error" : ""}`}
        placeholder="Индивидуальный номер утечки *"
        value={form.leak_id ?? ""}
        onChange={(e) => handle("leak_id", e.target.value)}
      />
      {errors.leak_id && <div className="error-text">{errors.leak_id}</div>}

      <input
        id="video"
        type="number"
        inputMode="numeric"
        className={`emojis ${errors.video_id ? "input-error" : ""}`}
        placeholder="Индивидуальный номер утечки *"
        value={form.video_id ?? ""}
        onChange={(e) => handle("video_id", e.target.value)}
      />
      <input
        id="speed"
        type="number"
        inputMode="decimal"
        step="any"
        className={`emojis ${errors.leak_speed ? "input-error" : ""}`}
        placeholder="Скорость утечки *"
        value={form.leak_speed ?? ""}
        onChange={(e) => handle("leak_speed", e.target.value)}
      />

      {/* ===== ПАРАМЕТРЫ ===== */}
      <input
        className="emojis"
        id="temperature"
        type="number"
        inputMode="numeric"
        placeholder="Температура"
        value={form.temperature ?? ""}
        onChange={(e) => handle("temperature", e.target.value)}
      />
      <input
        className="emojis"
        id="pressure"
        type="number"
        inputMode="numeric"
        placeholder="Давление"
        value={form.pressure ?? ""}
        onChange={(e) => handle("pressure", e.target.value)}
      />
      <input placeholder="УМГ" />
      <input placeholder="Компрессорная станция" />

      <textarea placeholder="Примечание" />

      {/* ===== СПРАВОЧНИКИ ===== */}
      <input list="locations-list" placeholder="Локация" />
      <datalist id="locations-list">
        {Object.values(locations)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input list="objects-list" placeholder="Объект" />
      <datalist id="objects-list">
        {Object.values(objects)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input list="components-list" placeholder="Компонент" />
      <datalist id="components-list">
        {Object.values(components)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input list="description-list" placeholder="Описание утечки" />
      <datalist id="description-list">
        {Object.values(description)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input list="cause-list" placeholder="Причина утечки" />
      <datalist id="cause-list">
        {Object.values(cause)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input list="solutions-list" placeholder="Технологическое решение" />
      <datalist id="solutions-list">
        {Object.values(solutions)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input
        list="recommendations-list"
        placeholder="Решение / План устранения"
      />
      <datalist id="recommendations-list">
        {Object.values(recommendations)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input list="materials-list" placeholder="МТР ремонта" />
      <datalist id="materials-list">
        {Object.values(materials)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <button onClick={add}>💾 Сохранить</button>
    </div>
  );
}
