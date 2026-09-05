import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Снимок плюс журнал на файловой системе — то, чем этот проект жил до SQLite.
 *
 * Читать это хранилище приходится до сих пор: у любого, кто ставил приложение
 * раньше, данные лежат именно так, и путь миграции ведёт через него. Ломается
 * такое молча и на чужих данных, поэтому проверяется здесь не то, какие вызовы
 * ушли в файловую систему, а что уцелело после того, как её уронили.
 */

const fs = vi.hoisted(() => ({
  files: new Map(),
  /** @type {null | ((op: string, path: string) => void)} */
  onCall: null,
}));

function missing(path) {
  return new Error(`File does not exist: ${path}`);
}

vi.mock("@capacitor/filesystem", () => ({
  Encoding: { UTF8: "utf8" },
  Directory: { Data: "DATA" },
  Filesystem: {
    mkdir: vi.fn(async () => undefined),
    readFile: vi.fn(async ({ path }) => {
      fs.onCall?.("readFile", path);
      if (!fs.files.has(path)) throw missing(path);
      return { data: fs.files.get(path) };
    }),
    writeFile: vi.fn(async ({ path, data }) => {
      fs.onCall?.("writeFile", path);
      fs.files.set(path, String(data));
    }),
    appendFile: vi.fn(async ({ path, data }) => {
      fs.onCall?.("appendFile", path);
      fs.files.set(path, `${fs.files.get(path) ?? ""}${data}`);
    }),
    stat: vi.fn(async ({ path }) => {
      fs.onCall?.("stat", path);
      if (!fs.files.has(path)) throw missing(path);
      return { size: String(fs.files.get(path)).length };
    }),
    copy: vi.fn(async ({ from, to }) => {
      fs.onCall?.("copy", to);
      if (!fs.files.has(from)) throw missing(from);
      fs.files.set(to, fs.files.get(from));
    }),
    rename: vi.fn(async ({ from, to }) => {
      fs.onCall?.("rename", to);
      if (!fs.files.has(from)) throw missing(from);
      fs.files.set(to, fs.files.get(from));
      fs.files.delete(from);
    }),
    deleteFile: vi.fn(async ({ path }) => {
      fs.onCall?.("deleteFile", path);
      if (!fs.files.has(path)) throw missing(path);
      fs.files.delete(path);
    }),
  },
}));

vi.mock("@/utils/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const {
  clearNativeProjectStorageCache,
  getNativeProjectPaths,
  loadNativeProject,
  readNativeSnapshot,
  saveNativeProject,
  writeNativeProjectSnapshot,
} = await import("./legacyNativeLeakStorage");

const FOLDER = "buzahur";
const paths = getNativeProjectPaths(FOLDER);

const leak = (id, extra = {}) => ({ id, leak_id: `T-${id}`, ...extra });

/** Ошибка на первом же обращении указанного вида к указанному файлу. */
function failOnce(op, pathSuffix, message = "I/O failure") {
  let fired = false;
  fs.onCall = (calledOp, path) => {
    if (fired || calledOp !== op || !path.endsWith(pathSuffix)) return;
    fired = true;
    throw new Error(message);
  };
}

function journalLines() {
  return String(fs.files.get(paths.journal) ?? "")
    .split("\n")
    .filter(Boolean);
}

beforeEach(() => {
  fs.files.clear();
  fs.onCall = null;
  clearNativeProjectStorageCache();
  vi.clearAllMocks();
});

describe("снимок проекта", () => {
  /*
   * Три поколения формата лежат на устройствах одновременно: голый массив,
   * объект второй версии и третья с идентификатором снимка. Прочитаться должны
   * все три, иначе обновление приложения выглядит как пропавший проект.
   */
  it("читает все три поколения формата снимка", async () => {
    fs.files.set("bare.json", JSON.stringify([leak(1)]));
    fs.files.set(
      "v2.json",
      JSON.stringify({ version: 2, data: [leak(2)], syncState: { a: 1 } }),
    );
    fs.files.set(
      "v3.json",
      JSON.stringify({ version: 3, snapshotId: "s1", data: [leak(3)] }),
    );

    await expect(readNativeSnapshot("bare.json")).resolves.toMatchObject({
      data: [leak(1)],
      snapshotVersion: 0,
      snapshotId: null,
    });
    await expect(readNativeSnapshot("v2.json")).resolves.toMatchObject({
      snapshotVersion: 2,
      syncState: { a: 1 },
      snapshotId: null,
    });
    await expect(readNativeSnapshot("v3.json")).resolves.toMatchObject({
      snapshotVersion: 3,
      snapshotId: "s1",
    });
  });

  it("отказывается принимать за снимок что попало", async () => {
    fs.files.set("junk.json", JSON.stringify({ version: 9, data: [] }));

    await expect(readNativeSnapshot("junk.json")).rejects.toThrow(TypeError);
  });
});

describe("журнал поверх снимка", () => {
  it("докладывает записи журнала к снимку в порядке их появления", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1), leak(2)]);
    await saveNativeProject(FOLDER, [leak(1), leak(2), leak(3)], {
      previousLeaks: [leak(1), leak(2)],
    });
    await saveNativeProject(FOLDER, [leak(1, { note: "правка" }), leak(3)], {
      previousLeaks: [leak(1), leak(2), leak(3)],
    });

    clearNativeProjectStorageCache();
    const loaded = await loadNativeProject(FOLDER);

    expect(loaded.state.data).toEqual([leak(1, { note: "правка" }), leak(3)]);
    expect(loaded.source).toBe(paths.main);
    expect(loaded.recovered).toBe(false);
  });

  /*
   * Состояние синхронизации едет в тех же записях, что и данные, и последняя
   * из них — та, что верна. Потерять его тише некуда: данные на месте, а
   * приложение считает, что проект ни разу не синхронизировали.
   */
  it("берёт состояние синхронизации из последней записи журнала", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1)], { cursor: "a" });
    await saveNativeProject(FOLDER, [leak(1), leak(2)], {
      previousLeaks: [leak(1)],
      syncState: { cursor: "b" },
    });
    await saveNativeProject(FOLDER, [leak(1), leak(2), leak(3)], {
      previousLeaks: [leak(1), leak(2)],
      syncState: { cursor: "c" },
    });

    clearNativeProjectStorageCache();
    const loaded = await loadNativeProject(FOLDER);

    expect(loaded.state.syncState).toEqual({ cursor: "c" });
  });

  /*
   * Дописать строку и упасть посреди неё — обычное дело для убитого процесса.
   * Оборванный хвост отбрасывается: всё, что дописалось до него, — правда, и
   * терять её из-за последней строки нельзя.
   */
  it("отбрасывает оборванную последнюю строку, сохраняя прежние", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1)]);
    await saveNativeProject(FOLDER, [leak(1), leak(2)], {
      previousLeaks: [leak(1)],
    });
    fs.files.set(paths.journal, `${fs.files.get(paths.journal)}{"version":1,`);

    clearNativeProjectStorageCache();
    const loaded = await loadNativeProject(FOLDER);

    expect(loaded.state.data).toEqual([leak(1), leak(2)]);
  });

  /*
   * Оборванной может быть только последняя строка. Битая посередине означает,
   * что файл испорчен не обрывом записи, и додумывать за него нечего.
   */
  it("не прощает битую строку в середине журнала", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1)]);
    await saveNativeProject(FOLDER, [leak(1), leak(2)], {
      previousLeaks: [leak(1)],
    });
    fs.files.set(
      paths.journal,
      `{"version":1,\n${fs.files.get(paths.journal)}`,
    );
    fs.files.delete(paths.backup);

    clearNativeProjectStorageCache();
    await expect(loadNativeProject(FOLDER)).rejects.toThrow(
      "Native project snapshots could not be read",
    );
  });

  /*
   * Журнал привязан к снимку своим идентификатором. Записи от прежнего снимка
   * описывают уже несуществующее состояние: применить их — значит воскресить
   * удалённое.
   */
  it("пропускает записи, оставшиеся от прежнего снимка", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1)]);
    await saveNativeProject(FOLDER, [leak(1), leak(2)], {
      previousLeaks: [leak(1)],
    });
    const stale = journalLines()[0];
    await writeNativeProjectSnapshot(FOLDER, [leak(9)]);
    fs.files.set(paths.journal, `${stale}\n`);

    clearNativeProjectStorageCache();
    const loaded = await loadNativeProject(FOLDER);

    expect(loaded.state.data).toEqual([leak(9)]);
  });
});

describe("выбор между дельтой и снимком", () => {
  it("дописывает дельту, когда изменилось немногое", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1)]);

    await saveNativeProject(FOLDER, [leak(1), leak(2)], {
      previousLeaks: [leak(1)],
    });

    expect(journalLines()).toHaveLength(1);
  });

  it("пишет снимок, когда просят прямо", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1)]);
    await saveNativeProject(FOLDER, [leak(1), leak(2)], {
      previousLeaks: [leak(1)],
    });

    await saveNativeProject(FOLDER, [leak(1), leak(2), leak(3)], {
      previousLeaks: [leak(1), leak(2)],
      forceSnapshot: true,
    });

    expect(journalLines()).toHaveLength(0);
    clearNativeProjectStorageCache();
    expect((await loadNativeProject(FOLDER)).state.data).toEqual([
      leak(1),
      leak(2),
      leak(3),
    ]);
  });

  /*
   * Дельта умеет добавлять, править и удалять, но не переставлять: порядок в
   * ней задан неявно. Перестановка записывается снимком, иначе список
   * восстановился бы в прежнем порядке.
   */
  it("уходит в снимок, когда записи переставили местами", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1), leak(2)]);

    await saveNativeProject(FOLDER, [leak(2), leak(1)], {
      previousLeaks: [leak(1), leak(2)],
    });

    expect(journalLines()).toHaveLength(0);
    clearNativeProjectStorageCache();
    expect((await loadNativeProject(FOLDER)).state.data).toEqual([
      leak(2),
      leak(1),
    ]);
  });

  it("уходит в снимок, когда записи без пригодного идентификатора", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1)]);

    await saveNativeProject(FOLDER, [leak(1), { leak_id: "без id" }], {
      previousLeaks: [leak(1)],
    });

    expect(journalLines()).toHaveLength(0);
  });

  it("уходит в снимок, когда прошлое состояние неизвестно", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1)]);

    await saveNativeProject(FOLDER, [leak(1), leak(2)]);

    expect(journalLines()).toHaveLength(0);
  });

  /*
   * Журнал не должен расти без предела: на сороковой записи он сворачивается в
   * снимок, иначе каждое чтение проекта становится дороже предыдущего.
   */
  it("сворачивает журнал в снимок, когда записей набралось слишком много", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(0)]);
    let previous = [leak(0)];

    for (let index = 1; index <= 40; index += 1) {
      const next = [...previous, leak(index)];
      await saveNativeProject(FOLDER, next, { previousLeaks: previous });
      previous = next;
    }

    expect(journalLines()).toHaveLength(0);
    clearNativeProjectStorageCache();
    expect((await loadNativeProject(FOLDER)).state.data).toHaveLength(41);
  });

  it("пишет снимок, когда дельту дописать не удалось", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1)]);
    failOnce("appendFile", "data.journal.jsonl", "no space left");

    await saveNativeProject(FOLDER, [leak(1), leak(2)], {
      previousLeaks: [leak(1)],
    });

    fs.onCall = null;
    clearNativeProjectStorageCache();
    expect((await loadNativeProject(FOLDER)).state.data).toEqual([
      leak(1),
      leak(2),
    ]);
  });
});

describe("когда основной снимок не читается", () => {
  it("поднимает проект из резервной копии и чинит основную", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1), leak(2)]);
    fs.files.set(paths.main, "{ битый снимок");

    clearNativeProjectStorageCache();
    const loaded = await loadNativeProject(FOLDER);

    expect(loaded.recovered).toBe(true);
    expect(loaded.source).toBe(paths.backup);
    expect(loaded.state.data).toEqual([leak(1), leak(2)]);
    // Основной файл восстановлен из копии: следующее чтение уже обычное.
    clearNativeProjectStorageCache();
    expect((await loadNativeProject(FOLDER)).recovered).toBe(false);
  });

  it("отвечает пустотой, когда проекта нет вовсе", async () => {
    await expect(loadNativeProject("нет-такого")).resolves.toBeNull();
  });

  /*
   * Оба файла на месте и оба нечитаемы — это не «проекта нет». Разница важна:
   * на пустоту вызывающий заводит проект заново, то есть затирает данные,
   * которые, возможно, ещё можно спасти.
   */
  it("не выдаёт испорченные снимки за отсутствующие", async () => {
    fs.files.set(paths.main, "{ битый");
    fs.files.set(paths.backup, "{ тоже битый");

    const error = await loadNativeProject(FOLDER).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error.mainError).toBeDefined();
    expect(error.backupError).toBeDefined();
  });
});

describe("устойчивость записи снимка", () => {
  /*
   * Между удалением основного файла и переименованием временного проект живёт
   * только в откатной копии. Падение ровно здесь — то самое, ради чего копия
   * и делается.
   */
  it("возвращает прежний снимок на место, если переименование не удалось", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1)]);
    failOnce("rename", "data.json", "rename failed");

    await expect(
      writeNativeProjectSnapshot(FOLDER, [leak(2)]),
    ).rejects.toThrow();

    fs.onCall = null;
    // Именно основной файл, а не «проект как-нибудь прочитается»: из резервной
    // копии он поднялся бы и без отката, и такая проверка ничего не значит.
    expect(JSON.parse(String(fs.files.get(paths.main))).data).toEqual([
      leak(1),
    ]);
    clearNativeProjectStorageCache();
    const loaded = await loadNativeProject(FOLDER);
    expect(loaded.recovered).toBe(false);
    expect(loaded.state.data).toEqual([leak(1)]);
  });

  it("не оставляет журнал от прежнего снимка", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1)]);
    await saveNativeProject(FOLDER, [leak(1), leak(2)], {
      previousLeaks: [leak(1)],
    });
    expect(journalLines()).toHaveLength(1);

    await writeNativeProjectSnapshot(FOLDER, [leak(3)]);

    expect(fs.files.has(paths.journal)).toBe(false);
  });
});

describe("кэш состояния хранилища", () => {
  it("забывает один проект, не трогая остальные", async () => {
    await writeNativeProjectSnapshot(FOLDER, [leak(1)]);
    await writeNativeProjectSnapshot("другой", [leak(2)]);

    clearNativeProjectStorageCache(FOLDER);

    // У забытого проекта прошлое состояние неизвестно, поэтому пишется
    // снимок; у нетронутого — дельта.
    await saveNativeProject(FOLDER, [leak(1), leak(9)], {
      previousLeaks: [leak(1)],
    });
    await saveNativeProject("другой", [leak(2), leak(9)], {
      previousLeaks: [leak(2)],
    });

    expect(journalLines()).toHaveLength(0);
    expect(
      String(fs.files.get(getNativeProjectPaths("другой").journal) ?? "")
        .split("\n")
        .filter(Boolean),
    ).toHaveLength(1);
  });
});
