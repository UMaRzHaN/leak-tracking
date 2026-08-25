import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/platform", () => ({ isNative: false }));

const { formatStorageAmount, readDeviceStorage } =
  await import("@/services/storage/deviceStorage");

const MB = 1024 * 1024;

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.navigator.storage;
});

describe("formatStorageAmount", () => {
  it("округляет мегабайты до целых", () => {
    expect(formatStorageAmount(512 * MB)).toEqual({ value: "512", unit: "MB" });
  });

  // «14 512 МБ» человек не читает, а на телефоне свободного места обычно
  // именно столько.
  it("переходит на гигабайты от 1024 МБ", () => {
    expect(formatStorageAmount(2048 * MB)).toEqual({
      value: "2.0",
      unit: "GB",
    });
  });

  it("остаётся в мегабайтах у самой границы", () => {
    expect(formatStorageAmount(1023 * MB)).toEqual({
      value: "1023",
      unit: "MB",
    });
  });

  it.each([null, undefined, NaN, -1])("отдаёт null для %s", (value) => {
    expect(formatStorageAmount(value)).toBeNull();
  });
});

describe("readDeviceStorage: веб", () => {
  it("считает свободное как квоту минус занятое", async () => {
    globalThis.navigator.storage = {
      estimate: async () => ({ quota: 100 * MB, usage: 40 * MB }),
    };

    await expect(readDeviceStorage()).resolves.toEqual({
      freeBytes: 60 * MB,
      totalBytes: 100 * MB,
      usedBytes: 40 * MB,
    });
  });

  // Оценку могут заблокировать настройками приватности — это не отказ, а
  // отсутствие данных, и экран должен сказать «не удалось определить».
  it("переживает отсутствие estimate", async () => {
    await expect(readDeviceStorage()).resolves.toEqual({
      freeBytes: null,
      totalBytes: null,
      usedBytes: null,
    });
  });

  it("переживает отказ estimate", async () => {
    globalThis.navigator.storage = {
      estimate: async () => {
        throw new Error("blocked");
      },
    };

    await expect(readDeviceStorage()).resolves.toMatchObject({
      freeBytes: null,
    });
  });

  it("не выдумывает свободное место из неполной оценки", async () => {
    globalThis.navigator.storage = {
      estimate: async () => ({ usage: 40 * MB }),
    };

    await expect(readDeviceStorage()).resolves.toEqual({
      freeBytes: null,
      totalBytes: null,
      usedBytes: 40 * MB,
    });
  });
});
