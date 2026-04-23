import { useState, useCallback, useRef, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { useProject } from "../../app/settings/ProjectContext";
import { useProjectVars } from "../../app/settings/useProjectVars";
import { useProjectData } from "../../app/hooks/useProjectData";
import { useTheme } from "../../app/hooks/useTheme";
import { usePhotoStorage } from "../../hooks/usePhotoStorage";
import { PROJECT_META } from "../../configs/projects";
import { getMapCacheInfo, clearMapCache } from "../../services/maps/tileCache";
import { buildBackupZip, exportBackupZip, importBackupZip } from "../../services/export/backup";
import SettingsHeader from "./Header/SettingsHeader";
import SettingsModal from "../../components/SettingsModal/SettingsModal";
import Notification from "../../components/Notification/Notification";
import ProjectList from "./components/ProjectList";
import AddProjectForm from "./components/AddProjectForm";
import s from "./Settings.module.scss";

export default function Settings({ setPage, prevPage, clearForm, clearDatabase }) {
  const {
    projects,
    activeProject,
    addProject,
    selectProject,
    renameProject,
    removeProject,
  } = useProject();

  const { vars, setVars } = useProjectVars(activeProject?.id ?? null);
  const { data, save } = useProjectData();
  const { getPhoto: idbGetPhoto, savePhoto } = usePhotoStorage();

  const { dark, toggle: toggleTheme } = useTheme();
  const [notification, setNotification] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [cacheInfo, setCacheInfo] = useState(null);
  const importInputRef = useRef(null);
  const importZipRef = useRef(null);

  useEffect(() => {
    getMapCacheInfo().then(setCacheInfo);
  }, []);

  const notify = useCallback((type, message) => setNotification({ type, message }), []);

  /* =========================
     PROJECT ACTIONS
  ========================= */
  const handleSelect = useCallback(
    async (id) => {
      if (id === activeProject?.id) return;

      const ok = window.confirm(
        "Переключить проект? Форма добавления утечки будет сброшена.",
      );
      if (!ok) return;

      selectProject(id);
      clearForm?.();
      await clearMapCache();
      setCacheInfo({ count: 0, sizeMB: 0 });
      notify("info", "Проект переключён, кэш карты очищен");
    },
    [activeProject, selectProject, clearForm, notify],
  );

  const handleRename = useCallback(
    (id, name) => {
      renameProject(id, name);
      notify("success", "Название сохранено");
    },
    [renameProject, notify],
  );

  const handleRemove = useCallback(
    (id) => {
      const target = projects.find((p) => p.id === id);
      if (!target) return;
      removeProject(id);
      notify("warning", `Проект «${target.name}» удалён`);
    },
    [projects, removeProject, notify],
  );

  const handleAdd = useCallback(
    (name, type) => {
      addProject(name, type);
      setAddingProject(false);
      notify("success", `Проект «${name || PROJECT_META[type].title}» создан`);
    },
    [addProject, notify],
  );

  /* =========================
     BACKUP / RESTORE
  ========================= */
  const handleExport = useCallback(async () => {
    if (!data.length) { notify("warning", "Нет данных для экспорта"); return; }

    const folder = activeProject?.folderName ?? "backup";
    const fileName = `${folder}_${Date.now()}.json`;
    const json = JSON.stringify(data, null, 2);

    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.mkdir({
          path: folder,
          directory: Directory.Documents,
          recursive: true,
        }).catch(() => {});
        await Filesystem.writeFile({
          path: `${folder}/${fileName}`,
          directory: Directory.Documents,
          data: json,
          encoding: "utf8",
        });
        notify("success", `Сохранено в Документы/${folder}/`);
      } catch (err) {
        notify("error", "Ошибка экспорта: " + err.message);
      }
    } else {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      notify("success", `Экспортировано ${data.length} записей`);
    }
  }, [data, activeProject, notify]);

  const handleImport = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Array.isArray(parsed)) throw new Error("Ожидается массив JSON");
        const ok = window.confirm(
          `Импортировать ${parsed.length} записей?\n\nТекущие данные будут заменены.`,
        );
        if (!ok) return;
        await save(parsed);
        notify("success", `Импортировано ${parsed.length} записей`);
      } catch (err) {
        notify("error", "Ошибка импорта: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  }, [save, notify]);

  const handleExportZip = useCallback(async () => {
    if (!data.length) { notify("warning", "Нет данных для экспорта"); return; }
    const folder = activeProject?.folderName ?? "backup";
    const fileName = `${folder}_${Date.now()}.zip`;
    try {
      const blob = await buildBackupZip(data, idbGetPhoto);

      if (Capacitor.isNativePlatform()) {
        const reader = new FileReader();
        const base64 = await new Promise((res, rej) => {
          reader.onload = () => res(reader.result.split(",")[1]);
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
        await Filesystem.mkdir({
          path: folder,
          directory: Directory.Documents,
          recursive: true,
        }).catch(() => {});
        await Filesystem.writeFile({
          path: `${folder}/${fileName}`,
          directory: Directory.Documents,
          data: base64,
        });
        notify("success", `ZIP сохранён в Документы/${folder}/`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        notify("success", `ZIP-архив скачан (${data.length} записей)`);
      }
    } catch (err) {
      notify("error", "Ошибка экспорта: " + err.message);
    }
  }, [data, idbGetPhoto, activeProject, notify]);

  const handleImportZip = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const restoredLeaks = await importBackupZip(file, savePhoto);
      const ok = window.confirm(
        `Импортировать ${restoredLeaks.length} записей с фото?\n\nТекущие данные будут заменены.`,
      );
      if (!ok) { e.target.value = ""; return; }
      await save(restoredLeaks);
      notify("success", `Импортировано ${restoredLeaks.length} записей`);
    } catch (err) {
      notify("error", "Ошибка импорта: " + err.message);
    }
    e.target.value = "";
  }, [savePhoto, save, notify]);

  /* =========================
     VARS MODAL
  ========================= */
  const handleModalSave = useCallback(
    (nextVars) => {
      setVars(nextVars);
      setModalOpen(false);
      notify("success", "Параметры расчёта сохранены");
    },
    [setVars, notify],
  );

  const handleModalClose = useCallback((discarded) => {
    setModalOpen(false);
    if (discarded) notify("warning", "Изменения отменены");
  }, [notify]);

  const handleClearMapCache = useCallback(async () => {
    const ok = window.confirm("Очистить кэш карты? Тайлы будут перекачаны при следующем открытии карты.");
    if (!ok) return;
    await clearMapCache();
    setCacheInfo({ count: 0, sizeMB: 0 });
    notify("success", "Кэш карты очищен");
  }, [notify]);

  const handleClearDatabase = useCallback(() => {
    const ok = window.confirm(
      "Удалить все записи об утечках?\n\nЭто действие необратимо. Фото-файлы сохранятся на устройстве.",
    );
    if (!ok) return;
    clearDatabase?.();
    notify("warning", "База данных очищена");
  }, [clearDatabase, notify]);

  /* =========================
     RENDER
  ========================= */
  return (
    <div className={s.settings}>
      <SettingsHeader onBack={() => setPage?.(prevPage ?? "")} />

      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      <div className={s.content}>

        {/* ── Список проектов ── */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Проекты</h2>
            {!addingProject && (
              <button className={s.addBtn} type="button" onClick={() => setAddingProject(true)}>
                + Добавить
              </button>
            )}
          </div>

          {addingProject && (
            <AddProjectForm
              onConfirm={handleAdd}
              onCancel={() => setAddingProject(false)}
            />
          )}

          <ProjectList
            projects={projects}
            activeId={activeProject?.id}
            onSelect={handleSelect}
            onRename={handleRename}
            onRemove={handleRemove}
          />

          {projects.length === 0 && !addingProject && (
            <p className={s.empty}>Нет проектов. Создайте первый.</p>
          )}
        </section>

        {/* ── Резервное копирование ── */}
        {activeProject && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Резервная копия</h2>
            </div>
            <div className={s.backupBody}>
              <div className={s.backupRow}>
                <button className={s.backupBtn} type="button" onClick={handleExportZip}>
                  ⬆ Экспорт ZIP
                </button>
                <button
                  className={`${s.backupBtn} ${s.restore}`}
                  type="button"
                  onClick={() => importZipRef.current?.click()}
                >
                  ⬇ Импорт ZIP
                </button>
              </div>
              <p className={s.backupHint}>
                ZIP-архив содержит все записи и фотографии. Рекомендуется для переноса данных между устройствами.
              </p>
              <div className={s.backupRow}>
                <button className={s.backupBtn} type="button" onClick={handleExport}>
                  ⬆ Экспорт JSON
                </button>
                <button
                  className={`${s.backupBtn} ${s.restore}`}
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                >
                  ⬇ Импорт JSON
                </button>
              </div>
              <p className={s.backupHint}>
                JSON — только записи, без фотографий.
              </p>
            </div>
            <input
              ref={importZipRef}
              type="file"
              accept=".zip,application/zip"
              style={{ display: "none" }}
              onChange={handleImportZip}
            />
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleImport}
            />
          </section>
        )}

        {/* ── Суммарные потери по проекту ── */}
        {activeProject && data.length > 0 && (() => {
          const active = data.filter((l) => l.status !== "resolved");
          const totalMethane = active.reduce((sum, l) => sum + (Number(l.Total_Annual_Methane_Loss_m3_y) || 0), 0);
          const totalCO2 = active.reduce((sum, l) => sum + (Number(l.Emissions_t_CO2eq_year) || 0), 0);
          if (totalMethane === 0 && totalCO2 === 0) return null;
          const fmt = (n) => n >= 1000
            ? `${(n / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} тыс.`
            : n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
          return (
            <section className={s.section}>
              <div className={s.sectionHead}>
                <h2 className={s.sectionTitle}>Потери проекта (открытые)</h2>
              </div>
              <div className={s.emissionsGrid}>
                <div className={s.emissionsCard}>
                  <span className={s.emissionsVal}>{fmt(totalMethane)}</span>
                  <span className={s.emissionsUnit}>м³/год</span>
                  <span className={s.emissionsLabel}>Потери газа</span>
                </div>
                <div className={s.emissionsCard}>
                  <span className={s.emissionsVal}>{fmt(totalCO2)}</span>
                  <span className={s.emissionsUnit}>т CO₂-экв/год</span>
                  <span className={s.emissionsLabel}>Выбросы</span>
                </div>
                <div className={s.emissionsCard}>
                  <span className={s.emissionsVal}>{active.length}</span>
                  <span className={s.emissionsUnit}>записей</span>
                  <span className={s.emissionsLabel}>Активных утечек</span>
                </div>
              </div>
            </section>
          );
        })()}

        {/* ── Параметры расчёта ── */}
        {activeProject && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Параметры расчёта</h2>
            </div>
            <div className={s.calcBody}>
              <p className={s.description}>
                Настройки для проекта <strong>{activeProject.name}</strong>
              </p>
              <button
                className={s.editVarsBtn}
                type="button"
                onClick={() => setModalOpen(true)}
              >
                ⚙ Редактировать параметры
              </button>
            </div>
          </section>
        )}

        {/* ── Внешний вид ── */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Внешний вид</h2>
          </div>
          <div className={s.themeRow}>
            <div className={s.themeInfo}>
              <span className={s.themeLabel}>{dark ? "Тёмная тема" : "Светлая тема"}</span>
              <span className={s.themeHint}>{dark ? "Тёмный фон, снижает нагрузку на глаза" : "Светлый фон"}</span>
            </div>
            <button
              className={`${s.themeToggle} ${dark ? s.themeToggleDark : ""}`}
              type="button"
              onClick={toggleTheme}
              aria-label="Переключить тему"
            >
              <span className={s.themeThumb} />
            </button>
          </div>
        </section>

        {/* ── Кэш карты ── */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Кэш карты</h2>
          </div>
          <div className={s.cacheBody}>
            <div className={s.cacheInfo}>
              <span className={s.cacheLabel}>Спутниковые тайлы</span>
              {cacheInfo ? (
                <span className={s.cacheSize}>
                  {cacheInfo.count > 0
                    ? `${cacheInfo.count} тайлов · ~${cacheInfo.sizeMB} МБ`
                    : "Кэш пуст"}
                </span>
              ) : (
                <span className={s.cacheSize}>Загрузка...</span>
              )}
            </div>
            <button
              className={s.cacheBtn}
              type="button"
              onClick={handleClearMapCache}
              disabled={!cacheInfo || cacheInfo.count === 0}
            >
              🗺 Очистить кэш карты
            </button>
          </div>
        </section>

        {/* ── Опасная зона ── */}
        {activeProject && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Опасная зона</h2>
            </div>
            <div className={s.dangerBody}>
              <p className={s.dangerHint}>
                Очистка удаляет все записи об утечках активного проекта. Фото-файлы на устройстве сохранятся.
              </p>
              <button className={s.dangerBtn} type="button" onClick={handleClearDatabase}>
                🗑 Очистить базу данных
              </button>
            </div>
          </section>
        )}

      </div>

      {activeProject && vars && (
        <SettingsModal
          open={modalOpen}
          onClose={handleModalClose}
          variables={vars}
          onSave={handleModalSave}
        />
      )}
    </div>
  );
}
