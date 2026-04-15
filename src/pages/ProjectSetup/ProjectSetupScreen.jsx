import { useState } from "react";
import { PROJECT_META } from "../../configs/projects";
import s from "./ProjectSetupScreen.module.scss";

const PROJECT_ICONS = {
  upstream: "⛽",
  midstream: "🔧",
  downstream: "🏭",
};

export default function ProjectSetupScreen({ onComplete }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    if (!type) {
      setError("Выберите тип проекта");
      return;
    }
    onComplete(type, name.trim());
  };

  return (
    <div className={s.screen}>
      <div className={s.card}>
        <div className={s.logo}>📋</div>
        <h1 className={s.title}>Журнал утечек</h1>
        <p className={s.subtitle}>Настройте проект для начала работы</p>

        {/* Название проекта */}
        <div className={s.field}>
          <label className={s.label}>Название проекта</label>
          <input
            className={s.input}
            type="text"
            placeholder="Например: Месторождение Тенгиз"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoFocus
          />
          <span className={s.hint}>Необязательно — можно изменить в настройках</span>
        </div>

        {/* Тип проекта */}
        <div className={s.field}>
          <label className={s.label}>Тип проекта <span className={s.required}>*</span></label>
          <div className={s.typeGrid}>
            {Object.entries(PROJECT_META).map(([id, meta]) => (
              <button
                key={id}
                type="button"
                className={`${s.typeBtn} ${type === id ? s.selected : ""}`}
                onClick={() => {
                  setType(id);
                  setError("");
                }}
              >
                <span className={s.typeIcon}>{PROJECT_ICONS[id]}</span>
                <span className={s.typeName}>{meta.title}</span>
                <span className={s.typeDesc}>{meta.description}</span>
              </button>
            ))}
          </div>
          {error && <span className={s.error}>{error}</span>}
        </div>

        <button
          className={s.startBtn}
          type="button"
          onClick={handleSubmit}
          disabled={!type}
        >
          Начать работу
        </button>
      </div>
    </div>
  );
}
