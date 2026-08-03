export const settings = {
  title: "Settings",

  appearanceTitle: "Appearance",
  themeLabelDark: "Dark theme",
  themeLabelLight: "Light theme",
  themeHintDark: "Dark background is easier on the eyes",
  themeHintLight: "Light background",

  languageLabel: "Language",
  languageHintEn: "Current leak entry page language: English",
  toggleButtonRu: "RU",
  projects: "Projects",
  addProject: "Add",
  noProjects: "No projects yet. Create your first one.",

  calculationParameters: "Calculation Parameters",
  projectSettings: "Settings for project",
  editParameters: "Edit Parameters",

  fieldsAndExcel: "Form Fields and Excel",
  fieldsDescription:
    "Hide unused fields — they will disappear from the form and export columns.",
  hiddenFields: "Hidden",
  configureFields: "Configure Fields",

  excelExportMode: "Monitoring Log in Excel",
  excelExportFull: "Full History",
  excelExportFullHint:
    "Export every check, including repeated records from the same round.",
  excelExportLatest: "Latest Record per Round",
  excelExportLatestHint:
    "Export only the latest check for each tag in every round.",

  backup: "Backup",
  exportZip: "Export ZIP",
  importZip: "Import ZIP",
  importExcel: "Import Excel",
  importExcelLoading: "Import...",
  backupHint:
    "Export ZIP creates a complete project backup. Import ZIP restores that backup. Import Excel accepts an XLSX or Excel ZIP archive with tables, monitoring history, and photos.",

  mapCache: "Map Cache",
  satelliteTiles: "Satellite Tiles",
  cacheEmpty: "Cache is empty",
  loading: "Loading...",
  clearMapCache: "Clear Offline Map Cache",

  dangerZone: "Danger Zone",
  dangerHint:
    "Clearing removes all leak records from the active project and their associated photos.",
  clearDatabase: "Clear Database",

  notifications: {
    parametersSaved: "Calculation parameters saved",
    changesCanceled: "Changes cancelled",
    cacheCleared:
      "Offline map cache cleared. Already visible tiles may remain until the map refreshes.",
    databaseCleared: "Database cleared",
    allFieldsActive: "All fields are active",
    hiddenFieldsCount: "Hidden fields: {{count}}",
    excelExportModeSaved: "Excel export mode saved",
  },

  dialogs: {
    clearMapCache:
      "Clear offline map cache? This frees device storage. Already visible tiles may remain until the map refreshes.",
    clearDatabase:
      "Delete all leak records?\n\nThis action cannot be undone. Photo files will remain on the device.",
  },
};
