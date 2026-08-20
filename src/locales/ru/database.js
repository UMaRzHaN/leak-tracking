export const database = {
  bulkRecalcTitle: "Массовый пересчёт",
  bulkRecalcDescription:
    "Параметры первой выбранной утечки будут применены к {{count}} записям.",
  apply: "Применить",

  changeSortOrder: "Изменить порядок сортировки",
  dateAsc: "дата ↑",
  dateDesc: "дата ↓",
  clearAll: "Снять всё",
  selectAll: "Выбрать всё",
  exportZip: "Экспорт в Excel + фото (ZIP)",
  exporting: "Экспорт...",
  exportInProgress: "Идёт экспорт, подождите...",
  clearSelection: "Снять выбор",
  check: "Проверить",
  editCalcParamsForSelected: "Изменить параметры расчёта для выбранных",
  calcParams: "Параметры расчёта",

  notSpecified: "Не указано",
  radiusKm: "км",
  radiusM: "м",
  searchPlaceholder: "Бирка, место, объект, описание, проверяющий...",
  searchLeaks: "Поиск утечек",
  clearSearch: "Очистить поиск",
  filters: "Фильтры",
  status: "Статус",
  priority: "Приоритет",
  all: "Все",
  nearbyRadius: " • в радиусе {{radius}} м",

  // Именительный падеж, для счётчика найденного: «1 запись», «2 записи».
  // Формы выбирает Intl.PluralRules, поэтому присутствовать должна каждая,
  // которую язык умеет выбрать — оттого английский и повторяется.
  records: {
    one: "запись",
    few: "записи",
    many: "записей",
    other: "записей",
  },

  empty: {
    nothingFound: "Ничего не найдено",
    noNearby: "Нет утечек в радиусе {{radius}} м",
    noRecords: "Записей нет",
  },
  selectedOf: "{{selected}} выбрано из {{visible}}",
  nearMe: "Рядом со мной",

  // Names of the location field a project type uses; which one applies is
  // decided by the project config, not by language.
  locationLabels: {
    subdivision: "Подразделение",
    field: "УМГ",
    district: "Район",
    deposit: "Месторождение",
    station: "Компрессорная станция",
    locality: "Населённый пункт",
    location: "Локация",
    address: "Адрес",
  },

  fillUserName: "Заполните имя пользователя в профиле",
  paramsAlreadyApplied: "Выбранные параметры уже применены",
  paramsUpdated: "Параметры и расчёты обновлены: {{changed}}",
  paramsUpdateFailed: "Не удалось обновить параметры: {{message}}",

  bulk: {
    statusChanged: "Статус изменён у {{count}} {{records}}",
    resolved: "Устранено {{count}} {{records}}",
    saveError: "Ошибка сохранения: {{message}}",
    // Родительный падеж: строка читается как «у 1 записи», «у 2 записей».
    // Именительный набор для счётчика лежит отдельно, в database.records.
    records: {
      one: "записи",
      few: "записей",
      many: "записей",
      other: "записей",
    },
  },

  export: {
    hasPhoto: "Да",
    success: "ZIP-архив успешно скачан",
    error: "Ошибка экспорта: {{message}}",
  },
};
