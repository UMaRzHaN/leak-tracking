export const addLeak = {
  pageTitle: "Новая утечка",
  stepPrefix: "Шаг",
  draftBanner: {
    message: "📋 Есть незаконченная запись",
    restore: "Восстановить",
    discard: "Удалить",
  },
  buttons: {
    prev: "← Назад",
    next: "Далее →",
    save: "💾 Сохранить",
    saving: "Сохранение...",
    clearStep: "Очистить шаг 🧽",
    clearAll: "Очистить все поля 🧹",
  },
  confirm: {
    title: "Заполнить из предыдущей записи?",
    description: "Некоторые поля пустые. Скопировать значения?",
    confirmLabel: "Скопировать",
    cancelLabel: "Отмена",
  },
  noCoords: {
    saved:
      "Утечка сохранена без координат: определить местоположение не удалось. Найти её можно в базе, но на карте она не появится.",
  },
  validation: {
    lat: "Широта {{lat}} вне допустимого диапазона [-90, 90]",
    lng: "Долгота {{lng}} вне допустимого диапазона [-180, 180]",
    photoReady:
      "Фото ещё не готово для сохранения. Повторите попытку через секунду.",
    photoStorageError: "Хранилище фото недоступно: {{reason}}",
  },

  errors: {
    userNameRequired: "Заполните имя пользователя в профиле",
    serialNumberRequired:
      "Заполните серийный номер оборудования в параметрах расчета",
    duplicateTag: "Утечка с таким номером уже существует",
    photoSaveFailed: "Не удалось сохранить фотографию",
    saveFailed: "Не удалось сохранить утечку",
  },

  success: {
    title: "Утечка сохранена",
    description: "Запись добавлена в журнал и доступна в базе данных.",
    newLeak: "Новая утечка",
    home: "На главную",
    tag: "№",
    component: "Компонент",
    leakRate: "Скорость",
  },

  stepTitles: {
    basic: "Основное",
    mtrAndDescription: "МТР и Описание *",
    noteAndPhoto: "Примечание и фото",
  },

  // Hints live here for both languages. Placeholders still come from the step
  // configs: they are domain examples, and three of them (location, object,
  // category) differ per project type.
  fields: {
    district: {
      label: "Район",
      hint: "Административный район города, в котором зафиксирована утечка",
      placeholder: "напр. Ярославский",
    },
    locality: {
      label: "Населенный пункт",
      hint: "Город или населенный пункт",
      placeholder: "напр. Ярославль",
    },
    address: {
      label: "Адрес",
      hint: "Улица, дом, квартира",
      placeholder: "напр. ул. Ленина, д. 1, кв. 1",
    },
    object: {
      label: "Объект",
      hint: "Объект, в котором зафиксирована утечка",
      placeholder_downstream: "напр. Подвал жилого дома",
      placeholder_midstream: "напр. АВОГ-1",
      placeholder_upstream: "напр. дренажная линия",
    },
    category: {
      label: "Категория",
      hint: "Категория утечки",
      placeholder_downstream: "напр. Шкафные и регуляторные пункты",
      placeholder_upstream: "напр. Well",
    },
    leak_id: {
      label: "Индивидуальный номер утечки",
      shortLabel: "Бирка",
      hint: "Уникальный номер на физическом маркере, прикреплённом к месту утечки",
      placeholder: "напр. 4242",
    },
    component: {
      label: "Компонент",
      hint: "Деталь или узел, из которого зафиксирована утечка",
      placeholder: "напр. Кран Шаровый",
    },
    video_id: {
      label: "Индивидуальный номер видео",
      shortLabel: "Видео",
      hint: "Номер видеозаписи из прибора (OGI)",
      placeholder: "напр. 1042",
    },
    pressure: {
      label: "Давление, атм",
      shortLabel: "Давление",
      hint: "Рабочее давление в трубопроводе, атм",
      placeholder: "напр. 4.5",
    },
    temperature: {
      label: "Температура, °C",
      shortLabel: "Температура",
      hint: "Температура рабочей среды, °C",
      placeholder: "напр. 20",
    },
    leak_speed: {
      label: "Скорость утечки, л/мин",
      shortLabel: "Скорость",
      hint: "Измеренная скорость утечки по прибору, л/мин",
      placeholder: "напр. 1.5",
    },
    field: {
      label: "УМГ",
      hint: "Наименование управления магистральных газопроводов",
      placeholder: "напр. УМГ-1",
    },
    station: {
      label: "Компрессорная станция",
      hint: "Наименование компрессорной станции",
      placeholder: "напр. КС-1",
    },
    location: {
      label: "Локация",
      hint: "Участок, на котором зафиксирована утечка",
      placeholder_midstream: "напр. цех А компрессорных агрегатов",
      placeholder_upstream: "напр. скважина 1",
    },
    subdivision: {
      label: "Подразделение",
      hint: "Наименование подразделения, в котором зафиксирована утечка",
      placeholder: "напр. Мессояхское УПГ",
    },
    deposit: {
      label: "Месторождение",
      hint: "Наименование месторождения, на котором зафиксирована утечка",
      placeholder: "напр. Мессояхское",
    },
    leak_cause: {
      label: "Причина утечки",
      hint: "Установленная или предполагаемая причина возникновения утечки",
      placeholder: "напр. Коррозия",
    },
    leak_description: {
      label: "Описание утечки",
      hint: "Характер и место утечки: тип соединения, видимые повреждения",
      placeholder: "напр. трещина",
    },
    technological_solution: {
      label: "Технологическое решение",
      shortLabel: "Техрешение",
      hint: "Предполагаемый способ устранения утечки",
      placeholder: "напр. Ревизия",
    },
    repair_recommendation: {
      label: "Решение / План устранения",
      shortLabel: "План устранения",
      hint: "Способ устранения без или с остановкой оборудования",
      placeholder: "напр. Устранение без остановки",
    },
    materials_equipment: {
      label: "Материалы и оборудование",
      shortLabel: "МТР ремонта",
      hint: "Предполагаемые материалы и оборудование для устранения",
      placeholder: "напр. сальник",
    },
    actuator_type: {
      label: "Тип привода",
      hint: "Ручной, электрический, пневматический и т.д.",
      placeholder: "напр. ручной",
    },
    connection_type: {
      label: "Тип присоединения",
      hint: "Фланцевое, резьбовое, сварное и т.д.",
      placeholder: "напр. фланцевое соединение",
    },
    installation_type: {
      label: "Тип установки",
      hint: "Надземная, подземная, внутри здания и т.д.",
      placeholder: "напр. надземная",
    },
    note: {
      label: "Примечание",
      hint: "Любые дополнительные сведения: условия обнаружения, сопутствующие дефекты",
    },
    photo: {
      label: "Фото утечки",
    },
    date: {
      label: "Дата",
    },
    detectedBy: {
      label: "Кто зафиксировал",
    },
    lat: {
      label: "Широта (X)",
    },
    lng: {
      label: "Долгота (Y)",
    },
    equipmentType: {
      label: "Оборудование для замера объёма утечки",
    },
    serial_number: {
      label: "Серийный номер оборудования",
    },
    uncertainty: {
      label: "Погрешность",
    },
    repairAt: {
      label: "Дата ремонта",
    },
    resolvedAt: {
      label: "Дата устранения",
    },
    photo_repair: {
      label: "Фото в ремонте",
    },
    photo_after: {
      label: "Фото после ремонта",
    },
    monitoringRecords: {
      label: "История мониторинга",
    },
    roundNumber: {
      label: "Номер обхода",
    },
    leak_speed_kg_h: {
      label: "Измеренная скорость утечки, кг/ч",
    },
    temperature_K: {
      label: "Температура, K",
    },
    flareShare: {
      label: "Процент газа на сжигание",
    },
    utilShare: {
      label: "Процент газа на использование",
    },
    Operating_mode: {
      label: "Наработка (дней)",
    },
    Total_Annual_Methane_Loss_m3_y: {
      label: "Общие годовые потери метана CH4, м3/год",
    },
    Total_Annual_Methane_Loss_t_y: {
      label: "Годовые потери метана CH4, т/год",
    },
    Emissions_t_CO2eq_year: {
      label: "Выбросы, CO2-экв, т/год",
    },
    Emissions_kg_CO2_eq_year: {
      label: "Выбросы, кг CO2, т/год",
    },
    weightedGWP: {
      label: "Потенциал глобального потепления",
    },
  },
};
