import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("@/utils/logger", () => ({ logger }));

const { IDB_BLOCKED_TIMEOUT_MS, IdbBlockedError, openIdbDatabase } =
  await import("./idbConnection");

/** Соединение настолько, насколько оно нужно этому модулю. */
function makeDb() {
  return { close: vi.fn(), onclose: null, onversionchange: null };
}

/**
 * Один запрос `indexedDB.open`, которым тест управляет вручную: настоящая
 * реализация не даёт вызвать `blocked`, а весь смысл модуля — именно в нём.
 */
function stubOpen() {
  const request = { result: null, error: null };
  globalThis.indexedDB = { open: vi.fn(() => request) };
  return request;
}

describe("openIdbDatabase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.indexedDB;
  });

  it("отдаёт соединение и передаёт базу в обновление схемы", async () => {
    const request = stubOpen();
    const db = makeDb();
    const upgrade = vi.fn();

    const opening = openIdbDatabase("some-db", 3, { upgrade });
    request.result = db;
    request.onupgradeneeded();
    request.onsuccess();

    await expect(opening).resolves.toBe(db);
    expect(upgrade).toHaveBeenCalledWith(db);
    expect(globalThis.indexedDB.open).toHaveBeenCalledWith("some-db", 3);
  });

  it("закрывает соединение, когда схему обновляет соседняя вкладка", async () => {
    const request = stubOpen();
    const db = makeDb();
    const onLost = vi.fn();

    const opening = openIdbDatabase("some-db", 1, { onLost });
    request.result = db;
    request.onsuccess();
    await opening;

    db.onversionchange();

    expect(db.close).toHaveBeenCalled();
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it("сообщает о потере соединения, закрывшегося само", async () => {
    const request = stubOpen();
    const db = makeDb();
    const onLost = vi.fn();

    const opening = openIdbDatabase("some-db", 1, { onLost });
    request.result = db;
    request.onsuccess();
    await opening;

    db.onclose();

    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it("дожидается чужой вкладки, если та отпустила базу до срока", async () => {
    const request = stubOpen();
    const db = makeDb();

    const opening = openIdbDatabase("some-db", 2);
    request.onblocked();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("is blocked by another open connection"),
    );

    vi.advanceTimersByTime(IDB_BLOCKED_TIMEOUT_MS - 1);
    request.result = db;
    request.onsuccess();

    await expect(opening).resolves.toBe(db);

    // Срок снят вместе с ожиданием: сработав позже, он отклонил бы уже
    // выданное соединение.
    vi.advanceTimersByTime(IDB_BLOCKED_TIMEOUT_MS);
    expect(db.close).not.toHaveBeenCalled();
  });

  it("отказывает вместо бесконечного ожидания заблокированной базы", async () => {
    const request = stubOpen();

    const opening = openIdbDatabase("some-db", 2);
    request.onblocked();
    vi.advanceTimersByTime(IDB_BLOCKED_TIMEOUT_MS);

    await expect(opening).rejects.toBeInstanceOf(IdbBlockedError);
    await expect(opening).rejects.toMatchObject({ code: "IDB_BLOCKED" });
  });

  it("закрывает соединение, пришедшее после того, как ждать перестали", async () => {
    const request = stubOpen();
    const db = makeDb();
    const onLost = vi.fn();

    const opening = openIdbDatabase("some-db", 2, { onLost });
    request.onblocked();
    vi.advanceTimersByTime(IDB_BLOCKED_TIMEOUT_MS);
    await expect(opening).rejects.toBeInstanceOf(IdbBlockedError);

    request.result = db;
    request.onsuccess();

    expect(db.close).toHaveBeenCalled();
    // Кэш вызывающий сбросил ещё на отказе, и мог начать новое открытие:
    // сообщить о потере сейчас значило бы выбросить его.
    expect(onLost).not.toHaveBeenCalled();
    expect(db.onversionchange).toBeNull();
  });

  it("отклоняется ошибкой запроса", async () => {
    const request = stubOpen();
    request.error = new Error("denied");

    const opening = openIdbDatabase("some-db", 1);
    request.onerror();

    await expect(opening).rejects.toBe(request.error);
  });

  it("отклоняется, когда IndexedDB нет вовсе", async () => {
    delete globalThis.indexedDB;
    await expect(openIdbDatabase("some-db", 1)).rejects.toBeInstanceOf(Error);
  });
});
