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
  validation: {
    lat: "Широта {{lat}} вне допустимого диапазона [-90, 90]",
    lng: "Долгота {{lng}} вне допустимого диапазона [-180, 180]",
    photoReady:
      "Фото ещё не готово для сохранения. Повторите попытку через секунду.",
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

  // Placeholders and hints still live in the step configs: their Russian
  // text differs per project type, which a single key here cannot carry.
  fields: {
    district: {
      label: "Район",
    },
    locality: {
      label: "Населенный пункт",
    },
    address: {
      label: "Адрес",
    },
    object: {
      label: "Объект",
    },
    category: {
      label: "Категория",
    },
    leak_id: {
      label: "Индивидуальный номер утечки",
      shortLabel: "Бирка",
    },
    component: {
      label: "Компонент",
    },
    video_id: {
      label: "Индивидуальный номер видео",
      shortLabel: "Видео",
    },
    pressure: {
      label: "Давление, атм",
      shortLabel: "Давление",
    },
    temperature: {
      label: "Температура, °C",
      shortLabel: "Температура",
    },
    leak_speed: {
      label: "Скорость утечки, л/мин",
      shortLabel: "Скорость",
    },
    field: {
      label: "УМГ",
    },
    station: {
      label: "Компрессорная станция",
    },
    location: {
      label: "Локация",
    },
    subdivision: {
      label: "Подразделение",
    },
    deposit: {
      label: "Месторождение",
    },
    leak_cause: {
      label: "Причина утечки",
    },
    leak_description: {
      label: "Описание утечки",
    },
    technological_solution: {
      label: "Технологическое решение",
      shortLabel: "Техрешение",
    },
    repair_recommendation: {
      label: "Решение / План устранения",
      shortLabel: "План устранения",
    },
    materials_equipment: {
      label: "Материалы и оборудование",
      shortLabel: "МТР ремонта",
    },
    actuator_type: {
      label: "Тип привода",
    },
    connection_type: {
      label: "Тип присоединения",
    },
    installation_type: {
      label: "Тип установки",
    },
    note: {
      label: "Примечание",
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
