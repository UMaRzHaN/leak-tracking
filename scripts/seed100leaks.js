/**
 * seed100leaks.js
 * Вставить в консоль браузера (F12 → Console) при открытом приложении.
 * Генерирует 100 тестовых утечек для активного upstream-проекта.
 *
 * Что делает скрипт:
 *  1. Записывает 100 утечек → app:<id>:data_v1
 *  2. Записывает vars проекта (если не заданы) → app:<id>:vars_v1
 *  3. Генерирует разные canvas-фото для каждой утечки
 *  4. Встраивает вычисленные поля (calculations.js) прямо в объект
 */
(function () {
  /* ── Определяем активный проект ── */
  const activeId = localStorage.getItem("app:active_id_v1");
  if (!activeId) {
    console.error("❌ Активный проект не найден. Сначала выбери проект в приложении.");
    return;
  }
  const dataKey = `app:${activeId}:data_v1`;
  const varsKey = `app:${activeId}:vars_v1`;
  console.log("📦 Проект:", activeId);

  /* ══════════════════════════════════════════════
     СПРАВОЧНИКИ (синхронизированы с кодом)
  ══════════════════════════════════════════════ */

  const SUBDIVISIONS = ["ПУ №1 Карачаганак", "ПУ №2 Жанажол", "ПУ №3 Тенгиз", "ПУ №4 Кашаган"];
  const DEPOSITS = {
    "ПУ №1 Карачаганак": ["Карачаганакское", "Чинаревское"],
    "ПУ №2 Жанажол":     ["Жанажольское", "Кенкиякское"],
    "ПУ №3 Тенгиз":      ["Тенгизское", "Королёвское"],
    "ПУ №4 Кашаган":     ["Кашаганское", "Каламкас"],
  };

  // src/data/leak/fieldDictionary.js → locations
  const LOCATIONS = [
    "Скважина", "Пылеуловитель", "Турбокомпрессорный Агрегат",
    "Аппарат воздушного охлаждения газа", "Блок подготовки топливного газа",
    "Газоперекачивающий агрегат", "Печь газовая", "Блок фильтрсепараторов",
    "Большой контур", "Малый контур", "Цех", "Секция",
    "За территорией цеха", "Блок редуцирования", "Узел сброса", "Фильтр топливного газа",
  ];

  // src/data/leak/fieldDictionary.js → objects
  const OBJECTS = [
    "Компрессорная станция", "Дожимная компрессорная станция",
    "Насосная станция", "Дожимная насосная станция",
    "Газодобывающее управление", "Нефтегазодобывающее управление",
    "Кустовая площадка", "Скважинная площадка",
    "Установка комплексной подготовки газа", "Установка подготовки нефти",
    "Газосборный пункт", "Центральный пункт сбора",
    "Кран Шаровой", "Кран Пробковый", "Обратный Клапан", "Вентиль",
    "Задвижка Механическая Стальная", "Сбросной Пружинный Предохранительный Клапан",
    "Регулятор Давления", "Блок фильтрсепараторов",
  ];

  // src/data/leak/fieldDictionary.js → components
  const COMPONENTS = [
    "Входная линия", "Выходная линия", "Свечная линия", "Дренажная линия",
    "Импульсная линия", "Кран Шаровой", "Вентиль", "Задвижка Механическая Стальная",
    "Штуцер", "Заглушка", "Датчик давления", "Датчик температуры",
    "Дыхательный клапан", "Импульсная трубка", "Клапан", "Клапан отсекатель",
    "Крышка фильтра", "Люк-лаз", "Манометр", "Насос дренажный",
    "Патрубок", "Редуктор", "Сварной шов", "Труба", "Фланцевое соединение", "Фильтр",
  ];

  // src/data/leak/fieldDictionary.js → categories_up
  const CATEGORIES = ["Compression", "Primary Gas Treatment & Transport", "Processing", "Well"];

  // src/data/leak/fieldDictionary.js → actuator_type
  const ACTUATOR_TYPES = [
    "Механический ручной", "Гидравлический", "Гидроэлектрический",
    "Пневматический", "Пневмогидравлический", "Пневмогидроэлектрический",
    "Электрический", "Электропневматический", "Электрогидравлический",
    "Электропневмогидравлический",
  ];

  // src/data/leak/fieldDictionary.js → connection_type
  const CONNECTION_TYPES = [
    "Фланцевое соединение", "Фланцевое соединение с кольцевым уплотнением",
    "Фланцевое соединение с паранитовым уплотнением", "Муфтовая внутренняя резьба",
    "Нипельная внешняя резьба", "Сварное соединение", "Болтовое соединение",
    "Штуцерно-нипельное соединение",
  ];

  // src/data/leak/fieldDictionary.js → installation_type
  const INSTALLATION_TYPES = [
    "Наземный", "Подземный (открытое исполнение)", "Подземный (закрытое исполнение)",
  ];

  // src/data/leak/fieldDictionary.js → description
  const DESCRIPTIONS = [
    "Технологическое/Техническое отверстие", "Фланцевое соединение",
    "Болтовое соединение", "Резьбовое соединение", "Шток/Маховик",
    "Из под земли", "Крышка/Люк", "Патрубок", "Корпус",
    "Привод", "Свеча", "Дренажный слив", "Штуцер",
  ];

  // src/data/leak/fieldDictionary.js → cause
  const CAUSES = [
    "Износ уплотнений", "Износ соединений", "Износ прокладки",
    "Износ сальникового уплотнения", "Коррозия", "Отсутствие",
    "Повреждение", "Негерметичность", "Загрязнение", "Пропуск по штоку",
  ];

  // src/data/leak/fieldDictionary.js → solutions
  const SOLUTIONS = [
    "Ревизия уплотнений", "Ревизия соединения", "Подтяжка", "Демонтаж",
    "Огневые работы", "Установить прокладку", "Замена вентиля", "Замена задвижки",
    "Замена крана", "Замена клапана", "Замена оборудования",
    "Замена уплотнительного материала", "Прочистка, продувка, прокладка резьбовая уплотнительная",
    "Ревизия сальниковой набивки штока оборудования", "Ревизия уплотнительных материалов",
  ];

  // src/data/leak/fieldDictionary.js → recommendations
  const RECOMMENDATIONS = ["Без остановки", "Замена", "С остановкой", "Демонтаж", "Установка"];

  // src/data/leak/fieldDictionary.js → materials
  const MATERIALS = [
    "По результату ревизии (замена прокладки и/или шпилек/гайек)",
    "Герметизирующая смазка (паста) и/или заменить графит/набивку/уплотнительные кольца",
    "Паронит / металлографит / спирально-навитая (проверить по паспорту компрессора)",
    "Анаэробный герметик и/или лента ФУМ (газовая)",
    "Болты, шпильки и гайки",
    "Электрод",
    "Уплотнительные резинки, мембраны, фитинги, корпуса, прокладки, резьбовые соединения и места спайки",
    "Рем. Комплект (сальниковая набивка, каранол, заглушка, паронит, электрод, гайки, шпильки, болты)",
    "Кран шаровой DN-50 PN-64 кгс/см² с ручным приводом с надземной установки. с ответными фланцами и крепежом",
    "Задвижка механическая стальная DN-100 PN-64 кгс/см² с ручным приводом с ответными фланцами и крепежом",
  ];

  // src/data/variables.js → EQUIPMENT_TYPES
  const EQUIPMENT_TYPES = ["GFM 2.0", "GFM 3.0", "Розовый мешок"];
  const UNCERTAINTY_MAP  = { "GFM 2.0": 0.05, "GFM 3.0": 0.05, "Розовый мешок": 0.1 };

  const STATUSES = ["open", "open", "open", "in_progress", "in_progress", "resolved"];

  /* ── Координаты (Западный Казахстан) ── */
  const BASE_LAT = 51.18;
  const BASE_LNG = 53.35;

  /* ══════════════════════════════════════════════
     VARS ПРОЕКТА (src/data/variables.js → VAR_DEFAULTS)
     Сохраняем только если ещё не заданы.
  ══════════════════════════════════════════════ */
  const DEFAULT_VARS = {
    gasType:                       "methane",
    equipmentType:                 "GFM 2.0",
    uncertainty:                   0.05,
    density:                       0.000716,   // кг/л, метан CH₄
    percentage_gas_to_flare:       0,
    percentage_gas_to_utilization: 100,
    GWP:                           28,
    GWP_Minus:                     25.25,
    Operating_mode:                365,
    serial_number:                 null,
  };

  if (!localStorage.getItem(varsKey)) {
    localStorage.setItem(varsKey, JSON.stringify(DEFAULT_VARS));
    console.log("⚙️  Vars проекта записаны →", varsKey);
  } else {
    console.log("⚙️  Vars проекта уже существуют, пропускаем.");
  }

  /* ══════════════════════════════════════════════
     ГЕНЕРАЦИЯ ФОТО (canvas)
     Рисуем миниатюру 240×180, разные цвета и формы.
  ══════════════════════════════════════════════ */

  /**
   * Рисует псевдо-промышленную сцену на canvas и возвращает dataURL JPEG.
   * hue (0-360) — основной оттенок, label — подпись (id утечки).
   * afterRepair=true — зелёный оттенок (фото после ремонта).
   */
  function makePhoto(hue, label, afterRepair = false) {
    const W = 240, H = 180;
    const c   = document.createElement("canvas");
    c.width   = W;
    c.height  = H;
    const ctx = c.getContext("2d");

    const h2 = afterRepair ? (hue + 120) % 360 : hue;

    // Фон — градиент
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, `hsl(${h2},45%,18%)`);
    bg.addColorStop(1, `hsl(${(h2 + 30) % 360},35%,10%)`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // "Труба" — горизонтальный цилиндр
    const pipeGrad = ctx.createLinearGradient(0, 70, 0, 120);
    pipeGrad.addColorStop(0, `hsl(${h2},30%,55%)`);
    pipeGrad.addColorStop(0.5, `hsl(${h2},20%,75%)`);
    pipeGrad.addColorStop(1, `hsl(${h2},30%,30%)`);
    ctx.fillStyle = pipeGrad;
    ctx.fillRect(0, 72, W, 40);

    // "Фланец" слева
    ctx.fillStyle = `hsl(${h2},25%,45%)`;
    ctx.fillRect(20, 62, 18, 60);
    // "Фланец" справа
    ctx.fillRect(W - 38, 62, 18, 60);

    // Болты на фланце
    ctx.fillStyle = `hsl(${h2},15%,65%)`;
    [66, 78, 90, 102, 114].forEach((y) => {
      ctx.beginPath(); ctx.arc(29, y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(W - 29, y, 3, 0, Math.PI * 2); ctx.fill();
    });

    // "Утечка" — оранжевые / зелёные частицы
    const leakColor = afterRepair ? "rgba(80,220,80,0.7)" : "rgba(255,160,30,0.75)";
    ctx.fillStyle = leakColor;
    for (let k = 0; k < 18; k++) {
      const px = 55 + (k % 6) * 22 + Math.sin(k * 1.3) * 8;
      const py = 55 + Math.sin(k * 2.1) * 20 + (afterRepair ? 30 : 0);
      const r  = 2 + Math.abs(Math.sin(k)) * 4;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    }

    // "Тепловизионный" ореол (только на фото утечки)
    if (!afterRepair) {
      const glow = ctx.createRadialGradient(W / 2, 82, 5, W / 2, 82, 50);
      glow.addColorStop(0, "rgba(255,100,0,0.35)");
      glow.addColorStop(1, "rgba(255,100,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }

    // Подпись
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "bold 11px monospace";
    ctx.fillText(afterRepair ? `ПОСЛЕ / ${label}` : label, 8, H - 8);

    // Дата-штамп (правый угол)
    const now = new Date();
    ctx.font = "9px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.textAlign = "right";
    ctx.fillText(
      `${now.getDate().toString().padStart(2,"0")}.${(now.getMonth()+1).toString().padStart(2,"0")}.${now.getFullYear()}`,
      W - 6, H - 8
    );
    ctx.textAlign = "left";

    return c.toDataURL("image/jpeg", 0.62);
  }

  /* ══════════════════════════════════════════════
     ПРИОРИТЕТ (src/utils/priority.js → priorityFromSpeed)
     critical ≥ 100 л/мин | high ≥ 50 | medium ≥ 10 | low > 0
  ══════════════════════════════════════════════ */
  function priorityFromSpeed(speed) {
    const v = Number(speed);
    if (!Number.isFinite(v) || v <= 0) return null;
    if (v >= 100) return "critical";
    if (v >= 50)  return "high";
    if (v >= 10)  return "medium";
    return "low";
  }

  /* ══════════════════════════════════════════════
     ВЫЧИСЛЯЕМЫЕ ПОЛЯ (src/utils/calculations/calculations.js)
     Вычисляем из DEFAULT_VARS + данных каждой утечки.
  ══════════════════════════════════════════════ */
  function calcFields(leak_speed, temperature) {
    const { density, GWP, GWP_Minus,
            percentage_gas_to_flare, percentage_gas_to_utilization,
            Operating_mode } = DEFAULT_VARS;

    const MINUTES_PER_YEAR   = 1440 * Operating_mode;
    const METHANE_DENSITY_STD = 0.7168; // кг/м³

    const flareShare = percentage_gas_to_flare / 100;          // 0
    const utilShare  = percentage_gas_to_utilization / 100;    // 1

    const leak_speed_kg_m = parseFloat((leak_speed * density).toFixed(6)); // кг/мин
    const leak_speed_kg_h = parseFloat((leak_speed_kg_m * 60).toFixed(4)); // кг/ч

    const Total_Annual_Methane_Loss_m3_y =
      parseFloat(((leak_speed * MINUTES_PER_YEAR) / 1000).toFixed(4));

    const Total_Annual_Methane_Loss_kg_y =
      parseFloat((Total_Annual_Methane_Loss_m3_y * METHANE_DENSITY_STD).toFixed(4));

    const Total_Annual_Methane_Loss_t_y =
      parseFloat((Total_Annual_Methane_Loss_kg_y * 0.001).toFixed(6));

    const weightedGWP =
      parseFloat((flareShare * GWP_Minus + utilShare * GWP).toFixed(4)); // = 28

    const Emissions_t_CO2eq_year =
      parseFloat((Total_Annual_Methane_Loss_t_y * weightedGWP).toFixed(6));

    const Emissions_kg_CO2_eq_year =
      parseFloat((Emissions_t_CO2eq_year * 1000).toFixed(4));

    const temperature_K =
      typeof temperature === "number" ? parseFloat((temperature + 273.15).toFixed(2)) : null;

    return {
      temperature_K,
      flareShare,
      utilShare,
      leak_speed_kg_m,
      leak_speed_kg_h,
      Total_Annual_Methane_Loss_m3_y,
      Total_Annual_Methane_Loss_kg_y,
      Total_Annual_Methane_Loss_t_y,
      weightedGWP,
      Emissions_t_CO2eq_year,
      Emissions_kg_CO2_eq_year,
      GWP,
      GWP_Minus,
      Operating_mode,
    };
  }

  /* ── Утилиты ── */
  const rnd      = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const rndFloat = (min, max, dec = 2) =>
    parseFloat((Math.random() * (max - min) + min).toFixed(dec));
  const padTwo   = (n) => String(n).padStart(2, "0");
  const fmtDate  = (d) =>
    `${padTwo(d.getDate())}.${padTwo(d.getMonth() + 1)}.${d.getFullYear()}`;

  /* ══════════════════════════════════════════════
     ГЕНЕРАЦИЯ УТЕЧЕК
  ══════════════════════════════════════════════ */
  const now       = Date.now();
  const TWO_YEARS = 2 * 365 * 24 * 60 * 60 * 1000;

  console.log("🖼  Генерация фото…");

  const leaks = Array.from({ length: 100 }, (_, i) => {
    const createdAt   = now - Math.floor(Math.random() * TWO_YEARS);
    const date        = new Date(createdAt);
    const subdivision = rnd(SUBDIVISIONS);
    const deposit     = rnd(DEPOSITS[subdivision]);
    const status      = rnd(STATUSES);
    const equipment   = rnd(EQUIPMENT_TYPES);
    const leak_speed  = rndFloat(0.1, 350, 2); // л/мин
    const temperature = rndFloat(-15, 60);
    const leakId      = `${String(2400 + i).padStart(4, "0")}`;
    const hue         = (i * 37) % 360; // разные оттенки

    const resolvedAt = status === "resolved"
      ? new Date(createdAt + Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)).toISOString()
      : null;

    // Фото: у ~80% утечек есть фото до; у resolved — ещё фото после
    const hasPhoto      = Math.random() > 0.20;
    const photo         = hasPhoto ? makePhoto(hue, `Б-${leakId}`, false) : null;
    const photo_after   = (status === "resolved" && hasPhoto && Math.random() > 0.25)
      ? makePhoto(hue, `Б-${leakId}`, true)
      : null;

    return {
      id:         createdAt + i,
      created_at: String(createdAt),
      updatedAt:  createdAt,
      index:      i + 1,
      date:       fmtDate(date),
      status,

      leak_id:  leakId,
      video_id: `V-${String(1100 + i).padStart(4, "0")}`,

      subdivision,
      deposit,
      location: rnd(LOCATIONS),

      object:    rnd(OBJECTS),
      component: rnd(COMPONENTS),
      category:  rnd(CATEGORIES),

      actuator_type:     rnd(ACTUATOR_TYPES),
      connection_type:   rnd(CONNECTION_TYPES),
      installation_type: rnd(INSTALLATION_TYPES),

      pressure:    rndFloat(2, 80),
      temperature,
      leak_speed,
      priority:    priorityFromSpeed(leak_speed),

      // Оборудование замера (src/data/variables.js → EQUIPMENT_TYPES)
      equipmentType: equipment,
      serial_number: equipment === "Розовый мешок" ? Math.floor(rndFloat(1000, 9999, 0)) : null,
      uncertainty:   UNCERTAINTY_MAP[equipment],

      // Текстовые поля
      leak_cause:             rnd(CAUSES),
      leak_description:       rnd(DESCRIPTIONS),
      technological_solution: rnd(SOLUTIONS),
      repair_recommendation:  rnd(RECOMMENDATIONS),
      materials_equipment:    rnd(MATERIALS),
      note: Math.random() > 0.6
        ? `Плановый осмотр ${padTwo(date.getDate())}.${padTwo(date.getMonth() + 1)}`
        : "",

      // Координаты
      lat: parseFloat((BASE_LAT + rndFloat(-0.8, 0.8, 6)).toFixed(6)),
      lng: parseFloat((BASE_LNG + rndFloat(-1.2, 1.2, 6)).toFixed(6)),

      // Фото
      photo,
      photo_after,
      resolvedAt,

      // Вычисленные поля (calculations.js)
      ...calcFields(leak_speed, temperature),

      history: [
        { action: "created", date: date.toISOString() },
        ...(status !== "open"
          ? [{ action: "status_changed", from: "open", to: status,
               date: new Date(createdAt + 86400000).toISOString() }]
          : []),
        ...(resolvedAt
          ? [{ action: "resolved", date: resolvedAt }]
          : []),
      ],
    };
  });

  /* ── Сортируем: новые первыми ── */
  leaks.sort((a, b) => b.id - a.id);

  /* ── Сохраняем ── */
  try {
    localStorage.setItem(dataKey, JSON.stringify(leaks));
    console.log(`✅ Записано ${leaks.length} утечек → "${dataKey}"`);

    const sizeKb = Math.round(JSON.stringify(leaks).length / 1024);
    const withPhoto = leaks.filter((l) => l.photo).length;
    console.log(`   📊 Размер: ~${sizeKb} КБ | С фото: ${withPhoto} утечек`);
    console.log("🔄 Перезагрузи страницу (F5), чтобы данные появились в приложении.");
  } catch (e) {
    console.error("❌ Ошибка записи в localStorage (возможно, превышен лимит):", e.message);
    console.warn("💡 Попробуй уменьшить долю утечек с фото (hasPhoto > 0.20 → 0.50) или качество JPEG (0.62 → 0.40).");
  }
})();
