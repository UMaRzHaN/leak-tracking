export const mainPage = {
  showAll: "Все {{count}} →",

  chips: {
    label: "Фильтр по статусу",
    all: "Все",
    open: "Открыто",
    inProgress: "Ремонт",
    resolved: "Устранено",
  },

  groups: {
    today: "Сегодня",
    yesterday: "Вчера",
    earlier: "Раньше",
  },

  coverage: {
    title: "Охват обследования",
    estimated: "{{surveyed}} из ~{{total}} · {{percent}}%",
    value: "{{surveyed}} из {{total}} · {{percent}}%",
    hint: "Объекты с записями об утечках",
    open: "По категориям объектов",
    projectWide: "По всему проекту — у обследования не указано место",
    noRegistry:
      "Объекты с записями об утечках. Общее число появится с реестром компонентов",
  },

  repairs: {
    title: "Ремонты",
    inProgress: "идёт",
    returned: "вернулось",
    completed: "починено",
    median: "обычно чинят за {{value}}",
    longestOpen: "самый старый ремонт открыт {{value}}",
    returnedTitle: "Вернулись после ремонта",
    attempts: "попыток ремонта: {{count}}",
    more: "и ещё {{count}}",
    noTag: "без номера",
    days: "{{count}} дн",
    hours: "{{count}} ч",
    minutes: "{{count}} мин",
  },
};
