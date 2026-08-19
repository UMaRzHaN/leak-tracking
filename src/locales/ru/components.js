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
  nameRequired:
    "Укажите своё имя в профиле — каждая запись реестра подписывается.",
  detailsTitle: "Карточка компонента",
  close: "Закрыть",
  edit: "Редактировать",
  removeShort: "Удалить",
  removeConfirm: "Удалить безвозвратно",
  noPhoto: "Фото не приложено",
  detailsEmpty: "Поля пока не заполнены",
  historyTitle: "История",
  historyEmpty: "Записей пока нет",
  historyCreated: "Карточка заведена",
  historyEdited: "Правка",
  historyInspected: "Осмотр",
  inspectTitle: "Состояние на момент осмотра",
  statusNow: "сейчас",
  swipeInspect: "Осмотр",
  swipeDetails: "Подробно",
  noLocation: "Место не указано",
  unnamed: "Без наименования",
  loading: "Загрузка реестра...",
  empty: "Реестр пуст. Первый компонент заводится прямо на площадке.",
  noMatches: "Ничего не найдено",
  loadError:
    "Не удалось прочитать реестр. Данные не потеряны, попробуйте позже.",
  searchPlaceholder: "Номер, наименование, номер на схеме...",
  locationFilter: "Фильтр по локации",
  statusFilter: "Фильтр по состоянию",
  allStatuses: "Все",
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
      hint: "Наименование компонента по документации — что это за железо",
      placeholder: "напр. Задвижка",
    },
    component_uid: {
      hint: "Номер, который вы присваиваете компоненту при обходе. Только цифры",
      placeholder: "напр. 4242",
    },
    scheme_tag: {
      hint: "Позиционное обозначение с чертежа. Повторяется, уникальным быть не обязано",
      placeholder: "напр. ЗД32",
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
    nominal_diameter: {
      hint: "Условный проход DN по паспорту",
      placeholder: "напр. 400",
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
    },
    component_status: {
      hint: "Состояние железа на момент обхода",
      placeholder: "напр. В работе",
    },
    photo: {
      hint: "Снимок компонента целиком, чтобы его можно было опознать",
    },
  },
  /*
   * Инвентаризация уезжает своим архивом: реестр отдают тем, кто владеет
   * железом, а отчёт по утечкам — тем, кто считает выбросы.
   */
  export: {
    button: "Выгрузить инвентаризацию",
    inProgress: "Собираем архив инвентаризации...",
    empty: "Реестр пуст — выгружать нечего.",
    saved: "Архив сохранён: {{path}}",
    downloaded: "Архив «{{fileName}}» скачан",
    error: "Не удалось выгрузить инвентаризацию: {{message}}",
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
    photoRequired: "Нужно фото компонента",
    digitsOnly: "Только цифры",
  },
};
