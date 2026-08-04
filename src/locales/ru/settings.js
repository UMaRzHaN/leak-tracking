export const settings = {
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
  projectSettings: "Настройки для проекта",
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
