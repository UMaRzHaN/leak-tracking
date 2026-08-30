import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isLiveSchema,
  liveSchemas,
  schemaIdentity,
  withSchemaAdded,
  withSchemaRemoved,
} from "@/domain/schemaTombstones";

/**
 * Два телефона обмениваются архивами со схемами.
 *
 * То же, что проверки схождения у утечек и у реестра, и по той же причине:
 * сведение списка схем проверялось по одному шагу, а обход идёт двумя
 * телефонами сразу. Здесь собран настоящий путь — выгрузка через
 * `buildSchemaArchiveEntries`, приём через `restoreSchemasFromArchive`, а
 * хранилище у каждого телефона своё.
 *
 * `SchemaRepository` подменён не заглушками, а работающим хранилищем в памяти:
 * оно повторяет то, что делает настоящее — добавление пишет в общий список
 * через `withSchemaAdded`, удаление оставляет надгробие через
 * `withSchemaRemoved`. Иначе проверялось бы не схождение, а вызовы.
 */

/** Телефон, от чьего лица сейчас идёт вызов хранилища. */
let device = null;

const mocks = vi.hoisted(() => ({ repository: {} }));

vi.mock("@/repositories/SchemaRepository", () => ({
  SchemaRepository: mocks.repository,
}));

Object.assign(mocks.repository, {
  async readIndex() {
    return structuredClone(device.index);
  },
  async listSchemas() {
    return liveSchemas(structuredClone(device.index));
  },
  async saveIndex(project, schemas) {
    device.index = structuredClone(schemas);
  },
  async addSchema(project, schema, blob) {
    device.index = withSchemaAdded(device.index, structuredClone(schema));
    device.files.set(schemaIdentity(schema), await blob.text());
    return schema;
  },
  async removeSchema(project, schema) {
    device.files.delete(schemaIdentity(schema));
    device.index = withSchemaRemoved(device.index, schema.id, tick(device));
    return true;
  },
  async readSchemaFile(project, schema) {
    const bytes = device.files.get(schemaIdentity(schema));
    return bytes == null ? null : new Blob([bytes]);
  },
});

const { buildSchemaArchiveEntries, restoreSchemasFromArchive } =
  await import("./schemaArchive");
const { getJSZip } = await import("./runtime");

const project = { id: "p1", folderName: "buzahur" };

function phone(name, at = 1_772_100_000_000) {
  return { name, index: [], files: new Map(), clock: at, project };
}

/**
 * Следующая отметка этого телефона — логические часы, а не настенные.
 *
 * Настоящие часы приложения лежат в модуле, один на всех, и в проверке двух
 * телефонов ничьей на них не выпадает никогда: каждая следующая отметка строго
 * больше предыдущей, чьей бы она ни была. Здесь у каждого телефона своя, и
 * двигается она от всего, что телефон видел, — так эти часы и устроены.
 */
function tick(target, ...alsoSeen) {
  const seen = [target.clock];
  for (const list of [target.index, ...alsoSeen]) {
    for (const record of list ?? []) {
      seen.push(
        Number(record?.deletedAt ?? 0),
        Date.parse(record?.addedAt ?? "") || 0,
      );
    }
  }
  target.clock = Math.max(...seen) + 1000;
  return target.clock;
}

/** Выполняет действие от лица телефона: хранилище у каждого своё. */
async function on(target, action) {
  device = target;
  try {
    return await action();
  } finally {
    device = null;
  }
}

const drawing = (name, extra = {}) => ({
  id: `${name}-id`,
  name,
  size: name.length,
  type: "application/pdf",
  ...extra,
});

async function addDrawing(target, name, at, history) {
  const stamp = at ?? tick(target);
  remember(history, name, "add", stamp);
  await on(target, () =>
    mocks.repository.addSchema(
      project,
      drawing(name, { addedAt: new Date(stamp).toISOString() }),
      new Blob([`байты ${name}`]),
    ),
  );
  return target;
}

async function removeDrawing(target, name, history) {
  const record = target.index.find(
    (entry) => entry.name === name && isLiveSchema(entry),
  );
  await on(target, () => mocks.repository.removeSchema(project, record));
  remember(
    history,
    name,
    "remove",
    record ? Number(deletedTime(target, name)) : 0,
  );
  return target;
}

/** Найденное надгробие: отметку ему выдал `tick` внутри хранилища. */
function deletedTime(target, name) {
  const grave = target.index.find(
    (entry) => entry.name === name && !isLiveSchema(entry),
  );
  return grave?.deletedAt ?? 0;
}

/**
 * Чем всё должно кончиться — по замыслу, а не по самому сведению.
 *
 * Судьбу чертежа решает последнее, что с ним сделали, а на равенстве —
 * удаление. Считать это отдельно важно: проверка «все трое пришли к одному»
 * ловит расхождение, но молчит, когда телефоны дружно сходятся на неверном —
 * например, воскрешают удалённое.
 */
function remember(history, name, kind, at) {
  if (!history) return;
  const known = history.get(name);
  if (!known || at > known.at || (at === known.at && kind === "remove")) {
    history.set(name, { kind, at });
  }
}

const expected = (history) =>
  [...history.entries()]
    .filter(([, action]) => action.kind === "add")
    .map(([name]) => name)
    .sort();

/** Архив, как его собирает выгрузка проекта. */
async function exportArchive(from) {
  return on(from, async () => {
    const entries = await buildSchemaArchiveEntries(
      project,
      await mocks.repository.readIndex(project),
      (proj, schema) => mocks.repository.readSchemaFile(proj, schema),
    );
    const JSZip = (await getJSZip()).default;
    const zip = new JSZip();
    for (const entry of entries) zip.file(entry.path, entry.blob);
    return zip.generateAsync({ type: "blob" });
  });
}

async function send(from, to) {
  const archive = await exportArchive(from);
  // Приём двигает часы получателя от приезжего списка: сведение спрашивает
  // время у обеих сторон, и здесь телефон узнаёт чужие отметки.
  tick(to, from.index);
  await on(to, () => restoreSchemasFromArchive(archive, project));
}

async function exchange(first, second) {
  await send(first, second);
  await send(second, first);
}

/** Живые чертежи по именам: порядок на экране задаёт не список. */
const snapshot = (target) =>
  liveSchemas(target.index)
    .map((schema) => schema.name)
    .sort();

/** Байты, которые телефон реально держит. */
const bytes = (target) => [...target.files.keys()].sort();

/** Опознаватель — это «имя:размер»; для сверки со списком нужно имя. */
const nameOf = (identity) => identity.slice(0, identity.lastIndexOf(":"));

describe("два телефона, обмен схемами", () => {
  let a;
  let b;

  beforeEach(() => {
    a = phone("A");
    b = phone("B");
  });

  it("чертёж с одного телефона приезжает на другой вместе с байтами", async () => {
    await addDrawing(a, "узел.pdf");

    await exchange(a, b);

    expect(snapshot(b)).toEqual(["узел.pdf"]);
    expect(
      await on(b, () =>
        mocks.repository.readSchemaFile(project, drawing("узел.pdf")),
      ),
    ).not.toBeNull();
  });

  it("сходятся, когда чертежи заводили на обоих", async () => {
    await addDrawing(a, "устье.pdf");
    await addDrawing(b, "коллектор.pdf");

    await exchange(a, b);

    expect(snapshot(a)).toEqual(["коллектор.pdf", "устье.pdf"]);
    expect(snapshot(b)).toEqual(snapshot(a));
  });

  it("удаление переживает обмен и не возвращается", async () => {
    await addDrawing(a, "устье.pdf");
    await exchange(a, b);
    await removeDrawing(a, "устье.pdf");

    await exchange(a, b);
    await exchange(a, b);

    expect(snapshot(a)).toEqual([]);
    expect(snapshot(b)).toEqual([]);
  });

  it("удалённый чертёж уносит и байты с обоих телефонов", async () => {
    await addDrawing(a, "устье.pdf");
    await exchange(a, b);
    await removeDrawing(b, "устье.pdf");

    await exchange(a, b);

    expect(bytes(a)).toEqual([]);
    expect(bytes(b)).toEqual([]);
  });

  it("добавленный заново после удаления возвращается", async () => {
    await addDrawing(a, "устье.pdf");
    await exchange(a, b);
    await removeDrawing(a, "устье.pdf");
    await exchange(a, b);
    await addDrawing(b, "устье.pdf");

    await exchange(a, b);

    expect(snapshot(a)).toEqual(["устье.pdf"]);
    expect(snapshot(b)).toEqual(["устье.pdf"]);
  });

  it("повторный обмен ничего не меняет", async () => {
    await addDrawing(a, "устье.pdf");
    await addDrawing(b, "коллектор.pdf");
    await exchange(a, b);
    const afterFirst = snapshot(a);

    await exchange(a, b);
    await exchange(a, b);

    expect(snapshot(a)).toEqual(afterFirst);
    expect(snapshot(b)).toEqual(afterFirst);
  });

  it("порядок обмена на итог не влияет", async () => {
    await addDrawing(a, "устье.pdf");
    await addDrawing(b, "коллектор.pdf");

    await send(b, a);
    await send(a, b);

    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("на равенстве отметок побеждает удаление, с какой стороны ни смотри", async () => {
    // Ничья возможна, пока телефоны ещё не обменивались: часы у каждого свои.
    // Правило разрешает её в пользу удаления — человек скорее переживёт лишний
    // раз добавленный чертёж, чем тот, что он удалил и который вернулся.
    //
    // Обе стороны проверяются нарочно: при сведении списки идут один за другим,
    // и правило, которое смотрит только на «свежее», разрешает ничью просто в
    // пользу того, кто оказался вторым. Тогда итог зависит от того, кто кому
    // послал архив первым, а это уже не правило.
    const TIE = 1_772_200_000_000;
    const grave = {
      id: "z",
      name: "замерная.pdf",
      // Тот же размер, что у чертежа: по паре «имя и размер» схему и опознают
      // между устройствами.
      size: "замерная.pdf".length,
      deleted: true,
      deletedAt: TIE,
    };

    async function tie() {
      const withDrawing = phone("A");
      const withTombstone = phone("B");
      await addDrawing(withDrawing, "замерная.pdf", TIE);
      withTombstone.index = [structuredClone(grave)];
      return [withDrawing, withTombstone];
    }

    const [a1, b1] = await tie();
    await send(a1, b1);
    expect(snapshot(b1)).toEqual([]);

    const [a2, b2] = await tie();
    await send(b2, a2);
    expect(snapshot(a2)).toEqual([]);
  });

  it("обмен через посредника сводит всех троих", async () => {
    const c = phone("C");
    await addDrawing(a, "устье.pdf");
    await addDrawing(c, "коллектор.pdf");

    await exchange(a, b);
    await exchange(b, c);
    await exchange(a, b);

    expect(snapshot(a)).toEqual(snapshot(c));
    expect(snapshot(b)).toEqual(snapshot(c));
  });
});

/**
 * Сценарии, собранные псевдослучайно: ошибки схождения живут в сочетаниях, а не
 * в отдельных ситуациях. Зерно фиксировано, падение воспроизводится по номеру.
 *
 * Телефоны заводятся с одинаковыми часами нарочно: только так до правила
 * «на равенстве побеждает удаление» вообще доходит дело.
 */
describe("случайные сценарии на трёх телефонах", () => {
  const NAMES = ["устье.pdf", "коллектор.pdf", "замерная.pdf"];

  function random(seed) {
    let state = seed >>> 0;
    return () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
  }

  async function play(seed) {
    const next = random(seed);
    const pick = (list) => list[Math.floor(next() * list.length)];
    const phones = [phone("A"), phone("B"), phone("C")];
    const history = new Map();

    const steps = 8 + Math.floor(next() * 10);
    for (let step = 0; step < steps; step += 1) {
      const target = pick(phones);
      const name = pick(NAMES);
      const roll = next();
      if (roll < 0.45) {
        const live = target.index.find(
          (entry) => entry.name === name && isLiveSchema(entry),
        );
        if (!live) await addDrawing(target, name, undefined, history);
      } else if (roll < 0.65) {
        const live = target.index.find(
          (entry) => entry.name === name && isLiveSchema(entry),
        );
        if (live) await removeDrawing(target, name, history);
      } else {
        await send(target, pick(phones.filter((other) => other !== target)));
      }
    }

    for (let round = 0; round < 3; round += 1) {
      for (const from of phones) {
        for (const to of phones) if (from !== to) await send(from, to);
      }
    }
    return { phones, history };
  }

  it("сходятся из любого сочетания правок и обменов", async () => {
    const diverged = [];
    for (let seed = 1; seed <= 40; seed += 1) {
      const {
        phones: [a, b, c],
      } = await play(seed);
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

  it("остаётся ровно то, что последним завели, а не удалили", async () => {
    // Проверка «все трое пришли к одному» молчит, когда телефоны дружно
    // сходятся на неверном: воскрешённый чертёж одинаков у всех.
    const wrong = [];
    for (let seed = 1; seed <= 40; seed += 1) {
      const { phones, history } = await play(seed);
      const should = expected(history);
      for (const target of phones) {
        if (JSON.stringify(snapshot(target)) !== JSON.stringify(should)) {
          wrong.push(`${seed}:${target.name}`);
        }
      }
    }

    expect(wrong).toEqual([]);
  });

  it("байты не расходятся со списком", async () => {
    // Чертёж, который список считает живым, а байтов под ним нет, откроется
    // сообщением «файл не найден»; лишние байты остаются занимать место.
    const mismatched = [];
    for (let seed = 1; seed <= 40; seed += 1) {
      const { phones } = await play(seed);
      for (const target of phones) {
        if (
          JSON.stringify(bytes(target).map(nameOf)) !==
          JSON.stringify(snapshot(target))
        ) {
          mismatched.push(`${seed}:${target.name}`);
        }
      }
    }

    expect(mismatched).toEqual([]);
  });
});
