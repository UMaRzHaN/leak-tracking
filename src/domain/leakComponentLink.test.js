import { describe, expect, it } from "vitest";
import {
  describeLinkedComponent,
  isLinkedToComponent,
  linkLeakToComponent,
  unlinkLeakComponent,
} from "@/domain/leakComponentLink";

const CARD = {
  id: "card-1",
  component_uid: "9001",
  component: "Задвижка",
  actuator_type: "Механический ручной",
  connection_type: "Фланцевое соединение",
  installation_type: "Наземный",
  lat: 41.31,
  lng: 69.24,
  photo: { src: "карточка.jpg" },
  component_status: "В работе",
  body_material: "Сталь 20",
};

describe("связь утечки с карточкой", () => {
  it("переносит паспорт железа и ставит ссылку", () => {
    const linked = linkLeakToComponent({ leak_id: "4242" }, CARD);

    expect(linked.component_id).toBe("card-1");
    expect(linked.component_uid).toBe("9001");
    expect(linked.component).toBe("Задвижка");
    expect(linked.actuator_type).toBe("Механический ручной");
    expect(linked.connection_type).toBe("Фланцевое соединение");
    expect(linked.installation_type).toBe("Наземный");
    expect(linked.leak_id).toBe("4242");
  });

  it("не трогает исходную утечку", () => {
    const leak = { leak_id: "4242" };
    linkLeakToComponent(leak, CARD);

    expect(leak).toEqual({ leak_id: "4242" });
  });

  /*
   * На карточке снят компонент, а от утечки нужен снимок утечки. Подставить
   * одно вместо другого значит выдать фотографию исправного железа за
   * доказательство пропуска.
   */
  it("никогда не переносит снимок карточки", () => {
    expect(linkLeakToComponent({}, CARD).photo).toBeUndefined();
    expect(
      linkLeakToComponent({ photo: { src: "утечка.jpg" } }, CARD).photo,
    ).toEqual({ src: "утечка.jpg" });
  });

  it("не переносит поля, которых у утечки нет", () => {
    const linked = linkLeakToComponent({}, CARD);

    expect(linked.component_status).toBeUndefined();
    expect(linked.body_material).toBeUndefined();
  });

  it("пропускает пустые поля карточки, не затирая заполненное", () => {
    const linked = linkLeakToComponent(
      { actuator_type: "Электрический" },
      { ...CARD, actuator_type: "  " },
    );

    expect(linked.actuator_type).toBe("Электрический");
  });

  describe("координаты", () => {
    // Свой фикс — свидетельство: где нашли, там и нашли.
    it("оставляет собственный фикс утечки", () => {
      const linked = linkLeakToComponent({ lat: 55.1, lng: 37.2 }, CARD);

      expect(linked.lat).toBe(55.1);
      expect(linked.lng).toBe(37.2);
    });

    // Но утечка без координат выпадает с карты совсем.
    it("подставляет координаты железа, когда своих нет", () => {
      const linked = linkLeakToComponent({}, CARD);

      expect(linked.lat).toBe(41.31);
      expect(linked.lng).toBe(69.24);
    });

    it("считает пустую строку отсутствием фикса", () => {
      const linked = linkLeakToComponent({ lat: "", lng: "" }, CARD);

      expect(linked.lat).toBe(41.31);
    });

    it("не выдумывает координат, когда их нет и у карточки", () => {
      const linked = linkLeakToComponent({}, { ...CARD, lat: null, lng: null });

      expect(linked.lat).toBeUndefined();
      expect(linked.lng).toBeUndefined();
    });

    // Половина фикса — не фикс: одна широта на карту не ставится.
    it("не берёт половину координат", () => {
      const linked = linkLeakToComponent({}, { ...CARD, lng: null });

      expect(linked.lat).toBeUndefined();
    });
  });

  it("не связывает с карточкой без идентификатора", () => {
    const leak = { leak_id: "4242" };

    expect(linkLeakToComponent(leak, { component_uid: "9001" })).toBe(leak);
    expect(linkLeakToComponent(leak, null)).toBe(leak);
  });
});

describe("снятие связи", () => {
  /*
   * Открепляют, когда выбрали не ту карточку. Стирать вместе со ссылкой всё
   * перенесённое нельзя: часть могла быть написана руками до выбора или
   * исправлена после.
   */
  it("убирает ссылку, оставляя заполненное", () => {
    const linked = linkLeakToComponent({ leak_id: "4242" }, CARD);
    const unlinked = unlinkLeakComponent(linked);

    expect(unlinked.component_id).toBeUndefined();
    expect(unlinked.component_uid).toBeUndefined();
    expect(unlinked.component).toBe("Задвижка");
    expect(unlinked.actuator_type).toBe("Механический ручной");
    expect(unlinked.leak_id).toBe("4242");
  });

  it("возвращает несвязанную утечку как есть", () => {
    const leak = { leak_id: "4242" };

    expect(unlinkLeakComponent(leak)).toBe(leak);
    expect(unlinkLeakComponent(null)).toBeNull();
  });
});

describe("признак и подпись", () => {
  it("узнаёт связанную утечку", () => {
    expect(isLinkedToComponent({ component_id: "card-1" })).toBe(true);
    expect(isLinkedToComponent({ component_uid: "9001" })).toBe(false);
    expect(isLinkedToComponent({})).toBe(false);
  });

  // Номер впереди наименования: его ищут глазами на бирке, а «Задвижек» сотни.
  it("подписывает связь номером и наименованием", () => {
    expect(
      describeLinkedComponent({
        component_id: "card-1",
        component_uid: "9001",
        component: "Задвижка",
      }),
    ).toBe("№9001 · Задвижка");
  });

  it("обходится тем, что есть", () => {
    expect(
      describeLinkedComponent({ component_id: "c", component_uid: "9001" }),
    ).toBe("№9001");
    expect(
      describeLinkedComponent({ component_id: "c", component: "Задвижка" }),
    ).toBe("Задвижка");
    expect(describeLinkedComponent({})).toBe("");
  });
});
