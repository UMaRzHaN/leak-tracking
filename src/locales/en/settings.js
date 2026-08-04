export const settings = {
  projectTypes: {
    upstream: "Upstream",
    upstreamHint: "Production",
    midstream: "Midstream",
    midstreamHint: "Transport and storage",
    downstream: "Downstream",
    downstreamHint: "Processing and distribution",
  },
  selectProjectType: "Select a project type",
  newProject: "New project",
  projectName: "Name",
  projectNamePlaceholder: "Example: Tengiz Q1 2026",
  deviceFolder: "Device folder:",
  projectType: "Type",
  cancel: "Cancel",
  create: "Create",
  back: "Back",
  close: "Close",

  toggleTheme: "Toggle theme",
  toggleLanguageAria: "Toggle language",
  hiddenFieldsCount: "Hidden: {{count}}.",

  importWarningLine: "{{sheet}}, row {{row}}, {{column}}: {{message}}",
  validationWarnings: " Validation warnings: {{count}}.",
  inExcel: "in Excel",
  excelPhotos: "Excel photos",
  importExcelTitle: "Import Excel?",
  importExcelDescription:
    "File: {{fileName}}. Sheet: {{sheetName}}. Rows found: {{totalRows}}; to import: {{imported}}; monitoring: {{monitoring}}; photos: {{photos}}; skipped: {{skipped}}.{{warnings}}",
  importAction: "Import",

  connectionQr: "Connection QR code",

  tileCacheSummary: "{{count}} tiles · ~{{sizeMB}} MB",
  mapProvider: "Map provider",
  mapProviderLocalOnly: "Local cache only — external requests disabled",
  mapProviderUnknown: "Not configured",
  mapProviderPrivacyHint:
    "The provider receives requested tile coordinates. Use a corporate server for sensitive sites.",

  photoRequired: "Cannot save without a photo.",
  photoOptional: "The photo is optional.",
  photoRequirements: "Photo requirements",
  photoWhenAdding: "When adding a leak",
  photoWhenMonitoring: "During monitoring",
  leakPhotoRequirementSaved: "Leak photo requirement saved",
  monitoringPhotoRequirementSaved: "Monitoring photo requirement saved",

  integrityTitle: "Data Check",
  integrityDescription:
    "Finds missing photos, broken links, coordinates, and duplicate IDs.",
  integrityChecking: "Checking...",
  integrityCheck: "Check",
  integrityNoIssues: "No issues found ({{total}} records)",
  integrityIssues: "Issues found: {{issues}}",
  integrityNoPhoto: "No photo",
  integrityNoRepairPhoto: "No repair photo",
  integrityNoAfterPhoto: "No after photo",
  integrityNoMonitoringPhoto: "No monitoring photo",
  integrityBrokenPhotos: "Broken photos",
  integrityNoCoordinates: "No coordinates",
  integrityDuplicateLeakId: "Duplicate leak_id",

  activeProject: "Active project",
  selectProject: "Select project",
  notCreatedYet: "not created yet",
  changeSyncId: "Change syncId",
  rename: "Rename",
  deleteConfirm: "Delete?",
  deleteProject: "Delete project",

  enterSerialNumber: "Enter equipment serial number",
  gases: {
    methane: "Methane (CH₄)",
    ethane: "Ethane (C₂H₆)",
    propane: "Propane (C₃H₈)",
    butane: "Butane (C₄H₁₀)",
  },

  title: "Settings",

  appearanceTitle: "Appearance",
  themeLabelDark: "Dark theme",
  themeLabelLight: "Light theme",
  themeHintDark: "Dark background is easier on the eyes",
  themeHintLight: "Light background",

  languageLabel: "Language",
  languageHint: "Current leak entry page language: English",
  languageToggleLabel: "RU",
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
