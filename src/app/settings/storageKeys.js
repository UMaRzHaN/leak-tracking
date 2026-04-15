const APP_PREFIX = "app";
const VERSION = "v1";

export const STORAGE_KEYS = {
  /* =========================
     GLOBAL
  ========================= */
  UI: `${APP_PREFIX}:ui_${VERSION}`,

  /* =========================
     MULTI-PROJECT (новая схема)
  ========================= */
  PROJECTS_LIST: `${APP_PREFIX}:projects_${VERSION}`,
  ACTIVE_PROJECT_ID: `${APP_PREFIX}:active_id_${VERSION}`,

  /* =========================
     PROJECT-SCOPED (keyed by project.id)
  ========================= */
  PROJECT_VARS: (projectId) => `${APP_PREFIX}:${projectId}:vars_${VERSION}`,
  PROJECT_DATA: (projectId) => `${APP_PREFIX}:${projectId}:data_${VERSION}`,

  /* =========================
     LEGACY (migration only — не использовать в новом коде)
  ========================= */
  _LEGACY_PROJECT_CONFIG: `${APP_PREFIX}:project_config_${VERSION}`,
  _LEGACY_ACTIVE_PROJECT: `${APP_PREFIX}:active_project_${VERSION}`,
  _LEGACY_PROJECT_SETTINGS: (id) => `${APP_PREFIX}:${id}:settings_${VERSION}`,
};
