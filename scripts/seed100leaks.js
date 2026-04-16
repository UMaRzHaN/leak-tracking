/**
 * seed100leaks.js
 * Вставить в консоль браузера (F12 → Console) при открытом приложении.
 * Генерирует 100 тестовых утечек для активного upstream-проекта.
 */
(function () {
  /* ── Определяем активный проект ── */
  const activeId = localStorage.getItem("app:active_id_v1");
  if (!activeId) {
    console.error("❌ Активный проект не найден. Сначала выбери проект в приложении.");
    return;
  }
  const storageKey = `app:${activeId}:data_v1`;
  console.log("📦 Проект:", activeId, "→ ключ:", storageKey);

  /* ── Справочники ── */
  const SUBDIVISIONS = ["ПУ №1 Карачаганак", "ПУ №2 Жанажол", "ПУ №3 Тенгиз", "ПУ №4 Кашаган"];
  const DEPOSITS = {
    "ПУ №1 Карачаганак": ["Карачаганакское", "Чинаревское"],
    "ПУ №2 Жанажол":     ["Жанажольское", "Кенкиякское"],
    "ПУ №3 Тенгиз":      ["Тенгизское", "Королёвское"],
    "ПУ №4 Кашаган":     ["Кашаганское", "Каламкас"],
  };
  const LOCATIONS = ["ГПС-1", "ГПС-2", "КС-3", "ДНС-4", "УПН-5", "ГПЗ-6", "КП-7", "УКПГб-2"];
  const OBJECTS = [
    "Кран шаровой DN80",
    "Задвижка клиновая DN150",
    "Фланцевое соединение DN100",
    "Сальниковый компенсатор",
    "Предохранительный клапан",
    "Обратный клапан DN50",
    "Насос ЦНС 38-220",
    "Компрессор ГПА-Ц-16",
    "Теплообменник кожухотрубный",
    "Сепаратор газовый НГС-1",
  ];
  const COMPONENTS = [
    "Шток",
    "Корпус задвижки",
    "Набивка сальника",
    "Фланцевый разъём",
    "Сварной стык",
    "Резьбовое соединение",
    "Торцевое уплотнение",
    "Седло клапана",
    "Крышка люка",
    "Дренажный патрубок",
  ];
  const CATEGORIES = ["А", "Б", "В", "Г"];
  const ACTUATOR_TYPES = ["Ручной", "Электропривод", "Пневмопривод", "Гидропривод"];
  const CONNECTION_TYPES = ["Фланцевое", "Резьбовое", "Сварное", "Муфтовое"];
  const INSTALLATION_TYPES = ["Надземная", "Подземная", "В помещении", "На открытом воздухе"];
  const DESCRIPTIONS = [
    "Утечка газа через сальниковое уплотнение штока",
    "Утечка через фланцевое соединение трубопровода высокого давления",
    "Пропуск газа по резьбовому соединению манометра",
    "Утечка через корродированный сварной стык",
    "Пропуск через торцевое уплотнение насоса",
    "Утечка газа через неплотности крышки",
    "Пропуск через дренажный кран",
    "Утечка через предохранительный клапан при превышении давления",
    "Пропуск через трещину в корпусе задвижки",
    "Утечка по уплотнению обратного клапана",
  ];
  const SOLUTIONS = [
    "Подтяжка сальниковой набивки",
    "Замена прокладки фланцевого соединения",
    "Замена набивки сальника с остановкой оборудования",
    "Вварка заплаты на сварной стык",
    "Замена торцевого уплотнения",
    "Подтяжка болтов крышки",
    "Замена дренажного крана",
    "Регулировка давления настройки ПК",
    "Ремонт корпуса методом холодной сварки",
    "Замена клапанного уплотнения",
  ];
  const MATERIALS = [
    "Набивка АГИ-1, 16×16 мм — 0.5 кг",
    "Прокладка паронитовая DN150 PN40 — 2 шт",
    "Набивка ФУМ-лента — 1 рул., болт М24×90 — 8 шт",
    "Электрод УОНИ-13/55 — 2 пачки",
    "Уплотнение торцевое 75S — 1 шт",
    "Болт М20×80 — 16 шт, шайба DIN 125 — 32 шт",
    "Кран шаровой DN25 PN40 — 1 шт",
    "Пружина ПК DN50 — 1 шт",
    "Холодная сварка Loctite 3478 — 2 тюб.",
    "Кольцо уплотнительное EPDM DN50 — 2 шт",
  ];
  const STATUSES = ["open", "open", "open", "in_progress", "in_progress", "resolved"];

  /* ── Координаты (район Казахстан, Западный) ── */
  const BASE_LAT = 51.18;
  const BASE_LNG = 53.35;

  /* ── Утилиты ── */
  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const rndFloat = (min, max, dec = 2) =>
    parseFloat((Math.random() * (max - min) + min).toFixed(dec));
  const padTwo = (n) => String(n).padStart(2, "0");
  const fmtDate = (d) => `${padTwo(d.getDate())}.${padTwo(d.getMonth() + 1)}.${d.getFullYear()}`;

  /* ── Генерация ── */
  const now = Date.now();
  const TWO_YEARS = 2 * 365 * 24 * 60 * 60 * 1000;

  const leaks = Array.from({ length: 100 }, (_, i) => {
    const createdAt = now - Math.floor(Math.random() * TWO_YEARS);
    const date = new Date(createdAt);
    const subdivision = rnd(SUBDIVISIONS);
    const deposit = rnd(DEPOSITS[subdivision]);
    const status = rnd(STATUSES);
    const objName = rnd(OBJECTS);
    const descIdx = Math.floor(Math.random() * DESCRIPTIONS.length);

    return {
      id:         createdAt + i,             // уникальный id
      created_at: String(createdAt),
      updatedAt:  createdAt,
      index:      i + 1,
      date:       fmtDate(date),
      status,

      leak_id:    `Б-${String(2400 + i).padStart(4, "0")}`,
      video_id:   `V-${String(1100 + i).padStart(4, "0")}`,

      subdivision,
      deposit,
      location:   rnd(LOCATIONS),

      object:     objName,
      component:  rnd(COMPONENTS),
      category:   rnd(CATEGORIES),

      actuator_type:     rnd(ACTUATOR_TYPES),
      connection_type:   rnd(CONNECTION_TYPES),
      installation_type: rnd(INSTALLATION_TYPES),

      pressure:    rndFloat(2, 80),
      temperature: rndFloat(-15, 60),
      leak_speed:  rndFloat(0.1, 350, 2),

      leak_description:        DESCRIPTIONS[descIdx],
      technological_solution:  SOLUTIONS[descIdx],
      materials_equipment:     MATERIALS[descIdx % MATERIALS.length],
      note:                    Math.random() > 0.6 ? `Плановый осмотр ${padTwo(date.getDate())}.${padTwo(date.getMonth() + 1)}` : "",

      lat: parseFloat((BASE_LAT + rndFloat(-0.8, 0.8, 6)).toFixed(6)),
      lng: parseFloat((BASE_LNG + rndFloat(-1.2, 1.2, 6)).toFixed(6)),

      photo: null,
      history: [{ action: "created", date: date.toISOString() }],
    };
  });

  /* ── Сортируем новые первыми ── */
  leaks.sort((a, b) => b.id - a.id);

  /* ── Сохраняем ── */
  localStorage.setItem(storageKey, JSON.stringify(leaks));
  console.log(`✅ Записано ${leaks.length} утечек → "${storageKey}"`);
  console.log("🔄 Перезагрузи страницу (F5), чтобы данные появились в приложении.");
})();
