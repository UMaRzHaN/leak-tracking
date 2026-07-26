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

    it('extracts secondary from full phrase "населённый пункт"', () => {
      const r = parseVoiceText("населённый пункт советский");
      expect(r.secondary).toBe("Советский");
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

    it("extracts district for downstream mapping", () => {
      expect(parseVoiceText("district north")).toMatchObject({ main: "North" });
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
