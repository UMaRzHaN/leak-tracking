const APP_PREFIX = "app";
const VERSION = "v1";

/** Returns the private filesystem directory path for a project's mobile files. */
export function getProjectMobileDir(project) {
  return `projects/${project?.id ?? "unknown"}`;
}

export const STORAGE_KEYS = {
  /* =========================
     GLOBAL
  ========================= */
  UI: `${APP_PREFIX}:ui_${VERSION}`,

  /* =========================
     MULTI-PROJECT (новая схема)
  ========================= */
  PROJECTS_LIST: `${APP_PREFIX}:projects_${VERSION}`,
  PROJECTS_LIST_RECOVERY: `${APP_PREFIX}:projects_recovery_${VERSION}`,
  ACTIVE_PROJECT_ID: `${APP_PREFIX}:active_id_${VERSION}`,

  /* =========================
     PROJECT-SCOPED (keyed by project.id)
  ========================= */
  PROJECT_VARS: (projectId) => `${APP_PREFIX}:${projectId}:vars_${VERSION}`,
  PROJECT_DATA: (projectId) => `${APP_PREFIX}:${projectId}:data_${VERSION}`,
  PROJECT_HIDDEN_FIELDS: (projectId) =>
    `${APP_PREFIX}:${projectId}:hidden_fields_${VERSION}`,
  PROJECT_EXCEL_EXPORT_MODE: (projectId) =>
    `${APP_PREFIX}:${projectId}:excel_export_mode_${VERSION}`,
  PROJECT_MONITORING_SETTINGS: (projectId) =>
    `${APP_PREFIX}:${projectId}:monitoring_settings_${VERSION}`,
  PROJECT_PHOTO_REQUIREMENTS: (projectId) =>
    `${APP_PREFIX}:${projectId}:photo_requirements_${VERSION}`,
  PROJECT_SYNC_STATE: (projectId) =>
    `${APP_PREFIX}:${projectId}:sync_state_${VERSION}`,
  PROJECT_FILTERS: (projectId) =>
    `${APP_PREFIX}:${projectId}:filters_${VERSION}`,
  PROJECT_VARS_UPDATED_AT: (projectId) =>
    `${APP_PREFIX}:${projectId}:vars_updated_at_${VERSION}`,
  PROJECT_SETTINGS_UPDATED_AT: (projectId) =>
    `${APP_PREFIX}:${projectId}:settings_updated_at_${VERSION}`,

  /* =========================
     LEGACY (migration only — не использовать в новом коде)
  ========================= */
  _LEGACY_PROJECT_CONFIG: `${APP_PREFIX}:project_config_${VERSION}`,
  _LEGACY_ACTIVE_PROJECT: `${APP_PREFIX}:active_project_${VERSION}`,
  _LEGACY_PROJECT_SETTINGS: (id) => `${APP_PREFIX}:${id}:settings_${VERSION}`,
};
