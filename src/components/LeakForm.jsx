<<<<<<< HEAD
import { useState, useEffect } from "react";
import { objects, components, leakTypes } from "../data/dictionaries";

export default function LeakForm({ onAdd }) {
  const [mode, setMode] = useState("select");
  const [form, setForm] = useState({});
  const handle = (k, v) => setForm({ ...form, [k]: v });

  return (
    <div className="card">
      {/* Режим */}
      <div className="radio-group">
        <label className="radio-item">
          <input
            type="radio"
            name="mode"
            checked={mode === "select"}
            onChange={() => setMode("select")}
          />
          <span>По справочнику</span>
        </label>

        <label className="radio-item">
          <input
            type="radio"
            name="mode"
            checked={mode === "manual"}
            onChange={() => setMode("manual")}
          />
          <span>Ручной ввод</span>
        </label>
      </div>
=======
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
  // const [mode, setMode] = useState("manual");
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const handle = (k, v) => setForm({ ...form, [k]: v });
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
  return (
    <div className="card">
      {/* Режим */}
      {/* <div className="mode-switch">
        <button
          type="button"
          className={`mode-btn ${mode === "select" ? "active" : ""}`}
          onClick={() => setMode("select")}
        >
          📘 По справочнику
        </button>

        <button
          type="button"
          className={`mode-btn ${mode === "manual" ? "active" : ""}`}
          onClick={() => setMode("manual")}
        >
          ✍️ Ручной ввод
        </button>
      </div> */}
>>>>>>> eaa8437 (Initial commit)

      {/* Общие поля */}

      <input
<<<<<<< HEAD
        className="emojis"
        id="tag"
        placeholder="Индивидуальный номер утечки "
        onChange={(e) => handle("leak_id", e.target.value)}
      />
      <input
        className="emojis"
        id="video"
        placeholder="Индивидуальный номер видео "
        onChange={(e) => handle("video_id", e.target.value)}
      />
      <input
        className="emojis"
        id="speed"
        placeholder="Скорость утечки "
        onChange={(e) => handle("leak_speed", e.target.value)}
      />
=======
        className={`emojis ${errors.leak_id ? "input-error" : ""}`}
        placeholder="Индивидуальный номер утечки *"
        onChange={(e) => handle("leak_id", e.target.value)}
        id="tag"
      />
      {errors.leak_id && <div className="error-text">{errors.leak_id}</div>}
      <input
        className={`emojis ${errors.video_id ? "input-error" : ""}`}
        placeholder="Индивидуальный номер видео *"
        onChange={(e) => handle("video_id", e.target.value)}
        id="video"
      />

      <input
        className={`emojis ${errors.leak_speed ? "input-error" : ""}`}
        placeholder="Скорость утечки *"
        onChange={(e) => handle("leak_speed", e.target.value)}
        id="speed"
      />

>>>>>>> eaa8437 (Initial commit)
      <input
        className="emojis"
        id="temperature"
        placeholder="Температура "
        onChange={(e) => handle("temperature", e.target.value)}
      />
      <input
        className="emojis"
        id="pressure"
        placeholder="Давление"
        onChange={(e) => handle("pressure", e.target.value)}
      />

      <input
        placeholder="УМГ"
        onChange={(e) => handle("field", e.target.value)}
      />
      <input
        placeholder="Компрессорная станция"
        onChange={(e) => handle("station", e.target.value)}
      />
      <textarea
        placeholder="Примечание"
        onChange={(e) => handle("note", e.target.value)}
      />

      {/* Справочник */}
<<<<<<< HEAD
      {mode === "select" && (
        <>
          <select onChange={(e) => handle("object", e.target.value)}>
            <option value="">Объект</option>
            {Object.keys(objects).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
=======
      {/* {mode === "select" && (
        <>
          <input
            list="locations-list"
            placeholder="Локация"
            value={form.locations || ""}
            onChange={(e) => handle("locations", e.target.value)}
          />

          <datalist id="locations-list">
            {Object.values(locations)
              .flat()
              .map((c, i) => (
                <option key={i} value={c} />
              ))}
          </datalist>
>>>>>>> eaa8437 (Initial commit)

          {form.object && (
            <select onChange={(e) => handle("location", e.target.value)}>
              <option value="">Локация</option>
              {objects[form.object].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          )}

          {form.location && (
            <select onChange={(e) => handle("component", e.target.value)}>
              <option value="">Компонент</option>
              {components[form.location]?.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}

          {form.component && (
            <select onChange={(e) => handle("leak", e.target.value)}>
              <option value="">Описание утечки</option>
              {leakTypes[form.component]?.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          )}
        </>
<<<<<<< HEAD
      )}

      {/* Ручной ввод */}
      {mode === "manual" && (
        <>
          <input
            placeholder="Локация"
            onChange={(e) => handle("location", e.target.value)}
          />
          <input
            placeholder="Объект"
            onChange={(e) => handle("object", e.target.value)}
          />
          <input
            placeholder="Компонент"
            onChange={(e) => handle("component", e.target.value)}
          />
          <input
            placeholder="Описание утечки"
            onChange={(e) => handle("leak_description", e.target.value)}
          />
          <input
            placeholder="Причина утечки"
            onChange={(e) => handle("leak_cause", e.target.value)}
          />
          <input
            placeholder="Технологическое решение"
            onChange={(e) => handle("technological_solution", e.target.value)}
          />
          <input
            placeholder="Решение / План устранения"
            onChange={(e) => handle("repair_recommendation", e.target.value)}
          />
          <input
            placeholder="МТР ремонта (предполагаемый)"
            onChange={(e) => handle("materials_equipment", e.target.value)}
          />
        </>
      )}

      <button
        onClick={() =>
          onAdd({
            ...form,
            mode,
            date: new Date().toLocaleDateString(),
          })
        }
      >
        ➕ Добавить запись
=======
      )} */}

      {/* Ручной ввод */}
      {/* {mode === "manual" && ( */}
      <>
        <div id="locations">
          <input
            list="locations-list"
            placeholder="Локация"
            value={form.location || ""}
            onChange={(e) => handle("location", e.target.value)}
          />

          <datalist id="locations-list">
            {Object.values(locations)
              .flat()
              .map((c, i) => (
                <option key={i} value={c} />
              ))}
          </datalist>
        </div>
        <div id="objects">
          <input
            list="objects-list"
            placeholder="Объект"
            value={form.object || ""}
            onChange={(e) => handle("object", e.target.value)}
          />

          <datalist id="objects-list">
            {Object.values(objects)
              .flat()
              .map((c, i) => (
                <option key={i} value={c} />
              ))}
          </datalist>
        </div>
        <div id="components">
          <input
            list="components-list"
            placeholder="Компонент"
            value={form.component || ""}
            onChange={(e) => handle("component", e.target.value)}
          />

          <datalist id="components-list">
            {Object.values(components)
              .flat()
              .map((c, i) => (
                <option key={i} value={c} />
              ))}
          </datalist>
        </div>
        <div id="description">
          <input
            list="description-list"
            placeholder="Описание утечки"
            value={form.leak_description || ""}
            onChange={(e) => handle("leak_description", e.target.value)}
          />

          <datalist id="description-list">
            {Object.values(description)
              .flat()
              .map((c, i) => (
                <option key={i} value={c} />
              ))}
          </datalist>
        </div>
        <div id="cause">
          <input
            list="cause-list"
            placeholder="Причина утечки"
            value={form.leak_cause || ""}
            onChange={(e) => handle("leak_cause", e.target.value)}
          />

          <datalist id="cause-list">
            {Object.values(cause)
              .flat()
              .map((c, i) => (
                <option key={i} value={c} />
              ))}
          </datalist>
        </div>
        <div id="solutions">
          <input
            list="solutions-list"
            placeholder="Технологическое решение"
            value={form.technological_solution || ""}
            onChange={(e) => handle("technological_solution", e.target.value)}
          />

          <datalist id="solutions-list">
            {Object.values(solutions)
              .flat()
              .map((c, i) => (
                <option key={i} value={c} />
              ))}
          </datalist>
        </div>
        <div id="recommendations">
          <input
            list="recommendations-list"
            placeholder="Решение / План устранения"
            value={form.repair_recommendation || ""}
            onChange={(e) => handle("repair_recommendation", e.target.value)}
          />

          <datalist id="recommendations-list">
            {Object.values(recommendations)
              .flat()
              .map((c, i) => (
                <option key={i} value={c} />
              ))}
          </datalist>
        </div>
        <div id="materials">
          <input
            list="materials-list"
            placeholder="МТР ремонта (предполагаемый)"
            value={form.materials_equipment || ""}
            onChange={(e) => handle("materials_equipment", e.target.value)}
          />

          <datalist id="materials-list">
            {Object.values(materials)
              .flat()
              .map((c, i) => (
                <option key={i} value={c} />
              ))}
          </datalist>
        </div>
      </>
      {/* )} */}

      <button
        onClick={() => {
          if (!validate()) return;
          onAdd(form);
          setErrors({});
        }}
      >
        ➕ Добавить
>>>>>>> eaa8437 (Initial commit)
      </button>
    </div>
  );
}
