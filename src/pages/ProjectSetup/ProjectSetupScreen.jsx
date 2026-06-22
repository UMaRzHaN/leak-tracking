import { useState, useRef, useMemo } from "react";
import { PROJECT_META } from "@/configs/projects";
import { toFolderName } from "@/app/project/ProjectContext";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./ProjectSetupScreen.module.scss";

const VALID_TYPES = ["upstream", "midstream", "downstream"];

function detectTypeFromString(str) {
  const lower = str.toLowerCase();
  if (lower.includes("downstream")) return "downstream";
  if (lower.includes("midstream")) return "midstream";
  if (lower.includes("upstream")) return "upstream";
  return null;
}

const PROJECT_ICONS = { upstream: "⛽", midstream: "🔧", downstream: "🏭" };

export default function ProjectSetupScreen({ onComplete, onImportZip }) {
  const { t } = useLanguage();
  const localeTexts = useMemo(
    () => ({
      title: t("projectSetup.title"),
      subtitle: t("projectSetup.subtitle"),

      projectName: t("projectSetup.projectName"),
      projectType: t("projectSetup.projectType"),

      projectExample: t("projectSetup.projectExample"),
      deviceFolder: t("projectSetup.deviceFolder"),

      selectProjectType: t("projectSetup.selectProjectType"),

      start: t("projectSetup.start"),

      or: t("projectSetup.or"),

      import: t("projectSetup.import"),
      importing: t("projectSetup.importing"),

      importHint: t("projectSetup.importHint"),

      importError: t("projectSetup.importError"),
    }),
    [t],
  );
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const handleSubmit = () => {
    if (!type) {
      setError(localeTexts.selectProjectType);
      return;
    }
    onComplete(type, name.trim());
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setError("");
    try {
      let resolvedName = name.trim();
      let resolvedType = type;

      // Уровень 1: project.json внутри ZIP
      // Уровень 2: детектирование по полям записей (peek.detectedType)
      // Уровень 3: ключевые слова в имени файла
      try {
        const { peekBackupZip } = await import("@/pages/Settings/backup");
        const peek = await peekBackupZip(file);
        const metaProject = peek.meta?.project;

        if (metaProject?.name && !resolvedName) {
          resolvedName = metaProject.name;
          setName(resolvedName);
        }
        if (!resolvedType) {
          const fromMeta =
            metaProject?.type && VALID_TYPES.includes(metaProject.type)
              ? metaProject.type
              : null;
          const detected =
            fromMeta || peek.detectedType || detectTypeFromString(file.name);
          if (detected) {
            resolvedType = detected;
            setType(detected);
          }
        }
      } catch {
        // ignore peek errors — importProjectZip will handle them
      }

      if (!resolvedName) {
        resolvedName = file.name.replace(/\.zip$/i, "");
        setName(resolvedName);
      }

      await onImportZip(file, { name: resolvedName, type: resolvedType });
    } catch (err) {
      setError(err.message ?? localeTexts.importError);
      setImporting(false);
    }
  };

  const folderPreview = name.trim()
    ? toFolderName(name.trim())
    : type
      ? toFolderName(PROJECT_META[type].title)
      : "—";

  return (
    <div className={s.screen}>
      <div className={s.card}>
        <div className={s.logo}>📋</div>
        <h1 className={s.title}>{localeTexts.title}</h1>
        <p className={s.subtitle}>{localeTexts.subtitle}</p>

        {/* Название проекта */}
        <div className={s.field}>
          <label className={s.label}>{localeTexts.projectName}</label>
          <input
            className={s.input}
            type="text"
            placeholder={localeTexts.projectExample}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && type) handleSubmit();
            }}
            maxLength={80}
            autoFocus
          />
          <span className={s.hint}>
            {localeTexts.deviceFolder}:{" "}
            <code className={s.code}>{folderPreview}</code>
          </span>
        </div>

        {/* Тип проекта */}
        <div className={s.field}>
          <label className={s.label}>
            {localeTexts.projectType} <span className={s.required}>*</span>
          </label>
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
          disabled={!type || importing}
        >
          {localeTexts.start}
        </button>

        {onImportZip && (
          <>
            <div className={s.orDivider}>
              <span>{localeTexts.or}</span>
            </div>

            <button
              className={s.importBtn}
              type="button"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              {importing ? localeTexts.importing : "⬇ " + localeTexts.import}
            </button>
            <p className={s.importHint}>{localeTexts.importHint}</p>

            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </>
        )}
      </div>
    </div>
  );
}
