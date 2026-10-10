export const settings = {
  repairRounds: {
    title: "Ремонты",
    allowNew: "Новые обходы ремонтов",
    allowedHint: "Можно начать новый обход ремонтов кнопкой «Новый обход».",
    lockedHint:
      "Новый обход ремонтов не начать — проверки идут в текущем. Защита от случайного нажатия.",
    allowFinish: "Завершение обходов ремонтов",
    finishAllowedHint:
      "Обход можно завершить кнопкой «Завершить обход», когда все ремонты проверены.",
    finishLockedHint: "Кнопки «Завершить обход» нет — обход остаётся открытым.",
    allowMerge: "Объединение обходов ремонтов",
    mergeAllowedHint:
      "Ошибочно начатый обход можно влить в предыдущий ссылкой «Объединить с № N».",
    mergeLockedHint: "Ссылки «Объединить с № N» нет — обходы не сливаются.",
  },
  reconcile: {
    title: "Инвентаризация",
    allowNew: "Новые сверки",
    allowedHint: "Можно начать новую сверку кнопкой «Новая сверка».",
    lockedHint:
      "Новую сверку не начать — компоненты сверяются в текущей. Защита от случайного нажатия.",
    allowFinish: "Завершение сверок",
    finishAllowedHint:
      "Сверку можно завершить кнопкой «Завершить сверку», когда всё сверено.",
    finishLockedHint:
      "Кнопки «Завершить сверку» нет — сверка остаётся открытой.",
    allowMerge: "Объединение сверок",
    mergeAllowedHint:
      "Ошибочно начатую сверку можно влить в предыдущую ссылкой «Объединить с № N».",
    mergeLockedHint: "Ссылки «Объединить с № N» нет — сверки не сливаются.",
  },
  rounds: {
    title: "Мониторинг",
    allowNew: "Новые обходы",
    allowedHint: "Можно начать новый обход кнопкой «Новый обход».",
    lockedHint:
      "Новый обход не начать — проверки идут только в текущем. Защита от случайного нажатия.",
    allowFinish: "Завершение обходов",
    finishAllowedHint:
      "Обход можно завершить кнопкой «Завершить обход», когда все теги проверены.",
    finishLockedHint:
      "Кнопки «Завершить обход» нет — обход остаётся открытым. Защита от случайного нажатия.",
    allowMerge: "Объединение обходов",
    mergeAllowedHint:
      "Ошибочно начатый обход можно влить в предыдущий ссылкой «Объединить с № N».",
    mergeLockedHint:
      "Ссылки «Объединить с № N» нет — обходы не сливаются. Защита от случайного нажатия.",
    saved: "Настройка обходов сохранена",
    disabled: "Новые обходы выключены в настройках проекта",
  },
  objects: {
    group: "Проект",
    name: "Название",
    caption: "Настройки проекта",
    title: "Объекты и кусты",
    count: "объектов: {{count}}",
    search: "Поиск объекта",
    summary: "Объектов: {{objects}} · записей: {{points}}",
    byName: "По алфавиту",
    byCount: "По числу записей",
    points: "записей: {{count}}",
    empty: "Объектов пока нет",
    hint: "Объект появляется вместе с первой записью или карточкой на нём.",
  },
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
  excelSheetEdits:
    "Правки из таблицы приняты: изменено {{v1}}, дописано {{v2}}.",
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
  hostStoppedAuthLimit:
    "Сеанс остановлен: слишком много неверных кодов подключения. Создайте новый QR-код.",
  hostStoppedError:
    "Сеанс синхронизации прервался из-за ошибки. Создайте новый QR-код.",
  localSyncError: "Ошибка локальной синхронизации",
  couldNotCreateSession: "Не удалось создать сеанс",
  connectionError: "Ошибка подключения",
  qrCodeError: "Ошибка QR-кода",
  databaseImportedByQr: "База импортирована по QR: «{{v1}}» ({{v2}} записей)",
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
  photoWhenRepair: "При приёмке ремонта",
  repairPhotoRequirementSaved: "Требование к фото ремонта сохранено",
  photoWhenReconcile: "При сверке компонентов",
  reconcilePhotoRequirementSaved: "Требование к фото сверки сохранено",
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
  integrityMissingComponent: "Карточки компонента нет в реестре",

  activeProject: "Активный проект",
  selectProject: "Выбрать проект",
  notCreatedYet: "еще не создан",
  changeSyncId: "Изменить syncId",
  rename: "Переименовать",
  deleteConfirm: "Удалить?",
  deleteProject: "Удалить проект",
  folder: "Папка",
  change: "Изменить",
  deleteProjectTitle: "Удалить проект «{{name}}»?",
  deleteProjectDescription:
    "Записи, фото и настройки проекта удалятся с этого устройства. Отменить это нельзя — сначала сохраните резервную копию из меню.",

  enterSerialNumber: "Укажите серийный номер оборудования",
  gases: {
    methane: "Метан (CH₄)",
    ethane: "Этан (C₂H₆)",
    propane: "Пропан (C₃H₈)",
    butane: "Бутан (C₄H₁₀)",
  },

  title: "Настройки",
  deviceStorage: "Свободно на устройстве",
  deviceStorageFree: "{{value}} {{unit}}",
  deviceStorageUnknown: "Не удалось определить",
  storageUnit: { MB: "МБ", GB: "ГБ" },

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

  fieldsLeaks: "Утечки",
  fieldsRegistry: "Реестр",
  componentFieldsDescription:
    "Скрытые поля исчезнут из формы реестра и из столбцов его выгрузки. Список свой — поля утечки он не трогает.",

  excelExportMode: "Журнал мониторинга в Excel",
  excelExportFull: "Полная история",
  excelExportFullHint:
    "Экспортировать каждую проверку, включая повторные записи одного обхода.",
  excelExportLatest: "Последняя запись в обходе",
  excelExportLatestHint:
    "Для каждого тега экспортировать только последнюю проверку в каждом обходе.",

  backup: "Резервная копия",
  exportZip: "Экспорт ZIP",
  exportZipLoading: "Экспорт...",
  importExcel: "Импорт Excel",
  importExcelLoading: "Импорт...",
  backupHint:
    "Экспорт ZIP создаёт полную резервную копию проекта. Импорт принимает любой из трёх файлов — ZIP-бэкап, XLSX или Excel ZIP-архив, архив инвентаризации — и сам определяет, что это и куда его класть.",
  importFile: "Импорт",
  importUnknownFile:
    "Не удалось понять, что за файл «{{v1}}». Ожидается XLSX, ZIP-бэкап или архив инвентаризации.",
  inventoryImportInProgress: "Читаем инвентаризацию...",
  inventoryImportEmpty: "В файле не нашлось компонентов для импорта.",
  inventoryImported:
    "Инвентаризация: добавлено {{v1}}, обновлено {{v2}}, совпавших номеров {{v3}}.",
  inventoryImportedRemovedAndSchemas:
    "Инвентаризация: удалено карточек {{v1}}, восстановлено чертежей {{v2}}.",
  inventoryRowsShadowed:
    "Строк не влилось: {{v1}} — такие номера уже заведены на устройстве, карточка с площадки важнее строки таблицы.",
  inventoryImportedIntoNewProject:
    "Реестр компонентов ведётся отдельным проектом — завели «{{v1}}» и влили в него {{v2}} карточек.",
  inventoryImportNoRegistry:
    "Реестр компонентов ведётся только в проектах типа «{{v1}}». Заведите такой проект и влейте инвентаризацию в него — на первом экране архив инвентаризации сам создаёт проект.",
  bundledInventoryNoRegistry:
    "Инвентаризация из архива не загружена: у проектов этого типа реестра компонентов нет.",
  inventoryImportError: "Ошибка импорта инвентаризации",

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

  voice: {
    title: "Поправки голосового ввода",
    hint: "Распознаватель ошибается по-своему на каждом объекте. Впишите, что он слышит и чем это заменить, — поправка применится к распознанной фразе целиком и уедет вместе с архивом ко всей бригаде.",
    heard: "Слышит",
    heardPlaceholder: "место рождения",
    written: "Записать как",
    writtenPlaceholder: "месторождение",
    add: "Добавить поправку",
    empty: "Поправок пока нет",
    remove: "Удалить поправку «{{from}}»",
    saved: "Поправки сохранены",
  },
};
