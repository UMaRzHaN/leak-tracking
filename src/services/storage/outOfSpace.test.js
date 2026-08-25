import { describe, expect, it } from "vitest";
import {
  asOutOfSpaceError,
  isOutOfSpaceError,
} from "@/services/storage/outOfSpace";

// DOMException в jsdom есть, но собрать его с произвольным именем проще так же,
// как это делает браузер: имя решает всё.
const domException = (name) => {
  const error = new Error("quota");
  error.name = name;
  return error;
};

describe("isOutOfSpaceError", () => {
  it.each(["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"])(
    "узнаёт веб-квоту по имени: %s",
    (name) => {
      expect(isOutOfSpaceError(domException(name))).toBe(true);
    },
  );

  it("узнаёт старый код квоты", () => {
    const error = new Error("quota exceeded");
    error.code = 22;
    expect(isOutOfSpaceError(error)).toBe(true);
  });

  // Android отдаёт текст системной ошибки: запись идёт в файл, а не в квоту.
  it.each([
    "java.io.IOException: write failed: ENOSPC (No space left on device)",
    "No space left on device",
    "Not enough space on the device",
    "Disk is full",
    "Недостаточно свободного места",
  ])("узнаёт нативный отказ по тексту: %s", (message) => {
    expect(isOutOfSpaceError(new Error(message))).toBe(true);
  });

  it.each([
    new Error("Failed to open database"),
    new Error("NetworkError"),
    domException("InvalidStateError"),
    null,
    undefined,
  ])("не принимает за нехватку места: %s", (error) => {
    expect(isOutOfSpaceError(error)).toBe(false);
  });

  // 22 у DOMException означает квоту, но у произвольного объекта это просто
  // число, и принимать его за отказ по месту нельзя.
  it("не считает код 22 у не-ошибки признаком", () => {
    expect(isOutOfSpaceError({ code: 22, message: "unrelated" })).toBe(false);
  });
});

describe("asOutOfSpaceError", () => {
  it("помечает отказ по месту кодом", () => {
    const converted = asOutOfSpaceError(domException("QuotaExceededError"));
    expect(converted.code).toBe("DEVICE_OUT_OF_SPACE");
  });

  // Подменять чужой сбой своим текстом — потерять причину.
  it("пропускает остальные ошибки как есть", () => {
    const original = new Error("Failed to open database");
    expect(asOutOfSpaceError(original)).toBe(original);
  });
});
