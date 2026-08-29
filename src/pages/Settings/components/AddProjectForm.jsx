import { useId, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { PROJECT_META } from "@/configs/projectMeta";
import { toFolderName } from "@/app/project/ProjectContext";
import s from "./AddProjectForm.module.scss";

const PROJECT_ICONS = { upstream: "⛽", midstream: "🔧", downstream: "🏭" };

function projectTexts(t) {
  return {
    upstream: {
      title: t("settings.projectTypes.upstream"),
      description: t("settings.projectTypes.upstreamHint"),
    },
    midstream: {
      title: t("settings.projectTypes.midstream"),
      description: t("settings.projectTypes.midstreamHint"),
    },
    downstream: {
      title: t("settings.projectTypes.downstream"),
      description: t("settings.projectTypes.downstreamHint"),
    },
  };
}

export default function AddProjectForm({ onConfirm, onCancel }) {
  const { t } = useLanguage();
  const nameId = useId();

  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const texts = projectTexts(t);

  const handleSubmit = () => {
    if (!type) {
      setError(t("settings.selectProjectType"));
      return;
    }
    onConfirm(name.trim(), type);
  };

  const preview = name.trim() ? toFolderName(name.trim()) : "—";

  return (
    <div className={s.form}>
      <h3 className={s.formTitle}>{t("settings.newProject")}</h3>

      <div className={s.field}>
        <label className={s.label} htmlFor={nameId}>
          {t("settings.projectName")}
        </label>
        <input
          id={nameId}
          className={s.input}
          type="text"
          placeholder={t("settings.projectNamePlaceholder")}
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
          {t("settings.deviceFolder")} <code>{preview}</code>
        </span>
      </div>

      <div className={s.field}>
        <label className={s.label}>
          {t("settings.projectType")} <span className={s.req}>*</span>
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
          {t("settings.cancel")}
        </button>
        <button
          className={s.createBtn}
          type="button"
          onClick={handleSubmit}
          disabled={!type}
        >
          {t("settings.create")}
        </button>
      </div>
    </div>
  );
}
