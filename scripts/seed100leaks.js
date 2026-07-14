/**
 * seed100leaks.js
 * Вставить в консоль браузера / WebView DevTools при открытом приложении.
 *
 * Генерирует тестовую базу для активного проекта:
 * - 100 утечек;
 * - фото до / в ремонте / после;
 * - detectedBy, serial_number, repairAt, resolvedAt;
 * - monitoringRecords с roundNumber и несколькими записями в одном обходе;
 * - активный обход для страницы мониторинга;
 * - web: пишет в localStorage;
 * - native Capacitor: пишет data.json и фото в Directory.Data.
 */
(async function seed100Leaks() {
  const COUNT = 100;
  const ROUNDS = 4;
  const CURRENT_ROUND = 4;
  const USER_PROFILE_KEY = "leak_tracking:user_profile:v1";

  const STORAGE = {
    PROJECTS_LIST: "app:projects_v1",
    ACTIVE_PROJECT_ID: "app:active_id_v1",
    PROJECT_DATA: (id) => `app:${id}:data_v1`,
    PROJECT_VARS: (id) => `app:${id}:vars_v1`,
    MONITORING_ROUND: (id) => `app:${id}:monitoring_round_v2`,
  };

  const DEFAULT_VARS = {
    gasType: "methane",
    equipmentType: "GFM 2.0",
    uncertainty: 5,
    density: 0.7168,
    percentage_gas_to_flare: 0,
    percentage_gas_to_utilization: 100,
    GWP: 28,
    GWP_Minus: 25.25,
    Operating_mode: 365,
    serial_number: "GFM-TEST-0001",
  };

  async function run() {
    const activeId = localStorage.getItem(STORAGE.ACTIVE_PROJECT_ID);
    if (!activeId) {
      console.error(
        "Активный проект не найден. Сначала выбери проект в приложении.",
      );
      return;
    }

    const projects = readJson(STORAGE.PROJECTS_LIST, []);
    const activeProject =
      projects.find((project) => String(project.id) === String(activeId)) ?? {};
    const projectType = activeProject.type ?? "upstream";
    const folderName =
      activeProject.folderName ??
      String(activeProject.name ?? activeId).replace(/[^\wа-яё-]+/gi, "_");
    const dataKey = STORAGE.PROJECT_DATA(activeId);
    const varsKey = STORAGE.PROJECT_VARS(activeId);
    const currentUser =
      readJson(USER_PROFILE_KEY, { name: "" }).name || "Тестовый пользователь";
    const isNative =
      !!window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === "function" &&
      window.Capacitor.isNativePlatform();

    if (!localStorage.getItem(varsKey)) {
      localStorage.setItem(varsKey, JSON.stringify(DEFAULT_VARS));
    }

    localStorage.setItem(
      STORAGE.MONITORING_ROUND(activeId),
      JSON.stringify({
        id: `seed-round-${CURRENT_ROUND}`,
        number: CURRENT_ROUND,
        startedAt: new Date().toISOString(),
      }),
    );

    const leaks = buildLeaks({
      count: COUNT,
      rounds: ROUNDS,
      currentRound: CURRENT_ROUND,
      projectType,
      currentUser,
      vars: DEFAULT_VARS,
    });

    try {
      if (isNative) {
        await saveNativeData({ leaks, folderName });
      } else {
        localStorage.setItem(dataKey, JSON.stringify(leaks));
      }

      const withBefore = leaks.filter((leak) => leak.photo).length;
      const withRepair = leaks.filter((leak) => leak.photo_repair).length;
      const withAfter = leaks.filter((leak) => leak.photo_after).length;
      const monitoringCount = leaks.reduce(
        (sum, leak) => sum + (leak.monitoringRecords?.length ?? 0),
        0,
      );

      console.log(
        `Готово: ${leaks.length} утечек записано для проекта ${activeId}.`,
      );
      console.log(
        `Фото до: ${withBefore}; в ремонте: ${withRepair}; после: ${withAfter}; мониторинг: ${monitoringCount}.`,
      );
      console.log("Перезагружаю страницу...");
      location.reload();
    } catch (error) {
      console.error("Не удалось записать тестовые данные:", error);
    }
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function buildLeaks({
    count,
    rounds,
    currentRound,
    projectType,
    currentUser,
    vars,
  }) {
    const now = Date.now();
    const twoYears = 2 * 365 * 24 * 60 * 60 * 1000;
    const leaks = [];

    for (let index = 0; index < count; index += 1) {
      const createdAt = now - Math.floor(Math.random() * twoYears);
      const leakId = String(2400 + index);
      const status = pickWeighted([
        ["open", 52],
        ["in_progress", 28],
        ["resolved", 20],
      ]);
      const equipmentType = pick(EQUIPMENT_TYPES);
      const serialNumber = `${equipmentType.replace(/\s+/g, "-").toUpperCase()}-${String(
        10000 + index,
      )}`;
      const leak_speed = rndFloat(0.3, 360, 2);
      const temperature = rndFloat(-15, 62, 2);
      const pressure = rndFloat(2, 80, 2);
      const detectedBy = pick(USERS);
      const hue = (index * 37) % 360;
      const createdIso = new Date(createdAt).toISOString();
      const repairAt =
        status === "in_progress" || status === "resolved"
          ? createdAt + rndInt(2, 30) * DAY
          : null;
      const resolvedAt =
        status === "resolved" ? repairAt + rndInt(3, 35) * DAY : null;

      const leak = {
        id: createdAt + index,
        created_at: String(createdAt),
        createdAt,
        updatedAt: resolvedAt ?? repairAt ?? createdAt,
        index: index + 1,
        date: formatDate(new Date(createdAt)),
        status,
        detectedBy,
        leak_id: leakId,
        video_id: `V-${String(1100 + index).padStart(4, "0")}`,
        ...buildLocationFields(projectType),
        object: pick(OBJECTS),
        component: pick(COMPONENTS),
        category: projectType === "midstream" ? undefined : pick(CATEGORIES),
        actuator_type: pick(ACTUATOR_TYPES),
        connection_type: pick(CONNECTION_TYPES),
        installation_type: pick(INSTALLATION_TYPES),
        pressure,
        temperature,
        leak_speed,
        priority: priorityFromSpeed(leak_speed),
        equipmentType,
        serial_number: serialNumber,
        uncertainty: UNCERTAINTY_MAP[equipmentType] ?? 0.05,
        leak_cause: pick(CAUSES),
        leak_description: pick(DESCRIPTIONS),
        technological_solution: pick(SOLUTIONS),
        repair_recommendation: pick(RECOMMENDATIONS),
        materials_equipment: pick(MATERIALS),
        note:
          Math.random() > 0.55
            ? `Плановый осмотр ${formatShortDate(new Date(createdAt))}`
            : "",
        lat: rndFloat(BASE_LAT - 0.035, BASE_LAT + 0.035, 6),
        lng: rndFloat(BASE_LNG - 0.045, BASE_LNG + 0.045, 6),
        photo: makePhoto(hue, `ДО ${leakId}`, "before"),
        photo_repair:
          status === "in_progress" || status === "resolved"
            ? makePhoto(hue, `РЕМ ${leakId}`, "repair")
            : null,
        photo_after:
          status === "resolved"
            ? makePhoto(hue, `ПОСЛЕ ${leakId}`, "after")
            : null,
        repairAt,
        resolvedAt,
        ...calcFields({ leak_speed, temperature, vars }),
      };

      leak.monitoringRecords = buildMonitoringRecords({
        leak,
        rounds,
        currentRound,
        hue,
      });
      leak.history = buildHistory({
        leak,
        createdIso,
        currentUser,
      });
      leak.updatedAt = getLatestTimestamp(leak) ?? leak.updatedAt;

      leaks.push(leak);
    }

    return leaks.sort((left, right) => right.id - left.id);
  }

  function buildLocationFields(type) {
    if (type === "midstream") {
      const field = pick(FIELDS);
      return {
        field,
        station: pick(STATIONS[field]),
        location: pick(LOCATIONS),
      };
    }

    if (type === "downstream") {
      const district = pick(DISTRICTS);
      return {
        district,
        locality: pick(LOCALITIES[district]),
        address: pick(ADDRESSES),
        location: pick(LOCATIONS),
      };
    }

    const subdivision = pick(SUBDIVISIONS);
    return {
      subdivision,
      deposit: pick(DEPOSITS[subdivision]),
      location: pick(LOCATIONS),
    };
  }

  function buildMonitoringRecords({ leak, rounds, currentRound, hue }) {
    const records = [];
    const maxRounds = Math.min(rounds, rndInt(0, rounds));

    for (let round = 1; round <= maxRounds; round += 1) {
      const shouldSkipCurrent = round === currentRound && Math.random() < 0.35;
      if (shouldSkipCurrent) continue;

      const duplicates = round === currentRound && leak.index % 9 === 0 ? 2 : 1;
      for (let copy = 0; copy < duplicates; copy += 1) {
        const date = new Date(
          Date.now() - (rounds - round) * 24 * DAY + copy * 2 * HOUR,
        );
        const result =
          copy === duplicates - 1
            ? statusToMonitoringResult(leak.status)
            : pick(["still_leaking", "needs_recheck", "resolved"]);

        records.push({
          id: `${leak.id}-round-${round}-${copy + 1}`,
          date: date.toISOString(),
          roundId: `seed-round-${round}`,
          roundNumber: round,
          monitoredBy: pick(USERS),
          result,
          photo: makePhoto(
            hue + round * 19,
            `МОН ${leak.leak_id}.${round}`,
            "monitoring",
          ),
          materials_equipment:
            result === "still_leaking"
              ? leak.materials_equipment
              : pick(MATERIALS),
          comment:
            copy === duplicates - 1
              ? `Итоговая запись обхода ${round}`
              : `Черновая запись обхода ${round}`,
        });
      }
    }

    return records;
  }

  function buildHistory({ leak, createdIso, currentUser }) {
    const history = [
      {
        action: "created",
        date: createdIso,
        user: leak.detectedBy,
      },
    ];

    if (leak.repairAt) {
      history.push({
        action: "status_changed",
        from: "open",
        to: "in_progress",
        date: new Date(leak.repairAt).toISOString(),
        user: currentUser,
        changes: [{ key: "photo_repair", before: "", after: "Фото в ремонте" }],
      });
    }

    if (leak.resolvedAt) {
      history.push({
        action: "status_changed",
        from: "in_progress",
        to: "resolved",
        date: new Date(leak.resolvedAt).toISOString(),
        user: currentUser,
        changes: [
          { key: "photo_after", before: "", after: "Фото после ремонта" },
        ],
      });
    }

    for (const record of leak.monitoringRecords ?? []) {
      history.push({
        action: "monitoring",
        date: record.date,
        to:
          record.result === "resolved"
            ? "resolved"
            : record.result === "needs_recheck"
              ? "in_progress"
              : "open",
        user: record.monitoredBy,
        text: `${monitoringLabel(record.result)} ${record.comment ?? ""}`.trim(),
      });
    }

    return history.sort(
      (left, right) => Date.parse(left.date) - Date.parse(right.date),
    );
  }

  function getLatestTimestamp(leak) {
    const values = [
      leak.createdAt,
      leak.repairAt,
      leak.resolvedAt,
      ...(leak.monitoringRecords ?? []).map((record) =>
        Date.parse(record.date),
      ),
    ].filter((value) => Number.isFinite(Number(value)));
    return values.length ? Math.max(...values.map(Number)) : null;
  }

  function statusToMonitoringResult(status) {
    if (status === "resolved") return "resolved";
    if (status === "in_progress") return "needs_recheck";
    return "still_leaking";
  }

  function monitoringLabel(result) {
    return (
      {
        still_leaking: "Утечка сохраняется",
        needs_recheck: "Утечка в ремонте",
        resolved: "Утечка устранена",
      }[result] ?? result
    );
  }

  async function saveNativeData({ leaks, folderName }) {
    const Fs = window.Capacitor?.Plugins?.Filesystem;
    if (!Fs) throw new Error("Capacitor Filesystem недоступен");

    const dataDir = `LeakReports/${folderName}/data`;
    const photoDir = `LeakReports/${folderName}/photos`;
    await Fs.mkdir({ path: dataDir, directory: "DATA", recursive: true }).catch(
      () => {},
    );
    await Fs.mkdir({
      path: photoDir,
      directory: "DATA",
      recursive: true,
    }).catch(() => {});

    let photoCount = 0;
    for (const leak of leaks) {
      for (const key of ["photo", "photo_repair", "photo_after"]) {
        if (
          typeof leak[key] !== "string" ||
          !leak[key].startsWith("data:image/")
        )
          continue;
        leak[key] = await writeNativePhoto({
          Fs,
          photoDir,
          prefix: key,
          leakId: leak.leak_id,
          dataUrl: leak[key],
        });
        photoCount += 1;
      }

      for (const [recordIndex, record] of (
        leak.monitoringRecords ?? []
      ).entries()) {
        if (
          typeof record.photo !== "string" ||
          !record.photo.startsWith("data:image/")
        )
          continue;
        record.photo = await writeNativePhoto({
          Fs,
          photoDir,
          prefix: `monitoring_${record.roundNumber}_${recordIndex + 1}`,
          leakId: leak.leak_id,
          dataUrl: record.photo,
        });
        photoCount += 1;
      }
    }

    await Fs.writeFile({
      path: `${dataDir}/data.json`,
      directory: "DATA",
      data: JSON.stringify(leaks),
      encoding: "utf8",
    });
    console.log(`Фото записано в Filesystem: ${photoCount}`);
  }

  async function writeNativePhoto({ Fs, photoDir, prefix, leakId, dataUrl }) {
    const base64 = dataUrl.split(",")[1];
    const fileName = `photo_${prefix}_${leakId}_${Date.now()}_${Math.floor(
      Math.random() * 100000,
    )}.jpg`;
    const path = `${photoDir}/${fileName}`;
    await Fs.writeFile({ path, directory: "DATA", data: base64 });
    return `data://${path}`;
  }

  function makePhoto(hue, label, mode) {
    const width = 240;
    const height = 180;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const modeHue =
      mode === "after"
        ? (hue + 120) % 360
        : mode === "repair"
          ? (hue + 35) % 360
          : hue;

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, `hsl(${modeHue},45%,18%)`);
    bg.addColorStop(1, `hsl(${(modeHue + 35) % 360},35%,10%)`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const pipe = ctx.createLinearGradient(0, 70, 0, 120);
    pipe.addColorStop(0, `hsl(${modeHue},30%,55%)`);
    pipe.addColorStop(0.5, `hsl(${modeHue},20%,78%)`);
    pipe.addColorStop(1, `hsl(${modeHue},30%,30%)`);
    ctx.fillStyle = pipe;
    ctx.fillRect(0, 72, width, 40);

    ctx.fillStyle = `hsl(${modeHue},25%,43%)`;
    ctx.fillRect(20, 62, 18, 60);
    ctx.fillRect(width - 38, 62, 18, 60);

    ctx.fillStyle = `hsl(${modeHue},15%,67%)`;
    [66, 78, 90, 102, 114].forEach((y) => {
      ctx.beginPath();
      ctx.arc(29, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(width - 29, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    const color =
      mode === "after"
        ? "rgba(80,220,90,0.75)"
        : mode === "repair"
          ? "rgba(255,165,35,0.85)"
          : "rgba(255,95,35,0.8)";
    ctx.fillStyle = color;
    for (let i = 0; i < 18; i += 1) {
      const px = 55 + (i % 6) * 22 + Math.sin(i * 1.3) * 8;
      const py = 55 + Math.sin(i * 2.1) * 20 + (mode === "after" ? 28 : 0);
      const r = 2 + Math.abs(Math.sin(i)) * 4;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (mode !== "after") {
      const glow = ctx.createRadialGradient(
        width / 2,
        82,
        5,
        width / 2,
        82,
        55,
      );
      glow.addColorStop(0, "rgba(255,110,0,0.35)");
      glow.addColorStop(1, "rgba(255,110,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "bold 11px monospace";
    ctx.fillText(label, 8, height - 10);
    ctx.textAlign = "right";
    ctx.font = "9px monospace";
    ctx.fillText(formatShortDate(new Date()), width - 8, height - 10);
    ctx.textAlign = "left";

    return canvas.toDataURL("image/jpeg", 0.56);
  }

  function calcFields({ leak_speed, temperature, vars }) {
    const minutesPerYear = 1440 * vars.Operating_mode;
    const flareShare = vars.percentage_gas_to_flare / 100;
    const utilShare = vars.percentage_gas_to_utilization / 100;
    const leak_speed_kg_m = round((leak_speed * vars.density) / 1000, 6);
    const leak_speed_kg_h = round(leak_speed_kg_m * 60, 4);
    const Total_Annual_Methane_Loss_m3_y = round(
      (leak_speed * minutesPerYear) / 1000,
      4,
    );
    const Total_Annual_Methane_Loss_kg_y = round(
      Total_Annual_Methane_Loss_m3_y * vars.density,
      4,
    );
    const Total_Annual_Methane_Loss_t_y = round(
      Total_Annual_Methane_Loss_kg_y / 1000,
      6,
    );
    const weightedGWP = round(
      flareShare * vars.GWP_Minus + utilShare * vars.GWP,
      4,
    );
    const Emissions_t_CO2eq_year = round(
      Total_Annual_Methane_Loss_t_y * weightedGWP,
      6,
    );

    return {
      temperature_K: round(temperature + 273.15, 2),
      flareShare,
      utilShare,
      leak_speed_kg_m,
      leak_speed_kg_h,
      Total_Annual_Methane_Loss_m3_y,
      Total_Annual_Methane_Loss_kg_y,
      Total_Annual_Methane_Loss_t_y,
      weightedGWP,
      Emissions_t_CO2eq_year,
      Emissions_kg_CO2_eq_year: round(Emissions_t_CO2eq_year * 1000, 4),
      GWP: vars.GWP,
      GWP_Minus: vars.GWP_Minus,
      Operating_mode: vars.Operating_mode,
      gasType: vars.gasType,
    };
  }

  function priorityFromSpeed(speed) {
    if (!Number.isFinite(Number(speed)) || Number(speed) <= 0) return null;
    if (speed >= 100) return "critical";
    if (speed >= 50) return "high";
    if (speed >= 10) return "medium";
    return "low";
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function pickWeighted(items) {
    const total = items.reduce((sum, [, weight]) => sum + weight, 0);
    let cursor = Math.random() * total;
    for (const [value, weight] of items) {
      cursor -= weight;
      if (cursor <= 0) return value;
    }
    return items[items.length - 1][0];
  }

  function rndInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function rndFloat(min, max, digits = 2) {
    return round(Math.random() * (max - min) + min, digits);
  }

  function round(value, digits = 2) {
    return Number(Number(value).toFixed(digits));
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatDate(date) {
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
  }

  function formatShortDate(date) {
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
  }

  const DAY = 24 * 60 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;
  const BASE_LAT = 41.297147;
  const BASE_LNG = 69.258685;

  const USERS = ["Евгений", "Алексей", "Ирина", "Дмитрий", "Оператор смены"];
  const SUBDIVISIONS = [
    "ПУ №1 Карачаганак",
    "ПУ №2 Жанажол",
    "ПУ №3 Тенгиз",
    "ПУ №4 Кашаган",
  ];
  const DEPOSITS = {
    "ПУ №1 Карачаганак": ["Карачаганакское", "Чинаревское"],
    "ПУ №2 Жанажол": ["Жанажольское", "Кенкиякское"],
    "ПУ №3 Тенгиз": ["Тенгизское", "Королёвское"],
    "ПУ №4 Кашаган": ["Кашаганское", "Каламкас"],
  };
  const FIELDS = [
    "Западное УМГ",
    "Южное УМГ",
    "Северное УМГ",
    "Центральное УМГ",
  ];
  const STATIONS = {
    "Западное УМГ": ["КС-1", "КС-2"],
    "Южное УМГ": ["КС-3", "КС-4"],
    "Северное УМГ": ["КС-5", "КС-6"],
    "Центральное УМГ": ["КС-7", "КС-8"],
  };
  const DISTRICTS = [
    "Алмазарский",
    "Юнусабадский",
    "Мирзо-Улугбекский",
    "Сергелийский",
  ];
  const LOCALITIES = {
    Алмазарский: ["Каракамыш", "Чигатай"],
    Юнусабадский: ["Юнусабад", "Минор"],
    "Мирзо-Улугбекский": ["Дархан", "Буюк Ипак Йули"],
    Сергелийский: ["Сергели", "Куйлюк"],
  };
  const ADDRESSES = [
    "ул. Центральная, 12",
    "пр. Газовиков, 7",
    "ул. Промышленная, 3",
  ];
  const LOCATIONS = [
    "Скважина",
    "Пылеуловитель",
    "Турбокомпрессорный Агрегат",
    "Аппарат воздушного охлаждения газа",
    "Блок подготовки топливного газа",
    "Газоперекачивающий агрегат",
    "Печь газовая",
    "Блок фильтрсепараторов",
    "Большой контур",
    "Малый контур",
    "Цех",
    "Секция",
  ];
  const OBJECTS = [
    "Компрессорная станция",
    "Дожимная компрессорная станция",
    "Газодобывающее управление",
    "Кустовая площадка",
    "Установка комплексной подготовки газа",
    "Газосборный пункт",
    "Кран Шаровой",
    "Блок фильтрсепараторов",
  ];
  const COMPONENTS = [
    "Входная линия",
    "Выходная линия",
    "Свечная линия",
    "Дренажная линия",
    "Импульсная линия",
    "Кран Шаровой",
    "Вентиль",
    "Фланцевое соединение",
    "Патрубок",
    "Сварной шов",
  ];
  const CATEGORIES = [
    "Compression",
    "Primary Gas Treatment & Transport",
    "Processing",
    "Well",
  ];
  const ACTUATOR_TYPES = [
    "Механический ручной",
    "Гидравлический",
    "Пневматический",
    "Электрический",
  ];
  const CONNECTION_TYPES = [
    "Фланцевое соединение",
    "Муфтовая внутренняя резьба",
    "Сварное соединение",
    "Болтовое соединение",
  ];
  const INSTALLATION_TYPES = [
    "Наземный",
    "Подземный (открытое исполнение)",
    "Подземный (закрытое исполнение)",
  ];
  const DESCRIPTIONS = [
    "Технологическое/Техническое отверстие",
    "Фланцевое соединение",
    "Болтовое соединение",
    "Резьбовое соединение",
    "Шток/Маховик",
    "Крышка/Люк",
  ];
  const CAUSES = [
    "Износ уплотнений",
    "Износ соединений",
    "Износ прокладки",
    "Коррозия",
    "Повреждение",
    "Негерметичность",
  ];
  const SOLUTIONS = [
    "Ревизия уплотнений",
    "Ревизия соединения",
    "Подтяжка",
    "Демонтаж",
    "Замена крана",
    "Замена клапана",
    "Замена уплотнительного материала",
  ];
  const RECOMMENDATIONS = [
    "Без остановки",
    "Замена",
    "С остановкой",
    "Демонтаж",
    "Установка",
  ];
  const MATERIALS = [
    "По результату ревизии (замена прокладки и/или шпилек/гайек)",
    "Герметизирующая смазка и/или замена графитовой набивки",
    "Паронит / металлографит / спирально-навитая прокладка",
    "Анаэробный герметик и/или лента ФУМ (газовая)",
    "Болты, шпильки и гайки",
    "Кран шаровой DN-50 PN-64 кгс/см² с ручным приводом с ответными фланцами и крепежом",
  ];
  const EQUIPMENT_TYPES = ["GFM 2.0", "GFM 3.0", "Розовый мешок"];
  const UNCERTAINTY_MAP = {
    "GFM 2.0": 0.05,
    "GFM 3.0": 0.05,
    "Розовый мешок": 0.1,
  };

  await run();
})();
