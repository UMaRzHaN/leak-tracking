import { PROJECT_META } from "../configs/projects";

// Функция для получения ключа хранилища для конкретного проекта (WEB)
export const getProjectDataKey = (projectId) =>
  `leaks_database:${projectId}:v1`;

// Функция для получения пути сохранения данных на мобильных устройствах
export const getProjectMobileDir = (projectId = "midstream") => {
  const folder = PROJECT_META[projectId]?.folder || projectId;
  return `LeakReports/${folder}`;
};

// Функция для получения пути файла с данными проекта на мобильных устройствах
export const getProjectDataFile = (projectId) => {
  const dir = getProjectMobileDir(projectId);
  return `${dir}/data/data.json`;
};

// Для обратной совместимости
export const STORAGE_KEY = "leaks_database_v1";
