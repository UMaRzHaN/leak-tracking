import { useState, useRef } from "react";
import { PROJECT_META } from "../../configs/projects";
import { toFolderName } from "../../app/settings/ProjectContext";
import { peekBackupZip } from "../../services/export/backup";
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
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const handleSubmit = () => {
    if (!type) { setError("Выберите тип проекта"); return; }
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
        const peek = await peekBackupZip(file);
        const metaProject = peek.meta?.project;

        if (metaProject?.name && !resolvedName) {
          resolvedName = metaProject.name;
          setName(resolvedName);
        }
        if (!resolvedType) {
          const fromMeta = metaProject?.type && VALID_TYPES.includes(metaProject.type) ? metaProject.type : null;
          const detected = fromMeta || peek.detectedType || detectTypeFromString(file.name);
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
      setError(err.message ?? "Ошибка импорта");
      setImporting(false);
    }
  };

  const folderPreview = name.trim()
    ? toFolderName(name.trim())
    : (type ? toFolderName(PROJECT_META[type].title) : "—");

  return (
    <div className={s.screen}>
      <div className={s.card}>
        <div className={s.logo}>📋</div>
        <h1 className={s.title}>Журнал утечек</h1>
        <p className={s.subtitle}>Создайте первый проект для начала работы</p>

        {/* Название проекта */}
        <div className={s.field}>
          <label className={s.label}>Название проекта</label>
          <input
            className={s.input}
            type="text"
            placeholder="Например: Тенгиз Q1 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && type) handleSubmit(); }}
            maxLength={80}
            autoFocus
          />
          <span className={s.hint}>
            Папка на устройстве: <code className={s.code}>{folderPreview}</code>
          </span>
        </div>

        {/* Тип проекта */}
        <div className={s.field}>
          <label className={s.label}>
            Тип проекта <span className={s.required}>*</span>
          </label>
          <div className={s.typeGrid}>
            {Object.entries(PROJECT_META).map(([id, meta]) => (
              <button
                key={id}
                type="button"
                className={`${s.typeBtn} ${type === id ? s.selected : ""}`}
                onClick={() => { setType(id); setError(""); }}
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
          Начать работу
        </button>

        {onImportZip && (
          <>
            <div className={s.orDivider}><span>или</span></div>

            <button
              className={s.importBtn}
              type="button"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              {importing ? "Импорт…" : "⬇ Импортировать из ZIP"}
            </button>
            <p className={s.importHint}>Восстановить проект из резервной копии</p>

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
