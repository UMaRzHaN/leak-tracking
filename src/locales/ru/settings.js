export const settings = {
  title: "Настройки",
  appearanceTitle: "Внешний вид",
  themeLabelDark: "Тёмная тема",
  themeLabelLight: "Светлая тема",
  themeHintDark: "Тёмный фон, снижает нагрузку на глаза",
  themeHintLight: "Светлый фон",
  languageLabel: "Язык",
  languageHintRu: "Текущий язык интерфейса страницы добавления утечки: Русский",
  toggleButtonEn: "EN",

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
