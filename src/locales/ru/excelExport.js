export const excelExport = {
  sheets: {
    leaks: "Утечки",
    history: "История",
    monitoring: "Мониторинг",
  },

  photo: {
    open: "Открыть фото",
    missing: "Есть (файл не найден)",
  },

  history: {
    unknownUser: "Не указан",
    headers: {
      index: "№",
      leak_id: "Бирка",
      date: "Дата",
      time: "Время",
      action: "Действие",
      user: "Пользователь",
      text: "Текст",
      to: "Статус",
      changes: "Изменения JSON",
    },
  },

  monitoring: {
    headers: {
      index: "№",
      leak_id: "Бирка",
      roundNumber: "Обход",
      date: "Дата мониторинга",
      time: "Время мониторинга",
      monitoredBy: "Кто мониторил",
      result: "Утечка есть",
      materials_equipment: "МТР",
      comment: "Комментарий",
      photo: "Фото мониторинга",
      previousPhoto: "Предыдущее фото",
    },
    answers: {
      still_leaking: "Да",
      needs_recheck: "В ремонте",
      resolved: "Нет",
    },
  },

  backup: {
    title: "Резервная копия проекта",
    note: "Сводка предназначена для просмотра. Для восстановления используются скрытые служебные столбцы.",
    fieldColumn: "Параметр",
    valueColumn: "Значение",
    roundNumberFormat: '"№ "0',
    projectTypes: {
      upstream: "Добыча (Upstream)",
      midstream: "Транспортировка (Midstream)",
      downstream: "Переработка (Downstream)",
    },
    summary: {
      project: "Проект",
      projectType: "Тип проекта",
      exportedAt: "Экспортировано",
      leaks: "Утечек",
      monitoringChecks: "Проверок мониторинга",
      historyRecords: "Записей истории",
      currentRound: "Текущий обход",
      checkedInRound: "Проверено в текущем обходе",
      totalInRound: "Всего в текущем обходе",
      remainingInRound: "Осталось проверить",
      schemaVersion: "Версия резервной копии",
    },
  },

  archiveExported: "Excel-архив проекта экспортирован ({{fileName}})",
  saved: "Сохранено в Документы/{{path}}",
  downloaded: "Файл экспортирован ({{fileName}})",
};
