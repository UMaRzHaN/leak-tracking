export const map = {
  noDataToExport: "Нет данных для экспорта",
  exportUnavailable: "Экспорт недоступен для этого проекта",
  exportError: "Ошибка экспорта",
  kmlExported: "KML-файл успешно экспортирован",
  noTilesToDownload: "Нет тайлов для скачивания",

  // Popup shown when a marker is tapped.
  popup: {
    tag: "Бирка №",
    component: "Компонент",
    description: "Описание утечки",
    status: "Статус",
    componentTag: "Компонент №",
    schemeTag: "Номер на схеме",
  },

  tilesSaved: "Сохранено {{total}} тайлов",
  tilesFailed: "Не удалось скачать {{failed}} тайлов",
  tilesDownloaded: "скачано {{count}}",
  tilesAlreadyCached: "уже было {{count}}",
  tilesFailedPart: "не удалось {{count}}",
  downloadFailed: "✕ Ошибка скачивания",
  downloadCancelled: "Отменено — сохранено {{done}} из {{total}}",
  downloading: "Загрузка {{percent}}%",
  cancelDownload: "Отменить скачивание карты",

  monitoringFilter: "Фильтр по мониторингу",
  monitoringDue: "К проверке",
  monitoringChecked: "Проверено",
  monitoringAll: "Все теги",
  heatmap: "Тепловая карта",
  statusFilter: "Фильтр по статусу",
  componentStatusFilter: "Фильтр по состоянию железа",
  priorityFilter: "Фильтр по приоритету",
  nearbyLeaks: "Утечки рядом",
  all: "Все",
  radiusKm: "км",
  radiusM: "м",

  sheet: {
    title: "Фильтры карты",
    notSpecified: "Не указано",
    searchPlaceholder: "Поиск по номеру бирки...",
    searchLabel: "Поиск по номеру бирки",
    empty: "Ничего не найдено",
  },

  kml: {
    componentsDocumentName: "Компоненты",
    schemeTag: "Номер на схеме",
    documentName: "Отчет по утечкам",
    noRate: "Без скорости",
    savedToDocuments: "Сохранено в Документы/{{path}}",
    downloaded: "KML-файл успешно скачан",
  },

  // Утечки и компоненты — две базы одного проекта, и карта показывает по
  // одной за раз: смешанные булавки не дали бы посчитать ни те, ни другие.
  baseLeaks: "Утечки",
  baseComponents: "Железо",

  controls: {
    myLocation: "Моё местоположение",
    searchLeaks: "Поиск утечек",
    downloadArea: "Скачать карту текущей области",
    base: "Переключить базу: утечки или компоненты",
  },
};
