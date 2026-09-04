/**
 * Как читаются написанные людьми значения: статус, итог обхода, действие в
 * журнале.
 *
 * Списки написаний, а не правила: книгу заполняют руками и на двух языках, и
 * «устранена» встречается наравне с «resolved» и «закрыто». Держатся отдельно
 * от разбора ячейки — тот про типы и форматы, а это про слова.
 */
export const STATUS_BY_VALUE = new Map(
  /** @type {[string, string][]} */ ([
    ...["open", "открыта", "открыто", "активна", "новая"].map((value) => [
      value,
      "open",
    ]),
    ...[
      "in progress",
      "in_progress",
      // Подпись, которую пишет сама выгрузка на английском
      // (`leakDetails.statuses.in_progress`). Её тут не было, и статус после
      // круга через Excel становился `open` — см. тест на круг подписей.
      "under repair",
      "в ремонте",
      "ремонт",
      "на ремонте",
    ].map((value) => [value, "in_progress"]),
    ...["resolved", "устранена", "устранено", "закрыта", "закрыто"].map(
      (value) => [value, "resolved"],
    ),
  ]),
);

export const MONITORING_RESULT_BY_VALUE = new Map(
  /** @type {[string, string][]} */ ([
    ...[
      "still leaking",
      "still_leaking",
      "leak present",
      "yes — leak present",
      // `excelExport.monitoring.answers.still_leaking` на английском — просто
      // «Yes». Совпадало с нужным значением только потому, что запасной
      // вариант `normalizeMonitoringResult` и есть `still_leaking`.
      "yes",
      "да",
      "да — утечка есть",
      "утечка есть",
      "утечка сохраняется",
      "сохраняется",
      "open",
    ].map((value) => [value, "still_leaking"]),
    ...[
      "needs recheck",
      "needs_recheck",
      "leak under repair",
      "under repair",
      "under repair — needs recheck",
      "утечка в ремонте",
      "в ремонте — требуется повторная проверка",
      "в ремонте",
    ].map((value) => [value, "needs_recheck"]),
    ...[
      "resolved",
      "no leak",
      "no — no leak",
      // `excelExport.monitoring.answers.resolved` на английском — просто «No».
      // Худший из трёх промахов: обход «утечки нет» возвращался как «утечка
      // есть».
      "no",
      "нет",
      "нет — утечки нет",
      "утечки нет",
      "утечка устранена",
      "устранена",
      "устранено",
    ].map((value) => [value, "resolved"]),
  ]),
);

export const HISTORY_ACTION_BY_VALUE = new Map(
  /** @type {[string, string][]} */ ([
    ...["created", "запись создана", "создано", "создана"].map((value) => [
      value,
      "created",
    ]),
    ...["edited", "data updated", "данные изменены", "изменено"].map(
      (value) => [value, "edited"],
    ),
    ...[
      "status_changed",
      "status changed",
      "статус изменен",
      "статус изменён",
    ].map((value) => [value, "status_changed"]),
    ...["comment", "комментарий"].map((value) => [value, "comment"]),
    ...["monitoring", "мониторинг"].map((value) => [value, "monitoring"]),
  ]),
);
