import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { PROJECT_META } from "@/configs/projects";
import { toFolderName } from "@/app/project/ProjectContext";
import s from "./AddProjectForm.module.scss";

const PROJECT_ICONS = { upstream: "⛽", midstream: "🔧", downstream: "🏭" };

function projectTexts(lang) {
  return {
    upstream: {
      title: lang === "ru" ? "Добыча" : "Upstream",
      description: lang === "ru" ? "Добыча" : "Production",
    },
    midstream: {
      title: lang === "ru" ? "Транспортировка" : "Midstream",
      description:
        lang === "ru" ? "Транспортировка и хранение" : "Transport and storage",
    },
    downstream: {
      title: lang === "ru" ? "Переработка" : "Downstream",
      description:
        lang === "ru" ? "Переработка и сбыт" : "Processing and distribution",
    },
  };
}

export default function AddProjectForm({ onConfirm, onCancel }) {
  const { lang } = useLanguage();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const texts = projectTexts(lang);

  const handleSubmit = () => {
    if (!type) {
      setError(
        lang === "ru" ? "Выберите тип проекта" : "Select a project type",
      );
      return;
    }
    onConfirm(name.trim(), type);
  };

  const preview = name.trim() ? toFolderName(name.trim()) : "—";

  return (
    <div className={s.form}>
      <h3 className={s.formTitle}>
        {lang === "ru" ? "Новый проект" : "New project"}
      </h3>

      <div className={s.field}>
        <label className={s.label}>{lang === "ru" ? "Название" : "Name"}</label>
        <input
          className={s.input}
          type="text"
          placeholder={
            lang === "ru"
              ? "Например: Тенгиз Q1 2026"
              : "Example: Tengiz Q1 2026"
          }
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onCancel();
          }}
          maxLength={80}
          autoFocus
        />
        <span className={s.hint}>
          {lang === "ru" ? "Папка на устройстве:" : "Device folder:"}{" "}
          <code>{preview}</code>
        </span>
      </div>

      <div className={s.field}>
        <label className={s.label}>
          {lang === "ru" ? "Тип" : "Type"} <span className={s.req}>*</span>
        </label>
        <div className={s.types}>
          {Object.entries(PROJECT_META).map(([id]) => (
            <button
              key={id}
              type="button"
              className={`${s.typeBtn} ${type === id ? s.selected : ""}`}
              onClick={() => {
                setType(id);
                setError("");
              }}
            >
              <span>{PROJECT_ICONS[id]}</span>
              <span className={s.typeName}>{texts[id].title}</span>
              <span className={s.typeDesc}>{texts[id].description}</span>
            </button>
          ))}
        </div>
        {error && <span className={s.error}>{error}</span>}
      </div>

      <div className={s.footer}>
        <button className={s.cancelBtn} type="button" onClick={onCancel}>
          {lang === "ru" ? "Отмена" : "Cancel"}
        </button>
        <button
          className={s.createBtn}
          type="button"
          onClick={handleSubmit}
          disabled={!type}
        >
          {lang === "ru" ? "Создать" : "Create"}
        </button>
      </div>
    </div>
  );
}
