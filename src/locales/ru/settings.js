export const settings = {
  projectsOfDifferentTypes:
    "Нельзя объединить проекты разных типов: текущий — {{v1}}, импортируемый — {{v2}}.",
  theArchiveDoesNot:
    "В архиве не указан тип проекта. Импорт в существующий проект отменён.",
  theCurrentProjectHas: "У текущего проекта не определён тип. Импорт отменён.",
  importError: "Ошибка импорта",
  zipBackupImportIn: "Идёт импорт ZIP backup, подождите...",
  readingZipBackupPlease: "Идёт чтение ZIP backup, подождите...",
  couldNotReadProject: "Не удалось получить данные проекта из файла",
  projectVImportedV: "Импортирован проект «{{v1}}» ({{v2}} {{v3}})",
  noDataToExport: "Нет данных для экспорта",
  zipBackupExportIn: "Идёт экспорт ZIP backup, подождите...",
  zipSavedToDocuments: "ZIP сохранён в Документы/{{v1}}/",
  zipArchiveDownloadedV: "ZIP-архив скачан ({{v1}} {{v2}})",
  exportError: "Ошибка экспорта",
  couldNotDetermineThe:
    "Не удалось определить тип проекта из файла «{{v1}}». Переименуйте файл, добавив в имя upstream / midstream / downstream.",
  recordData: "данным записей",
  fileName: "имени файла",
  importProject: "Импортировать проект?",
  nameVTypeV:
    "Название: {{v1}}\nТип: {{v2}} ({{v3}})\nЗаписей: {{v4}}\nОпределено по: {{v5}}\n\nБудет создан новый проект.",
  projectVOverwrittenV: "Проект «{{v1}}» перезаписан ({{v2}} {{v3}})",
  mergedIntoVApplied:
    "Объединено с «{{v1}}» (из архива применено: {{v2}} {{v3}})",
  couldNotCreateProject: "Не удалось создать проект",
  copyVCreatedV: "Создана копия «{{v1}}» ({{v2}} {{v3}})",
  anInterruptedImportWas:
    "Обнаружен прерванный импорт. Проверьте данные проекта и повторите импорт из исходного файла.",
  noDataIssuesFound: "Проблем в данных не найдено",
  checkCompleteVIssues: "Проверка завершена: {{v1}} проблем",
  checkError: "Ошибка проверки",
  readingExcelFilePlease: "Идёт чтение Excel, подождите...",
  noImportableRowsFound: "В Excel не найдено строк для импорта",
  projectVImportedV2: "Импортирован проект «{{v1}}» ({{v2}} записей)",
  excelParsedVRecords: "Excel прочитан: {{v1}} записей, фото: {{v2}}",
  excelImportError: "Ошибка импорта Excel",
  excelImportInProgress: "Идёт импорт Excel, подождите...",
  importedVRecordsBut:
    "Импортировано {{v1}} записей, но журнал операции не удалось очистить. Не повторяйте импорт и перезапустите приложение для проверки восстановления.",
  importedFromExcelV: "Импортировано из Excel: {{v1}} записей",
  failedToSaveImport: "Не удалось сохранить импорт",
  projectOverwrittenVRecords:
    "Проект перезаписан ({{v1}} записей), но журнал операции не удалось очистить. Перезапустите приложение для проверки восстановления.",
  projectOverwrittenFromExcel: "Проект перезаписан из Excel ({{v1}} записей)",
  excelWasMergedBut:
    "Excel объединён с проектом, но журнал операции не удалось очистить. Перезапустите приложение для проверки восстановления.",
  excelMergedIntoProject:
    "Excel объединён с проектом: применено {{v1}} записей",
  failedToMergeExcel: "Не удалось объединить Excel",
  copyVCreatedV2: "Создана копия «{{v1}}» ({{v2}} записей)",
  failedToCreateCopy: "Не удалось создать копию",
  cleanupFailed: "Не удалось выполнить очистку",
  switchProject: "Переключить проект?",
  theLeakEntryForm: "Форма добавления утечки будет сброшена.",
  switch: "Переключить",
  projectSwitchedMapCache: "Проект переключён, кэш карты очищен",
  nameSaved: "Название сохранено",
  couldNotRemoveProject: "Не удалось удалить проект «{{v1}}»: {{v2}}",
  projectVDeleted: "Проект «{{v1}}» удалён",
  projectVWasRemoved:
    "Проект «{{v1}}» удалён, но некоторые файлы не удалось очистить",
  projectVCreated: "Проект «{{v1}}» создан",
  couldNotSwitchProject: "Не удалось переключить проект: {{v1}}",
  syncidMustBeAt: "syncId должен содержать минимум 8 символов",
  projectSyncidUpdated: "syncId проекта обновлен",
  couldNotUpdateProject: "Не удалось обновить syncId проекта",
  changeProjectSyncid: "Изменить syncId проекта",
  theCurrentSyncidIs:
    "Текущий syncId показан в поле. Его можно скопировать или заменить для теста синхронизации.",
  save: "Сохранить",
  unknown: "неизвестно",
  oldDeletionHistoryWas:
    "На одном из устройств была очищена старая история удалений. Автоматическое объединение остановлено, чтобы не восстановить удалённые записи. Создайте полный ZIP на актуальном устройстве и замените проект на втором устройстве.",
  projectsOfDifferentTypes2:
    "Нельзя синхронизировать проекты разных типов: текущий — {{v1}}, полученный — {{v2}}.",
  theReceivedArchiveDoes:
    "Полученный архив не содержит тип проекта. Синхронизация отменена.",
  theCurrentProjectHas2:
    "У текущего проекта не определён тип. Синхронизация отменена.",
  noProjectSelected: "Проект не выбран",
  syncCompleteVChanges: "Синхронизация завершена: применено изменений — {{v1}}",
  theQrCodeHas: "Срок действия QR-кода истёк",
  transferCompleteDevicesV: "Передача завершена. Устройств: {{v1}}",
  localSyncError: "Ошибка локальной синхронизации",
  couldNotCreateSession: "Не удалось создать сеанс",
  connectionError: "Ошибка подключения",
  qrCodeError: "Ошибка QR-кода",
  databaseImportedByQr: "База импортирована по QR: «{{v1}}» ({{v2}} записей)",
  qrImportError: "Ошибка импорта по QR",
  import: "Импорт...",
  projectTypes: {
    upstream: "Добыча",
    upstreamHint: "Добыча",
    midstream: "Транспортировка",
    midstreamHint: "Транспортировка и хранение",
    downstream: "Переработка",
    downstreamHint: "Переработка и сбыт",
  },
  selectProjectType: "Выберите тип проекта",
  newProject: "Новый проект",
  projectName: "Название",
  projectNamePlaceholder: "Например: Тенгиз Q1 2026",
  deviceFolder: "Папка на устройстве:",
  projectType: "Тип",
  cancel: "Отмена",
  create: "Создать",
  back: "Назад",
  close: "Закрыть",

  toggleTheme: "Переключить тему",
  toggleLanguageAria: "Переключить язык",
  hiddenFieldsCount: "Скрыто: {{count}}.",

  importWarningLine: "{{sheet}}, строка {{row}}, {{column}}: {{message}}",
  validationWarnings: " Предупреждения валидации: {{count}}.",
  inExcel: "в Excel",
  excelPhotos: "Фото Excel",
  importExcelTitle: "Импортировать Excel?",
  importExcelDescription:
    "Файл: {{fileName}}. Лист: {{sheetName}}. Найдено строк: {{totalRows}}; будет импортировано: {{imported}}; мониторинг: {{monitoring}}; фото: {{photos}}; пропущено: {{skipped}}.{{warnings}}",
  importAction: "Импортировать",

  connectionQr: "QR-код подключения",

  tileCacheSummary: "{{count}} тайлов · ~{{sizeMB}} МБ",
  mapProvider: "Источник карты",
  mapProviderLocalOnly: "Только локальный кэш — внешние запросы отключены",
  mapProviderUnknown: "Не определён",
  mapProviderPrivacyHint:
    "Провайдер получает координаты запрашиваемых тайлов. Для чувствительных объектов используйте корпоративный сервер.",

  photoRequired: "Без фото сохранить нельзя.",
  photoOptional: "Фото можно добавить по желанию.",
  photoRequirements: "Требования к фото",
  photoWhenAdding: "При добавлении утечки",
  photoWhenComponent: "Фото при добавлении компонента",
  componentPhotoRequirementSaved: "Требование фото для компонента сохранено",
  photoWhenMonitoring: "При мониторинге",
  leakPhotoRequirementSaved: "Требование к фото утечки сохранено",
  monitoringPhotoRequirementSaved: "Требование к фото мониторинга сохранено",

  integrityTitle: "Проверка данных",
  integrityDescription:
    "Ищет пропущенные фото, битые ссылки, координаты и дубли ID.",
  integrityChecking: "Проверка...",
  integrityCheck: "Проверить",
  integrityNoIssues: "Проблем не найдено ({{total}} записей)",
  integrityIssues: "Найдено проблем: {{issues}}",
  integrityNoPhoto: "Без фото",
  integrityNoRepairPhoto: "Без фото в ремонте",
  integrityNoAfterPhoto: "Без фото после",
  integrityNoMonitoringPhoto: "Без фото мониторинга",
  integrityBrokenPhotos: "Битые фото",
  integrityNoCoordinates: "Без координат",
  integrityDuplicateLeakId: "Дубли leak_id",

  activeProject: "Активный проект",
  selectProject: "Выбрать проект",
  notCreatedYet: "еще не создан",
  changeSyncId: "Изменить syncId",
  rename: "Переименовать",
  deleteConfirm: "Удалить?",
  deleteProject: "Удалить проект",

  enterSerialNumber: "Укажите серийный номер оборудования",
  gases: {
    methane: "Метан (CH₄)",
    ethane: "Этан (C₂H₆)",
    propane: "Пропан (C₃H₈)",
    butane: "Бутан (C₄H₁₀)",
  },

  title: "Настройки",
  appearanceTitle: "Внешний вид",
  themeLabelDark: "Тёмная тема",
  themeLabelLight: "Светлая тема",
  themeHintDark: "Тёмный фон, снижает нагрузку на глаза",
  themeHintLight: "Светлый фон",
  languageLabel: "Язык",
  languageHint: "Текущий язык интерфейса страницы добавления утечки: Русский",
  languageToggleLabel: "EN",

  projects: "Проекты",
  addProject: "Добавить",
  noProjects: "Нет проектов. Создайте первый.",

  calculationParameters: "Параметры расчёта",
  editParameters: "Редактировать параметры",

  fieldsAndExcel: "Поля формы и Excel",
  fieldsDescription:
    "Скройте неиспользуемые поля — они исчезнут из формы и столбцов экспорта.",
  hiddenFields: "Скрыто",
  configureFields: "Настроить поля",

  excelExportMode: "Журнал мониторинга в Excel",
  excelExportFull: "Полная история",
  excelExportFullHint:
    "Экспортировать каждую проверку, включая повторные записи одного обхода.",
  excelExportLatest: "Последняя запись в обходе",
  excelExportLatestHint:
    "Для каждого тега экспортировать только последнюю проверку в каждом обходе.",

  backup: "Резервная копия",
  exportZip: "Экспорт ZIP",
  importZip: "Импорт ZIP",
  importExcel: "Импорт Excel",
  importExcelLoading: "Импорт...",
  backupHint:
    "Экспорт ZIP создаёт полную резервную копию проекта. Импорт ZIP восстанавливает такую копию. Импорт Excel принимает XLSX или Excel ZIP-архив с таблицами, историей мониторинга и фотографиями.",

  mapCache: "Кэш карты",
  satelliteTiles: "Спутниковые тайлы",
  cacheEmpty: "Кэш пуст",
  loading: "Загрузка...",
  clearMapCache: "Очистить офлайн-кэш карты",

  dangerZone: "Опасная зона",
  dangerHint:
    "Очистка удаляет все записи об утечках активного проекта и связанные с ними фото.",
  clearDatabase: "Очистить базу данных",

  notifications: {
    parametersSaved: "Параметры расчёта сохранены",
    changesCanceled: "Изменения отменены",
    cacheCleared:
      "Офлайн-кэш карты очищен. Уже открытые тайлы могут отображаться до обновления карты.",
    databaseCleared: "База данных очищена",
    allFieldsActive: "Все поля активны",
    hiddenFieldsCount: "Скрыто полей: {{count}}",
    excelExportModeSaved: "Режим Excel-экспорта сохранён",
  },

  dialogs: {
    clearMapCache:
      "Очистить офлайн-кэш карты? Это освободит память устройства. Уже открытые тайлы могут оставаться на экране до обновления карты.",
    clearDatabase:
      "Удалить все записи об утечках?\n\nЭто действие необратимо. Фото-файлы сохранятся на устройстве.",
  },
};
