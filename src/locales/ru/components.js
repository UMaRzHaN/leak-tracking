export const components = {
  title: "Реестр компонентов",
  tab: "Компоненты",
  conflictBanner:
    "Одинаковых номеров: {{count}}. Оба варианта сохранены — перенумеруйте один.",
  showConflicts: "Показать",
  showAll: "Показать все",
  count: "Заведено: {{count}}",
  shown: "показано {{count}}",
  add: "Добавить компонент",
  addTitle: "Новый компонент",
  editTitle: "Карточка компонента",
  cancel: "Отмена",
  remove: "Удалить компонент",
  unnamed: "Без наименования",
  loading: "Загрузка реестра...",
  empty: "Реестр пуст. Первый компонент заводится прямо на площадке.",
  noMatches: "Ничего не найдено",
  loadError:
    "Не удалось прочитать реестр. Данные не потеряны, попробуйте позже.",
  searchPlaceholder: "Номер, наименование, номер на схеме...",
  locationFilter: "Фильтр по локации",
  allLocations: "Все локации",
  duplicateWarning:
    "Такой номер уже есть в реестре ({{count}}). Сохранить можно — разберём при сведении.",
  stepPrefix: "Шаг",
  /*
   * One line saying what the field wants, and a worked example inside it —
   * the same pair the leak form gives, because a walker at the equipment
   * reads the example and stops guessing between a name, a number and an
   * abbreviation.
   */
  fields: {
    subdivision: {
      hint: "Наименование подразделения, в котором находится компонент",
      placeholder: "напр. Мессояхское УПГ",
    },
    deposit: {
      hint: "Месторождение, к которому относится компонент",
      placeholder: "напр. Бузахур",
    },
    location: {
      hint: "Узел или площадка со схемы: УППГ, сборный пункт, скважина",
      placeholder: "напр. Скважина 22",
    },
    object: {
      hint: "Объект, на котором стоит компонент",
      placeholder: "напр. дренажная линия",
    },
    component: {
      hint: "Что это за железо",
      placeholder: "напр. Задвижка",
    },
    component_uid: {
      hint: "Номер, который вы присваиваете компоненту при обходе. Только цифры",
      placeholder: "напр. 14",
    },
    scheme_tag: {
      hint: "Позиционное обозначение с чертежа. Повторяется, уникальным быть не обязано",
      placeholder: "напр. ЗД32",
    },
    component_name: {
      hint: "Наименование компонента по документации",
      placeholder: "напр. Задвижка",
    },
    component_name_en: {
      hint: "Подставляется само по русскому наименованию",
      placeholder: "напр. Gate valve",
    },
    component_type: {
      hint: "Что компонент делает в технологической цепочке",
      placeholder: "напр. Запорная арматура",
    },
    equipment_type: {
      hint: "Класс оборудования, к которому относится компонент",
      placeholder: "напр. Трубопроводная арматура",
    },
    diameter: {
      hint: "Фактический наружный диаметр, миллиметры",
      placeholder: "напр. 426",
    },
    nominal_diameter: {
      hint: "Условный проход DN по паспорту",
      placeholder: "напр. 400",
    },
    line_pressure: {
      hint: "Давление на линии, где стоит компонент, МПа",
      placeholder: "напр. 35",
    },
    nominal_pressure: {
      hint: "Условное давление PN по паспорту, МПа",
      placeholder: "напр. 16",
    },
    working_pressure: {
      hint: "Давление, при котором компонент работает, МПа",
      placeholder: "напр. 12",
    },
    working_temperature: {
      hint: "Рабочая температура среды, °C",
      placeholder: "напр. 40",
    },
    connection_type: {
      hint: "Как компонент присоединён к трубопроводу",
      placeholder: "напр. Фланцевое соединение",
    },
    actuator_type: {
      hint: "Чем приводится в действие",
      placeholder: "напр. Механический ручной",
    },
    installation_type: {
      hint: "Как размещён относительно земли",
      placeholder: "напр. Наземный",
    },
    medium: {
      hint: "Что проходит через компонент",
      placeholder: "напр. Природный газ",
    },
    body_material: {
      hint: "Материал корпуса по паспорту или маркировке",
      placeholder: "напр. Сталь 20",
    },
    manufacturer: {
      hint: "Завод-изготовитель с таблички",
      placeholder: "напр. Пензтяжпромарматура",
    },
    installed_at: {
      hint: "Дата монтажа с таблички или из документации",
      placeholder: "напр. 12.05.2019",
    },
    component_status: {
      hint: "Состояние железа на момент обхода",
      placeholder: "напр. В работе",
    },
    photo: {
      hint: "Снимок компонента целиком, чтобы его можно было опознать",
    },
  },
  buttons: {
    prev: "← Назад",
    next: "Далее →",
    save: "Сохранить",
    saving: "Сохранение...",
    clearStep: "Очистить шаг",
    clearAll: "Очистить всё",
  },
  copyConfirm: {
    title: "Заполнить из предыдущей карточки?",
    description:
      "Часть полей осталась пустой. Подставить значения предыдущего компонента? Заполненное не изменится.",
    confirmLabel: "Заполнить",
    cancelLabel: "Оставить пустыми",
  },
  errors: {
    required: "Обязательное поле",
    badCoordinate: "Координата вне допустимого диапазона",
    digitsOnly: "Только цифры",
  },
};
