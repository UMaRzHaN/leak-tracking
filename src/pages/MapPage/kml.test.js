import { describe, expect, it } from "vitest";
import { translate, translateRu } from "@/test/translate";
import { KML_MODE, exportComponentsKML, exportLeaksKML } from "./kml";

describe("exportLeaksKML", () => {
  it("escapes XML tag values and keeps description content readable", () => {
    const kml = exportLeaksKML(
      [
        {
          id: "1",
          leak_id: "A&B<1>",
          station: "КС & 5",
          field: "Field <North>",
          component: '<img src="https://tracker.test/pixel"> ]]> test',
          leak_speed: 12,
          lat: 51.5,
          lng: 71.4,
        },
      ],
      "midstream",
      translateRu,
    );

    expect(kml).toContain("<name>A&amp;B&lt;1&gt;</name>");
    expect(kml).toContain("<name>КС &amp; 5</name>");
    expect(kml).toContain("Field &lt;North&gt;");
    expect(kml).toContain(
      "&lt;img src=&quot;https://tracker.test/pixel&quot;&gt; ]]&gt; test",
    );
    expect(kml).not.toContain('<img src="https://tracker.test/pixel">');
    // The Russian export uses the Russian labels, not the interface default.
    expect(kml).toContain("Скорость");
    expect(kml).toContain("Отчет по утечкам");
  });

  it("выносит точность координат в описание булавки", () => {
    const kml = exportLeaksKML(
      [{ id: "1", leak_id: "A-1", lat: 51.5, lng: 71.4, coords_accuracy: 12 }],
      "midstream",
      translateRu,
    );

    expect(kml).toContain("Точность:");
    expect(kml).toContain("±12 м");
  });

  it("молчит о точности там, где её не записали", () => {
    // Записи до появления поля — обычный случай, а не пробел: пометка о нём в
    // каждой второй карточке ГИС ничего не сообщает.
    const kml = exportLeaksKML(
      [{ id: "1", leak_id: "A-1", lat: 51.5, lng: 71.4 }],
      "midstream",
      translateRu,
    );

    expect(kml).not.toContain("Точность:");
  });

  it("omits placemarks with out-of-range coordinates", () => {
    const kml = exportLeaksKML(
      [
        { leak_id: "VALID", station: "A", lat: 0, lng: 0 },
        { leak_id: "INVALID", station: "A", lat: 999, lng: 0 },
      ],
      "midstream",
      translate,
    );

    expect(kml).toContain("<name>VALID</name>");
    expect(kml).not.toContain("<name>INVALID</name>");
  });
});

describe("exportComponentsKML", () => {
  const cards = [
    {
      id: "a",
      component_uid: "4242",
      component: "Задвижка",
      scheme_tag: "ЗД32",
      component_status: "Требует замены",
      subdivision: "Мессояхское УПГ",
      deposit: "Бузахур",
      lat: 38.4,
      lng: 66.1,
    },
  ];

  it("подписывает булавку присвоенным номером, а не биркой утечки", () => {
    const kml = exportComponentsKML(cards, "upstream", translateRu);

    expect(kml).toContain("<name>4242</name>");
    expect(kml).toContain("ЗД32");
    expect(kml).toContain("Требует замены");
  });

  it("не говорит о скорости утечки там, где её нет", () => {
    // У железа её не бывает; выгружать компоненты под видом утечек значило бы
    // отдать получателю файл, где половина подписей не про то.
    const kml = exportComponentsKML(cards, "upstream", translateRu);

    expect(kml).not.toContain(
      translateRu("addLeak.fields.leak_speed.shortLabel"),
    );
  });

  it("группирует по месторождению, как и утечки", () => {
    const kml = exportComponentsKML(cards, "upstream", translateRu);
    expect(kml).toContain("<name>Бузахур</name>");
  });

  it("пропускает карточку без координат, а не ставит её в ноль", () => {
    const kml = exportComponentsKML(
      [{ ...cards[0], lat: null, lng: null }],
      "upstream",
      translateRu,
    );

    expect(kml).not.toContain("<Placemark>");
  });
});

describe("KML по смыслу карты", () => {
  const place = {
    subdivision: "УПГ",
    deposit: "Бузахур",
    lat: 38.4,
    lng: 66.1,
  };
  const open = { id: "1", leak_id: "101", status: "open", ...place };
  const repair = { id: "2", leak_id: "102", status: "in_progress", ...place };
  const done = { id: "3", leak_id: "103", status: "resolved", ...place };
  const folderNames = (kml) =>
    [...kml.matchAll(/<Folder>\s*<name>([^<]*)<\/name>/g)].map((m) => m[1]);

  it("утечки — папками по статусу, внутри по месту", () => {
    const kml = exportLeaksKML([done, open], "upstream", translateRu);
    expect(folderNames(kml)).toEqual([
      "Открыта (1)",
      "Бузахур",
      "Устранена (1)",
      "Бузахур",
    ]);
    // Цвет метки — цвет статуса, как у булавки.
    expect(kml).toContain("color=E53935");
    expect(kml).toContain("color=43A047");
  });

  it("мониторинг в обходе — к осмотру отдельно, осмотренные серым", () => {
    const kml = exportLeaksKML(
      [
        { ...open, _checkedInRound: false },
        { ...repair, _checkedInRound: true },
      ],
      "upstream",
      translateRu,
      KML_MODE.MONITORING,
    );
    const names = folderNames(kml);
    expect(names[0]).toMatch(/^К осмотру · Открыта \(1\)$/);
    expect(names).toContain("Осмотрено в обходе (1)");
    expect(kml).toContain("color=9E9E9E");
    expect(kml).toContain("Последний осмотр:</b> Не осматривалась");
    expect(kml).toContain("<name>Обход мониторинга</name>");
  });

  it("ремонты — папками по стадии работ", () => {
    const kml = exportLeaksKML(
      [open, repair],
      "upstream",
      translateRu,
      KML_MODE.REPAIRS,
    );
    expect(folderNames(kml)).toEqual([
      "Ожидает МТР (1)",
      "Бузахур",
      "В ремонте (1)",
      "Бузахур",
    ]);
  });

  it("инвентаризация — папками по состоянию, с датой осмотра", () => {
    const kml = exportComponentsKML(
      [
        {
          id: "c",
          component_uid: "0001",
          component_status: "В работе",
          inspected_at: "2026-10-07T10:00:00.000Z",
          ...place,
        },
      ],
      "upstream",
      translateRu,
    );
    expect(folderNames(kml)[0]).toBe("В работе (1)");
    expect(kml).toContain("Последний осмотр:</b> 2026-10-07");
  });
});
