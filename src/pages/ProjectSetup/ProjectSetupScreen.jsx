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

export default function ProjectSetupScreen({
  onComplete,
  onImportZip,
  onImportExcel,
}) {
  const { t, toggleLanguage, lang } = useLanguage();
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
      importExcel: t("projectSetup.importExcel"),
      importingExcel: t("projectSetup.importingExcel"),
      importExcelProgress: t("projectSetup.importExcelProgress"),
      emptyExcel: t("projectSetup.emptyExcel"),
      importProgress: t("projectSetup.importProgress", {
        defaultValue:
          lang === "ru"
            ? "Идёт импорт ZIP backup, подождите..."
            : "ZIP backup import in progress, please wait...",
      }),

      importHint: t("projectSetup.importHint"),

      importError: t("projectSetup.importError"),
      languageToggle: t("projectSetup.languageToggle"),
      projectTypes: {
        upstream: {
          title: t("projectSetup.projectTypes.upstream.title"),
          description: t("projectSetup.projectTypes.upstream.description"),
        },
        midstream: {
          title: t("projectSetup.projectTypes.midstream.title"),
          description: t("projectSetup.projectTypes.midstream.description"),
        },
        downstream: {
          title: t("projectSetup.projectTypes.downstream.title"),
          description: t("projectSetup.projectTypes.downstream.description"),
        },
      },
    }),
    [lang, t],
  );
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importingExcel, setImportingExcel] = useState(false);
  const zipFileRef = useRef(null);
  const excelFileRef = useRef(null);
  const isImporting = importing || importingExcel;

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
        const { peekBackupZip } =
          await import("@/services/projectBackupService");
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

  const requestExcelFile = () => {
    setError("");
    excelFileRef.current?.click();
  };

  const handleExcelFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImportingExcel(true);
    setError("");
    try {
      const resolvedName =
        name.trim() || file.name.replace(/\.(?:xlsx|zip)$/i, "");
      if (!name.trim()) setName(resolvedName);
      await onImportExcel(file, { name: resolvedName, type });
    } catch (err) {
      setError(
        err.code === "MISSING_PROJECT_TYPE"
          ? localeTexts.selectProjectType
          : err.code === "EMPTY_EXCEL"
            ? localeTexts.emptyExcel
            : (err.message ?? localeTexts.importError),
      );
      setImportingExcel(false);
    }
  };

  const folderPreview = name.trim()
    ? toFolderName(name.trim())
    : type
      ? toFolderName(
          localeTexts.projectTypes[type]?.title ?? PROJECT_META[type].title,
        )
      : "—";

  return (
    <div className={s.screen}>
      <div className={s.card}>
        <button
          className={s.langBtn}
          type="button"
          onClick={toggleLanguage}
          aria-label={localeTexts.languageToggle}
        >
          {localeTexts.languageToggle}
        </button>
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
            {Object.entries(PROJECT_META).map(([id, meta]) => {
              const localizedType = localeTexts.projectTypes[id] ?? meta;
              return (
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
                  <span className={s.typeName}>{localizedType.title}</span>
                  <span className={s.typeDesc}>
                    {localizedType.description}
                  </span>
                </button>
              );
            })}
          </div>
          {error && <span className={s.error}>{error}</span>}
        </div>

        <button
          className={s.startBtn}
          type="button"
          onClick={handleSubmit}
          disabled={!type || isImporting}
        >
          {localeTexts.start}
        </button>

        {(onImportZip || onImportExcel) && (
          <>
            <div className={s.orDivider}>
              <span>{localeTexts.or}</span>
            </div>

            <div className={s.importActions}>
              {onImportZip && (
                <button
                  className={s.importBtn}
                  type="button"
                  disabled={isImporting}
                  onClick={() => zipFileRef.current?.click()}
                >
                  {importing
                    ? localeTexts.importing
                    : "↓ " + localeTexts.import}
                </button>
              )}
              {onImportExcel && (
                <button
                  className={`${s.importBtn} ${s.excelImportBtn}`}
                  type="button"
                  disabled={isImporting}
                  onClick={requestExcelFile}
                >
                  {importingExcel
                    ? localeTexts.importingExcel
                    : "▦ " + localeTexts.importExcel}
                </button>
              )}
            </div>
            {isImporting && (
              <p className={s.importStatus} role="status" aria-live="polite">
                {importingExcel
                  ? localeTexts.importExcelProgress
                  : localeTexts.importProgress}
              </p>
            )}
            <p className={s.importHint}>{localeTexts.importHint}</p>

            <input
              ref={zipFileRef}
              type="file"
              accept=".zip,application/zip"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <input
              ref={excelFileRef}
              type="file"
              accept=".xlsx,.zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip"
              style={{ display: "none" }}
              onChange={handleExcelFileChange}
            />
          </>
        )}
      </div>
    </div>
  );
}
