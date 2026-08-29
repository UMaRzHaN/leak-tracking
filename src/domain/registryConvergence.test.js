import { describe, expect, it } from "vitest";
import {
  normalizeComponent,
  stampChangedComponents,
} from "@/domain/componentRegistry";
import { mergeComponentRegistries } from "@/domain/componentMerge";
import {
  isLiveComponent,
  withComponentRemoved,
} from "@/domain/componentTombstones";

/**
 * Два телефона обмениваются реестром компонентов.
 *
 * То же, что проверка схождения у утечек, и по той же причине: сведение
 * реестров проверялось по одному шагу, а обход идёт двумя телефонами сразу.
 * Собран настоящий путь — правка сохраняется через `normalizeComponent` и
 * `keepUnchangedComponentStamps`, как это делает `ComponentRepository.save`,
 * а обмен идёт через `mergeComponentRegistries` с последующим сохранением,
 * как в `mergeIncomingComponents`.
 */

/** Ключи по алфавиту: их порядок у двух телефонов складывается по-разному. */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => ({ ...result, [key]: stable(value[key]) }), {});
  }
  return value;
}

function device(name, cards, clock) {
  return { name, cards, clock };
}

/**
 * Следующая отметка этого телефона — логические часы, а не настенные.
 *
 * `normalizeComponent` берёт её у `nextSyncTimestamp`, а `componentChangedAt`
 * проводит через `observeSyncTimestamp` каждую прочитанную метку. Значит
 * телефон, увидевший чужое время из будущего, нумерует свои правки от него.
 */
function tick(phone, ...alsoSeen) {
  const seen = [];
  for (const cards of [phone.cards, ...alsoSeen]) {
    for (const card of cards ?? []) {
      seen.push(Number(card?.updatedAt ?? 0), Number(card?.deletedAt ?? 0));
    }
  }
  phone.clock = Math.max(phone.clock, ...seen) + 1000;
  return phone.clock;
}

/**
 * Сохранение реестра. `previous` — то, что, по мнению приложения, уже лежит в
 * хранилище: с ним метка изменения остаётся у карточек, которых правка не
 * касалась.
 */
function saveRegistry(phone, cards, previous, ...alsoSeen) {
  const at = tick(phone, cards, ...alsoSeen);
  return stampChangedComponents(
    cards.map((card) => normalizeComponent(card, { now: at })),
    previous,
    at,
  );
}

function editCard(phone, id, patch) {
  const next = phone.cards.map((card) =>
    card.id === id ? { ...card, ...patch } : card,
  );
  phone.cards = saveRegistry(phone, next, phone.cards);
  return phone;
}

function addCard(phone, card) {
  phone.cards = saveRegistry(phone, [...phone.cards, card], phone.cards);
  return phone;
}

function removeCard(phone, id) {
  const next = withComponentRemoved(phone.cards, id, tick(phone));
  phone.cards = saveRegistry(phone, next, phone.cards);
  return phone;
}

/** Приём чужого реестра — путь `mergeIncomingComponents`. */
function send(from, to) {
  const { merged } = mergeComponentRegistries(to.cards, from.cards);
  // Результат сведения пишется без «прежнего»: правок этого устройства в нём
  // нет, и переставлять метки нечему — так и делают `mergeIncomingComponents`
  // с `inventoryImport`. Часы при этом двигаются от приезжего списка: сведение
  // спрашивало время у обеих сторон.
  to.cards = saveRegistry(to, merged, null, from.cards);
  return to;
}

function exchange(first, second) {
  send(first, second);
  send(second, first);
}

/** Живые карточки, порядок неважен: на экране реестр сортируется по номеру. */
function snapshot(phone) {
  return stable(
    phone.cards
      .filter(isLiveComponent)
      .map((card) => card)
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
  );
}

const card = (id, extra = {}) => ({
  id,
  component_uid: id.replace("card-", ""),
  component: "Задвижка",
  manufacturer: "Завод",
  date: "2026-02-25T10:00:00.000Z",
  inspected_at: "2026-02-25T10:00:00.000Z",
  ...extra,
});

function twoDevices(cards = [card("card-1"), card("card-2")]) {
  const start = { name: "0", clock: 1_772_000_000_000 };
  const stamped = saveRegistry(start, cards, null);
  return [
    device("A", structuredClone(stamped), 1_772_100_000_000),
    // Часы второго телефона отстают: так и бывает.
    device("B", structuredClone(stamped), 1_772_050_000_000),
  ];
}

describe("два телефона, обмен реестром", () => {
  it("сходятся к одному состоянию после обмена", () => {
    const [a, b] = twoDevices();
    editCard(a, "card-1", { manufacturer: "Пензтяжпромарматура" });
    editCard(b, "card-2", { component: "Кран шаровой" });

    exchange(a, b);

    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("правки с обоих телефонов доживают до обоих", () => {
    const [a, b] = twoDevices();
    editCard(a, "card-1", { manufacturer: "Пензтяжпромарматура" });
    editCard(b, "card-2", { component: "Кран шаровой" });

    exchange(a, b);

    for (const phone of [a, b]) {
      expect({
        телефон: phone.name,
        первая: phone.cards.find((c) => c.id === "card-1").manufacturer,
        вторая: phone.cards.find((c) => c.id === "card-2").component,
      }).toEqual({
        телефон: phone.name,
        первая: "Пензтяжпромарматура",
        вторая: "Кран шаровой",
      });
    }
  });

  it("правка соседа не теряется под чужим сохранением реестра", () => {
    // Карточку правили на B. На A в это время завели другую — реестр
    // сохраняется целиком, и пока метка переставлялась всем карточкам разом,
    // нетронутая копия с A оказывалась «свежее» правки с B.
    const [a, b] = twoDevices();
    editCard(b, "card-1", { manufacturer: "Правка соседа" });
    addCard(a, card("card-3"));

    exchange(a, b);

    expect(a.cards.find((c) => c.id === "card-1").manufacturer).toBe(
      "Правка соседа",
    );
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("новая карточка с любого телефона приезжает на другой", () => {
    const [a, b] = twoDevices();
    addCard(a, card("card-3"));
    addCard(b, card("card-4"));

    exchange(a, b);

    expect(snapshot(a).map((c) => c.id)).toEqual([
      "card-1",
      "card-2",
      "card-3",
      "card-4",
    ]);
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("повторный обмен ничего не меняет", () => {
    const [a, b] = twoDevices();
    editCard(a, "card-1", { manufacturer: "Пензтяжпромарматура" });
    exchange(a, b);
    const afterFirst = snapshot(a);

    exchange(a, b);
    exchange(a, b);

    expect(snapshot(a)).toEqual(afterFirst);
    expect(snapshot(b)).toEqual(afterFirst);
  });

  it("порядок обмена на итог не влияет", () => {
    const setup = () => {
      const [a, b] = twoDevices();
      editCard(a, "card-1", { manufacturer: "Первый" });
      editCard(b, "card-1", { component: "Кран шаровой" });
      return [a, b];
    };

    const [a1, b1] = setup();
    exchange(a1, b1);
    const [a2, b2] = setup();
    exchange(b2, a2);

    expect(snapshot(a1)).toEqual(snapshot(a2));
    expect(snapshot(b1)).toEqual(snapshot(b2));
  });

  it("удаление переживает обмен и не возвращается", () => {
    const [a, b] = twoDevices();
    removeCard(a, "card-1");

    exchange(a, b);
    exchange(a, b);

    expect(snapshot(a).map((c) => c.id)).toEqual(["card-2"]);
    expect(snapshot(b)).toEqual(snapshot(a));
  });

  it("правка после удаления возвращает карточку: её видели живой позже", () => {
    const [a, b] = twoDevices();
    removeCard(a, "card-1");
    b.clock = a.clock + 5000;
    editCard(b, "card-1", { manufacturer: "Всё-таки нужна" });

    exchange(a, b);

    expect(snapshot(a).map((c) => c.id)).toEqual(["card-1", "card-2"]);
    expect(snapshot(b)).toEqual(snapshot(a));
  });

  it("обмен через посредника сводит всех троих", () => {
    const [a, b] = twoDevices();
    const c = device("C", structuredClone(a.cards), 1_772_080_000_000);
    editCard(a, "card-1", { manufacturer: "От A" });
    editCard(c, "card-2", { component: "От C" });

    exchange(a, b);
    exchange(b, c);
    exchange(a, b);

    expect(snapshot(a)).toEqual(snapshot(c));
    expect(snapshot(b)).toEqual(snapshot(c));
  });
});

/**
 * Сценарии, собранные псевдослучайно: ошибки схождения живут в сочетаниях, а
 * не в отдельных ситуациях. Зерно фиксировано, падение воспроизводится по
 * номеру сценария.
 */
describe("случайные сценарии на трёх телефонах", () => {
  const FIELDS = ["manufacturer", "component", "medium", "body_material"];
  const VALUES = ["А", "Б", "В", "Г"];

  function random(seed) {
    let state = seed >>> 0;
    return () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
  }

  function play(seed) {
    const next = random(seed);
    const pick = (list) => list[Math.floor(next() * list.length)];
    const [a, b] = twoDevices([card("card-1"), card("card-2"), card("card-3")]);
    const c = device("C", structuredClone(a.cards), 1_772_080_000_000);
    const phones = [a, b, c];

    const steps = 10 + Math.floor(next() * 12);
    for (let step = 0; step < steps; step += 1) {
      const phone = pick(phones);
      const id = `card-${1 + Math.floor(next() * 3)}`;
      const roll = next();
      if (roll < 0.12) removeCard(phone, id);
      else if (roll < 0.6)
        editCard(phone, id, { [pick(FIELDS)]: pick(VALUES) });
      else send(phone, pick(phones.filter((other) => other !== phone)));
    }

    for (let round = 0; round < 4; round += 1) {
      for (const from of phones) {
        for (const to of phones) if (from !== to) send(from, to);
      }
    }
    return phones;
  }

  it("сходятся к одному состоянию из любого сочетания правок и обменов", () => {
    const diverged = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      const [a, b, c] = play(seed);
      const first = JSON.stringify(snapshot(a));
      if (
        first !== JSON.stringify(snapshot(b)) ||
        first !== JSON.stringify(snapshot(c))
      ) {
        diverged.push(seed);
      }
    }

    expect(diverged).toEqual([]);
  });
});
