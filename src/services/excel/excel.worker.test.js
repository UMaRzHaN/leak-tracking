import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Воркер — обработчик сообщений, а не модуль с экспортами: он вешает
 * `onmessage` на своё глобальное окружение при загрузке. Поэтому подменяется
 * само окружение, а проверяется то, что уходит обратно через `postMessage`.
 */
const mocks = vi.hoisted(() => ({
  scope: /** @type {any} */ ({ postMessage: vi.fn() }),
  buildWorkbookBufferLocally: vi.fn(),
  parseExcelImportFile: vi.fn(),
  parseBackupZip: vi.fn(),
}));

vi.mock("@/utils/globalScope", () => ({ globalScope: mocks.scope }));
vi.mock("@/services/excelExport/buildWorkbookBuffer", () => ({
  buildWorkbookBufferLocally: mocks.buildWorkbookBufferLocally,
}));
vi.mock("@/services/import/excelImportParse", () => ({
  parseExcelImportFile: mocks.parseExcelImportFile,
}));
vi.mock("@/services/backup/archiveParser", () => ({
  parseBackupZip: mocks.parseBackupZip,
}));

await import("./excel.worker");

/** Отправляет воркеру сообщение и отдаёт единственный ответ. */
async function send(data) {
  mocks.scope.postMessage.mockClear();
  await mocks.scope.onmessage({ data });
  expect(mocks.scope.postMessage).toHaveBeenCalledOnce();
  return mocks.scope.postMessage.mock.calls[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("выгрузка", () => {
  it("отдаёт буфер и передаёт его владение, а не копию", async () => {
    const buffer = new ArrayBuffer(8);
    mocks.buildWorkbookBufferLocally.mockResolvedValue(buffer);

    const [message, transfer] = await send({ kind: "export", payload: {} });

    expect(message).toEqual({ ok: true, buffer });
    // Книга на десятки мегабайт: копирование её через границу потока стоило
    // бы столько же памяти ещё раз.
    expect(transfer).toEqual([buffer]);
  });

  it("представление над буфером вырезается по своим границам", async () => {
    // ExcelJS отдаёт Uint8Array поверх буфера, который бывает больше самих
    // данных. Отдать его буфер целиком значило бы отдать чужой хвост.
    const source = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    mocks.buildWorkbookBufferLocally.mockResolvedValue(source.subarray(2, 5));

    const [message] = await send({ kind: "export", payload: {} });

    expect(new Uint8Array(message.buffer)).toEqual(new Uint8Array([3, 4, 5]));
  });

  it("непонятный буфер — отказ с причиной, а не молчание", async () => {
    mocks.buildWorkbookBufferLocally.mockResolvedValue("не буфер");

    const [message] = await send({ kind: "export", payload: {} });

    expect(message).toMatchObject({
      ok: false,
      error: "ExcelJS returned an unsupported buffer type",
    });
  });
});

describe("импорт листа", () => {
  it("разбирает файл и возвращает разобранное", async () => {
    mocks.parseExcelImportFile.mockResolvedValue({ leaks: [{ id: "1" }] });
    const file = new Blob(["xlsx"]);

    const [message] = await send({
      kind: "import",
      payload: { file, options: { projectType: "upstream" } },
    });

    expect(mocks.parseExcelImportFile).toHaveBeenCalledWith(file, {
      projectType: "upstream",
    });
    expect(message).toEqual({ ok: true, result: { leaks: [{ id: "1" }] } });
  });

  it("отказ разбора уезжает текстом, а не объектом ошибки", async () => {
    // Ошибку через границу потока не клонировать: на той стороне от неё
    // осталось бы пустое место.
    mocks.parseExcelImportFile.mockRejectedValue(new Error("Лист повреждён"));

    const [message] = await send({ kind: "import", payload: {} });

    expect(message).toEqual({
      ok: false,
      id: undefined,
      error: "Лист повреждён",
    });
  });
});

describe("архив резервной копии", () => {
  const photos = {
    read: vi.fn(),
    declaredSizes: vi.fn(() => ({ "photos/a.jpg": 100 })),
  };

  it("открывает архив, отдавая размеры, но не сами снимки", async () => {
    mocks.parseBackupZip.mockResolvedValue({ leaks: [], photos });

    const [message] = await send({
      kind: "backup",
      op: "open",
      id: 7,
      payload: { file: new Blob(["zip"]) },
    });

    // Снимки остаются в архиве и читаются по одному: отдать весь набор разом
    // означало бы держать в памяти всю резервную копию.
    expect(message).toEqual({
      ok: true,
      id: 7,
      result: { leaks: [], sizes: { "photos/a.jpg": 100 } },
    });
    expect(message.result.photos).toBeUndefined();
  });

  it("отдаёт снимок по запросу из уже открытого архива", async () => {
    const blob = new Blob(["jpeg"]);
    photos.read.mockResolvedValue(blob);

    const [message] = await send({
      kind: "backup",
      op: "readPhoto",
      id: 8,
      payload: { path: "photos/a.jpg" },
    });

    expect(photos.read).toHaveBeenCalledWith("photos/a.jpg");
    expect(message).toEqual({ ok: true, id: 8, blob });
  });

  it("незнакомая операция с архивом — отказ с её именем", async () => {
    const [message] = await send({ kind: "backup", op: "удалить", id: 9 });

    expect(message).toEqual({
      ok: false,
      id: 9,
      error: "Unknown backup worker request: удалить",
    });
  });
});

describe("нераспознанные запросы", () => {
  it("незнакомый вид работы называется в ответе", async () => {
    const [message] = await send({ kind: "печать", id: 1 });

    expect(message).toEqual({
      ok: false,
      id: 1,
      error: "Unknown Excel worker request: печать",
    });
  });

  it("пустое сообщение не роняет воркер", async () => {
    const [message] = await send({});

    expect(message.ok).toBe(false);
  });

  it("нечитаемый запрос получает ответ, а не тишину", () => {
    // Без ответа вызывающая сторона висела бы до своего таймаута, хотя работу
    // можно сделать в основном потоке прямо сейчас.
    mocks.scope.onmessageerror();

    expect(mocks.scope.postMessage).toHaveBeenCalledWith(
      {
        ok: false,
        unavailable: true,
        error: "Excel worker could not read the request",
      },
      [],
    );
  });
});
