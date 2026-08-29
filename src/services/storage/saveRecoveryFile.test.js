import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/platform", () => ({ isNative: false }));

const { saveRecoveryFile } = await import("./saveRecoveryFile");

let click;

beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => "blob:recovery");
  globalThis.URL.revokeObjectURL = vi.fn();
  // Скачивание — клик по невидимой ссылке; jsdom считает его переходом.
  click = vi
    .spyOn(globalThis.HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
});

afterEach(() => {
  click.mockRestore();
});

describe("saveRecoveryFile в браузере", () => {
  it("отдаёт файл ссылкой и сообщает имя", async () => {
    const result = await saveRecoveryFile({
      fileName: "project-recovery.json",
      text: '{"leaks":[]}',
    });

    expect(click).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, fileName: "project-recovery.json" });
    // Пути нет: в браузере приложение не знает, куда легло скачанное.
    expect(result.path).toBeUndefined();
  });

  it("кликает до первого await, оставаясь внутри жеста человека", () => {
    // Браузер вправе отказать в скачивании, начатом после разрыва цепочки
    // обработчика, поэтому клик обязан случиться синхронно.
    void saveRecoveryFile({ fileName: "diagnostics.json", text: "{}" });

    expect(click).toHaveBeenCalledOnce();
  });

  it("возвращает отказ, а не бросает его", async () => {
    click.mockImplementation(() => {
      throw new Error("скачивание заблокировано");
    });

    const result = await saveRecoveryFile({
      fileName: "diagnostics.json",
      text: "{}",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });
});
