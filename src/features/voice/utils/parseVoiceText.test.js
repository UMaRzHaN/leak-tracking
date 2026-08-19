import { parseVoiceText } from "./parseVoiceText";

describe("parseVoiceText", () => {
  describe("edge cases", () => {
    it("returns empty object for empty string", () => {
      expect(parseVoiceText("")).toEqual({});
    });

    it("returns empty object for null", () => {
      expect(parseVoiceText(null)).toEqual({});
    });

    it("returns empty object for undefined", () => {
      expect(parseVoiceText(undefined)).toEqual({});
    });

    it("returns empty object when no markers match", () => {
      expect(parseVoiceText("просто текст без маркеров")).toEqual({});
    });
  });

  describe("идентификаторы", () => {
    it('extracts leak_id from "бирка N"', () => {
      expect(parseVoiceText("бирка 42")).toMatchObject({ leak_id: "42" });
    });

    it('extracts leak_id from inflected "бирки N"', () => {
      expect(parseVoiceText("бирки 7")).toMatchObject({ leak_id: "7" });
    });

    it('extracts leak_id from "номер бирки N"', () => {
      expect(parseVoiceText("номер бирки 12")).toMatchObject({
        leak_id: "12",
      });
    });

    it('extracts leak_id from "id утечки N"', () => {
      expect(parseVoiceText("id утечки 44")).toMatchObject({
        leak_id: "44",
      });
    });

    it('extracts leak_id from "тег N"', () => {
      expect(parseVoiceText("тег 8")).toMatchObject({ leak_id: "8" });
    });

    it("extracts video_id", () => {
      expect(parseVoiceText("видео 15")).toMatchObject({ video_id: "15" });
    });

    it('extracts video_id from "номер видео N"', () => {
      expect(parseVoiceText("номер видео 31")).toMatchObject({
        video_id: "31",
      });
    });

    it('extracts video_id from "video id N"', () => {
      expect(parseVoiceText("video id 22")).toMatchObject({
        video_id: "22",
      });
    });
  });

  describe("числовые параметры", () => {
    it("extracts natural leak speed phrase", () => {
      expect(parseVoiceText("скорость утечки пять и семь")).toMatchObject({
        leak_speed: 5.7,
      });
    });

    it("extracts pressure with filler word", () => {
      expect(parseVoiceText("давление равно сорок")).toMatchObject({
        pressure: 40,
      });
    });

    it("extracts temperature with filler word and negative value", () => {
      expect(parseVoiceText("температура это минус пятнадцать")).toMatchObject({
        temperature: -15,
      });
    });

    it("extracts leak_speed with comma decimal", () => {
      expect(parseVoiceText("скорость 5,7")).toMatchObject({ leak_speed: 5.7 });
    });

    it("extracts leak_speed with dot decimal", () => {
      expect(parseVoiceText("скорость 3.14")).toMatchObject({
        leak_speed: 3.14,
      });
    });

    it("extracts leak_speed as integer", () => {
      expect(parseVoiceText("скорость 10")).toMatchObject({ leak_speed: 10 });
    });

    it("extracts pressure", () => {
      expect(parseVoiceText("давление 45")).toMatchObject({ pressure: 45 });
    });

    it("extracts positive temperature", () => {
      expect(parseVoiceText("температура 20")).toMatchObject({
        temperature: 20,
      });
    });

    it("extracts negative temperature", () => {
      expect(parseVoiceText("температура -15")).toMatchObject({
        temperature: -15,
      });
    });

    it("does not set number field when value is NaN (e.g. orphan dot)", () => {
      const r = parseVoiceText("скорость . давление 5");
      expect(r.leak_speed).toBeUndefined();
      expect(r.pressure).toBe(5);
    });

    it("correctly assigns zero speed", () => {
      expect(parseVoiceText("скорость 0")).toMatchObject({ leak_speed: 0 });
    });
  });

  describe("локации", () => {
    it("extracts main (умг)", () => {
      const r = parseVoiceText("умг газпром");
      expect(r.main).toBe("Газпром");
    });

    it("extracts main from mgpa", () => {
      const r = parseVoiceText("mgpa mgpa-1");
      expect(r.main).toBe("Mgpa-1");
    });

    it("extracts main from full English MGPA phrase", () => {
      const r = parseVoiceText("main gas pipeline administration mgpa-12");
      expect(r.main).toBe("Mgpa-12");
    });

    it("extracts main (управление)", () => {
      const r = parseVoiceText("управление северное");
      expect(r.main).toBe("Северное");
    });

    it("extracts secondary from compressor station and normalizes КС", () => {
      const r = parseVoiceText("компрессорная станция кс5");
      expect(r.secondary).toBe("КС-5");
    });

    it("extracts secondary (месторождение)", () => {
      const r = parseVoiceText("месторождение советское");
      expect(r.secondary).toBe("Советское");
    });

    it.each([
      ["месторождение кокдумалак", "Кокдумалак"],
      ["месторождения кокдумалак", "Кокдумалак"],
      ["место рождения кокдумалак", "Кокдумалак"],
      ["место рождение кокдумалак", "Кокдумалак"],
      ["место рождения газа кокдумалак", "Кокдумалак"],
      ["газовое месторождение кокдумалак", "Кокдумалак"],
      ["нефтяное месторождение кокдумалак", "Кокдумалак"],
      ["компрессорная станция мубарек", "Мубарек"],
      ["кс мубарек", "Мубарек"],
      ["gas field kokdumalak", "Kokdumalak"],
      ["oil field kokdumalak", "Kokdumalak"],
    ])("extracts secondary from %s", (text, expected) => {
      expect(parseVoiceText(text)).toMatchObject({ secondary: expected });
    });

    // Населённый пункт — верхний уровень downstream, поэтому слот main.
    it('extracts main from full phrase "населённый пункт"', () => {
      const r = parseVoiceText("населённый пункт советский");
      expect(r.main).toBe("Советский");
    });

    it("extracts last (локация)", () => {
      const r = parseVoiceText("локация северный участок");
      expect(r.last).toBe("Северный участок");
    });

    it("extracts last (адрес)", () => {
      const r = parseVoiceText("адрес ул ленина 5");
      expect(r.last).toBeDefined();
    });

    it("extracts English location fields", () => {
      const r = parseVoiceText(
        "subdivision ngdu-1 deposit tengiz location block 12",
      );
      expect(r.main).toBe("Ngdu-1");
      expect(r.secondary).toBe("Tengiz");
      expect(r.last).toBe("Block 12");
    });

    it("keeps backward-compatible field marker for main", () => {
      expect(parseVoiceText("field west")).toMatchObject({ main: "West" });
    });

    it("keeps backward-compatible station marker for secondary", () => {
      expect(parseVoiceText("station кс-12")).toMatchObject({
        secondary: "КС-12",
      });
    });

    // Район лежит под населённым пунктом, отсюда slot secondary.
    it("extracts district for downstream mapping", () => {
      expect(parseVoiceText("district north")).toMatchObject({
        secondary: "North",
      });
    });
  });

  describe("объект и компонент", () => {
    it("extracts object after filler word", () => {
      const r = parseVoiceText("объект это газопровод");
      expect(r.object).toBe("Газопровод");
    });

    it("extracts component after filler word", () => {
      const r = parseVoiceText("компонент такой фланец");
      expect(r.component).toBe("Фланец");
    });

    it("extracts object", () => {
      const r = parseVoiceText("объект газопровод");
      expect(r.object).toBe("Газопровод");
    });

    it("extracts component", () => {
      const r = parseVoiceText("компонент кран");
      expect(r.component).toBe("Кран");
    });

    it("extracts category", () => {
      const r = parseVoiceText("категория первая");
      expect(r.category).toBe("Первая");
    });

    it("extracts English object and component", () => {
      const r = parseVoiceText("object pipeline component ball valve");
      expect(r.object).toBe("Pipeline");
      expect(r.component).toBe("Ball Valve");
    });
  });

  describe("описания", () => {
    it("extracts note", () => {
      const r = parseVoiceText("примечание дополнительная информация");
      expect(r.note).toBe("Дополнительная информация");
    });

    it("extracts note from заметка", () => {
      const r = parseVoiceText("заметка проверить повторно");
      expect(r.note).toBe("Проверить повторно");
    });

    it("extracts note from комментарий", () => {
      const r = parseVoiceText("комментарий видно с дороги");
      expect(r.note).toBe("Видно с дороги");
    });

    it("extracts leak_description", () => {
      const r = parseVoiceText("описание утечки фланцевое соединение");
      expect(r.leak_description).toBe("Фланцевое соединение");
    });

    it("extracts leak_cause", () => {
      const r = parseVoiceText("причина утечки коррозия металла");
      expect(r.leak_cause).toBe("Коррозия металла");
    });

    it("extracts technological_solution", () => {
      const r = parseVoiceText("тех решение замена прокладки");
      expect(r.technological_solution).toBe("Замена прокладки");
    });

    it("extracts repair_recommendation", () => {
      const r = parseVoiceText("план устранения замена болтов");
      expect(r.repair_recommendation).toBe("Замена болтов");
    });

    it("extracts materials_equipment (мтр)", () => {
      const r = parseVoiceText("мтр болты м16");
      expect(r.materials_equipment).toBe("Болты м16");
    });

    it("extracts materials_equipment (мтр ремонта — longer marker takes precedence)", () => {
      const r = parseVoiceText("мтр ремонта болты м16");
      expect(r.materials_equipment).toBe("Болты м16");
    });

    it("extracts English text fields", () => {
      const r = parseVoiceText(
        "leak description flange connection leak cause corrosion note visible from road",
      );
      expect(r.leak_description).toBe("Flange Connection");
      expect(r.leak_cause).toBe("Corrosion");
      expect(r.note).toBe("Visible From Road");
    });
  });

  describe("типы оборудования", () => {
    it("extracts actuator_type (тип привода)", () => {
      const r = parseVoiceText("тип привода пневматический");
      expect(r.actuator_type).toBe("Пневматический");
    });

    it("extracts actuator_type (привод — short form)", () => {
      const r = parseVoiceText("привод электрический");
      expect(r.actuator_type).toBe("Электрический");
    });

    it("extracts connection_type (присоединение)", () => {
      const r = parseVoiceText("присоединение фланцевое");
      expect(r.connection_type).toBe("Фланцевое");
    });

    it("extracts installation_type (установка)", () => {
      const r = parseVoiceText("установка наземная");
      expect(r.installation_type).toBe("Наземная");
    });
  });

  describe("множественные поля и lookahead", () => {
    it("extracts multiple fields from a single utterance", () => {
      const r = parseVoiceText("бирка 5 скорость 2 давление 10");
      expect(r.leak_id).toBe("5");
      expect(r.leak_speed).toBe(2);
      expect(r.pressure).toBe(10);
    });

    it("object value stops at next field marker", () => {
      const r = parseVoiceText("объект газопровод компонент кран");
      expect(r.object).toBe("Газопровод");
      expect(r.component).toBe("Кран");
    });

    it("last match wins when field appears twice (correction behavior)", () => {
      const r = parseVoiceText("бирка 5 бирка 10");
      expect(r.leak_id).toBe("10");
    });

    it("full realistic utterance parses correctly", () => {
      const r = parseVoiceText(
        "бирка 123 скорость 5,2 давление 40 станция кс-5 объект кран шаровой",
      );
      expect(r.leak_id).toBe("123");
      expect(r.leak_speed).toBeCloseTo(5.2);
      expect(r.pressure).toBe(40);
      expect(r.secondary).toBe("КС-5");
      expect(r.object).toBe("Кран шаровой");
    });
  });
});

describe("parseVoiceText abbreviations", () => {
  it("parses Russian component abbreviations", () => {
    expect(parseVoiceText("объект кш компонент фланец")).toMatchObject({
      object: "Кран шаровой",
      component: "Фланец",
    });

    expect(parseVoiceText("объект кп")).toMatchObject({
      object: "Кран пробковый",
    });
  });

  it("parses English component abbreviations", () => {
    expect(parseVoiceText("object bv component flange")).toMatchObject({
      object: "Кран шаровой",
      component: "Flange",
    });
  });

  it("parses compressor-station abbreviations", () => {
    expect(parseVoiceText("кс мубарек")).toMatchObject({
      secondary: "Мубарек",
    });
    expect(parseVoiceText("cs mubarek")).toMatchObject({
      secondary: "Mubarek",
    });
  });

  it("parses an abbreviation next to punctuation", () => {
    expect(parseVoiceText("объект кш, компонент фланец")).toMatchObject({
      object: "Кран шаровой,",
      component: "Фланец",
    });
  });
});

describe("parseVoiceText contextual abbreviation normalization", () => {
  it("keeps station abbreviations intact until station normalization", () => {
    expect(parseVoiceText("станция кс номер два")).toMatchObject({
      secondary: "КС-2",
    });
    expect(parseVoiceText("station cs number five")).toMatchObject({
      secondary: "КС-5",
    });
  });

  it("collapses redundant station abbreviation and full name in either order", () => {
    expect(parseVoiceText("кс компрессорная станция номер два")).toMatchObject({
      secondary: "КС-2",
    });
    expect(parseVoiceText("компрессорная станция кс номер два")).toMatchObject({
      secondary: "КС-2",
    });
  });

  it("expands field abbreviations after parsing and supports universal numbers", () => {
    expect(parseVoiceText("объект кп номер два")).toMatchObject({
      object: "Кран пробковый №2",
    });
    expect(parseVoiceText("компонент задвижка номер семь")).toMatchObject({
      component: "Задвижка механическая стальная №7",
    });
  });

  it("collapses redundant object abbreviation and full name in either order", () => {
    expect(parseVoiceText("объект кш кран шаровой номер два")).toMatchObject({
      object: "Кран шаровой №2",
    });
    expect(parseVoiceText("объект кран шаровой кш номер два")).toMatchObject({
      object: "Кран шаровой №2",
    });
  });
});

describe("parseVoiceText entity numbers and sizes", () => {
  it("separates an explicit component number from a following size", () => {
    expect(
      parseVoiceText("компонент кш номер двадцать три пятьдесят на двадцать"),
    ).toMatchObject({
      component: "Кран шаровой №23 50/20",
    });
  });

  it("works for other component abbreviations", () => {
    expect(
      parseVoiceText("компонент змс номер семь пятьдесят на двадцать"),
    ).toMatchObject({
      component: "Задвижка механическая стальная №7 50/20",
    });

    expect(
      parseVoiceText("компонент кп номер девять восемьдесят на сорок"),
    ).toMatchObject({
      component: "Кран пробковый №9 80/40",
    });

    expect(
      parseVoiceText("компонент сппк номер один сто на пятьдесят"),
    ).toMatchObject({
      component: "Сбросной пружинный предохранительный клапан №1 100/50",
    });
  });

  it("supports the size before the entity number", () => {
    expect(
      parseVoiceText("компонент кш пятьдесят на двадцать номер двадцать три"),
    ).toMatchObject({
      component: "Кран шаровой №23 50/20",
    });
  });
});

describe("parseVoiceText full component names and speech variants", () => {
  it("parses a full ball-valve name with a spoken number and size", () => {
    expect(
      parseVoiceText(
        "компонент кран шаровой номер двадцать три пятьдесят на двадцать",
      ),
    ).toMatchObject({
      component: "Кран шаровой №23 50/20",
    });
  });

  it("normalizes common ball-valve recognition variants", () => {
    const phrases = [
      "компонент шаровой кран номер двадцать три пятьдесят на двадцать",
      "компонент кран шаровый номер двадцать три пятьдесят на двадцать",
      "компонент кран шоровой номер двадцать три пятьдесят на двадцать",
    ];

    for (const phrase of phrases) {
      expect(parseVoiceText(phrase)).toMatchObject({
        component: "Кран шаровой №23 50/20",
      });
    }
  });

  it("supports full names and aliases for other component types", () => {
    expect(
      parseVoiceText(
        "компонент задвижка механическая стальная номер семь пятьдесят на двадцать",
      ),
    ).toMatchObject({
      component: "Задвижка механическая стальная №7 50/20",
    });

    expect(
      parseVoiceText(
        "компонент пробковый кран номер девять восемьдесят на сорок",
      ),
    ).toMatchObject({
      component: "Кран пробковый №9 80/40",
    });

    expect(
      parseVoiceText(
        "компонент предохранительный клапан номер один сто на пятьдесят",
      ),
    ).toMatchObject({
      component: "Сбросной пружинный предохранительный клапан №1 100/50",
    });
  });
});

describe("parseVoiceText end-to-end voice component scenarios", () => {
  const cases = [
    {
      phrase: "компонент кш номер двадцать три пятьдесят на двадцать",
      expected: "Кран шаровой №23 50/20",
    },
    {
      phrase: "компонент кран шаровой номер двадцать три пятьдесят на двадцать",
      expected: "Кран шаровой №23 50/20",
    },
    {
      phrase: "компонент шаровой кран номер двадцать три пятьдесят на двадцать",
      expected: "Кран шаровой №23 50/20",
    },
    {
      phrase: "компонент кран шаровый номер двадцать три пятьдесят на двадцать",
      expected: "Кран шаровой №23 50/20",
    },
    {
      phrase: "компонент кран шоровой номер двадцать три пятьдесят на двадцать",
      expected: "Кран шаровой №23 50/20",
    },
    {
      phrase: "компонент кран шаровой пятьдесят на двадцать номер двадцать три",
      expected: "Кран шаровой №23 50/20",
    },
    {
      phrase: "компонент змс номер семь пятьдесят на двадцать",
      expected: "Задвижка механическая стальная №7 50/20",
    },
    {
      phrase:
        "компонент задвижка механическая стальная номер семь пятьдесят на двадцать",
      expected: "Задвижка механическая стальная №7 50/20",
    },
    {
      phrase: "компонент кп номер девять восемьдесят на сорок",
      expected: "Кран пробковый №9 80/40",
    },
    {
      phrase: "компонент пробковый кран номер девять восемьдесят на сорок",
      expected: "Кран пробковый №9 80/40",
    },
    {
      phrase: "компонент сппк номер один сто на пятьдесят",
      expected: "Сбросной пружинный предохранительный клапан №1 100/50",
    },
    {
      phrase: "компонент предохранительный клапан номер один сто на пятьдесят",
      expected: "Сбросной пружинный предохранительный клапан №1 100/50",
    },
  ];

  it.each(cases)('parses "$phrase"', ({ phrase, expected }) => {
    expect(parseVoiceText(phrase)).toMatchObject({
      component: expected,
    });
  });
});

describe("что слышно у железа, а не у утечки", () => {
  it("отделяет присвоенный номер от наименования", () => {
    // Сказанное «номер компонента 4242» писало «4242» в наименование.
    expect(
      parseVoiceText("номер компонента 4242 компонент задвижка"),
    ).toMatchObject({
      component_uid: "4242",
      component: "Задвижка механическая стальная",
    });
  });

  it("понимает и «индивидуальный номер»", () => {
    expect(parseVoiceText("индивидуальный номер 15")).toMatchObject({
      component_uid: "15",
    });
  });

  it("возвращает бирку со схемы заглавными, как её пишут", () => {
    // Обозначения с чертежа в нижнем регистре не существует.
    expect(parseVoiceText("инвентаризационный номер зд32")).toMatchObject({
      scheme_tag: "ЗД32",
    });
    expect(parseVoiceText("номер на схеме pg-7")).toMatchObject({
      scheme_tag: "PG-7",
    });
  });

  it("не путает тип компонента с наименованием", () => {
    const parsed = parseVoiceText(
      "тип компонента запорная арматура тип оборудования трубопроводная арматура",
    );

    expect(parsed).toMatchObject({
      component_type: "Запорная арматура",
      equipment_type: "Трубопроводная арматура",
    });
    expect(parsed.component).toBeUndefined();
  });

  it("слышит паспортные величины по-русски и сокращениями", () => {
    expect(
      parseVoiceText(
        "номинальный диаметр 400 номинальное давление 16 рабочее давление 12 рабочая температура 40",
      ),
    ).toMatchObject({
      nominal_diameter: 400,
      nominal_pressure: 16,
      working_pressure: 12,
      working_temperature: 40,
    });
  });

  it("слышит ДУ и РУ, набранные с таблички", () => {
    // \b рядом с кириллицей не срабатывает — граница здесь своя.
    expect(parseVoiceText("ду 100 ру 6")).toMatchObject({
      nominal_diameter: 100,
      nominal_pressure: 6,
    });
  });

  it("не принимает «ду» внутри слова за диаметр", () => {
    expect(parseVoiceText("буду смотреть 5")).not.toHaveProperty(
      "nominal_diameter",
    );
  });

  it("слышит среду, материал корпуса и завод", () => {
    expect(
      parseVoiceText(
        "среда природный газ материал корпуса сталь 20 производитель пензтяжпромарматура",
      ),
    ).toMatchObject({
      medium: "Природный газ",
      body_material: "Сталь 20",
      manufacturer: "Пензтяжпромарматура",
    });
  });

  it("слышит состояние железа", () => {
    expect(parseVoiceText("состояние в работе")).toMatchObject({
      component_status: "В работе",
    });
  });
});
