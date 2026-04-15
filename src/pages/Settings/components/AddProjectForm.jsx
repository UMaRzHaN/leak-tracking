import { useState } from "react";
import { PROJECT_META } from "../../../configs/projects";
import { toFolderName } from "../../../app/settings/ProjectContext";
import s from "./AddProjectForm.module.scss";

const PROJECT_ICONS = { upstream: "⛽", midstream: "🔧", downstream: "🏭" };

export default function AddProjectForm({ onConfirm, onCancel }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    if (!type) { setError("Выберите тип проекта"); return; }
    onConfirm(name.trim(), type);
  };

  const preview = name.trim() ? toFolderName(name.trim()) : "—";

  return (
    <div className={s.form}>
      <h3 className={s.formTitle}>Новый проект</h3>

      {/* Название */}
      <div className={s.field}>
        <label className={s.label}>Название</label>
        <input
          className={s.input}
          type="text"
          placeholder="Например: Тенгиз Q1 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") onCancel(); }}
          maxLength={80}
          autoFocus
        />
        <span className={s.hint}>
          Папка на устройстве: <code>{preview}</code>
        </span>
      </div>

      {/* Тип */}
      <div className={s.field}>
        <label className={s.label}>Тип <span className={s.req}>*</span></label>
        <div className={s.types}>
          {Object.entries(PROJECT_META).map(([id, meta]) => (
            <button
              key={id}
              type="button"
              className={`${s.typeBtn} ${type === id ? s.selected : ""}`}
              onClick={() => { setType(id); setError(""); }}
            >
              <span>{PROJECT_ICONS[id]}</span>
              <span className={s.typeName}>{meta.title}</span>
              <span className={s.typeDesc}>{meta.description}</span>
            </button>
          ))}
        </div>
        {error && <span className={s.error}>{error}</span>}
      </div>

      {/* Кнопки */}
      <div className={s.footer}>
        <button className={s.cancelBtn} type="button" onClick={onCancel}>Отмена</button>
        <button className={s.createBtn} type="button" onClick={handleSubmit} disabled={!type}>
          Создать
        </button>
      </div>
    </div>
  );
}
