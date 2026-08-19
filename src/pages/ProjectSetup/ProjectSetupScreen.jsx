import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { PROJECT_META } from "@/configs/projects";
import { toFolderName } from "@/app/project/ProjectContext";
import { useLanguage } from "@/app/hooks/useLanguage";
import {
  cancelLocalSyncQrScan,
  fetchLocalSyncArchive,
  isLocalSyncAvailable,
  scanLocalSyncQr,
} from "@/services/sync/localSyncService";
import s from "./ProjectSetupScreen.module.scss";

const VALID_TYPES = ["upstream", "midstream", "downstream"];

function detectTypeFromString(str) {
  const lower = str.toLowerCase();
  if (lower.includes("downstream")) return "downstream";
  if (lower.includes("midstream")) return "midstream";
  if (lower.includes("upstream")) return "upstream";
  return null;
}

function ImportIcon({ type }) {
  if (type === "qr") {
    return (
      <svg className={s.importIcon} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="6" height="6" rx="1" />
        <rect x="15" y="3" width="6" height="6" rx="1" />
        <rect x="3" y="15" width="6" height="6" rx="1" />
        <path
          className={s.importIconFill}
          d="M15 15h2v2h-2zM19 15h2v4h-2zM15 19h4v2h-4zM11 3h2v4h-2zM11 9h4v2h-4zM11 13h2v4h-2z"
        />
      </svg>
    );
  }

  return (
    <svg className={s.importIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 3.5h10l4 4V20.5H5z" />
      <path d="M15 3.5v4h4M12 4v2M12 8v2M12 12v2" />
      <path d="M10.5 16h3v3h-3z" />
    </svg>
  );
}

const PROJECT_ICONS = { upstream: "⛽", midstream: "🔧", downstream: "🏭" };

/**
 * Имя проекта, каким его написала выгрузка.
 *
 * Файл называется «!Database_Бузахур.zip» или «!Inventorization_Бузахур.zip»:
 * приставку ставит приложение, чтобы архивы различались в папке, и предлагать
 * её человеку как название проекта — значит заставлять его стирать её руками.
 */
function projectNameFromFile(fileName) {
  return (
    String(fileName)
      .replace(/\.(?:xlsx|zip)$/i, "")
      .replace(/^!?(?:Database|Inventorization)[_-]?/i, "")
      .trim() || String(fileName).replace(/\.(?:xlsx|zip)$/i, "")
  );
}

/** Ошибка импорта словами, которые что-то говорят стоящему у экрана. */
function importErrorText(error, localeTexts) {
  if (error?.code === "MISSING_PROJECT_TYPE") {
    return localeTexts.selectProjectType;
  }
  if (error?.code === "EMPTY_EXCEL") return localeTexts.emptyExcel;
  if (error?.code === "EMPTY_INVENTORY") return localeTexts.emptyInventory;
  if (error?.code === "UNKNOWN_IMPORT_FILE") {
    return localeTexts.importUnknownFile;
  }
  return error?.message ?? localeTexts.importError;
}

export default function ProjectSetupScreen({
  onComplete,
  onImportZip,
  onImportExcel,
  onImportInventory,
}) {
  const { t, toggleLanguage } = useLanguage();
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
      importFile: t("projectSetup.importFile"),
      importing: t("projectSetup.importing"),
      importUnknownFile: t("projectSetup.importUnknownFile"),
      emptyInventory: t("projectSetup.emptyInventory"),
      importQr: t("projectSetup.importQr"),
      importingQr: t("projectSetup.importingQr"),
      scanQrProgress: t("projectSetup.scanQrProgress"),
      importQrProgress: t("projectSetup.importQrProgress"),
      emptyExcel: t("projectSetup.emptyExcel"),
      importProgress: t("projectSetup.importProgress"),

      cancelScan: t("projectSetup.cancelScan"),

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
    [t],
  );
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importingQr, setImportingQr] = useState(false);
  const [qrPhase, setQrPhase] = useState("idle");
  const fileRef = useRef(null);
  const canImportByQr = onImportZip && isLocalSyncAvailable();
  const canImportFile = Boolean(onImportZip || onImportExcel);
  const isImporting = importing || importingQr;

  const handleSubmit = () => {
    if (!type) {
      setError(localeTexts.selectProjectType);
      return;
    }
    onComplete(type, name.trim());
  };

  const importZipFile = useCallback(
    async (file) => {
      let resolvedName = name.trim();
      let resolvedType = type;

      // Уровень 1: project.json внутри ZIP
      // Уровень 2: детектирование по полям записей (peek.detectedType)
      // Уровень 3: ключевые слова в имени файла
      try {
        const { peekBackupZip } =
          await import("@/services/backup/projectBackupService");
        const peek = await peekBackupZip(file);
        const metaProject = peek.meta?.project;

        if (metaProject?.name && !resolvedName) {
          resolvedName = metaProject.name;
          setName(resolvedName);
        }
        const fromMeta =
          metaProject?.type && VALID_TYPES.includes(metaProject.type)
            ? metaProject.type
            : null;
        const detected =
          fromMeta ||
          (!resolvedType
            ? peek.detectedType || detectTypeFromString(file.name)
            : null);
        if (detected) {
          resolvedType = detected;
          setType(detected);
        }
      } catch {
        // ignore peek errors — importProjectZip will handle them
      }

      if (!resolvedName) {
        resolvedName = file.name.replace(/\.zip$/i, "");
        setName(resolvedName);
      }

      await onImportZip(file, { name: resolvedName, type: resolvedType });
    },
    [name, onImportZip, type],
  );

  const importExcelFile = useCallback(
    async (file) => {
      const resolvedName = name.trim() || projectNameFromFile(file.name);
      if (!name.trim()) setName(resolvedName);
      await onImportExcel(file, { name: resolvedName, type });
    },
    [name, onImportExcel, type],
  );

  const importInventoryArchive = useCallback(
    async (file) => {
      const resolvedName = name.trim() || projectNameFromFile(file.name);
      if (!name.trim()) setName(resolvedName);
      await onImportInventory(file, { name: resolvedName, type });
    },
    [name, onImportInventory, type],
  );

  /**
   * Один разбор на любой принесённый файл.
   *
   * Кнопок было две, и человеку с только что полученным файлом приходилось
   * знать, бэкап у него, отчёт или инвентаризация: ошибся кнопкой — получил
   * «файл backup.json не найден в архиве» и никакой подсказки, что делать
   * дальше. Ответ целиком лежит внутри файла, и тем же распознаванием, что
   * в настройках.
   */
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setError("");
    try {
      const { detectImportKind } =
        await import("@/services/import/importRouting");
      const { kind } = await detectImportKind(file);

      if (kind === "project" && onImportZip) await importZipFile(file);
      else if (kind === "excel" && onImportExcel) await importExcelFile(file);
      else if (kind === "inventory" && onImportInventory) {
        await importInventoryArchive(file);
      } else {
        const error = new Error(localeTexts.importUnknownFile);
        error.code = "UNKNOWN_IMPORT_FILE";
        throw error;
      }
    } catch (err) {
      setError(importErrorText(err, localeTexts));
      setImporting(false);
    }
  };

  const handleQrImport = async () => {
    setImportingQr(true);
    setQrPhase("scanning");
    setError("");
    try {
      const connection = await scanLocalSyncQr();
      setQrPhase("importing");
      const file = await fetchLocalSyncArchive(connection);
      await importZipFile(file);
    } catch (err) {
      if (err.code !== "QR_SCAN_CANCELLED") {
        setError(importErrorText(err, localeTexts));
      }
      setImportingQr(false);
      setQrPhase("idle");
    }
  };

  useEffect(
    () => () => {
      Promise.resolve(cancelLocalSyncQrScan()).catch(() => {});
    },
    [],
  );

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
          <label className={s.label} htmlFor="project-name">
            {localeTexts.projectName}
          </label>
          <input
            id="project-name"
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
          <span className={s.label} id="project-type-label">
            {localeTexts.projectType} <span className={s.required}>*</span>
          </span>
          <div
            className={s.typeGrid}
            role="group"
            aria-labelledby="project-type-label"
          >
            {Object.entries(PROJECT_META).map(([id, meta]) => {
              const localizedType = localeTexts.projectTypes[id] ?? meta;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={type === id}
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
            {qrPhase === "scanning" && (
              <div className={s.qrScannerOverlay} role="dialog">
                <div className={s.qrScannerFrame} aria-hidden="true" />
                <p>{localeTexts.scanQrProgress}</p>
                <button
                  type="button"
                  className={s.cancelScanBtn}
                  onClick={cancelLocalSyncQrScan}
                >
                  {localeTexts.cancelScan}
                </button>
              </div>
            )}

            <div className={s.orDivider}>
              <span>{localeTexts.or}</span>
            </div>

            {/* Одна кнопка на любой файл и отдельная — на QR: там не файл, а
                чужой телефон рядом, и выбирать нечего. */}
            <div
              className={`${s.importActions} ${
                canImportByQr ? s.importActionsTwoColumns : ""
              }`}
            >
              {canImportFile && (
                <button
                  className={s.importBtn}
                  type="button"
                  title={localeTexts.import}
                  disabled={isImporting}
                  onClick={() => {
                    setError("");
                    fileRef.current?.click();
                  }}
                >
                  <ImportIcon type="zip" />
                  {importing ? localeTexts.importing : localeTexts.importFile}
                  <span className={s.importBtnSr}>
                    {"↓ " + localeTexts.import}
                  </span>
                </button>
              )}
              {canImportByQr && (
                <button
                  className={`${s.importBtn} ${s.qrImportBtn}`}
                  type="button"
                  title={localeTexts.importQr}
                  disabled={isImporting}
                  onClick={handleQrImport}
                >
                  <ImportIcon type="qr" />
                  {importingQr ? localeTexts.importingQr : "QR"}
                  <span className={s.importBtnSr}>
                    {"QR " + localeTexts.importQr}
                  </span>
                </button>
              )}
            </div>
            {isImporting && (
              <p className={s.importStatus} role="status" aria-live="polite">
                {importingQr
                  ? qrPhase === "scanning"
                    ? localeTexts.scanQrProgress
                    : localeTexts.importQrProgress
                  : localeTexts.importProgress}
              </p>
            )}
            <p className={s.importHint}>{localeTexts.importHint}</p>

            <input
              ref={fileRef}
              type="file"
              accept=".zip,.xlsx,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </>
        )}
      </div>
    </div>
  );
}
