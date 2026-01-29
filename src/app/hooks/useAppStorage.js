import { useEffect, useCallback } from "react";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import {
  PHOTOS_DIR,
  getProjectDataKey,
  getProjectDataFile,
  getProjectMobileDir,
} from "../../constants/storage.constants";
import { useProject } from "../settings/ProjectContext";

export function useAppStorage(setData) {
  const { project } = useProject();

  const loadWebProjectData = useCallback(() => {
    const storageKey = getProjectDataKey(project);
    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        const projectData = JSON.parse(saved);
        setData(projectData);
        alert(
          `📁 [WEB] Загружены данные проекта "${project}": ${projectData.length} записей`,
        );
      } catch (e) {
        console.error("Ошибка чтения localStorage", e);
        setData([]);
      }
    } else {
      setData([]);
      alert(`📁 [WEB] Проект "${project}" пока не содержит данных`);
    }
  }, [project, setData]);

  const loadMobileProjectData = useCallback(async () => {
    try {
      const dataFile = getProjectDataFile(project);
      const result = await Filesystem.readFile({
        path: dataFile,
        directory: Directory.Documents,
        encoding: "utf8",
      });

      const projectData = JSON.parse(result.data);
      setData(projectData);
      alert(
        `📱 [MOBILE] Загружены данные проекта "${project}": ${projectData.length} записей`,
      );
    } catch (e) {
      // Файл не найден - это нормально для нового проекта
      setData([]);
      alert(`📱 [MOBILE] Проект "${project}" пока не содержит данных`);
    }
  }, [project, setData]);

  const loadProjectData = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      await loadMobileProjectData();
    } else {
      loadWebProjectData();
    }
  }, [loadMobileProjectData, loadWebProjectData]);

  const initializeDirectories = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      // Создаём папку для фотографий
      await Filesystem.mkdir({
        path: PHOTOS_DIR,
        directory: Directory.Documents,
        recursive: true,
      }).catch(() => {});

      // Создаём папку для проекта
      const projectDir = getProjectMobileDir(project);
      await Filesystem.mkdir({
        path: projectDir,
        directory: Directory.Documents,
        recursive: true,
      }).catch(() => {});
    } catch (e) {
      console.error("Ошибка инициализации директорий", e);
    }
  }, [project]);

  // Загружаем данные при загрузке приложения или смене проекта
  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  // Создаём папки для фотографий и проектов
  useEffect(() => {
    initializeDirectories();
  }, [initializeDirectories]);

  const clearDatabase = async () => {
    if (!window.confirm("Удалить базу данных для этого проекта?")) return;

    if (Capacitor.isNativePlatform()) {
      await clearMobileDatabase();
    } else {
      clearWebDatabase();
    }
  };

  const clearWebDatabase = () => {
    const storageKey = getProjectDataKey(project);
    localStorage.removeItem(storageKey);
    setData([]);
    alert(`🗑 [WEB] Очищены данные проекта "${project}"`);
  };

  const clearMobileDatabase = async () => {
    try {
      const dataFile = getProjectDataFile(project);
      await Filesystem.deleteFile({
        path: dataFile,
        directory: Directory.Documents,
      });
      setData([]);
      alert(`🗑 [MOBILE] Очищены данные проекта "${project}"`);
    } catch (e) {
      console.warn("Error clearing mobile database:", e);
    }
  };

  return { clearDatabase };
}
