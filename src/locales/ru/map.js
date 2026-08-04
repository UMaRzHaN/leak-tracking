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
  priorityFilter: "Фильтр по приоритету",
  nearbyLeaks: "Утечки рядом",
  all: "Все",
  radiusKm: "км",
  radiusM: "м",

  sheet: {
    title: "Фильтры карты",
    filterBy: "Фильтр по:",
    notSpecified: "Не указано",
    searchPlaceholder: "Поиск по номеру бирки...",
    searchLabel: "Поиск по номеру бирки",
    empty: "Ничего не найдено",
  },

  kml: {
    documentName: "Отчет по утечкам",
    noRate: "Без скорости",
    savedToDocuments: "Сохранено в Документы/{{path}}",
    downloaded: "KML-файл успешно скачан",
  },

  controls: {
    myLocation: "Моё местоположение",
    searchLeaks: "Поиск утечек",
    downloadArea: "Скачать карту текущей области",
  },
};
