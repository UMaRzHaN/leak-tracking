export const importScreen = {
  title: "Импорт данных",
  what: "Что можно загрузить",
  kinds: {
    backup: {
      title: "Резервная копия проекта",
      hint: "ZIP с утечками, фото, обходами и накладными",
    },
    report: {
      title: "Отчёт Excel-архивом",
      hint: "XLSX или ZIP из «Экспорта отчёта»",
    },
    inventory: {
      title: "Инвентаризация",
      hint: "Архив реестра компонентов с фото и схемами",
    },
  },
  autoDetect: "Тип файла определяется сам — выбирать его не нужно.",
  where: "Откуда",
  pick: "Выбрать файл",
  pickHint: "ZIP или XLSX с устройства",
  importing: "Импорт…",
  other: "С другого устройства",
};
