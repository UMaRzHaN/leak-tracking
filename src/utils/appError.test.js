import { describe, expect, it } from "vitest";
import { appError, errorText } from "@/utils/appError";

// Заменяет i18next: знает три ключа и возвращает сам ключ для остальных —
// ровно так i18next ведёт себя с отсутствующим переводом.
const t = (key, params) => {
  const known = {
    "errors.QR_OTHER_PROJECT": "The QR code was made for a different project",
    "errors.PHOTO_SAVE_FAILED": `Could not save photo ${params?.path}`,
    "syncErrors.INVALID_CODE": "Wrong connection code",
  };
  return known[key] ?? key;
};

describe("appError", () => {
  it("несёт код и текст", () => {
    const error = appError("QR_OTHER_PROJECT", "QR-код создан для другого");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("QR_OTHER_PROJECT");
    expect(error.message).toBe("QR-код создан для другого");
  });

  it("не заводит params, когда подставлять нечего", () => {
    expect("params" in appError("QR_CORRUPT", "текст")).toBe(false);
  });
});

describe("errorText", () => {
  it("переводит код, который бросил JS", () => {
    const error = appError("QR_OTHER_PROJECT", "QR-код создан для другого");
    expect(errorText(error, t)).toBe(
      "The QR code was made for a different project",
    );
  });

  it("подставляет params в перевод", () => {
    const error = appError("PHOTO_SAVE_FAILED", "Не удалось сохранить", {
      path: "photos/leak-1/before.jpg",
    });
    expect(errorText(error, t)).toBe(
      "Could not save photo photos/leak-1/before.jpg",
    );
  });

  // Коды нативного плагина живут в соседнем неймспейсе, и резолвер один на оба.
  it("находит код плагина в syncErrors", () => {
    const error = Object.assign(new Error("Неверный код подключения"), {
      code: "INVALID_CODE",
    });
    expect(errorText(error, t)).toBe("Wrong connection code");
  });

  // Ровно то, ради чего текст остаётся в коде: ошибка из браузера, из exceljs
  // или от плагина сборки, которая старше самих кодов.
  it("отдаёт текст, когда кода нет", () => {
    expect(errorText(new Error("Quota exceeded"), t)).toBe("Quota exceeded");
  });

  it("отдаёт текст, когда код есть, а перевода нет", () => {
    const error = appError("SOMETHING_NEWER", "Что-то новое");
    expect(errorText(error, t)).toBe("Что-то новое");
  });

  it("отдаёт сам код, когда нет ни перевода, ни текста", () => {
    expect(errorText({ code: "SOMETHING_NEWER" }, t)).toBe("SOMETHING_NEWER");
  });

  it("переживает отказ, на котором ничего нет", () => {
    expect(errorText(null, t)).toBe("");
    expect(errorText(undefined, t)).toBe("");
  });
});

// i18next при части настроек отдаёт `undefined` вместо ключа. Проверка «не
// ключ» такое пропускала, и наружу уходило `undefined` вместо текста ошибки.
describe("errorText: перевод вернул не строку", () => {
  it("падает на запасной текст", () => {
    const error = appError("QR_CORRUPT", "QR-код синхронизации повреждён");
    expect(errorText(error, () => undefined)).toBe(
      "QR-код синхронизации повреждён",
    );
  });

  it("падает на код, когда и текста нет", () => {
    expect(errorText({ code: "QR_CORRUPT" }, () => null)).toBe("QR_CORRUPT");
  });
});
