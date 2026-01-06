import { useState } from "react";
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

const REQUIRED_FIELDS = ["leak_id", "video_id", "leak_speed"];

export default function LeakForm({ onAdd }) {
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});

  const handle = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = () => {
    const newErrors = {};
    REQUIRED_FIELDS.forEach((key) => {
      if (!form[key] || form[key].trim() === "") {
        newErrors[key] = "Обязательное поле";
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const add = () => {
    if (!validate()) return;
    onAdd({
      ...form,
      date: new Date().toLocaleDateString(),
    });
    setForm({});
    setErrors({});
  };

  return (
    <div className="card">
      {/* Обязательные поля */}
      <input
        id="tag"
        className={`emojis ${errors.leak_id ? "input-error" : ""}`}
        placeholder="Индивидуальный номер утечки *"
        value={form.leak_id || ""}
        onChange={(e) => handle("leak_id", e.target.value)}
      />
      {errors.leak_id && <div className="error-text">{errors.leak_id}</div>}

      <input
        id="video"
        className={`emojis ${errors.video_id ? "input-error" : ""}`}
        placeholder="Индивидуальный номер видео *"
        value={form.video_id || ""}
        onChange={(e) => handle("video_id", e.target.value)}
      />

      <input
        id="speed"
        className={`emojis ${errors.leak_speed ? "input-error" : ""}`}
        placeholder="Скорость утечки *"
        value={form.leak_speed || ""}
        onChange={(e) => handle("leak_speed", e.target.value)}
      />

      {/* Параметры */}
      <input
        id="temperature"
        className="emojis"
        placeholder="Температура"
        value={form.temperature || ""}
        onChange={(e) => handle("temperature", e.target.value)}
      />

      <input
        id="pressure"
        className="emojis"
        placeholder="Давление"
        value={form.pressure || ""}
        onChange={(e) => handle("pressure", e.target.value)}
      />

      <input
        placeholder="УМГ"
        value={form.field || ""}
        onChange={(e) => handle("field", e.target.value)}
      />

      <input
        placeholder="Компрессорная станция"
        value={form.station || ""}
        onChange={(e) => handle("station", e.target.value)}
      />

      <textarea
        placeholder="Примечание"
        value={form.note || ""}
        onChange={(e) => handle("note", e.target.value)}
      />

      {/* Excel-style подсказки */}
      <input
        list="locations-list"
        placeholder="Локация"
        value={form.location || ""}
        onChange={(e) => handle("location", e.target.value)}
      />
      <datalist id="locations-list">
        {Object.values(locations)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input
        list="objects-list"
        placeholder="Объект"
        value={form.object || ""}
        onChange={(e) => handle("object", e.target.value)}
      />
      <datalist id="objects-list">
        {Object.values(objects)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input
        list="components-list"
        placeholder="Компонент"
        value={form.component || ""}
        onChange={(e) => handle("component", e.target.value)}
      />
      <datalist id="components-list">
        {Object.values(components)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input
        list="description-list"
        placeholder="Описание утечки"
        value={form.leak_description || ""}
        onChange={(e) => handle("leak_description", e.target.value)}
      />
      <datalist id="description-list">
        {Object.values(description)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input
        list="cause-list"
        placeholder="Причина утечки"
        value={form.leak_cause || ""}
        onChange={(e) => handle("leak_cause", e.target.value)}
      />
      <datalist id="cause-list">
        {Object.values(cause)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input
        list="solutions-list"
        placeholder="Технологическое решение"
        value={form.technological_solution || ""}
        onChange={(e) => handle("technological_solution", e.target.value)}
      />
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
        value={form.repair_recommendation || ""}
        onChange={(e) => handle("repair_recommendation", e.target.value)}
      />
      <datalist id="recommendations-list">
        {Object.values(recommendations)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input
        list="materials-list"
        placeholder="МТР ремонта (предполагаемый)"
        value={form.materials_equipment || ""}
        onChange={(e) => handle("materials_equipment", e.target.value)}
      />
      <datalist id="materials-list">
        {Object.values(materials)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <button onClick={add}>➕ Добавить утечку</button>
    </div>
  );
}
