import { describe, expect, it } from "vitest";
import { startLeakRepair } from "@/domain/leakLifecycle";
import { stampLeakFieldVersions } from "@/services/storage/leakFieldVersions";
import { filterIncomingLeaksForMerge } from "@/services/backup/mergePreview";
import {
  getChangedFieldKeys,
  mergeLeaksByFreshness,
} from "@/services/backup/leakMergeEngine";
import {
  applyProjectTombstones,
  getLeakSyncIdentities,
  mergeProjectSyncStates,
  normalizeProjectSyncState,
} from "@/services/sync/projectSyncState";

/**
 * Два телефона обмениваются архивом.
 *
 * Отдельные проверки слияния смотрят на один шаг: что стало с записью, когда
 * к ней приехала другая. Но обход идёт двумя телефонами сразу, обмен случается
 * не один раз и не всегда в одном порядке, и вопрос на самом деле другой:
 * сойдутся ли устройства к одному состоянию и не потеряется ли по дороге
 * чья-то правка. Это свойство целого, и одношаговым тестом его не увидеть.
 *
 * Здесь собран настоящий путь: правка проходит через `stampLeakFieldVersions`
 * ровно так, как её проводит сохранение проекта, а обмен — через тот же
 * `filterIncomingLeaksForMerge` и `mergeLeaksByFreshness` с `source: "sync"`,
 * которые зовёт импорт архива.
 */

/**
 * Устойчивая запись значения: ключи по алфавиту.
 *
 * Сравнение идёт строкой, а порядок ключей у двух телефонов складывается
 * по-разному — от того, какими путями запись до них дошла. Смысла в нём нет.
 */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => ({ ...result, [key]: stable(value[key]) }), {});
  }
  return value;
}

/** Копия записи без перечисленных ключей. */
function omit(value, keys) {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

/** Устройство со своими часами: они у телефонов расходятся, и это норма. */
function device(name, leaks, clock) {
  return { name, leaks, clock, sync: normalizeProjectSyncState() };
}

/**
 * Следующая отметка на этом телефоне — логические часы, а не настенные.
 *
 * Приложение проводит каждую прочитанную версию через `observeSyncTimestamp`,
 * поэтому телефон, увидевший чужую версию из будущего, дальше нумерует свои
 * правки от неё. Без этого правка на отстающем телефоне получала бы номер
 * меньше уже известного, и обмен считал бы её старой.
 */
function tick(phone, ...alsoSeen) {
  const seen = [];
  for (const leaks of [phone.leaks, ...alsoSeen]) {
    for (const leak of leaks ?? []) {
      seen.push(...Object.values(leak?._fieldUpdatedAt ?? {}));
      for (const record of leak?.monitoringRecords ?? []) {
        seen.push(...Object.values(record?._fieldUpdatedAt ?? {}));
      }
    }
  }
  phone.clock = Math.max(phone.clock, ...seen) + 1000;
  return phone.clock;
}

/** Правка на устройстве: применяется и отмечается так же, как при сохранении. */
function edit(phone, id, patch) {
  const next = phone.leaks.map((leak) =>
    leak.id === id ? { ...leak, ...patch } : leak,
  );
  phone.leaks = stampLeakFieldVersions(phone.leaks, next, tick(phone));
  return phone;
}

function addLeak(phone, leak) {
  phone.leaks = stampLeakFieldVersions(
    phone.leaks,
    [...phone.leaks, leak],
    tick(phone),
  );
  return phone;
}

/**
 * Передача архива: `from` отдаёт свой список, `to` вливает его в свой.
 *
 * Порядок шагов взят у `backupImport`: состояния удалений сливаются, надгробия
 * применяются к приезжему списку и к результату, а сохранение проводит итог
 * через простановку меток — как это делает `useProjectData`.
 */
function send(from, to) {
  const options = { source: "sync" };
  const state = mergeProjectSyncStates(to.sync, from.sync);
  const previous = to.leaks;
  const incoming = filterIncomingLeaksForMerge(
    previous,
    applyProjectTombstones(from.leaks, state),
    options,
  );
  const merged = applyProjectTombstones(
    mergeLeaksByFreshness(previous, incoming, options).leaks,
    state,
  );
  to.sync = state;
  to.leaks = merged;
  // Отметка берётся после слияния и от всего прочитанного, а не только от
  // принятого: версии приезжего списка приложение пропускает через
  // `observeSyncTimestamp` даже тогда, когда запись решено не применять.
  to.leaks = stampLeakFieldVersions(previous, merged, tick(to, from.leaks));
  return to;
}

/** Обход: запись мониторинга заводится так же, как её пишет приложение. */
function monitor(phone, id, result) {
  const at = tick(phone);
  const next = phone.leaks.map((leak) =>
    leak.id === id
      ? {
          ...leak,
          monitoringRecords: [
            ...(leak.monitoringRecords ?? []),
            {
              id: `${leak.id}-${at}`,
              date: new Date(at).toISOString(),
              roundId: `round-${at}`,
              roundNumber: 1,
              monitoredBy: phone.name,
              result,
            },
          ],
        }
      : leak,
  );
  phone.leaks = stampLeakFieldVersions(phone.leaks, next, at);
  return phone;
}

/** Ремонт: заводится теми же функциями домена, что и кнопкой в приложении. */
function repair(phone, id, photo) {
  const at = tick(phone);
  const next = phone.leaks.map((leak) =>
    leak.id === id
      ? startLeakRepair(
          leak,
          { photo_repair: photo },
          { user: phone.name, now: at },
        )
      : leak,
  );
  phone.leaks = stampLeakFieldVersions(phone.leaks, next, at);
  return phone;
}

/** Удаление записи: карточка уходит, а надгробие остаётся в состоянии обмена. */
function removeLeak(phone, id) {
  const gone = phone.leaks.filter((leak) => leak.id === id);
  if (gone.length === 0) return phone;
  tick(phone);
  const deleted = { ...phone.sync.deleted };
  for (const leak of gone) {
    for (const identity of getLeakSyncIdentities(leak)) {
      deleted[identity] = Math.max(deleted[identity] ?? 0, phone.clock);
    }
  }
  phone.sync = normalizeProjectSyncState({ ...phone.sync, deleted });
  phone.leaks = phone.leaks.filter((leak) => leak.id !== id);
  return phone;
}

/** Полный обмен: туда и обратно. */
function exchange(first, second) {
  send(first, second);
  send(second, first);
}

/**
 * Сравнимый снимок состояния.
 *
 * Порядок значения не имеет ни у списка утечек, ни у записей мониторинга: на
 * экране и то и другое сортируется при показе. Сравнивается состав.
 */
function snapshot(phone) {
  const byId = (records) =>
    [...records].sort((left, right) =>
      String(left.id).localeCompare(String(right.id)),
    );
  return phone.leaks
    .map((leak) => {
      const rest = omit(leak, ["history"]);
      const withMonitoring = leak.monitoringRecords
        ? { ...rest, monitoringRecords: byId(leak.monitoringRecords) }
        : rest;
      return leak.events
        ? { ...withMonitoring, events: byId(leak.events) }
        : withMonitoring;
    })
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

// Поля те же, что у записи, заведённой формой: `index` и `updatedAt` у неё
// есть всегда, и без них сравнение спотыкалось бы о разницу, которой в жизни
// не бывает.
const baseLeak = (id, extra = {}) => ({
  id,
  index: Number(id.replace("leak-", "")),
  leak_id: id.replace("leak-", "TAG-"),
  object: "дренажная линия",
  component: "Задвижка",
  status: "open",
  createdAt: 1_772_000_000_000,
  updatedAt: 1_772_000_000_000,
  ...extra,
});

/** Общее начало: оба телефона получили один и тот же проект. */
function twoDevices(leaks = [baseLeak("leak-1"), baseLeak("leak-2")]) {
  const stamped = stampLeakFieldVersions([], leaks, 1_772_000_000_000);
  return [
    device("A", structuredClone(stamped), 1_772_100_000_000),
    // Часы второго телефона отстают: так и бывает, и порядок правок задаёт
    // не он, а причинность.
    device("B", structuredClone(stamped), 1_772_050_000_000),
  ];
}

describe("два телефона, обмен архивом", () => {
  it("сходятся к одному состоянию после обмена", () => {
    const [a, b] = twoDevices();
    edit(a, "leak-1", { component: "Кран шаровой" });
    edit(b, "leak-2", { object: "факельный коллектор" });

    exchange(a, b);

    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("правки с обоих телефонов доживают до обоих", () => {
    const [a, b] = twoDevices();
    edit(a, "leak-1", { component: "Кран шаровой" });
    edit(b, "leak-2", { object: "факельный коллектор" });

    exchange(a, b);

    for (const phone of [a, b]) {
      const first = phone.leaks.find((leak) => leak.id === "leak-1");
      const second = phone.leaks.find((leak) => leak.id === "leak-2");
      expect({ телефон: phone.name, поле: first.component }).toEqual({
        телефон: phone.name,
        поле: "Кран шаровой",
      });
      expect({ телефон: phone.name, поле: second.object }).toEqual({
        телефон: phone.name,
        поле: "факельный коллектор",
      });
    }
  });

  it("правки в одну запись, но в разные поля, не вытесняют друг друга", () => {
    // Два человека стоят у разного железа и правят одну карточку с разных
    // сторон: один уточнил компонент, другой — объект.
    const [a, b] = twoDevices();
    edit(a, "leak-1", { component: "Кран шаровой" });
    edit(b, "leak-1", { object: "факельный коллектор" });

    exchange(a, b);

    expect(a.leaks[0]).toMatchObject({
      component: "Кран шаровой",
      object: "факельный коллектор",
    });
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("новая запись с любого телефона приезжает на другой", () => {
    const [a, b] = twoDevices();
    addLeak(a, baseLeak("leak-3"));
    addLeak(b, baseLeak("leak-4"));

    exchange(a, b);

    const ids = snapshot(a).map((leak) => leak.id);
    expect(ids).toEqual(["leak-1", "leak-2", "leak-3", "leak-4"]);
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("повторный обмен ничего не меняет", () => {
    const [a, b] = twoDevices();
    edit(a, "leak-1", { component: "Кран шаровой" });
    edit(b, "leak-2", { object: "факельный коллектор" });
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
      edit(a, "leak-1", { component: "Кран шаровой" });
      edit(b, "leak-1", { object: "факельный коллектор" });
      edit(b, "leak-2", { status: "in_progress" });
      return [a, b];
    };

    const [a1, b1] = setup();
    exchange(a1, b1);

    const [a2, b2] = setup();
    exchange(b2, a2);

    expect(snapshot(a1)).toEqual(snapshot(a2));
    expect(snapshot(b1)).toEqual(snapshot(b2));
  });

  it("отстающие часы не дают старой правке победить новую", () => {
    // У телефона B часы отстают на час. Правка на нём сделана позже по
    // причинности — после обмена, — и обязана победить, несмотря на меньшее
    // число на циферблате.
    const [a, b] = twoDevices();
    edit(a, "leak-1", { component: "Кран шаровой" });
    exchange(a, b);

    edit(b, "leak-1", { component: "Задвижка клиновая" });
    exchange(a, b);

    expect(a.leaks[0].component).toBe("Задвижка клиновая");
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("три обмена по кругу через посредника сходятся", () => {
    // A и C никогда не встречаются напрямую: обмен идёт только через B.
    const [a, b] = twoDevices();
    const c = device("C", structuredClone(a.leaks), 1_772_080_000_000);
    edit(a, "leak-1", { component: "Кран шаровой" });
    edit(c, "leak-2", { object: "факельный коллектор" });

    exchange(a, b);
    exchange(b, c);
    exchange(a, b);

    expect(snapshot(a)).toEqual(snapshot(c));
    expect(snapshot(b)).toEqual(snapshot(c));
  });

  it("обходы с двух телефонов складываются, а не вытесняют друг друга", () => {
    const [a, b] = twoDevices();
    monitor(a, "leak-1", "still_leaking");
    monitor(b, "leak-1", "resolved");

    exchange(a, b);

    expect(a.leaks[0].monitoringRecords).toHaveLength(2);
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("ремонты с двух телефонов складываются, а не вытесняют друг друга", () => {
    // Ровно то, ради чего заведена лента. Вехой ремонт был одним полем:
    // `photo_repair` и `repairAt` сводятся выбором свежайшего, и одна из двух
    // починок, записанных без связи, пропадала молча.
    const [a, b] = twoDevices();
    repair(a, "leak-1", "idb://repair-a");
    repair(b, "leak-1", "idb://repair-b");

    exchange(a, b);

    for (const phone of [a, b]) {
      const leak = phone.leaks.find((item) => item.id === "leak-1");
      const photos = leak.events
        .filter((event) => event.type === "repair_started")
        .map((event) => event.photo)
        .sort();
      expect({ телефон: phone.name, фото: photos }).toEqual({
        телефон: phone.name,
        фото: ["idb://repair-a", "idb://repair-b"],
      });
    }

    // Поле на самой записи по-прежнему одно — список чинит именно это.
    expect(snapshot(a)).toEqual(snapshot(b));

    // Повторный обмен ленту не раздваивает: номера событий свои у каждого.
    const before = snapshot(a);
    exchange(a, b);
    expect(snapshot(a)).toEqual(before);
  });

  it("принятая запись обхода не считается изменённой на обратном пути", () => {
    // Обход заведён на A и уехал на B. Метку записи B проставляет своим
    // временем сохранения — и пока она бралась оттуда, а не выводилась из
    // версий полей, запись у двух телефонов навсегда оставалась «разной»:
    // `monitoringRecords` показывалось изменённым полем, а обмен отчитывался
    // о правках там, где обе стороны держали одно и то же.
    const [a, b] = twoDevices();
    monitor(a, "leak-1", "still_leaking");

    send(a, b);

    const changed = getChangedFieldKeys(a.leaks[0], b.leaks[0], {
      source: "sync",
    });
    const back = mergeLeaksByFreshness(a.leaks, b.leaks, { source: "sync" });

    expect(changed).toEqual([]);
    expect(back).toMatchObject({ updated: 0, changedFields: 0 });
  });

  it("удаление переживает обмен и не возвращается", () => {
    const [a, b] = twoDevices();
    removeLeak(a, "leak-1");

    exchange(a, b);

    expect(snapshot(a).map((leak) => leak.id)).toEqual(["leak-2"]);
    expect(snapshot(b)).toEqual(snapshot(a));
  });

  it("правка после удаления возвращает запись: её видели живой позже", () => {
    // Порядок решают метки, а не устройства: правка, сделанная после удаления,
    // говорит, что запись нужна.
    const [a, b] = twoDevices();
    removeLeak(a, "leak-1");
    b.clock = a.clock + 5000;
    edit(b, "leak-1", { component: "Кран шаровой" });

    exchange(a, b);

    expect(snapshot(a).map((leak) => leak.id)).toEqual(["leak-1", "leak-2"]);
    expect(snapshot(b)).toEqual(snapshot(a));
  });
});

/**
 * Состояние без служебных номеров версий.
 *
 * Номер версии поля — метка устройства, а не данные. Он сходится, только когда
 * слияние что-то применило; там, где значения и так совпали, применять нечего,
 * и номера остаются разными. Потери из этого не выходит: часы логические, и
 * телефон, прочитавший чужую версию, нумерует свою следующую правку от неё —
 * то есть выше. Проверяется схождение данных; номера сравниваются в
 * поимённых проверках выше, где они обязаны совпасть.
 */
function dataSnapshot(phone) {
  return snapshot(phone).map((leak) => {
    const rest = omit(leak, ["_fieldUpdatedAt"]);
    return leak.monitoringRecords
      ? {
          ...rest,
          monitoringRecords: leak.monitoringRecords.map((record) =>
            omit(record, ["_fieldUpdatedAt"]),
          ),
        }
      : rest;
  });
}

/**
 * Сценарии, собранные псевдослучайно.
 *
 * Проверки выше называют по одной ситуации каждая, а ошибки схождения живут в
 * сочетаниях: кто с кем обменялся, в каком порядке, что успели поправить между
 * обменами. Зерно фиксировано, поэтому падение воспроизводится: в сообщении
 * стоит номер сценария.
 */
/**
 * Свой срок для случайных сценариев.
 *
 * Пятисекундного по умолчанию им хватает только на свободной машине. Это
 * перебор из десятков прогонов подряд — чистый счёт без ввода-вывода, — и на
 * занятой машине или в CI он растягивается кратно: измеренные 1800 мс
 * превращались в шесть секунд, и набор падал не там, где что-то сломалось.
 *
 * Срок здесь сторожит зависание, а не медлительность: проверок он не
 * ослабляет — при расхождении тест падает сравнением, а не по времени.
 */
const RANDOM_SCENARIO_TIMEOUT_MS = 30_000;

describe("случайные сценарии на трёх телефонах", () => {
  const FIELDS = ["object", "component", "status", "note"];
  const VALUES = ["А", "Б", "В", "Г"];

  function random(seed) {
    let state = seed >>> 0;
    return () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
  }

  function play(seed) {
    const next = random(seed);
    const pick = (list) => list[Math.floor(next() * list.length)];
    const [a, b] = twoDevices([
      baseLeak("leak-1"),
      baseLeak("leak-2"),
      baseLeak("leak-3"),
    ]);
    const c = device("C", structuredClone(a.leaks), 1_772_080_000_000);
    const phones = [a, b, c];

    const steps = 12 + Math.floor(next() * 12);
    for (let step = 0; step < steps; step += 1) {
      const phone = pick(phones);
      const id = `leak-${1 + Math.floor(next() * 3)}`;
      const roll = next();
      if (roll < 0.1) removeLeak(phone, id);
      else if (roll < 0.3)
        monitor(phone, id, pick(["still_leaking", "resolved"]));
      else if (roll < 0.65) edit(phone, id, { [pick(FIELDS)]: pick(VALUES) });
      else send(phone, pick(phones.filter((other) => other !== phone)));
    }

    // Досинхронизация: всех со всеми, пока состояние не устоится.
    for (let round = 0; round < 4; round += 1) {
      for (const from of phones) {
        for (const to of phones) if (from !== to) send(from, to);
      }
    }
    return phones;
  }

  it(
    "сходятся к одному состоянию из любого сочетания правок и обменов",
    () => {
      const diverged = [];
      for (let seed = 1; seed <= 200; seed += 1) {
        const [a, b, c] = play(seed);
        const first = JSON.stringify(stable(dataSnapshot(a)));
        if (
          first !== JSON.stringify(stable(dataSnapshot(b))) ||
          first !== JSON.stringify(stable(dataSnapshot(c)))
        ) {
          diverged.push(seed);
        }
      }

      expect(diverged).toEqual([]);
    },
    RANDOM_SCENARIO_TIMEOUT_MS,
  );
});
