const RU_TO_EN = {
  Коррозия: "Corrosion",
  "Износ уплотнений": "Seal wear",
  "Износ соединений": "Joint wear",
  "Износ прокладки": "Gasket wear",
  "Износ сальникового уплотнения": "Packing seal wear",
  Отсутствие: "Missing part",
  Повреждение: "Damage",
  Негерметичность: "Loss of tightness",
  Загрязнение: "Contamination",
  "Пропуск по штоку": "Stem leak",

  "Технологическое/Техническое отверстие": "Technological/technical opening",
  "Фланцевое соединение": "Flange connection",
  "Болтовое соединение": "Bolted connection",
  "Резьбовое соединение": "Threaded connection",
  "Шток/Маховик": "Stem/handwheel",
  "Из под земли": "From underground",
  "Крышка/Люк": "Cover/hatch",
  Патрубок: "Branch pipe",
  Корпус: "Body",
  Привод: "Actuator",
  Свеча: "Vent stack",
  "Дренажный слив": "Drain outlet",
  Штуцер: "Fitting",

  "Ревизия уплотнений": "Seal inspection",
  "Ревизия соединения": "Connection inspection",
  Подтяжка: "Retightening",
  Демонтаж: "Dismantling",
  "Огневые работы": "Hot work",
  "Установить прокладку": "Install gasket",
  "Замена вентиля": "Replace valve",
  "Замена задвижки": "Replace gate valve",
  "Замена крана": "Replace ball valve",
  "Замена клапана": "Replace valve assembly",
  "Замена оборудования": "Replace equipment",
  "Замена редуктора": "Replace regulator",
  "Замена СППК": "Replace relief valve",
  "Замена уплотнительного материала": "Replace sealing material",
  "Ревизия вентиля": "Valve inspection",
  "Ревизия задвижки": "Gate valve inspection",
  "Ревизия оборудования": "Equipment inspection",
  "Ревизия клапана": "Valve assembly inspection",
  "Ревизия крана": "Ball valve inspection",

  "Без остановки": "Without shutdown",
  Замена: "Replacement",
  "С остановкой": "With shutdown",
  Установка: "Installation",

  "Механический ручной": "Manual mechanical",
  Гидравлический: "Hydraulic",
  Гидроэлектрический: "Electrohydraulic",
  Пневматический: "Pneumatic",
  Пневмогидравлический: "Pneumohydraulic",
  Пневмогидроэлектрический: "Electropneumohydraulic",
  Электрический: "Electric",
  Электропневматический: "Electropneumatic",
  Электрогидравлический: "Electrohydraulic",
  Электропневмогидравлический: "Electropneumohydraulic",

  Наземный: "Aboveground",
  "Наземный с оцинковкой": "Aboveground galvanized",
  "Подземный (открытое исполнение)": "Underground (open installation)",
  "Подземный (закрытое исполнение)": "Underground (closed installation)",

  "Фланцевое соединение с кольцевым уплотнением":
    "Flange connection with ring gasket",
  "Фланцевое соединение с паранитовым уплотнением":
    "Flange connection with paronite gasket",
  "Муфтовая внутренняя резьба": "Socket internal thread",
  "Нипельная внешняя резьба": "Nipple external thread",
  "Сварное соединение": "Welded connection",
  "Штуцерно-нипельное соединение": "Fitting-nipple connection",

  Скважина: "Well",
  Пылеуловитель: "Dust collector",
  "Турбокомпрессорный Агрегат": "Turbocompressor unit",
  "Аппарат воздушного охлаждения газа": "Air Cooling Gas Unit",
  "Блок подготовки топливного газа": "Fuel gas treatment unit",
  "Газоперекачивающий агрегат": "Gas Pumping Unit",
  "Печь газовая": "Gas heater",
  "Блок фильтрсепараторов": "Filter separator unit",
  "Большой контур": "Large loop",
  "Малый контур": "Small loop",
  Цех: "Workshop",
  Секция: "Section",
  "За территорией цеха": "Outside workshop area",
  "Блок редуцирования": "Pressure reduction unit",
  "Узел сброса": "Discharge unit",
  "Фильтр топливного газа": "Fuel gas filter",

  "Компрессорная станция": "Compressor station",
  "Дожимная компрессорная станция": "Booster compressor station",
  "Насосная станция": "Pump station",
  "Дожимная насосная станция": "Booster pump station",
  "Линейная компрессорная станция": "Line compressor station",
  "Линейная насосная станция": "Line pump station",
  "Газодобывающее управление": "Gas production administration",
  "Нефтедобывающее управление": "Oil production administration",
  "Нефтегазодобывающее управление": "Oil and gas production administration",
  "Промысел добычи нефти и газа": "Oil and gas field production facility",
  "Газовый промысел": "Gas field",
  "Нефтяной промысел": "Oil field",
  "Кустовая площадка": "Well cluster pad",
  "Скважинная площадка": "Well pad",
  "Установка комплексной подготовки газа": "Comprehensive gas treatment unit",
  "Установка предварительного сброса воды": "Produced water separation unit",
  "Установка подготовки нефти": "Oil treatment unit",
  "Газосборный пункт": "Gas gathering point",
  "Магистральный газопровод": "Main gas pipeline",
  "Газораспределительная станция": "Gas distribution station",
  "Газоизмерительная станция": "Gas metering station",
  "Узел учета газа": "Gas metering unit",
  "Пункт редуцирования газа": "Gas pressure reduction point",
  "Подземное хранилище газа": "Underground gas storage",
  Нефтебаза: "Oil depot",
  "Станция налива нефти и нефтепродуктов": "Oil and petroleum loading station",
  "Факельное хозяйство": "Flare system",
  "Узел сепарации": "Separation unit",
  "Узел осушки газа": "Gas drying unit",
  "Узел очистки газа": "Gas treatment unit",

  "Входная линия": "Inlet line",
  "Выходная линия": "Outlet line",
  "Свечная линия": "Blowdown line",
  "Дренажная линия": "Drain line",
  "Пусковая линия": "Start-up line",
  "Байпасная линия": "Bypass line",
  "Импульсная линия": "Impulse line",
  "Кольцевая линия": "Loop line",
  "Контурная линия": "Circuit line",

  "Кран Шаровой": "Ball valve",
  "Кран Пробковый": "Plug valve",
  "Игольчатый Кран": "Needle valve",
  "Обратный Клапан": "Check valve",
  Вентиль: "Globe valve",
  "Задвижка Механическая Стальная": "Steel gate valve",
  "Задвижка Дисковая": "Butterfly gate valve",
  "Электропневматическое Управляющее Устройство":
    "Electropneumatic control unit",
  "Сбросной Пружинный Предохранительный Клапан":
    "Spring-loaded pressure relief valve",
  "Регулятор Давления": "Pressure regulator",

  // Наименования оборудования. Один список на утечки и на реестр: поле
  // `component` у них общее, чтобы карточка компонента копировалась в утечку
  // напрямую, — значит и английская колонка должна браться отсюда же, а не из
  // второго словаря, который разойдётся с этим.
  Труба: "Pipe",
  Отвод: "Bend",
  Тройник: "Tee",
  Заглушка: "Plug",
  "Сварной шов": "Weld seam",
  Хомут: "Clamp",
  Катушка: "Spool",
  Планшайба: "Faceplate",
  "Импульсная трубка": "Impulse tube",
  "Радиаторная трубка": "Radiator tube",
  Оголовник: "Headpiece",
  Вал: "Shaft",
  "Угловой регулируемый штуцер": "Angle adjustable fitting",
  "Регулируемый штуцер": "Adjustable fitting",
  Дроссель: "Choke",
  Клапан: "Valve",
  "Клапан отсекатель": "Shut-off valve",
  "Дыхательный клапан": "Breather valve",
  "Регулирующий клапан": "Control valve",
  "Клапан регулирующий давление": "Pressure control valve",
  "Предохранительный клапан": "Safety valve",
  Задвижка: "Gate valve",
  "Задвижка с ручным приводом": "Manual gate valve",
  "Запорный вентиль": "Stop valve",
  "Двухвентильный манифолд": "Two-valve manifold",
  Редуктор: "Pressure reducer",
  Фильтр: "Filter",
  "Крышка фильтра": "Filter cover",
  "Насос дренажный": "Drain pump",
  Пеногенератор: "Foam generator",
  "Кабельный ввод": "Cable gland",
  "Люк-лаз": "Manhole",
  Манометр: "Pressure gauge",
  Уровнемер: "Level gauge",
  "Уровнемерная колонка": "Level gauge column",
  Расходомер: "Flow meter",
  "Датчик давления": "Pressure sensor",
  "Датчик температуры": "Temperature sensor",
  "Датчик температуры газа": "Gas temperature sensor",
  "Газораспределительный пункт": "Gas distribution point",
  Сепаратор: "Separator",
  Разделитель: "Divider",
  Выветриватель: "Weathering vessel",
  Дегазатор: "Degasser",
  Ёмкость: "Vessel",
  Воздухосборник: "Air receiver",

  "ШГРП Баланс компании": "Cabinet regulator point - company balance",
  "ШГРП Комбыт": "Cabinet regulator point - utilities",
  "Вводы в дома": "Building inlets",
  "Объект на лиинии среднего давления": "Object on medium-pressure line",

  Compression: "Compression",
  "Primary Gas Treatment & Transport": "Primary Gas Treatment & Transport",
  Processing: "Processing",
  Well: "Well",
};

const DYNAMIC_TRANSLATION_PATTERNS = [
  ["Клапан запорный трехходовой (вентиль)", "Three-way globe valve"],
  ["Клапан запорный двухходовой (вентиль)", "Two-way globe valve"],
  [
    "Электропневматическое Управляющее Устройство",
    "Electropneumatic control unit",
  ],
  [
    "Сбросной Пружинный Предохранительный Клапан",
    "Spring-loaded pressure relief valve",
  ],
  ["Задвижка механическая стальная", "Steel gate valve"],
  ["Задвижка Механическая Стальная", "Steel gate valve"],
  ["Задвижка дисковая", "Butterfly gate valve"],
  ["Клапан запорный (вентиль)", "Globe valve"],
  ["Кран Шаровой", "Ball valve"],
  ["Кран шаровой", "Ball valve"],
  ["Кран Пробковый", "Plug valve"],
  ["Кран пробковый", "Plug valve"],
  ["Игольчатый Кран", "Needle valve"],
  ["Игольчатый кран", "Needle valve"],
  ["Обратный Клапан", "Check valve"],
  ["Обратный клапан", "Check valve"],
  ["Регулятор Давления", "Pressure regulator"],
  ["Регулятор давления", "Pressure regulator"],
];

const DYNAMIC_PHRASE_TRANSLATIONS = [
  ["По результату ревизии", "Based on inspection results"],
  ["Герметизирующая смазка (паста)", "Sealing compound (paste)"],
  ["замена прокладки", "gasket replacement"],
  ["и/или шпилек/гаек", "and/or studs/nuts"],
  ["и/или заменить", "and/or replace"],
  ["графит/набивку/уплотнительные кольца", "graphite/packing/sealing rings"],
  [
    "Паронит / металлографит / спирально-навитая",
    "Paronite / metal-graphite / spiral-wound",
  ],
  ["(проверить по паспорту компрессора)", "(check compressor datasheet)"],
  ["Анаэробный герметик", "Anaerobic sealant"],
  ["лента ФУМ (газовая)", "PTFE tape (gas-rated)"],
  ["Болты, шпильки и гайки", "Bolts, studs and nuts"],
  ["Электрод", "Electrode"],
  [
    "Уплотнительные резинки, мембраны, фитинги, корпуса, прокладки, резьбовые соединения и места спайки",
    "Sealing rubber parts, membranes, fittings, housings, gaskets, threaded connections and soldered joints",
  ],
  ["с ручным приводом", "with manual drive"],
  ["с пневмоприводом", "with pneumatic actuator"],
  ["с муфтовой внутренней резьбой", "with socket internal thread"],
  ["муфтовый с внутренней резьбой", "socket type with internal thread"],
  ["с ниппельной внешней резьбой", "with nipple external thread"],
  ["с нипельной внешней резьбой", "with nipple external thread"],
  ["с фланцевым соединением", "with flange connection"],
  ["с ответными фланцами и крепежом", "with mating flanges and fasteners"],
  ["штуцерно-ниппельное соединение", "fitting-nipple connection"],
  ["штуцерно-нипельное соединение", "fitting-nipple connection"],
  ["продувочной", "blowdown"],
  [
    "с концами под приварку надземной установки",
    "with weld ends for aboveground installation",
  ],
  ["с надземной установки", "for aboveground installation"],
  ["с надземной установки.", "for aboveground installation."],
  ["с ручным приводом,", "with manual drive,"],
  ["с пневмоприводом,", "with pneumatic actuator,"],
  [
    "В комплекте Обратные фланцы, Гайки, Шпильки",
    "Includes mating flanges, nuts, and studs",
  ],
  ["жаропрочный", "heat-resistant"],
  ["жаростойкий", "heat-resistant"],
  ["сероводородостойкое исполнение", "H2S-resistant design"],
  ["высоко теплостойкое исполнение", "high-temperature-resistant design"],
];

function translateDynamicAutocompleteOption(option) {
  let translated = option;

  for (const [ru, en] of DYNAMIC_TRANSLATION_PATTERNS) {
    if (translated.startsWith(ru)) {
      translated = en + translated.slice(ru.length);
      break;
    }
  }

  for (const [ru, en] of DYNAMIC_PHRASE_TRANSLATIONS) {
    translated = translated.replaceAll(ru, en);
  }

  return translated;
}

export function translateAutocompleteOption(option, lang) {
  if (lang !== "en") return option;
  return RU_TO_EN[option] ?? translateDynamicAutocompleteOption(option);
}

export function localizeAutocompleteOptions(options = [], lang) {
  if (lang !== "en") return options;

  return options.map((option) => ({
    value: option,
    label: translateAutocompleteOption(option, lang),
    keywords: [option],
  }));
}
