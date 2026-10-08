import { describe, expect, it, vi } from "vitest";

import { handleVoiceText } from "./handleVoiceText";

describe("handleVoiceText", () => {
  it.each([
    [
      "upstream",
      "subdivision north deposit tengiz location pad object valve component flange",
      {
        subdivision: "North",
        deposit: "Tengiz",
        location: "Pad",
        object: "Valve",
        component: "Flange",
      },
    ],
    [
      "midstream",
      "field west station cs 12 location line 5 object valve component flange",
      {
        field: "West",
        station: "КС-12",
        location: "Line 5",
        object: "Valve",
        component: "Flange",
      },
    ],
    [
      "downstream",
      "district north locality astana address street 10 object valve component flange",
      {
        district: "North",
        locality: "Astana",
        address: "Street 10",
        object: "Valve",
        component: "Flange",
      },
    ],
  ])("maps voice location fields for %s", (project, text, expected) => {
    const setVoiceData = vi.fn();

    handleVoiceText(
      [],
      text,
      setVoiceData,
      project,
      null,
      Object.keys(expected),
    );

    expect(setVoiceData).toHaveBeenCalledWith(expected);
  });

  it("filters recognized fields by the configured voice output fields", () => {
    const setVoiceData = vi.fn();

    handleVoiceText(
      [],
      "leak cause corrosion leak description small leak",
      setVoiceData,
      "upstream",
      null,
      ["leak_description"],
    );

    expect(setVoiceData).toHaveBeenCalledWith({
      leak_description: "Small Leak",
    });
  });

  it("uses dictation mode when only disallowed structured fields were recognized", () => {
    const setVoiceData = vi.fn();

    handleVoiceText(
      [],
      "leak cause corrosion",
      setVoiceData,
      "upstream",
      "note",
      ["leak_description"],
    );

    expect(setVoiceData).toHaveBeenCalledWith({
      note: "leak cause corrosion",
    });
  });
  it.each([
    [
      "компонент кран шаровой номер пять пятьдесят на сорок",
      "Кран шаровой №5 50/40",
    ],
    [
      "компонент кш номер двадцать три пятьдесят на двадцать",
      "Кран шаровой №23 50/20",
    ],
    [
      "компонент змс номер семь восемьдесят на сорок",
      "Задвижка механическая стальная №7 80/40",
    ],
    [
      "компонент змс номер пять 20 на 40",
      "Задвижка механическая стальная №5 20/40",
    ],
    [
      "компонент кран пробковый номер пять сорок на пятьдесят",
      "Кран пробковый №5 40/50",
    ],
    [
      "компонент задвижка номер семь сорок на пятьдесят",
      "Задвижка механическая стальная №7 40/50",
    ],
  ])(
    "preserves the spoken component number and size through the full voice pipeline: %s",
    (text, component) => {
      const setVoiceData = vi.fn();

      handleVoiceText([], text, setVoiceData, "midstream", null, ["component"]);

      expect(setVoiceData).toHaveBeenCalledWith({ component });
    },
  );
});

describe("услышанное к словарю поля", () => {
  const registry = {
    component: ["Задвижка", "Кран шаровой"],
    component_type: ["Запорная арматура", "Регулирующая арматура"],
    medium: ["Природный газ", "Нефть"],
    body_material: ["Сталь 20", "Чугун"],
    component_status: ["В работе", "Требует замены"],
  };
  const allowed = [
    "component",
    "component_type",
    "medium",
    "body_material",
    "component_status",
  ];

  function run(text, options = registry) {
    const setVoiceData = vi.fn();
    handleVoiceText([], text, setVoiceData, "upstream", null, allowed, options);
    return setVoiceData.mock.calls[0]?.[0] ?? {};
  }

  it("кладёт в карточку значение из списка, а не как расслышалось", () => {
    // Иначе в поле оказывается строка, которой нет ни в одном выпадающем
    // списке, и человек правит её руками, стоя у железа.
    expect(run("тип компонента запорной арматуры")).toMatchObject({
      component_type: "Запорная арматура",
    });
  });

  it("сопоставляет среду, материал и состояние", () => {
    expect(
      run("среда природный газ материал корпуса сталь 20 состояние в работе"),
    ).toMatchObject({
      medium: "Природный газ",
      body_material: "Сталь 20",
      component_status: "В работе",
    });
  });

  it("предпочитает список реестра словарю утечек", () => {
    // У утечки то же железо называется описательно — «Задвижка механическая
    // стальная», — а в реестре оно «Задвижка».
    expect(run("компонент задвижка")).toMatchObject({ component: "Задвижка" });
  });

  it("оставляет услышанное, когда списка для поля нет", () => {
    // Завод-изготовитель словарём не описать: их столько же, сколько табличек.
    const setVoiceData = vi.fn();
    handleVoiceText(
      [],
      "производитель пензтяжпромарматура",
      setVoiceData,
      "upstream",
      null,
      ["manufacturer"],
      registry,
    );

    expect(setVoiceData).toHaveBeenCalledWith({
      manufacturer: "Пензтяжпромарматура",
    });
  });
});

describe("ложные подстановки голосом", () => {
  const registry = {
    medium: ["Сырой газ", "Очищенный газ (товарный газ)"],
    body_material: ["Сталь 20", "Сталь 09Г2С", "Нержавеющая сталь"],
    component_status: ["В работе", "Требует замены"],
  };
  const allowed = ["medium", "body_material", "component_status"];

  function run(text) {
    const setVoiceData = vi.fn();
    const heard = handleVoiceText(
      [],
      text,
      setVoiceData,
      "upstream",
      null,
      allowed,
      registry,
    );
    return { data: setVoiceData.mock.calls[0]?.[0] ?? {}, heard };
  }

  it("оставляет сказанное, если словарь подходит не по смыслу", () => {
    const { data } = run(
      "среда газовый конденсат материал корпуса сталь 40х состояние не работает",
    );
    expect(data.medium).toMatch(/газовый конденсат/i);
    expect(data.body_material).toMatch(/сталь 40х/i);
    expect(data.component_status).toMatch(/не работает/i);
  });

  it("возвращает услышанное там, где словарь заменил сказанное", () => {
    const { data, heard } = run("состояние в работу материал корпуса сталь 20");
    expect(data.component_status).toBe("В работе");
    expect(heard.component_status).toMatch(/в работу/i);
    // «Сталь 20» сказана как есть — показывать рядом нечего.
    expect(heard.body_material).toBeUndefined();
  });
});
