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

      {/* Общие поля */}

      <input
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
      {mode === "select" && (
        <>
          <select onChange={(e) => handle("object", e.target.value)}>
            <option value="">Объект</option>
            {Object.keys(objects).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>

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
      </button>
    </div>
  );
}
