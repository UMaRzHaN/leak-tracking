export const settings = {
  projectsOfDifferentTypes:
    "Projects of different types cannot be combined: current — {{v1}}, imported — {{v2}}.",
  theArchiveDoesNot:
    "The archive does not specify a project type. Import into the existing project was cancelled.",
  theCurrentProjectHas:
    "The current project has no defined type. Import was cancelled.",
  importError: "Import error",
  zipBackupImportIn: "ZIP backup import in progress, please wait...",
  readingZipBackupPlease: "Reading ZIP backup, please wait...",
  couldNotReadProject: "Could not read project data from file",
  projectVImportedV: 'Project "{{v1}}" imported ({{v2}} {{v3}})',
  noDataToExport: "No data to export",
  zipBackupExportIn: "ZIP backup export in progress, please wait...",
  zipSavedToDocuments: "ZIP saved to Documents/{{v1}}/",
  zipArchiveDownloadedV: "ZIP archive downloaded ({{v1}} {{v2}})",
  exportError: "Export error",
  couldNotDetermineThe:
    'Could not determine the project type from file "{{v1}}". Rename the file to include upstream / midstream / downstream.',
  recordData: "record data",
  fileName: "file name",
  importProject: "Import project?",
  nameVTypeV:
    "Name: {{v1}}\nType: {{v2}} ({{v3}})\nRecords: {{v4}}\nDetected from: {{v5}}\n\nA new project will be created.",
  projectVOverwrittenV: 'Project "{{v1}}" overwritten ({{v2}} {{v3}})',
  mergedIntoVApplied:
    'Merged into "{{v1}}" (applied from archive: {{v2}} {{v3}})',
  couldNotCreateProject: "Could not create project",
  copyVCreatedV: 'Copy "{{v1}}" created ({{v2}} {{v3}})',
  anInterruptedImportWas:
    "An interrupted import was detected. Verify the project data and retry from the source file.",
  noDataIssuesFound: "No data issues found",
  checkCompleteVIssues: "Check complete: {{v1}} issues",
  checkError: "Check error",
  readingExcelFilePlease: "Reading Excel file, please wait...",
  noImportableRowsFound: "No importable rows found in Excel",
  projectVImportedV2: 'Project "{{v1}}" imported ({{v2}} records)',
  excelParsedVRecords: "Excel parsed: {{v1}} records, photos: {{v2}}",
  excelSheetEdits: "Edits from the sheet taken: {{v1}} changed, {{v2}} added.",
  excelImportError: "Excel import error",
  excelImportInProgress: "Excel import in progress, please wait...",
  importedVRecordsBut:
    "Imported {{v1}} records, but the operation journal could not be cleared. Do not repeat the import; restart the app to verify recovery.",
  importedFromExcelV: "Imported from Excel: {{v1}} records",
  failedToSaveImport: "Failed to save import",
  projectOverwrittenVRecords:
    "Project overwritten ({{v1}} records), but the operation journal could not be cleared. Restart the app to verify recovery.",
  projectOverwrittenFromExcel:
    "Project overwritten from Excel ({{v1}} records)",
  excelWasMergedBut:
    "Excel was merged, but the operation journal could not be cleared. Restart the app to verify recovery.",
  excelMergedIntoProject: "Excel merged into project: {{v1}} records applied",
  failedToMergeExcel: "Failed to merge Excel",
  copyVCreatedV2: 'Copy "{{v1}}" created ({{v2}} records)',
  failedToCreateCopy: "Failed to create copy",
  cleanupFailed: "Cleanup failed",
  switchProject: "Switch project?",
  theLeakEntryForm: "The leak entry form will be reset.",
  switch: "Switch",
  projectSwitchedMapCache: "Project switched, map cache cleared",
  nameSaved: "Name saved",
  couldNotRemoveProject: 'Could not remove project "{{v1}}": {{v2}}',
  projectVDeleted: 'Project "{{v1}}" deleted',
  projectVWasRemoved:
    'Project "{{v1}}" was removed, but some files could not be cleaned up',
  projectVCreated: 'Project "{{v1}}" created',
  couldNotSwitchProject: "Could not switch project: {{v1}}",
  syncidMustBeAt: "syncId must be at least 8 characters",
  projectSyncidUpdated: "Project syncId updated",
  couldNotUpdateProject: "Could not update project syncId",
  changeProjectSyncid: "Change project syncId",
  theCurrentSyncidIs:
    "The current syncId is shown in the field. You can copy it or replace it for sync testing.",
  save: "Save",
  unknown: "unknown",
  oldDeletionHistoryWas:
    "Old deletion history was compacted on one device. Automatic merge was stopped to prevent deleted records from being restored. Export a full ZIP from the current device and replace the project on the other device.",
  projectsOfDifferentTypes2:
    "Projects of different types cannot be synchronized: current — {{v1}}, received — {{v2}}.",
  theReceivedArchiveDoes:
    "The received archive does not contain a project type. Synchronization was cancelled.",
  theCurrentProjectHas2:
    "The current project has no defined type. Synchronization was cancelled.",
  noProjectSelected: "No project selected",
  syncCompleteVChanges: "Sync complete: {{v1}} changes applied",
  theQrCodeHas: "The QR code has expired",
  transferCompleteDevicesV: "Transfer complete. Devices: {{v1}}",
  localSyncError: "Local sync error",
  couldNotCreateSession: "Could not create session",
  connectionError: "Connection error",
  qrCodeError: "QR code error",
  databaseImportedByQr: 'Database imported by QR: "{{v1}}" ({{v2}} records)',
  import: "Import...",
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
  photoWhenComponent: "Photo when adding a component",
  componentPhotoRequirementSaved: "Component photo requirement saved",
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
  integrityMissingComponent: "Linked component card is gone",

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

  deviceStorage: "Free on device",
  deviceStorageFree: "{{value}} {{unit}}",
  deviceStorageUnknown: "Could not determine",
  storageUnit: { MB: "MB", GB: "GB" },

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
  exportZipLoading: "Export...",
  importExcel: "Import Excel",
  importExcelLoading: "Import...",
  backupHint:
    "Export ZIP creates a complete project backup. Import accepts any of the three — a ZIP backup, an XLSX or Excel ZIP archive, an inventory archive — and works out on its own what the file is and where it belongs.",
  importFile: "Import",
  importUnknownFile:
    'Could not tell what "{{v1}}" is. Expected an XLSX, a ZIP backup or an inventory archive.',
  inventoryImportInProgress: "Reading the inventory...",
  inventoryImportEmpty: "No components to import were found in the file.",
  inventoryImported:
    "Inventory: {{v1}} added, {{v2}} updated, {{v3}} number(s) colliding.",
  inventoryRowsShadowed:
    "{{v1}} row(s) were not merged — those numbers already exist on the device, and a card written on site outweighs a spreadsheet row.",
  inventoryImportedIntoNewProject:
    'A component registry lives in its own project — created "{{v1}}" and merged {{v2}} card(s) into it.',
  inventoryImportNoRegistry:
    'Only "{{v1}}" projects keep a component registry. Create one and merge the inventory there — on the first screen an inventory archive creates the project by itself.',
  inventoryImportError: "Inventory import error",

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
