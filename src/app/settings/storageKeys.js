const APP_PREFIX = "app";
const VERSION = "v1";

export const STORAGE_KEYS = {
  /* =========================
     GLOBAL
  ========================= */
  ACTIVE_PROJECT: `${APP_PREFIX}:active_project_${VERSION}`,
  PROJECT_CONFIG: `${APP_PREFIX}:project_config_${VERSION}`,
  UI: `${APP_PREFIX}:ui_${VERSION}`,

  /* =========================
     PROJECT-SCOPED
  ========================= */
  PROJECT_SETTINGS: (projectId) => {
    if (!projectId) {
      throw new Error("PROJECT_SETTINGS: projectId is required");
    }
    return `${APP_PREFIX}:${projectId}:settings_${VERSION}`;
  },

  PROJECT_DATA: (projectId) => {
    if (!projectId) {
      throw new Error("PROJECT_DATA: projectId is required");
    }
    return `${APP_PREFIX}:${projectId}:data_${VERSION}`;
  },
};
